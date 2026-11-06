const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const { initDB, getPool } = require('./config/db');
const registerTracking = require('./sockets/tracking');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

app.use(cors());
app.use(express.json());

const ALLOWED_TABLES = ['usuario', 'cliente', 'empleado', 'repartidor', 'categoria', 'producto', 'inventario', 'proveedor', 'pedido', 'direccion', 'zonaenvio', 'cupon', 'pago', 'resena'];

// Todas las rutas /api/admin/:table... solo aceptan tablas de la lista (evita inyección SQL por el nombre de tabla)
app.param('table', (req, res, next, table) => {
    if (!ALLOWED_TABLES.includes(table)) {
        return res.status(400).json({ success: false, error: 'Tabla no permitida' });
    }
    next();
});

// Middleware para verificar conexión a BD
const checkDB = (req, res, next) => {
    if (!getPool()) {
        return res.status(503).json({ 
            success: false, 
            error: 'Base de datos no disponible. Modo demo activado.' 
        });
    }
    next();
};

app.post('/api/auth/registrar-cliente', checkDB, async (req, res) => {
    const connection = await getPool().getConnection();
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
        const [userCheck] = await getPool().execute('SELECT id_usuario FROM usuario WHERE correo = ?', [correo]);
        if (userCheck.length > 0) {
            return res.status(400).json({ success: false, error: 'El correo ya está registrado' });
        }

        // Verificar si el documento ya existe (si se proporcionó)
        if (doc_identidad) {
            const [docCheck] = await getPool().execute('SELECT id_usuario FROM usuario WHERE doc_identidad = ?', [doc_identidad]);
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

        const [rows] = await getPool().execute(`
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
        await getPool().execute(
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
        
        const [rows] = await getPool().execute(`SELECT * FROM ${table}`);
        
        let stats = { total: rows.length };
        
        try {
            const [activeRows] = await getPool().execute(`SELECT COUNT(*) as count FROM ${table} WHERE estado = 'activo'`);
            stats.activos = activeRows[0].count;
        } catch (e) {
            stats.activos = rows.length;
        }
        
        // Agregar registros de última semana
        try {
            const [weekRows] = await getPool().execute(`
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
        
        const [pkInfo] = await getPool().execute(`SHOW KEYS FROM ${table} WHERE Key_name = 'PRIMARY'`);
        if (pkInfo.length === 0) {
            return res.status(400).json({ success: false, error: 'No se encontró clave primaria' });
        }
        const pk = pkInfo[0].Column_name;
        
        const [rows] = await getPool().execute(`SELECT * FROM ${table} WHERE ${pk} = ?`, [id]);
        
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
        
        const [columns] = await getPool().execute(`SHOW COLUMNS FROM ${table}`);
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
        
        const [result] = await getPool().execute(
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
        
        const [pkInfo] = await getPool().execute(`SHOW KEYS FROM ${table} WHERE Key_name = 'PRIMARY'`);
        if (pkInfo.length === 0) {
            return res.status(400).json({ success: false, error: 'No se encontró clave primaria' });
        }
        const pk = pkInfo[0].Column_name;
        
        const [columns] = await getPool().execute(`SHOW COLUMNS FROM ${table}`);
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
        await getPool().execute(
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
        
        const [pkInfo] = await getPool().execute(`SHOW KEYS FROM ${table} WHERE Key_name = 'PRIMARY'`);
        if (pkInfo.length === 0) {
            return res.status(400).json({ success: false, error: 'No se encontró clave primaria' });
        }
        const pk = pkInfo[0].Column_name;
        
        await getPool().execute(`DELETE FROM ${table} WHERE ${pk} = ?`, [id]);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ WEBSOCKET ============
registerTracking(io);

// ============ FRONTEND (build de producción) ============
// Si existe frontend/dist (npm run build en frontend) se sirve desde aquí.
// En desarrollo se usa el servidor de Vite (puerto 5173) con proxy hacia este backend.
const distPath = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get(/^\/(?!api|socket\.io).*/, (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

// ============ INICIAR SERVIDOR ============
const PORT = process.env.PORT || 3000;

// Iniciar servidor primero, luego conectar BD
server.listen(PORT, async () => {
    console.log(`🚀 API corriendo en http://localhost:${PORT}`);
    await initDB();
});
