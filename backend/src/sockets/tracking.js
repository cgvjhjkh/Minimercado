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

        // Envia a este socket el número de notificaciones sin leer del usuario.
        function emitirContador() {
            const id = socket.usuario?.id;
            const pool = getPool();
            if (!id || !pool) return;

            pool.execute(
                'SELECT COUNT(*) AS cnt FROM notificacion WHERE id_usuario = ? AND leida = 0',
                [id]
            ).then(([rows]) => {
                const count = Number(rows[0]?.cnt || 0);
                socket.emit('contador_no_leidos', { count, id_usuario: id });
                io.to(`usuario:${id}`).emit('contador_actualizado', { count, id_usuario: id });
            }).catch(() => {});
        }

        // Rooms solicitadas explícitamente por el cliente (campanita / SocketContext).
        // El login actual no siempre entrega token, así que estos datos del cliente
        // también identifican al socket para los eventos de notificaciones.
        socket.on('join_room', (data = {}) => {
            if (data.rol) {
                socket.join(`rol:${data.rol}`);
                socket.usuario = { ...(socket.usuario || {}), rol: data.rol };
            }
            const id = Number(data.id_usuario);
            if (Number.isFinite(id) && id > 0) {
                socket.join(`usuario:${id}`);
                socket.usuario = { ...(socket.usuario || {}), id };
                emitirContador();
            }
        });

        // El panel del repartidor avisa que está en línea para recibir sus eventos
        socket.on('repartidor_conectado', (data = {}) => {
            const id = Number(data.id_repartidor);
            if (Number.isFinite(id) && id > 0) {
                socket.join(`repartidor_${id}`);
                socket.emit('repartidor_registrado', { id_repartidor: id });
            }
        });

        // Monitor de repartidor (mapa a pantalla completa)
        socket.on('unirse_repartidor', (id) => {
            const n = Number(id);
            if (Number.isFinite(n) && n > 0) socket.join(`repartidor_${n}`);
        });

        // Unirse a rooms según el rol
        if (usuario.id) {
            socket.join(`usuario:${usuario.id}`);
        }
        if (usuario.rol) {
            socket.join(`rol:${usuario.rol}`);
        }

        // Solicitar contador de no leídos al conectar (cuando hay token)
        if (usuario.id) emitirContador();

        // Marcar notificación como leída
        socket.on('notificacion_marcar_leido', async (data = {}) => {
            const { id_notificacion } = data;
            const idUsuario = socket.usuario?.id;
            if (!id_notificacion || !idUsuario) return;
            const pool = getPool();
            if (!pool) return;
            try {
                await pool.execute(
                    'UPDATE notificacion SET leida = 1 WHERE id_notificacion = ? AND id_usuario = ?',
                    [id_notificacion, idUsuario]
                );
                emitirContador();
            } catch (err) {
                console.error('Error marcando notificación:', err.message);
            }
        });

        // Solicitar contador (re-sincronización)
        socket.on('solicitar_contador', () => emitirContador());

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