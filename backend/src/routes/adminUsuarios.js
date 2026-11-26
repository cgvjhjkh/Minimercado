const express = require('express');
const { getPool } = require('../config/db');
const { hashPassword } = require('../utils/password');

const router = express.Router();

// Roles que el administrador puede asignar al CREAR un usuario.
const ROLES_CREACION = ['empleado', 'repartidor', 'admin'];
const ESTADOS_VALIDOS = ['activo', 'inactivo', 'suspendido'];

// Nunca devolvemos contrasena_hash al frontend.
const CAMPOS_PUBLICOS = `
    id_usuario, nombre_completo, correo, telefono, doc_identidad,
    fecha_nacimiento, rol, estado, fecha_registro, ultimo_acceso
`;

function normalizarRol(valor) {
    const rol = String(valor || '').trim().toLowerCase();
    return rol === 'administrador' ? 'admin' : rol;
}

function correoValido(correo) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
}

function limpiar(valor) {
    return typeof valor === 'string' ? valor.trim() : '';
}

function sinPool(res) {
    return res.status(503).json({
        success: false,
        error: 'Base de datos no disponible. Verifica que MySQL esté encendido y el archivo .env.'
    });
}

// Crea la fila correspondiente en cliente / empleado / repartidor si no existe.
async function asegurarPerfilRol(conn, idUsuario, rol) {
    if (rol === 'cliente') {
        const [rows] = await conn.execute(
            'SELECT id_cliente FROM cliente WHERE id_usuario = ? LIMIT 1',
            [idUsuario]
        );
        if (rows.length === 0) {
            await conn.execute(
                'INSERT INTO cliente (id_usuario, puntos_fidelidad, total_compras) VALUES (?, 0, 0.00)',
                [idUsuario]
            );
        }
        return;
    }

    if (rol === 'empleado') {
        const [rows] = await conn.execute(
            'SELECT id_empleado FROM empleado WHERE id_usuario = ? LIMIT 1',
            [idUsuario]
        );
        if (rows.length === 0) {
            await conn.execute(
                "INSERT INTO empleado (id_usuario, estado) VALUES (?, 'activo')",
                [idUsuario]
            );
        }
        return;
    }

    if (rol === 'repartidor') {
        const [rows] = await conn.execute(
            'SELECT id_repartidor FROM repartidor WHERE id_usuario = ? LIMIT 1',
            [idUsuario]
        );
        if (rows.length === 0) {
            await conn.execute(
                "INSERT INTO repartidor (id_usuario, disponible, estado) VALUES (?, 1, 'activo')",
                [idUsuario]
            );
        }
    }
}

async function contarAdminsActivos(conn) {
    const [rows] = await conn.execute(
        "SELECT COUNT(*) AS total FROM usuario WHERE rol = 'admin' AND estado = 'activo'"
    );
    return Number(rows[0].total);
}

// ============================================================
// GET /api/admin/usuarios  -> lista real desde MySQL
// ============================================================
router.get('/', async (req, res) => {
    const pool = getPool();
    if (!pool) return sinPool(res);

    try {
        const [rows] = await pool.execute(
            `SELECT ${CAMPOS_PUBLICOS} FROM usuario ORDER BY id_usuario ASC`
        );

        const stats = {
            total: rows.length,
            activos: rows.filter((u) => u.estado === 'activo').length,
            inactivos: rows.filter((u) => u.estado !== 'activo').length
        };

        res.json({ success: true, total: rows.length, stats, usuarios: rows });
    } catch (error) {
        console.error('Error listando usuarios:', error);
        res.status(500).json({ success: false, error: 'No se pudo leer la tabla usuario: ' + error.message });
    }
});

