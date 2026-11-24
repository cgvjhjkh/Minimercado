// ============================================================
//  Migraciones idempotentes del módulo de repartidores y rastreo.
//  Se ejecutan al iniciar el servidor; si algo falla solo se avisa
//  por consola (modo demo) sin tumbar la API.
// ============================================================

const ESTADOS_VALIDOS = ['pendiente', 'confirmado', 'preparando', 'en_camino', 'entregado', 'cancelado'];
const TIPOS_NOTIFICACION = ['sistema', 'pedido', 'pago', 'promocion', 'inventario', 'empleado'];

async function ensureColumn(pool, table, column, definition) {
    const [rows] = await pool.execute(
        `SELECT COLUMN_NAME
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
            AND COLUMN_NAME = ?`,
        [table, column]
    );

    if (rows.length === 0) {
        await pool.execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
        console.log(`➕ Columna creada: ${table}.${column}`);
    }
}

async function safe(label, fn) {
    try {
        await fn();
    } catch (error) {
        console.warn(`⚠️ Esquema (${label}): ${error.message}`);
    }
}

// El estado del pedido suele ser un ENUM: si le faltan valores de entrega
// (preparando / en_camino / cancelado) se amplía sin perder datos.
async function asegurarEstadosPedido(pool) {
    const [rows] = await pool.execute(
        `SELECT COLUMN_TYPE
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'pedido'
            AND COLUMN_NAME = 'estado'`
    );

    if (!rows.length) return;

    const tipo = String(rows[0].COLUMN_TYPE || '').toLowerCase();
    if (!tipo.startsWith('enum')) return;

    const faltantes = ESTADOS_VALIDOS.filter(estado => !tipo.includes(`'${estado}'`));
    if (faltantes.length === 0) return;

    await pool.execute(
        `ALTER TABLE pedido MODIFY COLUMN estado
         ENUM(${ESTADOS_VALIDOS.map(e => `'${e}'`).join(',')}) DEFAULT 'pendiente'`
    );
    console.log(`✅ Estados de pedido ampliados: ${faltantes.join(', ')}`);
}

// La campanita usa notificacion.tipo; los reportes de daño y las acciones
// de empleados necesitan dos tipos nuevos además de los originales.
async function asegurarTiposNotificacion(pool) {
    const [rows] = await pool.execute(
        `SELECT COLUMN_TYPE
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'notificacion'
            AND COLUMN_NAME = 'tipo'`
    );

    if (!rows.length) return;

    const tipo = String(rows[0].COLUMN_TYPE || '').toLowerCase();
    if (!tipo.startsWith('enum')) return;

    const faltantes = TIPOS_NOTIFICACION.filter(t => !tipo.includes(`'${t}'`));
    if (faltantes.length === 0) return;

    await pool.execute(
        `ALTER TABLE notificacion MODIFY COLUMN tipo
         ENUM(${TIPOS_NOTIFICACION.map(t => `'${t}'`).join(',')}) NOT NULL DEFAULT 'sistema'`
    );
    console.log(`✅ Tipos de notificación ampliados: ${faltantes.join(', ')}`);
}

