const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const { initDB, getPool } = require('./config/db');
const registerTracking = require('./sockets/tracking');
const { hashPassword, verifyPassword, esHashBcrypt } = require('./utils/password');
const adminUsuariosRoutes = require('./routes/adminUsuarios');
const notificacionesRoutes = require('./routes/notificaciones');

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

// Rutas de perfil y auth (antes que el CRUD genérico)
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

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

// Healthcheck: útil para comprobar que el backend y MySQL están vivos.
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        servicio: 'minimercado-api',
        baseDeDatos: getPool() ? 'conectada' : 'no disponible',
        timestamp: new Date().toISOString()
    });
});

// Endpoints específicos de usuarios (deben ir ANTES del CRUD genérico /api/admin/:table)
app.use('/api/admin/usuarios', adminUsuariosRoutes);

// API del repartidor: pedidos, estados, disponibilidad, perfil,
// estadísticas, ubicación en tiempo real y rutas históricas.
const repartidorRoutes = require('./routes/repartidor');
app.use('/api', repartidorRoutes(io));

// API del módulo empleado (inventario, picking, daños) y de la campanita.
// Se crea con `io` para poder avisar a los administradores en tiempo real.
const crearRouterEmpleado = require('./routes/empleado');
app.use('/api', crearRouterEmpleado(io));
app.use('/api/notificaciones', notificacionesRoutes);


app.post('/api/auth/registrar-cliente', checkDB, async (req, res) => {
    let connection;
    try {
        connection = await getPool().getConnection();

        const { 
            nombre_completo, 
            telefono, 
            doc_identidad, 
            fecha_nacimiento 
        } = req.body;

        const correo = String(req.body.correo || '').trim().toLowerCase();
        const clavePlano = String(
            req.body.contrasena || req.body.password || req.body.contrasena_hash || ''
        );

        if (!nombre_completo || !correo || !clavePlano) {
            return res.status(400).json({ success: false, error: 'Campos obligatorios incompletos' });
        }
        if (clavePlano.length < 6) {
            return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres' });
        }

        // Verificar si el correo ya existe
        const [userCheck] = await connection.execute('SELECT id_usuario FROM usuario WHERE correo = ?', [correo]);
        if (userCheck.length > 0) {
            return res.status(400).json({ success: false, error: 'El correo ya está registrado' });
        }

        // Verificar si el documento ya existe (si se proporcionó)
        if (doc_identidad) {
            const [docCheck] = await connection.execute('SELECT id_usuario FROM usuario WHERE doc_identidad = ?', [doc_identidad]);
            if (docCheck.length > 0) {
                return res.status(400).json({ success: false, error: 'El documento de identidad ya está registrado' });
            }
        }

        await connection.beginTransaction();

        // La contraseña SIEMPRE se guarda encriptada con bcrypt.
        const contrasena_hash = await hashPassword(clavePlano);

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
        if (connection) { try { await connection.rollback(); } catch (_) {} }
        console.error('Error en registro:', error);
        res.status(500).json({ success: false, error: 'Error interno en el servidor' });
    } finally {
        if (connection) connection.release();
    }
});

