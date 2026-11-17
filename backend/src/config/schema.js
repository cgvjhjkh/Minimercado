// ============================================================
//  Migraciones idempotentes del módulo de repartidores y rastreo.
//  Se ejecutan al iniciar el servidor; si algo falla solo se avisa
//  por consola (modo demo) sin tumbar la API.
// ============================================================

const ESTADOS_VALIDOS = ['pendiente', 'confirmado', 'preparando', 'en_camino', 'entregado', 'cancelado'];

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
}

module.exports = { ensureTrackingSchema, ESTADOS_VALIDOS };
