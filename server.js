// ============================================================
//  MiMini · Servidor unificado (Minimercado + Rastreo)
//  Base de datos: minimercado
//  - Autenticación y CRUD del minimercado
//  - Pedidos, direcciones y estados
//  - Panel / API del repartidor
//  - Ubicación en tiempo real por WebSocket
// ============================================================
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
});

app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));
app.use(express.static('.'));

// ============ BASE DE DATOS ============
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'elmega01pro',
    database: 'minimercado',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool = null;

const ESTADOS_VALIDOS = ['pendiente', 'confirmado', 'preparando', 'en_camino', 'entregado', 'cancelado'];
const ESTADOS_ACTIVOS = ['pendiente', 'confirmado', 'preparando', 'en_camino'];
const ESTADOS_FINALES = ['entregado', 'cancelado'];

async function ensureColumn(table, column, definition) {
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

async function safeSchema(label, fn) {
    try {
        await fn();
    } catch (error) {
        console.warn(`⚠️ Esquema (${label}): ${error.message}`);
    }
}

async function asegurarEstadosPedido() {
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

async function asegurarEsquema() {
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS ubicacion_repartidor (
            id_ubicacion INT AUTO_INCREMENT PRIMARY KEY,
            id_repartidor INT NOT NULL,
            id_pedido INT NULL,
            latitud DECIMAL(10,7) NOT NULL,
            longitud DECIMAL(10,7) NOT NULL,
            precision_gps INT DEFAULT 0,
            velocidad DECIMAL(6,2) DEFAULT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_ubicacion_repartidor (id_repartidor, timestamp),
            INDEX idx_ubicacion_pedido (id_pedido)
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
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_ruta_pedido (id_pedido, punto_orden),
            INDEX idx_ruta_repartidor (id_repartidor)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await safeSchema('pedido.id_repartidor', () => ensureColumn('pedido', 'id_repartidor', 'INT NULL'));
    await safeSchema('pedido.fecha_entrega', () => ensureColumn('pedido', 'fecha_entrega', 'DATETIME NULL'));
    await safeSchema('pedido.tiempo_estimado_llegada', () => ensureColumn('pedido', 'tiempo_estimado_llegada', 'INT NULL'));
    await safeSchema('pedido.estado', () => asegurarEstadosPedido());

    await safeSchema('repartidor.disponible', () => ensureColumn('repartidor', 'disponible', 'TINYINT(1) NOT NULL DEFAULT 1'));
    await safeSchema('repartidor.pedidos_activos', () => ensureColumn('repartidor', 'pedidos_activos', 'INT NOT NULL DEFAULT 0'));
    await safeSchema('repartidor.vehiculo', () => ensureColumn('repartidor', 'vehiculo', 'VARCHAR(60) NULL'));
    await safeSchema('usuario.foto_perfil', () => ensureColumn('usuario', 'foto_perfil', 'VARCHAR(255) NULL'));
    await safeSchema('direccion.latitud', () => ensureColumn('direccion', 'latitud', 'DECIMAL(10,7) NULL'));
    await safeSchema('direccion.longitud', () => ensureColumn('direccion', 'longitud', 'DECIMAL(10,7) NULL'));
    await safeSchema('ubicacion_repartidor.id_pedido', () => ensureColumn('ubicacion_repartidor', 'id_pedido', 'INT NULL'));

    // Corrección de datos: Pedro Sanchez (usuario id 8) debe estar vinculado en repartidor.id_usuario = 8.
    // Caso reportado: el registro de repartidor apunta por error al usuario 7.
    await safeSchema('fix.repartidor_pedro_sanchez', async () => {
        const [result] = await pool.execute(`
            UPDATE repartidor r
            JOIN usuario u ON u.id_usuario = 8
            SET r.id_usuario = 8
            WHERE r.id_usuario = 7
              AND (u.nombre_completo LIKE '%Pedro%Sanchez%' OR u.nombre_completo LIKE '%Pedro%Sánchez%')
        `);
        if (result && result.affectedRows > 0) {
            console.log('✅ Corrección aplicada: repartidor.id_usuario de Pedro Sanchez actualizado a 8');
        }
    });

    console.log('✅ Tablas y columnas de rastreo listas');
}

async function initDB() {
    try {
        pool = await mysql.createPool(dbConfig);
        const conexion = await pool.getConnection();
        await conexion.ping();
        conexion.release();
        console.log('✅ Conectado a MySQL (base de datos: minimercado)');
        await asegurarEsquema();
        return true;
    } catch (error) {
        pool = null;
        console.error('❌ Error conectando a MySQL:', error.message);
        console.log('⚠️ El servidor seguirá funcionando en modo demo sin base de datos');
        return false;
    }
}

const checkDB = (req, res, next) => {
    if (!pool) {
        return res.status(503).json({
            success: false,
            error: 'Base de datos no disponible. Modo demo activado.'
        });
    }
    next();
};

function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function haversine(a, b) {
    if (!a || !b) return 0;
    const R = 6371000;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
}

// Fecha "hoy" sincronizada con la fecha real del sistema (YYYY-MM-DD).
// Se usa para que "datos de hoy" coincidan con el día real actual.
function fechaHoyReal() {
    const ahora = new Date();
    const y = ahora.getFullYear();
    const m = String(ahora.getMonth() + 1).padStart(2, '0');
    const d = String(ahora.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

async function recalcularPedidosActivos(connection, id_repartidor) {
    const placeholders = ESTADOS_ACTIVOS.map(() => '?').join(',');
    await connection.execute(
        `UPDATE repartidor
            SET pedidos_activos = (
                SELECT COUNT(*) FROM pedido
                 WHERE id_repartidor = ?
                   AND estado IN (${placeholders})
            )
          WHERE id_repartidor = ?`,
        [id_repartidor, ...ESTADOS_ACTIVOS, id_repartidor]
    );
}

// ============ AUTENTICACIÓN ============

app.post('/api/auth/registrar-cliente', checkDB, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const {
            nombre_completo,
            correo,
            contrasena_hash,
            telefono,
            doc_identidad,
            fecha_nacimiento
        } = req.body;

        if (!nombre_completo || !correo || !contrasena_hash) {
            return res.status(400).json({ success: false, error: 'Campos obligatorios incompletos' });
        }

        const [userCheck] = await pool.execute('SELECT id_usuario FROM usuario WHERE correo = ?', [correo]);
        if (userCheck.length > 0) {
            return res.status(400).json({ success: false, error: 'El correo ya está registrado' });
        }

        if (doc_identidad) {
            const [docCheck] = await pool.execute('SELECT id_usuario FROM usuario WHERE doc_identidad = ?', [doc_identidad]);
            if (docCheck.length > 0) {
                return res.status(400).json({ success: false, error: 'El documento de identidad ya está registrado' });
            }
        }

        await connection.beginTransaction();

        const [resultUsuario] = await connection.execute(`
            INSERT INTO usuario
            (nombre_completo, correo, contrasena_hash, telefono, doc_identidad, fecha_nacimiento, rol, estado)
            VALUES (?, ?, ?, ?, ?, ?, 'cliente', 'activo')
        `, [
            nombre_completo,
            correo,
            contrasena_hash,
            telefono || null,
            doc_identidad || null,
            fecha_nacimiento || null
        ]);

        const nuevoIdUsuario = resultUsuario.insertId;

        await connection.execute(`
            INSERT INTO cliente (id_usuario, puntos_fidelidad, total_compras)
            VALUES (?, 0, 0.00)
        `, [nuevoIdUsuario]);

        await connection.commit();
        res.json({ success: true, mensaje: 'Cliente registrado exitosamente' });
    } catch (error) {
        await connection.rollback();
        console.error('Error en registro:', error);
        res.status(500).json({ success: false, error: 'Error interno en el servidor' });
    } finally {
        connection.release();
    }
});

app.post('/api/auth/login', checkDB, async (req, res) => {
    try {
        const { correo, contrasena } = req.body;

        if (!correo || !contrasena) {
            return res.status(400).json({ success: false, error: 'Correo y contraseña son requeridos' });
        }

        const [rows] = await pool.execute(`
            SELECT u.id_usuario, u.nombre_completo, u.correo, u.telefono, u.doc_identidad,
                   u.fecha_nacimiento, u.rol, u.estado, u.foto_perfil,
                   c.id_cliente, r.id_repartidor, r.disponible, r.vehiculo, e.id_empleado
              FROM usuario u
              LEFT JOIN cliente c    ON u.id_usuario = c.id_usuario
              LEFT JOIN repartidor r ON u.id_usuario = r.id_usuario
              LEFT JOIN empleado e   ON u.id_usuario = e.id_usuario
             WHERE u.correo = ? AND u.contrasena_hash = ? AND u.estado = 'activo'
        `, [correo, contrasena]);

        if (rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Credenciales incorrectas o usuario inactivo' });
        }

        const usuario = rows[0];

        await pool.execute(
            'UPDATE usuario SET ultimo_acceso = NOW() WHERE id_usuario = ?',
            [usuario.id_usuario]
        );

        res.json({
            success: true,
            usuario: {
                id_usuario: usuario.id_usuario,
                nombre_completo: usuario.nombre_completo,
                correo: usuario.correo,
                telefono: usuario.telefono,
                doc_identidad: usuario.doc_identidad,
                fecha_nacimiento: usuario.fecha_nacimiento,
                rol: usuario.rol === 'admin' ? 'administrador' : usuario.rol,
                rol_bd: usuario.rol,
                foto_perfil: usuario.foto_perfil,
                id_cliente: usuario.id_cliente,
                id_repartidor: usuario.id_repartidor,
                id_empleado: usuario.id_empleado,
                disponible: usuario.disponible,
                vehiculo: usuario.vehiculo
            }
        });
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ success: false, error: 'Error interno en el servidor' });
    }
});

// ============ CLIENTE ============

app.get('/api/cliente/:id_cliente', checkDB, async (req, res) => {
    try {
        const { id_cliente } = req.params;
        const [rows] = await pool.execute(`
            SELECT c.*, u.nombre_completo, u.correo, u.telefono, u.doc_identidad,
                   u.fecha_nacimiento, u.foto_perfil
              FROM cliente c
              JOIN usuario u ON c.id_usuario = u.id_usuario
             WHERE c.id_cliente = ?
        `, [id_cliente]);

        if (rows.length > 0) {
            res.json({ success: true, data: rows[0] });
        } else {
            res.json({ success: false, error: 'Cliente no encontrado' });
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/cliente/:id_cliente', checkDB, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { id_cliente } = req.params;
        const { nombre_completo, telefono, doc_identidad, fecha_nacimiento } = req.body;

        await connection.beginTransaction();

        const [clienteRows] = await connection.execute(
            'SELECT id_usuario FROM cliente WHERE id_cliente = ?',
            [id_cliente]
        );

        if (clienteRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
        }

        const id_usuario = clienteRows[0].id_usuario;

        await connection.execute(`
            UPDATE usuario
               SET nombre_completo = ?, telefono = ?, doc_identidad = ?, fecha_nacimiento = ?
             WHERE id_usuario = ?
        `, [nombre_completo, telefono || null, doc_identidad || null, fecha_nacimiento || null, id_usuario]);

        await connection.commit();
        res.json({ success: true, mensaje: 'Perfil actualizado correctamente' });
    } catch (error) {
        await connection.rollback();
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        connection.release();
    }
});

app.post('/api/cliente/:id_cliente/foto-base64', checkDB, async (req, res) => {
    try {
        const { id_cliente } = req.params;
        const { foto_base64 } = req.body;

        if (!foto_base64) {
            return res.status(400).json({ success: false, error: 'No se proporcionó la imagen' });
        }

        const [clienteRows] = await pool.execute(
            'SELECT id_usuario FROM cliente WHERE id_cliente = ?',
            [id_cliente]
        );

        if (clienteRows.length === 0) {
            return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
        }

        const id_usuario = clienteRows[0].id_usuario;
        const fotoPath = String(foto_base64).slice(0, 255);

        await pool.execute(
            'UPDATE usuario SET foto_perfil = ? WHERE id_usuario = ?',
            [fotoPath, id_usuario]
        );

        res.json({ success: true, foto_perfil: fotoPath });
    } catch (error) {
        console.error('Error guardando foto:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/cliente/:id_cliente/pedidos', checkDB, async (req, res) => {
    try {
        const { id_cliente } = req.params;
        const [rows] = await pool.execute(`
            SELECT p.*, d.calle, d.numero, d.barrio, d.complemento,
                   d.latitud, d.longitud
              FROM pedido p
              JOIN direccion d ON p.id_direccion = d.id_direccion
             WHERE p.id_cliente = ?
             ORDER BY p.fecha_pedido DESC
        `, [id_cliente]);

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ PEDIDOS ============

app.get('/api/pedido/:id_pedido', checkDB, async (req, res) => {
    try {
        const { id_pedido } = req.params;
        const [rows] = await pool.execute(`
            SELECT p.*, d.calle, d.numero, d.barrio, d.complemento,
                   d.latitud, d.longitud,
                   u.nombre_completo AS cliente_nombre, u.telefono AS cliente_telefono
              FROM pedido p
              JOIN direccion d ON p.id_direccion = d.id_direccion
              JOIN cliente c   ON p.id_cliente = c.id_cliente
              JOIN usuario u   ON c.id_usuario = u.id_usuario
             WHERE p.id_pedido = ?
        `, [id_pedido]);

        if (rows.length > 0) {
            res.json({ success: true, data: rows[0] });
        } else {
            res.json({ success: false, error: 'Pedido no encontrado' });
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/pedido/:id_pedido/productos', checkDB, async (req, res) => {
    try {
        const { id_pedido } = req.params;
        const [rows] = await pool.execute(`
            SELECT dp.*, p.nombre AS nombre_producto
              FROM detalle_pedido dp
              JOIN producto p ON dp.id_producto = p.id_producto
             WHERE dp.id_pedido = ?
        `, [id_pedido]);

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/pedido', checkDB, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { id_cliente, id_direccion, productos, metodo_pago } = req.body;

        if (!id_cliente || !id_direccion || !productos || productos.length === 0) {
            return res.status(400).json({ success: false, error: 'Datos incompletos' });
        }

        await connection.beginTransaction();

        let total_pagar = 0;

        for (const item of productos) {
            const [prodRows] = await connection.execute(
                'SELECT stock, precio_venta FROM producto WHERE id_producto = ?',
                [item.id_producto]
            );
            if (prodRows.length === 0) {
                throw new Error(`Producto ${item.id_producto} no encontrado`);
            }
            if (prodRows[0].stock < item.cantidad) {
                throw new Error(`Stock insuficiente para producto ${item.id_producto}`);
            }
            total_pagar += Number(prodRows[0].precio_venta) * Number(item.cantidad);
        }

        const [pedidoResult] = await connection.execute(`
            INSERT INTO pedido (id_cliente, id_direccion, fecha_pedido, total_pagar, metodo_pago, estado)
            VALUES (?, ?, NOW(), ?, ?, 'pendiente')
        `, [id_cliente, id_direccion, total_pagar, metodo_pago || 'efectivo']);

        const id_pedido = pedidoResult.insertId;

        for (const item of productos) {
            await connection.execute(`
                INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio_unitario)
                VALUES (?, ?, ?, ?)
            `, [id_pedido, item.id_producto, item.cantidad, item.precio_unitario]);

            await connection.execute(
                'UPDATE producto SET stock = stock - ? WHERE id_producto = ?',
                [item.cantidad, item.id_producto]
            );
        }

        await connection.commit();

        io.emit('nuevo_pedido', { id_pedido, id_cliente, total_pagar });

        res.json({ success: true, id_pedido });
    } catch (error) {
        await connection.rollback();
        console.error('Error creando pedido:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        connection.release();
    }
});

// ============ DIRECCIONES ============

app.get('/api/cliente/:id_cliente/direcciones', checkDB, async (req, res) => {
    try {
        const { id_cliente } = req.params;
        const [rows] = await pool.execute(`
            SELECT * FROM direccion
             WHERE id_cliente = ?
             ORDER BY es_principal DESC, id_direccion ASC
        `, [id_cliente]);

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/direccion/:id_direccion', checkDB, async (req, res) => {
    try {
        const { id_direccion } = req.params;
        const [rows] = await pool.execute('SELECT * FROM direccion WHERE id_direccion = ?', [id_direccion]);

        if (rows.length > 0) {
            res.json({ success: true, data: rows[0] });
        } else {
            res.json({ success: false, error: 'Dirección no encontrada' });
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/direccion', checkDB, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const {
            id_cliente,
            nombre_direccion,
            calle,
            numero,
            complemento,
            barrio,
            latitud,
            longitud,
            es_principal
        } = req.body;

        if (!id_cliente || !nombre_direccion || !calle) {
            return res.status(400).json({ success: false, error: 'Campos obligatorios incompletos' });
        }

        await connection.beginTransaction();

        if (Number(es_principal) === 1) {
            await connection.execute(
                'UPDATE direccion SET es_principal = 0 WHERE id_cliente = ?',
                [id_cliente]
            );
        }

        const [result] = await connection.execute(`
            INSERT INTO direccion
            (id_cliente, nombre_direccion, calle, numero, complemento, barrio, latitud, longitud, es_principal)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id_cliente,
            nombre_direccion,
            calle,
            numero || null,
            complemento || null,
            barrio || null,
            latitud || null,
            longitud || null,
            es_principal || 0
        ]);

        await connection.commit();
        res.json({ success: true, id: result.insertId });
    } catch (error) {
        await connection.rollback();
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        connection.release();
    }
});

app.put('/api/direccion/:id_direccion', checkDB, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { id_direccion } = req.params;
        const {
            nombre_direccion,
            calle,
            numero,
            complemento,
            barrio,
            latitud,
            longitud,
            es_principal
        } = req.body;

        const [dirRows] = await connection.execute(
            'SELECT id_cliente FROM direccion WHERE id_direccion = ?',
            [id_direccion]
        );

        if (dirRows.length === 0) {
            return res.status(404).json({ success: false, error: 'Dirección no encontrada' });
        }

        const id_cliente = dirRows[0].id_cliente;

        await connection.beginTransaction();

        if (Number(es_principal) === 1) {
            await connection.execute(
                'UPDATE direccion SET es_principal = 0 WHERE id_cliente = ? AND id_direccion != ?',
                [id_cliente, id_direccion]
            );
        }

        await connection.execute(`
            UPDATE direccion
               SET nombre_direccion = ?, calle = ?, numero = ?, complemento = ?,
                   barrio = ?, latitud = ?, longitud = ?, es_principal = ?
             WHERE id_direccion = ?
        `, [
            nombre_direccion,
            calle,
            numero || null,
            complemento || null,
            barrio || null,
            latitud || null,
            longitud || null,
            es_principal || 0,
            id_direccion
        ]);

        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        connection.release();
    }
});

app.put('/api/direccion/:id_direccion/coordenadas', checkDB, async (req, res) => {
    try {
        const { id_direccion } = req.params;
        const lat = num(req.body.latitud);
        const lng = num(req.body.longitud);

        if (lat === null || lng === null) {
            return res.status(400).json({ success: false, error: 'Coordenadas inválidas' });
        }

        await pool.execute(
            'UPDATE direccion SET latitud = ?, longitud = ? WHERE id_direccion = ?',
            [lat, lng, id_direccion]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/direccion/:id_direccion', checkDB, async (req, res) => {
    try {
        const { id_direccion } = req.params;
        await pool.execute('DELETE FROM direccion WHERE id_direccion = ?', [id_direccion]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/direccion/principal/:id_direccion', checkDB, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { id_direccion } = req.params;
        const { id_cliente } = req.body;

        await connection.beginTransaction();
        await connection.execute('UPDATE direccion SET es_principal = 0 WHERE id_cliente = ?', [id_cliente]);
        await connection.execute('UPDATE direccion SET es_principal = 1 WHERE id_direccion = ?', [id_direccion]);
        await connection.commit();

        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        connection.release();
    }
});

// ============ REPARTIDOR ============

const SELECT_PEDIDO_REPARTIDOR = `
    SELECT p.id_pedido,
           p.estado,
           p.total_pagar,
           p.metodo_pago,
           p.fecha_pedido,
           p.fecha_entrega,
           p.tiempo_estimado_llegada,
           p.id_repartidor,
           d.id_direccion,
           d.calle,
           d.numero,
           d.complemento,
           d.barrio,
           d.latitud AS destino_lat,
           d.longitud AS destino_lng,
           c.id_cliente,
           u.nombre_completo AS cliente_nombre,
           u.telefono AS cliente_telefono
      FROM pedido p
      JOIN direccion d ON p.id_direccion = d.id_direccion
      JOIN cliente c   ON p.id_cliente = c.id_cliente
      JOIN usuario u   ON c.id_usuario = u.id_usuario
`;

app.get('/api/repartidor/:id_repartidor/pedidos', checkDB, async (req, res) => {
    try {
        const id_repartidor = Number(req.params.id_repartidor);
        const todos = req.query.todos === '1' || req.query.todos === 'true';
        const filtroEstados = todos
            ? ''
            : `AND p.estado IN (${ESTADOS_ACTIVOS.map(() => '?').join(',')})`;

        const [rows] = await pool.execute(`
            ${SELECT_PEDIDO_REPARTIDOR}
             WHERE p.id_repartidor = ?
               ${filtroEstados}
             ORDER BY FIELD(p.estado, 'en_camino', 'preparando', 'confirmado', 'pendiente', 'entregado', 'cancelado'),
                      p.fecha_pedido ASC
        `, todos ? [id_repartidor] : [id_repartidor, ...ESTADOS_ACTIVOS]);

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error listando pedidos del repartidor:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/repartidor/:id_repartidor/pedidos-disponibles', checkDB, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            ${SELECT_PEDIDO_REPARTIDOR}
             WHERE p.id_repartidor IS NULL
               AND p.estado IN ('pendiente', 'confirmado', 'preparando')
             ORDER BY p.fecha_pedido ASC
             LIMIT 50
        `);

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error listando pedidos disponibles:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/repartidor/pedido/:id_pedido/asignar', checkDB, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const id_pedido = Number(req.params.id_pedido);
        const id_repartidor = Number(req.body.id_repartidor);

        // Los repartidores no pueden auto-asignarse pedidos; la asignación la realiza un administrador.
        if (!req.body.from_admin && !req.body.asignado_por_admin) {
            return res.status(403).json({
                success: false,
                error: 'Los repartidores no pueden escoger pedidos. La asignación debe realizarla un administrador.'
            });
        }

        if (!id_repartidor) {
            return res.status(400).json({ success: false, error: 'id_repartidor requerido' });
        }

        await connection.beginTransaction();

        const [rows] = await connection.execute(
            'SELECT id_pedido, id_repartidor, estado FROM pedido WHERE id_pedido = ? FOR UPDATE',
            [id_pedido]
        );

        if (!rows.length) {
            await connection.rollback();
            return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
        }

        if (rows[0].id_repartidor && Number(rows[0].id_repartidor) !== id_repartidor) {
            await connection.rollback();
            return res.status(409).json({ success: false, error: 'El pedido ya está asignado a otro repartidor' });
        }

        await connection.execute(
            `UPDATE pedido
                SET id_repartidor = ?,
                    estado = IF(estado = 'pendiente', 'confirmado', estado)
              WHERE id_pedido = ?`,
            [id_repartidor, id_pedido]
        );

        await recalcularPedidosActivos(connection, id_repartidor);
        await connection.commit();

        io.emit('pedido_asignado', { id_pedido, id_repartidor });
        res.json({ success: true, id_pedido, id_repartidor });
    } catch (error) {
        await connection.rollback();
        console.error('Error asignando pedido:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        connection.release();
    }
});

app.put('/api/repartidor/pedido/:id_pedido/estado', checkDB, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const id_pedido = Number(req.params.id_pedido);
        const id_repartidor = Number(req.body.id_repartidor) || null;
        const estado = String(req.body.estado || '').toLowerCase();
        const rolActor = String(req.body.rol_actor || req.body.rol || '').toLowerCase();
        const esAdminOEmpleado = ['admin', 'administrador', 'empleado'].includes(rolActor) || req.body.from_admin || req.body.from_empleado;

        if (!ESTADOS_VALIDOS.includes(estado)) {
            return res.status(400).json({ success: false, error: 'Estado inválido' });
        }

        // Solo administrador y empleado pueden establecer "cancelado" o "preparando".
        if ((estado === 'cancelado' || estado === 'preparando') && !esAdminOEmpleado) {
            return res.status(403).json({
                success: false,
                error: 'Solo un administrador o empleado puede cambiar el pedido a "' + estado + '".'
            });
        }

        if (!esAdminOEmpleado && !id_repartidor) {
            return res.status(400).json({ success: false, error: 'id_repartidor requerido' });
        }

        await connection.beginTransaction();

        const [rows] = await connection.execute(
            'SELECT id_pedido, id_repartidor, estado FROM pedido WHERE id_pedido = ? FOR UPDATE',
            [id_pedido]
        );

        if (!rows.length) {
            await connection.rollback();
            return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
        }

        const pedido = rows[0];

        if (!esAdminOEmpleado && pedido.id_repartidor && Number(pedido.id_repartidor) !== id_repartidor) {
            await connection.rollback();
            return res.status(403).json({ success: false, error: 'Este pedido está asignado a otro repartidor' });
        }

        const sets = ['estado = ?'];
        const valores = [estado];

        if (id_repartidor) {
            sets.push('id_repartidor = COALESCE(id_repartidor, ?)');
            valores.push(id_repartidor);
        } else if (esAdminOEmpleado && Object.prototype.hasOwnProperty.call(req.body, 'id_repartidor')) {
            sets.push('id_repartidor = ?');
            valores.push(null);
        }

        if (estado === 'entregado') {
            sets.push('fecha_entrega = COALESCE(fecha_entrega, NOW())');
        } else if (ESTADOS_ACTIVOS.includes(estado)) {
            sets.push('fecha_entrega = NULL');
        }

        valores.push(id_pedido);

        await connection.execute(
            `UPDATE pedido SET ${sets.join(', ')} WHERE id_pedido = ?`,
            valores
        );

        const repCalcular = id_repartidor || (pedido.id_repartidor ? Number(pedido.id_repartidor) : null);
        if (repCalcular) await recalcularPedidosActivos(connection, repCalcular);
        await connection.commit();

        const payload = { id_pedido, id_repartidor: repCalcular || null, estado };
        io.emit('pedido_estado_actualizado', payload);
        if (estado === 'entregado') io.emit('pedido_completado', payload);

        res.json({ success: true, ...payload });
    } catch (error) {
        await connection.rollback();
        console.error('Error cambiando estado del pedido:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        connection.release();
    }
});

app.get('/api/repartidor/:id_repartidor/estadisticas', checkDB, async (req, res) => {
    try {
        const { id_repartidor } = req.params;
        const hoy = fechaHoyReal();

        const [rows] = await pool.execute(`
            SELECT
                COUNT(*) AS total_asignados,
                COALESCE(SUM(CASE WHEN estado = 'entregado' THEN 1 ELSE 0 END), 0) AS entregas_completadas,
                COALESCE(SUM(CASE WHEN estado IN ('pendiente', 'confirmado', 'preparando', 'en_camino') THEN 1 ELSE 0 END), 0) AS pedidos_pendientes,
                COALESCE(SUM(CASE WHEN estado = 'entregado' AND DATE(fecha_entrega) = ? THEN 1 ELSE 0 END), 0) AS entregas_hoy,
                COALESCE(SUM(CASE WHEN estado = 'entregado' THEN total_pagar ELSE 0 END), 0) AS total_recaudado,
                COALESCE(SUM(CASE WHEN estado = 'entregado' AND DATE(fecha_entrega) = ? THEN total_pagar * 0.08 ELSE 0 END), 0) AS ganancia_hoy
              FROM pedido
             WHERE id_repartidor = ?
        `, [hoy, hoy, id_repartidor]);

        res.json({ success: true, estadisticas: rows[0], fecha_hoy: hoy });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Alias compatible con mapa.js anterior
app.get('/api/repartidor/estadisticas/:id_repartidor', checkDB, async (req, res) => {
    try {
        const { id_repartidor } = req.params;
        const hoy = fechaHoyReal();
        const [rows] = await pool.execute(`
            SELECT
                COUNT(*) AS total_asignados,
                COALESCE(SUM(CASE WHEN estado = 'entregado' THEN 1 ELSE 0 END), 0) AS entregas_completadas,
                COALESCE(SUM(CASE WHEN estado IN ('pendiente', 'confirmado', 'preparando', 'en_camino') THEN 1 ELSE 0 END), 0) AS pedidos_pendientes,
                COALESCE(SUM(CASE WHEN estado = 'entregado' AND DATE(fecha_entrega) = ? THEN 1 ELSE 0 END), 0) AS entregas_hoy,
                COALESCE(SUM(CASE WHEN estado = 'entregado' THEN total_pagar ELSE 0 END), 0) AS total_recaudado,
                COALESCE(SUM(CASE WHEN estado = 'entregado' AND DATE(fecha_entrega) = ? THEN total_pagar * 0.08 ELSE 0 END), 0) AS ganancia_hoy
              FROM pedido
             WHERE id_repartidor = ?
        `, [hoy, hoy, id_repartidor]);

        res.json({ success: true, estadisticas: rows[0], fecha_hoy: hoy });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/repartidor/:id_repartidor/disponibilidad', checkDB, async (req, res) => {
    try {
        const { id_repartidor } = req.params;
        const disponible = req.body.disponible ? 1 : 0;

        const [result] = await pool.execute(
            'UPDATE repartidor SET disponible = ? WHERE id_repartidor = ?',
            [disponible, id_repartidor]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Repartidor no encontrado' });
        }

        io.emit('repartidor_disponibilidad', { id_repartidor: Number(id_repartidor), disponible: !!disponible });
        res.json({ success: true, disponible: !!disponible });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/repartidor/:id_repartidor/perfil', checkDB, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { id_repartidor } = req.params;
        const { nombre_completo, telefono, vehiculo } = req.body;

        const [rows] = await connection.execute(
            'SELECT id_usuario FROM repartidor WHERE id_repartidor = ?',
            [id_repartidor]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, error: 'Repartidor no encontrado' });
        }

        await connection.beginTransaction();

        await connection.execute(`
            UPDATE usuario
               SET nombre_completo = COALESCE(?, nombre_completo),
                   telefono = COALESCE(?, telefono)
             WHERE id_usuario = ?
        `, [
            nombre_completo || null,
            telefono || null,
            rows[0].id_usuario
        ]);

        await connection.execute(
            'UPDATE repartidor SET vehiculo = COALESCE(?, vehiculo) WHERE id_repartidor = ?',
            [vehiculo || null, id_repartidor]
        );

        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        connection.release();
    }
});

// Compatibilidad con la versión anterior del mapa
app.get('/api/pedido/pendiente/:id_repartidor', checkDB, async (req, res) => {
    try {
        const { id_repartidor } = req.params;
        const [rows] = await pool.execute(`
            ${SELECT_PEDIDO_REPARTIDOR}
             WHERE p.id_repartidor = ?
               AND p.estado IN (${ESTADOS_ACTIVOS.map(() => '?').join(',')})
             ORDER BY p.fecha_pedido ASC
             LIMIT 1
        `, [id_repartidor, ...ESTADOS_ACTIVOS]);

        if (rows.length > 0) {
            res.json({ success: true, pedido: rows[0] });
        } else {
            res.json({ success: false, pedido: null, mensaje: 'No hay pedidos pendientes' });
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/pedido/completar', checkDB, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const id_pedido = Number(req.body.id_pedido);
        const id_repartidor = Number(req.body.id_repartidor);

        if (!id_pedido) {
            return res.status(400).json({ success: false, error: 'id_pedido requerido' });
        }

        await connection.beginTransaction();

        await connection.execute(
            `UPDATE pedido
                SET estado = 'entregado',
                    fecha_entrega = COALESCE(fecha_entrega, NOW())
              WHERE id_pedido = ?`,
            [id_pedido]
        );

        if (id_repartidor) {
            await recalcularPedidosActivos(connection, id_repartidor);
        }

        await connection.commit();

        io.emit('pedido_completado', { id_pedido, id_repartidor });
        res.json({ success: true, mensaje: 'Pedido completado exitosamente' });
    } catch (error) {
        await connection.rollback();
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        connection.release();
    }
});

app.get('/api/repartidor/:id_repartidor', checkDB, async (req, res) => {
    try {
        const { id_repartidor } = req.params;
        const [rows] = await pool.execute(`
            SELECT r.*, u.nombre_completo, u.telefono, u.correo, u.foto_perfil
              FROM repartidor r
              JOIN usuario u ON r.id_usuario = u.id_usuario
             WHERE r.id_repartidor = ?
        `, [id_repartidor]);

        if (rows.length > 0) {
            res.json({ success: true, repartidor: rows[0] });
        } else {
            res.json({ success: false, error: 'Repartidor no encontrado' });
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ UBICACIÓN EN TIEMPO REAL ============

app.post('/api/ubicacion/actualizar', checkDB, async (req, res) => {
    try {
        const id_repartidor = Number(req.body.id_repartidor);
        const id_pedido = req.body.id_pedido ? Number(req.body.id_pedido) : null;
        const lat = num(req.body.latitud);
        const lng = num(req.body.longitud);
        const precision = num(req.body.precision_gps) || 0;
        const velocidad = num(req.body.velocidad);

        if (!id_repartidor || lat === null || lng === null) {
            return res.status(400).json({ success: false, error: 'Faltan datos de ubicación' });
        }

        const [ultimas] = await pool.execute(
            `SELECT latitud, longitud, timestamp
               FROM ubicacion_repartidor
              WHERE id_repartidor = ?
              ORDER BY id_ubicacion DESC
              LIMIT 1`,
            [id_repartidor]
        );

        let insertar = true;
        let distancia = 0;

        if (ultimas.length > 0) {
            const ultima = {
                lat: Number(ultimas[0].latitud),
                lng: Number(ultimas[0].longitud)
            };
            distancia = haversine(ultima, { lat, lng });
            const segundos = (Date.now() - new Date(ultimas[0].timestamp).getTime()) / 1000;
            if (segundos < 5 && distancia < 6) insertar = false;
        }

        if (insertar) {
            await pool.execute(`
                INSERT INTO ubicacion_repartidor
                (id_repartidor, id_pedido, latitud, longitud, precision_gps, velocidad)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [id_repartidor, id_pedido, lat, lng, precision, velocidad]);

            if (id_pedido && distancia > 10) {
                await pool.execute(`
                    INSERT INTO ruta_historica
                    (id_pedido, id_repartidor, punto_orden, latitud, longitud)
                    VALUES (?, ?,
                        (SELECT COALESCE(MAX(punto_orden), 0) + 1
                           FROM (SELECT punto_orden FROM ruta_historica WHERE id_pedido = ?) AS t),
                        ?, ?)
                `, [id_pedido, id_repartidor, id_pedido, lat, lng]);
            }
        }

        const payload = {
            id_repartidor,
            id_pedido,
            latitud: lat,
            longitud: lng,
            precision_gps: precision,
            velocidad,
            timestamp: new Date().toISOString()
        };

        io.emit('ubicacion_actualizada', payload);
        io.to(`repartidor_${id_repartidor}`).emit('mi_ubicacion', payload);

        res.json({ success: true, ...payload });
    } catch (error) {
        console.error('Error actualizando ubicación:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/ubicacion/:id_repartidor', checkDB, async (req, res) => {
    try {
        const { id_repartidor } = req.params;
        const [rows] = await pool.execute(`
            SELECT *
              FROM ubicacion_repartidor
             WHERE id_repartidor = ?
             ORDER BY id_ubicacion DESC
             LIMIT 1
        `, [id_repartidor]);

        res.json({ success: true, ubicacion: rows[0] || null });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/ubicacion/:id_repartidor/historial', checkDB, async (req, res) => {
    try {
        const { id_repartidor } = req.params;
        const limite = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
        const id_pedido = req.query.id_pedido ? Number(req.query.id_pedido) : null;

        const filtro = id_pedido ? 'AND id_pedido = ?' : '';
        const valores = id_pedido ? [id_repartidor, id_pedido] : [id_repartidor];

        const [rows] = await pool.execute(`
            SELECT *
              FROM ubicacion_repartidor
             WHERE id_repartidor = ?
               ${filtro}
             ORDER BY id_ubicacion DESC
             LIMIT ${limite}
        `, valores);

        res.json({ success: true, data: rows.reverse() });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/ruta/:id_pedido', checkDB, async (req, res) => {
    try {
        const { id_pedido } = req.params;
        const [rows] = await pool.execute(`
            SELECT latitud, longitud, timestamp, punto_orden
              FROM ruta_historica
             WHERE id_pedido = ?
             ORDER BY punto_orden ASC
        `, [id_pedido]);

        res.json({ success: true, ruta: rows });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ GEOCODIFICACIÓN (direcciones de la BD) ============

const geocodeCache = new Map();

app.get('/api/geocodificar', checkDB, async (req, res) => {
    try {
        const direccion = String(req.query.direccion || '').trim();
        if (!direccion) {
            return res.status(400).json({ success: false, error: 'Dirección requerida' });
        }

        if (geocodeCache.has(direccion)) {
            return res.json({ success: true, ...geocodeCache.get(direccion), cached: true });
        }

        const consulta = `${direccion}, Medellín, Antioquia, Colombia`;
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=co&q=${encodeURIComponent(consulta)}`;
        const respuesta = await fetch(url, {
            headers: {
                'User-Agent': 'MiMini-Minimercado/1.0',
                'Accept-Language': 'es'
            }
        });

        if (!respuesta.ok) {
            throw new Error(`Nominatim respondió ${respuesta.status}`);
        }

        const data = await respuesta.json();
        if (!Array.isArray(data) || data.length === 0) {
            return res.status(404).json({ success: false, error: 'No se encontró la dirección' });
        }

        const salida = {
            lat: Number(data[0].lat),
            lng: Number(data[0].lon),
            display_name: data[0].display_name
        };

        geocodeCache.set(direccion, salida);
        res.json({ success: true, ...salida });
    } catch (error) {
        console.error('Error geocodificando:', error);
        res.status(502).json({ success: false, error: error.message });
    }
});

// ============ PRODUCTOS (catálogo público desde BD minimercado) ============
app.get('/api/productos', checkDB, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT p.id_producto, p.codigo_barras, p.nombre, p.descripcion, p.marca,
                   p.precio_venta, p.costo_compra, p.estado, p.id_categoria,
                   c.nombre AS categoria_nombre
              FROM producto p
              LEFT JOIN categoria c ON c.id_categoria = p.id_categoria
             ORDER BY p.id_producto DESC
             LIMIT 500
        `);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error listando productos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ CRUD ADMIN ============

app.get('/api/admin/proveedor', checkDB, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM proveedor ORDER BY id_proveedor DESC');
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Datos reales para el panel administrador (usuarios, repartidores, pedidos)
app.get('/api/admin/panel/usuarios', checkDB, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT id_usuario, nombre_completo, correo, telefono, rol, estado, fecha_registro
              FROM usuario
             ORDER BY id_usuario DESC
        `);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error admin usuarios:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/panel/repartidores', checkDB, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT r.id_repartidor, r.id_usuario, r.disponible, r.vehiculo,
                   u.nombre_completo, u.correo, u.telefono, u.estado
              FROM repartidor r
              JOIN usuario u ON r.id_usuario = u.id_usuario
             ORDER BY u.nombre_completo ASC
        `);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error admin repartidores:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/panel/pedidos', checkDB, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT p.id_pedido, p.estado, p.total_pagar, p.fecha_pedido, p.metodo_pago,
                   p.id_repartidor,
                   d.calle, d.numero, d.barrio, d.complemento,
                   uc.nombre_completo AS cliente_nombre,
                   ur.nombre_completo AS repartidor_nombre
              FROM pedido p
              JOIN direccion d ON p.id_direccion = d.id_direccion
              JOIN cliente c ON p.id_cliente = c.id_cliente
              JOIN usuario uc ON c.id_usuario = uc.id_usuario
              LEFT JOIN repartidor r ON p.id_repartidor = r.id_repartidor
              LEFT JOIN usuario ur ON r.id_usuario = ur.id_usuario
             ORDER BY p.fecha_pedido DESC
             LIMIT 500
        `);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error admin pedidos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/:table', checkDB, async (req, res) => {
    try {
        const { table } = req.params;
        const allowedTables = ['usuario', 'cliente', 'empleado', 'repartidor', 'categoria', 'producto', 'inventario', 'proveedor', 'pedido', 'direccion', 'zonaenvio', 'cupon', 'pago', 'resena'];

        if (!allowedTables.includes(table)) {
            return res.status(400).json({ success: false, error: 'Tabla no permitida' });
        }

        const [rows] = await pool.execute(`SELECT * FROM ${table}`);
        let stats = { total: rows.length };

        try {
            const [activeRows] = await pool.execute(`SELECT COUNT(*) as count FROM ${table} WHERE estado = 'activo'`);
            stats.activos = activeRows[0].count;
        } catch (e) {
            stats.activos = rows.length;
        }

        try {
            const [weekRows] = await pool.execute(`
                SELECT COUNT(*) as count FROM ${table}
                 WHERE fecha_registro >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            `);
            stats.ultimaSemana = weekRows[0].count;
        } catch (e) {
            stats.ultimaSemana = 0;
        }

        res.json({ success: true, data: rows, stats });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/:table/:id', checkDB, async (req, res) => {
    try {
        const { table, id } = req.params;
        const [pkInfo] = await pool.execute(`SHOW KEYS FROM ${table} WHERE Key_name = 'PRIMARY'`);
        if (pkInfo.length === 0) {
            return res.status(400).json({ success: false, error: 'No se encontró clave primaria' });
        }
        const pk = pkInfo[0].Column_name;
        const [rows] = await pool.execute(`SELECT * FROM ${table} WHERE ${pk} = ?`, [id]);

        if (rows.length > 0) {
            res.json({ success: true, data: rows[0] });
        } else {
            res.json({ success: false, error: 'Registro no encontrado' });
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/:table', checkDB, async (req, res) => {
    try {
        const { table } = req.params;
        const data = req.body;

        const [columns] = await pool.execute(`SHOW COLUMNS FROM ${table}`);
        const columnNames = columns.map(c => c.Field);

        const validData = {};
        for (const [key, value] of Object.entries(data)) {
            if (columnNames.includes(key) && value !== '' && value !== null && value !== undefined) {
                validData[key] = value;
            }
        }

        if (Object.keys(validData).length === 0) {
            return res.status(400).json({ success: false, error: 'No hay datos válidos para insertar' });
        }

        const keys = Object.keys(validData);
        const values = Object.values(validData);
        const placeholders = keys.map(() => '?').join(',');

        const [result] = await pool.execute(
            `INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`,
            values
        );

        res.json({ success: true, id: result.insertId });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/:table/:id', checkDB, async (req, res) => {
    try {
        const { table, id } = req.params;
        const data = req.body;

        const [pkInfo] = await pool.execute(`SHOW KEYS FROM ${table} WHERE Key_name = 'PRIMARY'`);
        if (pkInfo.length === 0) {
            return res.status(400).json({ success: false, error: 'No se encontró clave primaria' });
        }
        const pk = pkInfo[0].Column_name;

        const [columns] = await pool.execute(`SHOW COLUMNS FROM ${table}`);
        const columnNames = columns.map(c => c.Field);

        const updates = [];
        const values = [];
        for (const [key, value] of Object.entries(data)) {
            if (columnNames.includes(key) && key !== pk && value !== undefined) {
                updates.push(`${key} = ?`);
                values.push(value === '' ? null : value);
            }
        }

        if (updates.length === 0) {
            return res.json({ success: true, message: 'No hay datos para actualizar' });
        }

        values.push(id);
        await pool.execute(
            `UPDATE ${table} SET ${updates.join(', ')} WHERE ${pk} = ?`,
            values
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/:table/:id', checkDB, async (req, res) => {
    try {
        const { table, id } = req.params;
        const [pkInfo] = await pool.execute(`SHOW KEYS FROM ${table} WHERE Key_name = 'PRIMARY'`);
        if (pkInfo.length === 0) {
            return res.status(400).json({ success: false, error: 'No se encontró clave primaria' });
        }
        const pk = pkInfo[0].Column_name;

        await pool.execute(`DELETE FROM ${table} WHERE ${pk} = ?`, [id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ WEBSOCKET ============

io.on('connection', (socket) => {
    console.log('📡 Cliente WebSocket conectado:', socket.id);

    socket.on('repartidor_conectado', (data = {}) => {
        const id = Number(data.id_repartidor);
        if (id) {
            socket.join(`repartidor_${id}`);
            console.log(`🛵 Repartidor ${id} conectado (pedido ${data.id_pedido || '—'})`);
        }
    });

    socket.on('unirse_repartidor', (id) => {
        const n = Number(id);
        if (n) socket.join(`repartidor_${n}`);
    });

    socket.on('disconnect', () => {
        console.log('📡 Cliente WebSocket desconectado:', socket.id);
    });
});

// ============ INICIO ============

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        db: !!pool,
        database: dbConfig.database,
        hora: new Date().toISOString()
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, async () => {
    console.log('══════════════════════════════════════════');
    console.log(`🚀 Servidor MiMini corriendo en http://localhost:${PORT}`);
    console.log(`🏠 Inicio:        http://localhost:${PORT}/index.html`);
    console.log(`🛵 Repartidor:    http://localhost:${PORT}/repartidor.html`);
    console.log(`🗺️  Mapa:          http://localhost:${PORT}/mapa.html`);
    console.log(`👨‍💼 Administrador: http://localhost:${PORT}/administrador.html`);
    console.log(`🛒 Cliente:       http://localhost:${PORT}/cliente.html`);
    console.log('══════════════════════════════════════════');

    await initDB();
});