// LOGIN
app.post('/api/auth/login', checkDB, async (req, res) => {
    try {
        const correo = String(req.body.correo || '').trim().toLowerCase();
        const contrasena = String(req.body.contrasena || req.body.password || '');

        if (!correo || !contrasena) {
            return res.status(400).json({ success: false, error: 'Correo y contraseña son requeridos' });
        }

        const [rows] = await getPool().execute(`
            SELECT u.id_usuario, u.nombre_completo, u.correo, u.telefono, u.doc_identidad, 
                   u.fecha_nacimiento, u.rol, u.estado, u.contrasena_hash, u.foto_perfil,
                   c.id_cliente, r.id_repartidor, r.disponible, r.vehiculo, e.id_empleado
            FROM usuario u
            LEFT JOIN cliente c ON u.id_usuario = c.id_usuario
            LEFT JOIN repartidor r ON u.id_usuario = r.id_usuario
            LEFT JOIN empleado e ON u.id_usuario = e.id_usuario
            WHERE u.correo = ?
            LIMIT 1
        `, [correo]);

        if (rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Credenciales incorrectas o usuario inactivo' });
        }

        const usuario = rows[0];

        // Compara bcrypt y también los registros legacy en texto plano.
        const claveValida = await verifyPassword(contrasena, usuario.contrasena_hash);
        if (!claveValida) {
            return res.status(401).json({ success: false, error: 'Credenciales incorrectas o usuario inactivo' });
        }

        if (usuario.estado !== 'activo') {
            return res.status(401).json({ success: false, error: 'Tu cuenta está inactiva. Contacta al administrador.' });
        }

        // Migración transparente: si la contraseña estaba en texto plano, se re-encripta.
        if (!esHashBcrypt(usuario.contrasena_hash)) {
            const nuevoHash = await hashPassword(contrasena);
            await getPool().execute(
                'UPDATE usuario SET contrasena_hash = ? WHERE id_usuario = ?',
                [nuevoHash, usuario.id_usuario]
            );
        }
        
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

// ============ CRUD ADMIN ============

// Obtener todos los registros de una tabla
app.get('/api/admin/:table', checkDB, async (req, res) => {
    try {
        const { table } = req.params;

        // Para usuario nunca exponemos contrasena_hash.
        const selectSql = table === 'usuario'
            ? `SELECT id_usuario, nombre_completo, correo, telefono, doc_identidad,
                      fecha_nacimiento, rol, estado, fecha_registro, ultimo_acceso
               FROM usuario`
            : `SELECT * FROM ${table}`;

        const [rows] = await getPool().execute(selectSql);
        
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

        if (table === 'usuario') {
            return res.status(400).json({
                success: false,
                error: 'Usa /api/admin/usuarios para crear usuarios (contraseña encriptada y roles validados).'
            });
        }
        
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

        if (table === 'usuario') {
            return res.status(400).json({
                success: false,
                error: 'Usa /api/admin/usuarios/:id para actualizar usuarios.'
            });
        }
        
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

        if (table === 'usuario') {
            return res.status(400).json({
                success: false,
                error: 'Usa /api/admin/usuarios/:id para eliminar usuarios.'
            });
        }
        
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

// 404 específico de la API (evita devolver HTML en rutas /api inexistentes)
app.use('/api', (req, res) => {
    res.status(404).json({ success: false, error: 'Ruta de API no encontrada.' });
});

// ============ FRONTEND (build de producción) ============
// Archivos subidos por los usuarios (fotos de perfil)
const uploadsPath = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsPath));

// Si existe frontend/dist (npm run build en frontend) se sirve desde aquí.
// En desarrollo se usa el servidor de Vite (puerto 5173) con proxy hacia este backend.
const distPath = path.join(__dirname, '..', '..', 'frontend', 'dist');
const hayBuild = fs.existsSync(path.join(distPath, 'index.html'));

if (hayBuild) {
    app.use(express.static(distPath));
    app.get(/^\/(?!api|socket\.io).*/, (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
} else {
    // Sin build, el backend sigue siendo útil: mostramos instrucciones claras
    // en lugar de un 404 confuso al abrir http://localhost:3000
    const paginaAyuda = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Minimercado - Backend activo</title>
  <style>
    body{font-family:system-ui,Segoe UI,Arial,sans-serif;background:#f7f5f0;color:#1a1a18;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;}
    .card{background:#fff;border:1px solid #e0ddd5;border-radius:16px;padding:32px 36px;max-width:620px;box-shadow:0 10px 40px rgba(0,0,0,.08);}
    h1{margin:0 0 8px;font-size:1.5rem;}
    p{line-height:1.55;color:#444;}
    code{background:#f1f5f9;padding:2px 6px;border-radius:5px;}
    .ok{color:#16a34a;font-weight:700;}
    ol{padding-left:20px;line-height:1.9;}
    a{color:#2563eb;}
  </style>
</head>
<body>
  <div class="card">
    <h1>Minimercado API <span class="ok">activa</span></h1>
    <p>El backend está corriendo, pero todavía no existe el build del frontend
       (<code>frontend/dist</code>). Por eso esta URL no muestra la tienda.</p>
    <p><strong>Abre la tienda en el servidor de desarrollo de Vite:</strong></p>
    <p style="font-size:1.2rem;"><a href="http://localhost:5173/">http://localhost:5173/</a></p>
    <p>Si aún no lo tienes encendido, ejecuta en otra terminal:</p>
    <ol>
      <li><code>cd frontend</code></li>
      <li><code>npm install</code> (solo la primera vez)</li>
      <li><code>npm run dev</code></li>
    </ol>
    <p>Para servir todo desde este puerto en producción:</p>
    <ol>
      <li><code>cd frontend</code> y <code>npm run build</code></li>
      <li>Reinicia este backend y abre <code>http://localhost:3000/</code></li>
    </ol>
    <p>Estado de la API: <a href="/api/health">/api/health</a></p>
  </div>
</body>
</html>`;

    app.get('/', (req, res) => res.status(200).send(paginaAyuda));
    app.use((req, res) => res.status(404).send(paginaAyuda));
    console.log('⚠️ No existe frontend/dist. Abre el frontend en http://localhost:5173 (npm run dev).');
}

// Manejo centralizado de errores (JSON inválido, etc.)
app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') {
        return res.status(400).json({ success: false, error: 'JSON inválido en la petición.' });
    }
    console.error('Error no controlado:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor.' });
});

// ============ INICIAR SERVIDOR ============
const PORT = process.env.PORT || 3000;

// Iniciar servidor primero, luego conectar BD
server.listen(PORT, async () => {
    console.log(`🚀 API corriendo en http://localhost:${PORT}`);
    await initDB();
});
