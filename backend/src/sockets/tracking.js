const { getPool } = require('../config/db');

// Eventos de Socket.io para notificaciones y chat en tiempo real
function registerSocketEvents(io) {
    // Autenticación opcional del socket
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token) return next();
        try {
            const payload = Buffer.from(token.split('.')[1] || '', 'base64').toString('utf-8');
            const parsed = JSON.parse(payload);
            if (parsed && parsed.sub) {
                socket.usuario = { id: parsed.sub, rol: parsed.rol || 'anon' };
            }
            next();
        } catch (error) {
            next();
        }
    });

    io.on('connection', (socket) => {
        const usuario = socket.usuario || { id: null, rol: 'anon' };
        console.log(`📡 WebSocket conectado: ${socket.id} - Rol: ${usuario.rol} - ID: ${usuario.id}`);

        // Unirse a rooms según el rol
        if (usuario.id) {
            socket.join(`usuario:${usuario.id}`);
        }
        if (usuario.rol) {
            socket.join(`rol:${usuario.rol}`);
        }

        // Solicitar contador de no leídos al conectar
        if (usuario.id) {
            const pool = getPool();
            if (pool) {
                pool.execute(
                    'SELECT COUNT(*) AS cnt FROM notificacion WHERE leida = 0 AND rol_destino = ?',
                    [usuario.rol]
                ).then(([rows]) => {
                    socket.emit('contador_no_leidos', { count: rows[0].cnt, rol: usuario.rol });
                }).catch(() => {});
            }
        }

        // Marcar notificación como leída
        socket.on('notificacion_marcar_leido', async (data = {}) => {
            const { id_notificacion } = data;
            if (!id_notificacion) return;
            const pool = getPool();
            if (!pool) return;
            try {
                await pool.execute(
                    'UPDATE notificacion SET leida = 1 WHERE id_notificacion = ?',
                    [id_notificacion]
                );
                const rol = usuario.rol || 'anon';
                pool.execute(
                    'SELECT COUNT(*) AS cnt FROM notificacion WHERE leida = 0 AND rol_destino = ?',
                    [rol]
                ).then(([rows]) => {
                    const newCount = rows[0].cnt;
                    io.to(`rol:${rol}`).emit('contador_actualizado', { count: newCount, rol });
                    socket.emit('contador_no_leidos', { count: newCount, rol });
                });
            } catch (err) {
                console.error('Error marcando notificación:', err.message);
            }
        });

        // Solicitar contador (re-sincronización)
        socket.on('solicitar_contador', async () => {
            const usuario = socket.usuario || { id: null, rol: 'anon' };
            if (!usuario.id) return;
            const pool = getPool();
            if (!pool) return;
            try {
                await pool.execute(
                    'SELECT COUNT(*) AS cnt FROM notificacion WHERE leida = 0 AND rol_destino = ?',
                    [usuario.rol]
                ).then(([rows]) => {
                    socket.emit('contador_no_leidos', { count: rows[0].cnt, rol: usuario.rol });
                });
            } catch (err) {
                console.error('Error obteniendo contador:', err.message);
            }
        });

        // Nuevo mensaje de chat
        socket.on('mensaje_chat_enviar', async (data = {}) => {
            const { id_receptor, contenido, tipo } = data;
            if (!id_receptor || !contenido) return;
            const pool = getPool();
            if (!pool) return;
            try {
                await pool.execute(
                    'INSERT INTO mensajes_chat (id_emisor, id_receptor, contenido, tipo) VALUES (?, ?, ?, ?)',
                    [usuario.id, id_receptor, contenido, tipo || 'texto']
                );
                const [userRows] = await pool.execute(
                    'SELECT nombre_completo FROM usuario WHERE id_usuario = ?',
                    [usuario.id]
                );
                const nombre = userRows.length ? userRows[0].nombre_completo : 'Usuario';
                io.to(`usuario:${id_receptor}`).emit('nuevo_mensaje', {
                    id_emisor: usuario.id, nombre, contenido, tipo: tipo || 'texto', fecha: new Date().toLocaleString()
                });
                if (usuario.rol) {
                    io.to(`rol:${usuario.rol}`).emit('nuevo_mensaje_publico', {
                        id_emisor: usuario.id, rol: usuario.rol, nombre, contenido, tipo: tipo || 'texto'
                    });
                }
            } catch (err) {
                console.error('Error en mensaje_chat:', err.message);
            }
        });

        socket.on('disconnect', () => {
            console.log(`📡 WebSocket desconectado: ${socket.id} - Rol: ${usuario.rol}`);
        });
    });
}

module.exports = registerSocketEvents;