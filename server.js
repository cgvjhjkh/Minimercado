const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'minimercado',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool;

async function initDB() {
    try {
        pool = await mysql.createPool(dbConfig);
        console.log('✅ Conectado a MySQL');
        
        // Verificar si las tablas existen, si no crearlas
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS ubicacion_repartidor (
                id_ubicacion INT AUTO_INCREMENT PRIMARY KEY,
                id_repartidor INT NOT NULL,
                latitud DECIMAL(10,7) NOT NULL,
                longitud DECIMAL(10,7) NOT NULL,
                precision_gps INT DEFAULT 0,
                velocidad DECIMAL(5,2) DEFAULT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_repartidor (id_repartidor)
            )
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
            )
        `);
        
        console.log('✅ Tablas listas');
        return true;
    } catch (error) {
        console.error('❌ Error conectando a MySQL:', error);
        console.log('⚠️ El servidor seguirá funcionando en modo demo sin base de datos');
        return false;
    }
}

// Middleware para verificar conexión a BD
const checkDB = (req, res, next) => {
    if (!pool) {
        return res.status(503).json({ 
            success: false, 
            error: 'Base de datos no disponible. Modo demo activado.' 
        });
    }
    next();
};

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

        // Verificar si el correo ya existe
        const [userCheck] = await pool.execute('SELECT id_usuario FROM usuario WHERE correo = ?', [correo]);
        if (userCheck.length > 0) {
            return res.status(400).json({ success: false, error: 'El correo ya está registrado' });
        }

        // Verificar si el documento ya existe (si se proporcionó)
        if (doc_identidad) {
            const [docCheck] = await pool.execute('SELECT id_usuario FROM usuario WHERE doc_identidad = ?', [doc_identidad]);
            if (docCheck.length > 0) {
                return res.status(400).json({ success: false, error: 'El documento de identidad ya está registrado' });
            }
        }

        await connection.beginTransaction();

        // Insertar usuario con rol 'cliente'
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

        // Insertar en tabla cliente
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

// LOGIN
app.post('/api/auth/login', checkDB, async (req, res) => {
    try {
        const { correo, contrasena } = req.body;

        if (!correo || !contrasena) {
            return res.status(400).json({ success: false, error: 'Correo y contraseña son requeridos' });
        }

        const [rows] = await pool.execute(`
            SELECT u.id_usuario, u.nombre_completo, u.correo, u.telefono, u.doc_identidad, 
                   u.fecha_nacimiento, u.rol, u.estado,
                   c.id_cliente, r.id_repartidor, e.id_empleado
            FROM usuario u
            LEFT JOIN cliente c ON u.id_usuario = c.id_usuario
            LEFT JOIN repartidor r ON u.id_usuario = r.id_usuario
            LEFT JOIN empleado e ON u.id_usuario = e.id_usuario
            WHERE u.correo = ? AND u.contrasena_hash = ? AND u.estado = 'activo'
        `, [correo, contrasena]);

        if (rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Credenciales incorrectas o usuario inactivo' });
        }

        const usuario = rows[0];
        
        // Actualizar último acceso
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
                rol: usuario.rol,
                id_cliente: usuario.id_cliente,
                id_repartidor: usuario.id_repartidor,
                id_empleado: usuario.id_empleado
            }
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ success: false, error: 'Error interno en el servidor' });
    }
});

// ============ CRUD ADMIN ============

// Obtener todos los registros de una tabla
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
        
        // Agregar registros de última semana
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

// Obtener un registro por ID
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

// Crear nuevo registro
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

// Actualizar registro
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

// Eliminar registro
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
    
    socket.on('repartidor_conectado', (data) => {
        console.log(`🛵 Repartidor ${data.id_repartidor} conectado con pedido ${data.id_pedido}`);
    });
    
    socket.on('disconnect', () => {
        console.log('📡 Cliente WebSocket desconectado:', socket.id);
    });
});

// ============ INICIAR SERVIDOR ============
const PORT = 3000;

// Iniciar servidor primero, luego conectar BD
server.listen(PORT, async () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📱 index: http://localhost:${PORT}/index.html`);
    console.log(`👨‍💼 Panel Administrador: http://localhost:${PORT}/administrador.html`);
    
    // Intentar conectar a la base de datos
    await initDB();
});