// La campanita lee/escribe esta tabla. Se crea si no existe y se le agregan
// las columnas que usan las rutas de notificaciones (migración idempotente).
async function ensureNotificacionSchema(pool) {
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS notificacion (
            id_notificacion INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            id_usuario INT NOT NULL,
            titulo VARCHAR(150) NOT NULL DEFAULT '',
            mensaje TEXT NULL,
            tipo VARCHAR(20) NOT NULL DEFAULT 'sistema',
            leida TINYINT(1) NOT NULL DEFAULT 0,
            fecha_envio DATETIME NULL,
            datos_adicionales TEXT NULL,
            INDEX idx_notificacion_usuario (id_usuario, leida, fecha_envio)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const columnas = [
        ['titulo', "VARCHAR(150) NOT NULL DEFAULT ''"],
        ['mensaje', 'TEXT NULL'],
        ['leida', 'TINYINT(1) NOT NULL DEFAULT 0'],
        ['fecha_envio', 'DATETIME NULL'],
        ['datos_adicionales', 'TEXT NULL']
    ];
    for (const [columna, definicion] of columnas) {
        await safe(`notificacion.${columna}`, () =>
            ensureColumn(pool, 'notificacion', columna, definicion));
    }
}

// Algunas bases tienen un trigger AFTER UPDATE sobre inventario que vuelve a
// hacer UPDATE inventario para actualizar fecha_actualizacion. MySQL lo rechaza
// ("Can't update table ... already used by statement which invoked this trigger")
// y con eso se rompen entradas, ajustes y reportes de daño. El BEFORE UPDATE ya
// asigna la fecha, así que basta con quitar esa segunda actualización.
// El cuerpo original se guarda en `migracion_triggers` para poder restaurarlo.
async function arreglarTriggerInventario(pool) {
    const [filas] = await pool.execute(
        `SELECT ACTION_STATEMENT
           FROM information_schema.TRIGGERS
          WHERE TRIGGER_SCHEMA = DATABASE()
            AND TRIGGER_NAME = 'trg_inventario_audit_update'`
    );
    if (!filas.length) return;

    const original = Buffer.isBuffer(filas[0].ACTION_STATEMENT)
        ? filas[0].ACTION_STATEMENT.toString('utf8')
        : String(filas[0].ACTION_STATEMENT || '');

    const repetida = /UPDATE\s+inventario\s+SET\s+fecha_actualizacion\s*=\s*NOW\(\)\s+WHERE\s+id_inventario\s*=\s*NEW\.id_inventario\s*;?/i;
    if (!repetida.test(original)) return; // ya está corregido

    await pool.query(`
        CREATE TABLE IF NOT EXISTS migracion_triggers (
            id_migracion INT AUTO_INCREMENT PRIMARY KEY,
            nombre_trigger VARCHAR(100) NOT NULL,
            statement_original LONGTEXT NOT NULL,
            fecha_aplicada DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.execute(
        'INSERT INTO migracion_triggers (nombre_trigger, statement_original) VALUES (?, ?)',
        ['trg_inventario_audit_update', original]
    );

    const corregido = original.replace(repetida, '');
    await pool.query('DROP TRIGGER trg_inventario_audit_update');
    await pool.query(`CREATE TRIGGER trg_inventario_audit_update
        AFTER UPDATE ON inventario
        FOR EACH ROW
        ${corregido}`);
    console.log('✅ Trigger de inventario corregido (original guardado en migracion_triggers)');
}

// Historial de productos dañados reportados por los empleados.
async function ensureEmployeeSchema(pool) {
    await ensureNotificacionSchema(pool);
    await safe('trigger de inventario', () => arreglarTriggerInventario(pool));

    await pool.execute(`
        CREATE TABLE IF NOT EXISTS reporte_dano (
            id_reporte INT AUTO_INCREMENT PRIMARY KEY,
            id_producto INT NOT NULL,
            id_empleado INT NULL,
            id_usuario INT NULL,
            cantidad INT NOT NULL,
            motivo VARCHAR(150) NOT NULL,
            observaciones TEXT NULL,
            fecha_reporte DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await safe('índices de reportes de daño', async () => {
        await crearIndice(pool, 'idx_reporte_dano_producto',
            'CREATE INDEX idx_reporte_dano_producto ON reporte_dano (id_producto, fecha_reporte)');
    });

    await safe('notificacion.tipo', () => asegurarTiposNotificacion(pool));
    await safe('notificacion.fecha_envio valores', async () => {
        await pool.execute('UPDATE notificacion SET fecha_envio = NOW() WHERE fecha_envio IS NULL');
    });

    await safe('detallepedido.verificado_empleado', () =>
        ensureColumn(pool, 'detallepedido', 'verificado_empleado', 'TINYINT(1) NOT NULL DEFAULT 0'));

    console.log('✅ Tablas y columnas del módulo empleado listas');
}

async function crearIndice(pool, nombre, sql) {
    try {
        await pool.execute(sql);
    } catch (error) {
        // 1061 = índice duplicado
        if (error.errno !== 1061) throw error;
    }
}

async function ensureTrackingSchema(pool) {
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS ubicacion_repartidor (
            id_ubicacion INT AUTO_INCREMENT PRIMARY KEY,
            id_repartidor INT NOT NULL,
            id_pedido INT NULL,
            latitud DECIMAL(10,7) NOT NULL,
            longitud DECIMAL(10,7) NOT NULL,
            precision_gps INT DEFAULT 0,
            velocidad DECIMAL(6,2) DEFAULT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.execute(`
        CREATE TABLE IF NOT EXISTS ruta_historica (
            id_ruta INT AUTO_INCREMENT PRIMARY KEY,
            id_pedido INT NOT NULL,
            id_repartidor INT NOT NULL,
            punto_orden INT NOT NULL,
            latitud DECIMAL(10,7) NOT NULL,
            longitud DECIMAL(10,7) NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await safe('índices de rastreo', async () => {
        await crearIndice(pool, 'idx_ubicacion_repartidor',
            'CREATE INDEX idx_ubicacion_repartidor ON ubicacion_repartidor (id_repartidor, timestamp)');
        await crearIndice(pool, 'idx_ubicacion_pedido',
            'CREATE INDEX idx_ubicacion_pedido ON ubicacion_repartidor (id_pedido)');
        await crearIndice(pool, 'idx_ruta_pedido',
            'CREATE INDEX idx_ruta_pedido ON ruta_historica (id_pedido, punto_orden)');
        await crearIndice(pool, 'idx_ruta_repartidor',
            'CREATE INDEX idx_ruta_repartidor ON ruta_historica (id_repartidor)');
    });

    await safe('ubicacion_repartidor.id_pedido', () =>
        ensureColumn(pool, 'ubicacion_repartidor', 'id_pedido', 'INT NULL'));
    await safe('ubicacion_repartidor.velocidad', async () => {
        const [rows] = await pool.execute(
            `SELECT NUMERIC_SCALE
               FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'ubicacion_repartidor'
                AND COLUMN_NAME = 'velocidad'`
        );
        if (rows.length && Number(rows[0].NUMERIC_SCALE) < 2) {
            await pool.execute('ALTER TABLE ubicacion_repartidor MODIFY COLUMN velocidad DECIMAL(6,2) NULL');
        }
    });

    await safe('pedido.id_repartidor', () => ensureColumn(pool, 'pedido', 'id_repartidor', 'INT NULL'));
    await safe('pedido.fecha_entrega', () => ensureColumn(pool, 'pedido', 'fecha_entrega', 'DATETIME NULL'));
    await safe('pedido.tiempo_estimado_llegada', () =>
        ensureColumn(pool, 'pedido', 'tiempo_estimado_llegada', 'INT NULL'));
    await safe('pedido.estado', () => asegurarEstadosPedido(pool));

    await safe('repartidor.disponible', () =>
        ensureColumn(pool, 'repartidor', 'disponible', 'TINYINT(1) NOT NULL DEFAULT 1'));
    await safe('repartidor.pedidos_activos', () =>
        ensureColumn(pool, 'repartidor', 'pedidos_activos', 'INT NOT NULL DEFAULT 0'));
    await safe('repartidor.vehiculo', () =>
        ensureColumn(pool, 'repartidor', 'vehiculo', 'VARCHAR(60) NULL'));

    await safe('usuario.foto_perfil', () =>
        ensureColumn(pool, 'usuario', 'foto_perfil', 'VARCHAR(255) NULL'));
    await safe('direccion.latitud', () =>
        ensureColumn(pool, 'direccion', 'latitud', 'DECIMAL(10,7) NULL'));
    await safe('direccion.longitud', () =>
        ensureColumn(pool, 'direccion', 'longitud', 'DECIMAL(10,7) NULL'));

    console.log('✅ Tablas y columnas de repartidores/rastreo listas');

    // Módulo empleado: reportes de daño y notificaciones de la campanita.
    await ensureEmployeeSchema(pool);
}

module.exports = { ensureTrackingSchema, ensureEmployeeSchema, ESTADOS_VALIDOS };