// ============================================================
// POST /api/admin/usuarios  -> crear usuario con contraseña encriptada
// ============================================================
router.post('/', async (req, res) => {
    const pool = getPool();
    if (!pool) return sinPool(res);

    const nombre_completo = limpiar(req.body.nombre_completo || req.body.nombre);
    const correo = limpiar(req.body.correo || req.body.email).toLowerCase();
    const contrasena = String(req.body.contrasena || req.body.password || req.body.contrasena_hash || '');
    const telefono = limpiar(req.body.telefono) || null;
    const doc_identidad = limpiar(req.body.doc_identidad) || null;
    const fecha_nacimiento = limpiar(req.body.fecha_nacimiento) || null;
    const rol = normalizarRol(req.body.rol);

    if (!nombre_completo || !correo || !contrasena || !rol) {
        return res.status(400).json({
            success: false,
            error: 'Nombre, correo, contraseña y rol son obligatorios.'
        });
    }
    if (!correoValido(correo)) {
        return res.status(400).json({ success: false, error: 'El correo no tiene un formato válido.' });
    }
    if (contrasena.length < 6) {
        return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres.' });
    }
    if (!ROLES_CREACION.includes(rol)) {
        return res.status(400).json({
            success: false,
            error: 'Rol no permitido. Usa: Empleado, Repartidor o Administrador.'
        });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [existe] = await conn.execute(
            'SELECT id_usuario FROM usuario WHERE correo = ? LIMIT 1',
            [correo]
        );
        if (existe.length > 0) {
            await conn.rollback();
            return res.status(409).json({ success: false, error: 'Ese correo ya está registrado.' });
        }

        const contrasena_hash = await hashPassword(contrasena);

        const [result] = await conn.execute(
            `INSERT INTO usuario
                (nombre_completo, correo, contrasena_hash, telefono, doc_identidad, fecha_nacimiento, rol, estado)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'activo')`,
            [nombre_completo, correo, contrasena_hash, telefono, doc_identidad, fecha_nacimiento, rol]
        );

        await asegurarPerfilRol(conn, result.insertId, rol);

        const [creado] = await conn.execute(
            `SELECT ${CAMPOS_PUBLICOS} FROM usuario WHERE id_usuario = ?`,
            [result.insertId]
        );

        await conn.commit();
        res.status(201).json({
            success: true,
            mensaje: 'Usuario creado correctamente.',
            usuario: creado[0]
        });
    } catch (error) {
        try { await conn.rollback(); } catch (_) {}
        console.error('Error creando usuario:', error);
        res.status(500).json({ success: false, error: 'No se pudo crear el usuario: ' + error.message });
    } finally {
        conn.release();
    }
});

// ============================================================
// PUT /api/admin/usuarios/:id  -> editar datos (contraseña opcional)
// ============================================================
router.put('/:id', async (req, res) => {
    const pool = getPool();
    if (!pool) return sinPool(res);

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ success: false, error: 'ID de usuario inválido.' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [actual] = await conn.execute(
            'SELECT id_usuario, rol FROM usuario WHERE id_usuario = ? LIMIT 1',
            [id]
        );
        if (actual.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, error: 'Usuario no encontrado.' });
        }

        const rolActual = actual[0].rol;
        const nombre_completo = limpiar(req.body.nombre_completo || req.body.nombre);
        const correo = limpiar(req.body.correo || req.body.email).toLowerCase();
        const telefono = limpiar(req.body.telefono) || null;
        const doc_identidad = limpiar(req.body.doc_identidad) || null;
        const fecha_nacimiento = limpiar(req.body.fecha_nacimiento) || null;
        const contrasena = String(req.body.contrasena || req.body.password || '');
        const rolSolicitado = req.body.rol ? normalizarRol(req.body.rol) : rolActual;
        const rol = rolSolicitado || rolActual;

        if (!nombre_completo || !correo) {
            await conn.rollback();
            return res.status(400).json({ success: false, error: 'Nombre y correo son obligatorios.' });
        }
        if (!correoValido(correo)) {
            await conn.rollback();
            return res.status(400).json({ success: false, error: 'El correo no tiene un formato válido.' });
        }

        // Un cliente existente conserva su rol; los demás roles deben ser los permitidos.
        if (rol !== rolActual && !ROLES_CREACION.includes(rol)) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                error: 'Rol no permitido. Usa: Empleado, Repartidor o Administrador.'
            });
        }

        const [duplicado] = await conn.execute(
            'SELECT id_usuario FROM usuario WHERE correo = ? AND id_usuario <> ? LIMIT 1',
            [correo, id]
        );
        if (duplicado.length > 0) {
            await conn.rollback();
            return res.status(409).json({ success: false, error: 'Ese correo ya está registrado por otro usuario.' });
        }

        const campos = [
            'nombre_completo = ?',
            'correo = ?',
            'telefono = ?',
            'doc_identidad = ?',
            'fecha_nacimiento = ?',
            'rol = ?'
        ];
        const valores = [nombre_completo, correo, telefono, doc_identidad, fecha_nacimiento, rol];

        if (contrasena) {
            if (contrasena.length < 6) {
                await conn.rollback();
                return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres.' });
            }
            campos.push('contrasena_hash = ?');
            valores.push(await hashPassword(contrasena));
        }

        valores.push(id);
        await conn.execute(
            `UPDATE usuario SET ${campos.join(', ')} WHERE id_usuario = ?`,
            valores
        );

        if (rol !== rolActual) {
            await asegurarPerfilRol(conn, id, rol);
        }

        const [actualizado] = await conn.execute(
            `SELECT ${CAMPOS_PUBLICOS} FROM usuario WHERE id_usuario = ?`,
            [id]
        );

        await conn.commit();
        res.json({
            success: true,
            mensaje: 'Usuario actualizado correctamente.',
            usuario: actualizado[0]
        });
    } catch (error) {
        try { await conn.rollback(); } catch (_) {}
        console.error('Error actualizando usuario:', error);
        res.status(500).json({ success: false, error: 'No se pudo actualizar el usuario: ' + error.message });
    } finally {
        conn.release();
    }
});

