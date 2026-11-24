// ============================================================
//  API de notificaciones de la campanita.
//  Montada en /api/notificaciones.
// ============================================================
const express = require('express');
const { getPool } = require('../config/db');

const router = express.Router();

const checkDB = (req, res, next) => {
    if (!getPool()) {
        return res.status(503).json({
            success: false,
            error: 'Base de datos no disponible. Modo demo activado.'
        });
    }
    next();
};

function normalizarNotificacion(fila) {
    if (!fila) return null;
    return {
        ...fila,
        leida: Boolean(fila.leida),
        datos_adicionales: fila.datos_adicionales || null
    };
}

// GET /api/notificaciones/:id_usuario?limit=30
router.get('/:id_usuario', checkDB, async (req, res) => {
    try {
        const idUsuario = Number(req.params.id_usuario);
        if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
            return res.status(400).json({ success: false, error: 'Usuario inválido.' });
        }

        const limite = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
        const pool = getPool();

        const [rows] = await pool.execute(
            `SELECT id_notificacion, id_usuario, titulo, mensaje, tipo, leida,
                    fecha_envio, datos_adicionales
               FROM notificacion
              WHERE id_usuario = ?
              ORDER BY leida ASC, fecha_envio DESC, id_notificacion DESC
              LIMIT ${limite}`,
            [idUsuario]
        );

        const [conteo] = await pool.execute(
            'SELECT COUNT(*) AS total FROM notificacion WHERE id_usuario = ? AND leida = 0',
            [idUsuario]
        );

        res.json({
            success: true,
            no_leidas: Number(conteo[0]?.total || 0),
            notificaciones: rows.map(normalizarNotificacion)
        });
    } catch (error) {
        console.error('Error listando notificaciones:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PATCH /api/notificaciones/:id_notificacion/leida
router.patch('/:id_notificacion/leida', checkDB, async (req, res) => {
    try {
        const id = Number(req.params.id_notificacion);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ success: false, error: 'Notificación inválida.' });
        }

        const [result] = await getPool().execute(
            'UPDATE notificacion SET leida = 1 WHERE id_notificacion = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Notificación no encontrada.' });
        }

        res.json({ success: true, id_notificacion: id });
    } catch (error) {
        console.error('Error marcando notificación:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PATCH /api/notificaciones/:id_notificacion/no-leida
router.patch('/:id_notificacion/no-leida', checkDB, async (req, res) => {
    try {
        const id = Number(req.params.id_notificacion);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ success: false, error: 'Notificación inválida.' });
        }

        await getPool().execute(
            'UPDATE notificacion SET leida = 0 WHERE id_notificacion = ?',
            [id]
        );

        res.json({ success: true, id_notificacion: id });
    } catch (error) {
        console.error('Error marcando notificación:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PATCH /api/notificaciones/usuario/:id_usuario/leer-todas
router.patch('/usuario/:id_usuario/leer-todas', checkDB, async (req, res) => {
    try {
        const idUsuario = Number(req.params.id_usuario);
        if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
            return res.status(400).json({ success: false, error: 'Usuario inválido.' });
        }

        await getPool().execute(
            'UPDATE notificacion SET leida = 1 WHERE id_usuario = ? AND leida = 0',
            [idUsuario]
        );

        res.json({ success: true, id_usuario: idUsuario, no_leidas: 0 });
    } catch (error) {
        console.error('Error marcando notificaciones:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
