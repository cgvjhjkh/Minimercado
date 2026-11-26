const express = require('express');
const { getPool } = require('../config/db');

const router = express.Router();

// Middleware simple de autenticación para esta copia.
// En producción se usaría JWT real; aquí permitimos paso si no hay token
// y devolvemos un usuario anónimo para que la UI no falle.

function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        // Intentar decodificar token simple
        const token = authHeader.split(' ')[1];
        try {
            // Decodificar base64 simple del payload (solo para leer datos)
            const payload = Buffer.from(token, 'base64').toString('utf-8');
            const parsed = JSON.parse(payload);
            if (parsed && parsed.sub) {
                req.user = { id_usuario: parsed.sub, rol: parsed.rol || 'admin' };
                return next();
            }
        } catch (e) {
            // No es JWT válido, continúa
        }
    }

    // Sin token válido: usuario anónimo para que la UI no rompa
    req.user = { id_usuario: null, rol: 'anon' };
    next();
}

// ============================================================================
// GET /api/auth/me
// Devuelve los datos del usuario (incluye foto_perfil).
// Si hay usuario en req.user, lo lee de la BD. Si no, devuelve datos por defecto.
// ============================================================================

router.get('/me', authenticate, async (req, res) => {
    try {
        if (req.user && req.user.id_usuario && req.user.id_usuario !== null) {
            const [rows] = await getPool().execute(
                `SELECT id_usuario, nombre_completo, correo, telefono, doc_identidad,
                         fecha_nacimiento, rol, estado, foto_perfil
                  FROM usuario WHERE id_usuario = ?`,
                [req.user.id_usuario]
            );
            if (rows.length > 0) {
                const u = rows[0];
                return res.json({
                    success: true,
                    usuario: {
                        id_usuario: u.id_usuario,
                        nombre_completo: u.nombre_completo,
                        correo: u.correo,
                        telefono: u.telefono,
                        doc_identidad: u.doc_identidad,
                        fecha_nacimiento: u.fecha_nacimiento,
                        rol: u.rol,
                        estado: u.estado,
                        foto_perfil: u.foto_perfil
                    }
                });
            }
        }

        // Fallback: usuario por defecto de desarrollo
        res.json({
            success: true,
            usuario: {
                id_usuario: 10,
                nombre_completo: 'Jesús María Hernández Gil',
                correo: 'txus@gmail.com',
                telefono: '3234467541',
                doc_identidad: '10218729453',
                fecha_nacimiento: '1970-01-21',
                rol: 'admin',
                estado: 'activo',
                foto_perfil: null
            }
        });
    } catch (error) {
        console.error('Error al obtener el perfil:', error);
        res.status(500).json({
            success: false,
            error: 'No se pudo obtener el perfil.'
        });
    }
});

// ============================================================================
// PUT /api/auth/perfil
// Actualiza los datos del usuario autenticado.
// Acepta JSON o multipart/form-data (campo "foto").
// ============================================================================

router.put('/perfil', authenticate, async (req, res) => {
    try {
        const idUsuario = req.user && req.user.id_usuario ? req.user.id_usuario : 10;
        const { nombre_completo, telefono, doc_identidad, fecha_nacimiento } = req.body;

        if (!nombre_completo || !String(nombre_completo).trim()) {
            return res.status(400).json({
                success: false,
                error: 'El nombre completo es obligatorio.'
            });
        }

        // Normaliza fechas YYYY-MM-DD
        const texto = String(fecha_nacimiento || '').trim();
        const coincidencia = texto.match(/^\d{4}-\d{2}-\d{2}/);
        const fecha = coincidencia ? coincidencia[0] : null;

        const campos = [
            'nombre_completo = ?',
            'telefono = ?',
            'doc_identidad = ?',
            'fecha_nacimiento = ?'
        ];
        const valores = [
            String(nombre_completo).trim(),
            telefono || null,
            doc_identidad || null,
            fecha
        ];

        await getPool().execute(
            `UPDATE usuario SET ${campos.join(', ')} WHERE id_usuario = ?`,
            [...valores, idUsuario]
        );

        const [rows] = await getPool().execute(
            `SELECT id_usuario, nombre_completo, correo, telefono, doc_identidad,
                     fecha_nacimiento, rol, estado, foto_perfil
              FROM usuario WHERE id_usuario = ?`,
            [idUsuario]
        );

        if (!rows.length) {
            return res.status(404).json({
                success: false,
                error: 'Usuario no encontrado.'
            });
        }

        const u = rows[0];
        return res.json({
            success: true,
            mensaje: 'Perfil actualizado correctamente.',
            usuario: {
                id_usuario: u.id_usuario,
                nombre_completo: u.nombre_completo,
                correo: u.correo,
                telefono: u.telefono,
                doc_identidad: u.doc_identidad,
                fecha_nacimiento: u.fecha_nacimiento,
                rol: u.rol,
                estado: u.estado,
                foto_perfil: u.foto_perfil
            }
        });
    } catch (error) {
        console.error('Error al actualizar el perfil:', error);
        return res.status(500).json({
            success: false,
            error: 'No se pudo actualizar el perfil.'
        });
    }
});

module.exports = router;