// ============================================================
// PATCH /api/admin/usuarios/:id/estado  -> activar / desactivar
// ============================================================
router.patch('/:id/estado', async (req, res) => {
    const pool = getPool();
    if (!pool) return sinPool(res);

    const id = Number(req.params.id);
    const estado = String(req.body.estado || '').trim().toLowerCase();

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ success: false, error: 'ID de usuario inválido.' });
    }
    if (!ESTADOS_VALIDOS.includes(estado)) {
        return res.status(400).json({
            success: false,
            error: 'Estado inválido. Valores permitidos: activo, inactivo, suspendido.'
        });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [rows] = await conn.execute(
            'SELECT id_usuario, rol, estado FROM usuario WHERE id_usuario = ? LIMIT 1',
            [id]
        );
        if (rows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, error: 'Usuario no encontrado.' });
        }

        const usuario = rows[0];
        if (usuario.rol === 'admin' && estado !== 'activo') {
            const activos = await contarAdminsActivos(conn);
            if (activos <= 1) {
                await conn.rollback();
                return res.status(400).json({
                    success: false,
                    error: 'No puedes desactivar al último administrador activo.'
                });
            }
        }

        await conn.execute(
            'UPDATE usuario SET estado = ? WHERE id_usuario = ?',
            [estado, id]
        );

        // Mantener sincronizado el estado en las tablas de perfil cuando existan.
        const estadoPerfil = estado === 'activo' ? 'activo' : 'inactivo';
        await conn.execute('UPDATE empleado SET estado = ? WHERE id_usuario = ?', [estadoPerfil, id]);
        await conn.execute('UPDATE repartidor SET estado = ? WHERE id_usuario = ?', [estadoPerfil, id]);

        const [actualizado] = await conn.execute(
            `SELECT ${CAMPOS_PUBLICOS} FROM usuario WHERE id_usuario = ?`,
            [id]
        );

        await conn.commit();
        res.json({
            success: true,
            mensaje: `Usuario ${estado === 'activo' ? 'activado' : 'desactivado'} correctamente.`,
            usuario: actualizado[0]
        });
    } catch (error) {
        try { await conn.rollback(); } catch (_) {}
        console.error('Error cambiando estado de usuario:', error);
        res.status(500).json({ success: false, error: 'No se pudo cambiar el estado: ' + error.message });
    } finally {
        conn.release();
    }
});

// ============================================================
// DELETE /api/admin/usuarios/:id
// ============================================================
router.delete('/:id', async (req, res) => {
    const pool = getPool();
    if (!pool) return sinPool(res);

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ success: false, error: 'ID de usuario inválido.' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [rows] = await conn.execute(
            'SELECT id_usuario, rol FROM usuario WHERE id_usuario = ? LIMIT 1',
            [id]
        );
        if (rows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, error: 'Usuario no encontrado.' });
        }

        if (rows[0].rol === 'admin') {
            const activos = await contarAdminsActivos(conn);
            if (activos <= 1) {
                await conn.rollback();
                return res.status(400).json({
                    success: false,
                    error: 'No puedes eliminar al último administrador activo.'
                });
            }
        }

        await conn.execute('DELETE FROM cliente WHERE id_usuario = ?', [id]);
        await conn.execute('DELETE FROM empleado WHERE id_usuario = ?', [id]);
        await conn.execute('DELETE FROM repartidor WHERE id_usuario = ?', [id]);
        await conn.execute('DELETE FROM usuario WHERE id_usuario = ?', [id]);

        await conn.commit();
        res.json({ success: true, mensaje: 'Usuario eliminado correctamente.' });
    } catch (error) {
        try { await conn.rollback(); } catch (_) {}
        console.error('Error eliminando usuario:', error);

        if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.errno === 1451) {
            return res.status(409).json({
                success: false,
                error: 'El usuario tiene pedidos u otros registros asociados. Desactívalo en lugar de eliminarlo.'
            });
        }

        res.status(500).json({ success: false, error: 'No se pudo eliminar el usuario: ' + error.message });
    } finally {
        conn.release();
    }
});

module.exports = router;
