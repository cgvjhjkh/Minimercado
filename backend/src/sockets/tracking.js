const { getPool } = require('../config/db');

// Eventos de Socket.io para el rastreo de pedidos en tiempo real
function registerTracking(io) {
    io.on('connection', (socket) => {
        console.log('📡 Cliente WebSocket conectado:', socket.id);

        // El repartidor avisa que salió con un pedido
        socket.on('repartidor_conectado', (data = {}) => {
            console.log(`🛵 Repartidor ${data.id_repartidor} conectado con pedido ${data.id_pedido}`);
            if (data.id_pedido) socket.join(`pedido:${data.id_pedido}`);
        });

        // El cliente se suscribe al rastreo de su pedido
        socket.on('seguir_pedido', (data = {}) => {
            if (data.id_pedido) socket.join(`pedido:${data.id_pedido}`);
        });

        // El repartidor envía su posición: se retransmite y (si hay BD) se guarda
        socket.on('ubicacion_repartidor', async (data = {}) => {
            const { id_repartidor, id_pedido, latitud, longitud, precision_gps, velocidad } = data;
            if (!id_repartidor || latitud == null || longitud == null) return;

            io.to(`pedido:${id_pedido}`).emit('ubicacion_actualizada', {
                id_repartidor, id_pedido, latitud, longitud, velocidad, timestamp: Date.now()
            });

            const pool = getPool();
            if (!pool) return;
            try {
                await pool.execute(
                    `INSERT INTO ubicacion_repartidor
                     (id_repartidor, latitud, longitud, precision_gps, velocidad)
                     VALUES (?, ?, ?, ?, ?)`,
                    [id_repartidor, latitud, longitud, precision_gps || 0, velocidad ?? null]
                );
            } catch (error) {
                console.error('Error guardando ubicación:', error.message);
            }
        });

        socket.on('disconnect', () => {
            console.log('📡 Cliente WebSocket desconectado:', socket.id);
        });
    });
}

module.exports = registerTracking;
