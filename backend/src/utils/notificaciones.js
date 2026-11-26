// ============================================================
//  Notificaciones persistidas en MySQL + eventos en tiempo real.
//  La campanita del administrador y del empleado leen esta tabla.
// ============================================================
const { getPool } = require('../config/db');

function normalizarDatos(datos) {
    if (datos === undefined || datos === null) return null;
    if (typeof datos === 'string') return datos;
    try {
        return JSON.stringify(datos);
    } catch (_) {
        return null;
    }
}

// Crea una notificación para un usuario concreto y la emite por WebSocket.
async function crearNotificacion(pool, io, notificacion) {
    const {
        id_usuario,
        titulo,
        mensaje,
        tipo = 'sistema',
        datos = null
    } = notificacion;

    if (!id_usuario) return null;

    const [result] = await pool.execute(
        `INSERT INTO notificacion
            (id_usuario, titulo, mensaje, tipo, leida, datos_adicionales)
         VALUES (?, ?, ?, ?, 0, ?)`,
        [id_usuario, titulo, mensaje, tipo, normalizarDatos(datos)]
    );

    const creada = {
        id_notificacion: result.insertId,
        id_usuario: Number(id_usuario),
        titulo,
        mensaje,
        tipo,
        leida: 0,
        fecha_envio: new Date().toISOString(),
        datos_adicionales: datos || null
    };

    // Un único evento por notificación, dirigido al usuario destinatario.
    // La campanita se une a la room `usuario:<id>` al conectar.
    if (io) io.to(`usuario:${id_usuario}`).emit('nueva_notificacion', creada);

    return creada;
}

// Envía la misma notificación a todos los administradores activos.
async function notificarAdmins(io, notificacion) {
    const pool = getPool();
    if (!pool) return [];

    const [admins] = await pool.execute(
        `SELECT id_usuario
           FROM usuario
          WHERE rol IN ('admin', 'administrador')
            AND estado = 'activo'`
    );

    const creadas = [];

    for (const admin of admins) {
        const creada = await crearNotificacion(pool, io, {
            ...notificacion,
            id_usuario: admin.id_usuario
        });
        if (creada) creadas.push(creada);
    }

    return creadas;
}

async function contarNoLeidas(idUsuario) {
    const pool = getPool();
    if (!pool || !idUsuario) return 0;

    const [rows] = await pool.execute(
        'SELECT COUNT(*) AS total FROM notificacion WHERE id_usuario = ? AND leida = 0',
        [idUsuario]
    );

    return Number(rows[0]?.total || 0);
}

module.exports = {
    crearNotificacion,
    notificarAdmins,
    contarNoLeidas
};
