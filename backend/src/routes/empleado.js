// ============================================================
//  API del módulo empleado: inventario, picking, entradas,
//  ajustes de stock, reportes de daño y pedidos empacados.
//  Montada en /api por server.js (factory para recibir io).
// ============================================================
const express = require('express');
const { getPool } = require('../config/db');
const { notificarAdmins } = require('../utils/notificaciones');

const ESTADOS_ACTIVOS = ['pendiente', 'confirmado', 'preparando', 'en_camino'];

function numPositivo(valor) {
    const n = Number(valor);
    return Number.isInteger(n) && n > 0 ? n : null;
}

function texto(valor, max = 255) {
    return String(valor || '').trim().slice(0, max);
}

module.exports = function crearRouterEmpleado(io) {
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

    const emitirAdmin = (evento, payload) => {
        if (io) io.to('rol:admin').emit(evento, payload);
    };

    // Devuelve id_empleado / nombre a partir del id_usuario de la sesión.
    async function datosEmpleado(idUsuario) {
        const pool = getPool();
        const [rows] = await pool.execute(
            `SELECT e.id_empleado, u.id_usuario, u.nombre_completo
               FROM usuario u
               LEFT JOIN empleado e ON e.id_usuario = u.id_usuario
              WHERE u.id_usuario = ?
              LIMIT 1`,
            [idUsuario]
        );
        return rows[0] || null;
    }

    // ---------- Inventario ----------
    router.get('/empleado/inventario', checkDB, async (req, res) => {
        try {
            const [rows] = await getPool().query(`
                SELECT p.id_producto,
                       p.codigo_barras,
                       p.nombre,
                       p.descripcion,
                       p.marca,
                       p.precio_venta,
                       p.estado,
                       p.id_categoria,
                       c.nombre AS categoria,
                       COALESCE((
                           SELECT i.existencia FROM inventario i
                           WHERE i.id_producto = p.id_producto
                           ORDER BY i.id_inventario ASC LIMIT 1
                       ), 0) AS existencia,
                       COALESCE((
                           SELECT i.stock_minimo FROM inventario i
                           WHERE i.id_producto = p.id_producto
                           ORDER BY i.id_inventario ASC LIMIT 1
                       ), 0) AS stock_minimo,
                       (
                           SELECT i.ubicacion_fisica FROM inventario i
                           WHERE i.id_producto = p.id_producto
                           ORDER BY i.id_inventario ASC LIMIT 1
                       ) AS ubicacion
                  FROM producto p
                  LEFT JOIN categoria c ON c.id_categoria = p.id_categoria
                 WHERE p.estado = 'activo'
                 ORDER BY c.nombre ASC, p.nombre ASC
            `);

            res.json({ success: true, inventario: rows });
        } catch (error) {
            console.error('Error listando inventario del empleado:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Registrar entrada de mercancía (suma existencias).
    router.post('/empleado/inventario/:id_producto/entrada', checkDB, async (req, res) => {
        const pool = getPool();
        const connection = await pool.getConnection();
        try {
            const idProducto = numPositivo(req.params.id_producto);
            const cantidad = numPositivo(req.body.cantidad);
            const ubicacion = texto(req.body.ubicacion, 100) || null;

            if (!idProducto || !cantidad) {
                return res.status(400).json({
                    success: false,
                    error: 'Producto y cantidad mayor a cero son obligatorios.'
                });
            }

            await connection.beginTransaction();

            const [producto] = await connection.execute(
                'SELECT nombre FROM producto WHERE id_producto = ?',
                [idProducto]
            );
            if (!producto.length) {
                await connection.rollback();
                return res.status(404).json({ success: false, error: 'Producto no encontrado.' });
            }

            const [inventario] = await connection.execute(
                'SELECT id_inventario FROM inventario WHERE id_producto = ? ORDER BY id_inventario ASC LIMIT 1',
                [idProducto]
            );

            if (inventario.length) {
                await connection.execute(
                    `UPDATE inventario
                        SET existencia = existencia + ?,
                            ubicacion_fisica = COALESCE(?, ubicacion_fisica),
                            fecha_actualizacion = NOW()
                      WHERE id_inventario = ?`,
                    [cantidad, ubicacion, inventario[0].id_inventario]
                );
            } else {
                await connection.execute(
                    `INSERT INTO inventario (id_producto, existencia, stock_minimo, ubicacion_fisica)
                     VALUES (?, ?, 0, ?)`,
                    [idProducto, cantidad, ubicacion]
                );
            }

            const [actualizado] = await connection.execute(
                `SELECT COALESCE(SUM(existencia), 0) AS existencia
                   FROM inventario WHERE id_producto = ?`,
                [idProducto]
            );

            await connection.commit();

            res.json({
                success: true,
                id_producto: idProducto,
                existencia: Number(actualizado[0]?.existencia || 0),
                mensaje: `Entrada registrada: +${cantidad} de ${producto[0].nombre}.`
            });
        } catch (error) {
            try { await connection.rollback(); } catch (_) { /* ignore */ }
            console.error('Error registrando entrada:', error);
            res.status(500).json({ success: false, error: error.message });
        } finally {
            connection.release();
        }
    });

    // Ajuste manual de stock (deja la existencia exacta indicada).
    router.patch('/empleado/inventario/:id_producto/stock', checkDB, async (req, res) => {
        const pool = getPool();
        const connection = await pool.getConnection();
        try {
            const idProducto = numPositivo(req.params.id_producto);
            const existencia = Number(req.body.existencia ?? req.body.stock);

            if (!idProducto || !Number.isInteger(existencia) || existencia < 0) {
                return res.status(400).json({ success: false, error: 'Existencia no válida.' });
            }

            await connection.beginTransaction();

            const [producto] = await connection.execute(
                'SELECT nombre FROM producto WHERE id_producto = ?',
                [idProducto]
            );
            if (!producto.length) {
                await connection.rollback();
                return res.status(404).json({ success: false, error: 'Producto no encontrado.' });
            }

            const [inventario] = await connection.execute(
                'SELECT id_inventario FROM inventario WHERE id_producto = ? ORDER BY id_inventario ASC LIMIT 1',
                [idProducto]
            );

            if (inventario.length) {
                await connection.execute(
                    `UPDATE inventario
                        SET existencia = ?, fecha_actualizacion = NOW()
                      WHERE id_inventario = ?`,
                    [existencia, inventario[0].id_inventario]
                );
            } else {
                await connection.execute(
                    `INSERT INTO inventario (id_producto, existencia, stock_minimo)
                     VALUES (?, ?, 0)`,
                    [idProducto, existencia]
                );
            }

            await connection.commit();

            res.json({
                success: true,
                id_producto: idProducto,
                existencia,
                mensaje: `Stock de "${producto[0].nombre}" ajustado a ${existencia}.`
            });
        } catch (error) {
            try { await connection.rollback(); } catch (_) { /* ignore */ }
            console.error('Error ajustando stock:', error);
            res.status(500).json({ success: false, error: error.message });
        } finally {
            connection.release();
        }
    });

    // ---------- Pedidos para picking ----------
    router.get('/empleado/pedidos', checkDB, async (req, res) => {
        try {
            const pool = getPool();
            const [pedidos] = await pool.execute(`
                SELECT p.id_pedido,
                       p.estado,
                       p.total_pagar,
                       p.metodo_pago,
                       p.fecha_pedido,
                       p.id_repartidor,
                       d.calle,
                       d.numero,
                       d.complemento,
                       d.barrio,
                       u.nombre_completo AS cliente_nombre,
                       u.telefono AS cliente_telefono
                  FROM pedido p
                  LEFT JOIN direccion d ON d.id_direccion = p.id_direccion
                  LEFT JOIN cliente c ON c.id_cliente = p.id_cliente
                  LEFT JOIN usuario u ON u.id_usuario = c.id_usuario
                 WHERE p.estado IN (${ESTADOS_ACTIVOS.map(() => '?').join(',')})
                 ORDER BY FIELD(p.estado, 'pendiente', 'confirmado', 'preparando', 'en_camino'),
                          p.fecha_pedido ASC
            `, ESTADOS_ACTIVOS);

            if (!pedidos.length) {
                return res.json({ success: true, pedidos: [] });
            }

            const ids = pedidos.map(p => p.id_pedido);
            const [detalles] = await pool.query(`
                SELECT dp.id_detalle,
                       dp.id_pedido,
                       dp.id_producto,
                       dp.cantidad,
                       dp.precio_unitario,
                       dp.subtotal,
                       dp.verificado_empleado,
                       pr.nombre,
                       pr.codigo_barras
                  FROM detallepedido dp
                  LEFT JOIN producto pr ON pr.id_producto = dp.id_producto
                 WHERE dp.id_pedido IN (${ids.map(() => '?').join(',')})
                 ORDER BY dp.id_detalle ASC
            `, ids);

            const porPedido = new Map();
            for (const detalle of detalles) {
                if (!porPedido.has(detalle.id_pedido)) porPedido.set(detalle.id_pedido, []);
                porPedido.get(detalle.id_pedido).push({
                    ...detalle,
                    verificado: Boolean(detalle.verificado_empleado)
                });
            }

            const salida = pedidos.map(p => ({
                ...p,
                direccion_completa: [p.calle, p.numero, p.complemento, p.barrio]
                    .filter(Boolean)
                    .join(', '),
                items: porPedido.get(p.id_pedido) || []
            }));

            res.json({ success: true, pedidos: salida });
        } catch (error) {
            console.error('Error listando pedidos del empleado:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Marca / desmarca un ítem del picking como recogido.
    router.patch('/empleado/pedidos/:id_pedido/items/:id_detalle', checkDB, async (req, res) => {
        try {
            const idPedido = numPositivo(req.params.id_pedido);
            const idDetalle = numPositivo(req.params.id_detalle);
            const verificado = req.body.verificado === undefined
                ? true
                : Boolean(req.body.verificado);

            if (!idPedido || !idDetalle) {
                return res.status(400).json({ success: false, error: 'Pedido o ítem inválido.' });
            }

            const [result] = await getPool().execute(
                `UPDATE detallepedido
                    SET verificado_empleado = ?
                  WHERE id_detalle = ? AND id_pedido = ?`,
                [verificado ? 1 : 0, idDetalle, idPedido]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, error: 'Ítem del pedido no encontrado.' });
            }

            res.json({ success: true, id_pedido: idPedido, id_detalle: idDetalle, verificado });
        } catch (error) {
            console.error('Error actualizando ítem del picking:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Marca el pedido completo como empacado y avisa a los administradores.
    router.post('/empleado/pedidos/:id_pedido/empacar', checkDB, async (req, res) => {
        const pool = getPool();
        const connection = await pool.getConnection();
        try {
            const idPedido = numPositivo(req.params.id_pedido);
            const idUsuario = numPositivo(req.body.id_usuario);

            if (!idPedido) {
                return res.status(400).json({ success: false, error: 'Pedido inválido.' });
            }

            const empleado = idUsuario ? await datosEmpleado(idUsuario) : null;

            await connection.beginTransaction();

            const [pedido] = await connection.execute(
                'SELECT id_pedido, estado FROM pedido WHERE id_pedido = ? FOR UPDATE',
                [idPedido]
            );

            if (!pedido.length) {
                await connection.rollback();
                return res.status(404).json({ success: false, error: 'Pedido no encontrado.' });
            }

            const [detalles] = await connection.execute(
                'SELECT id_detalle, verificado_empleado FROM detallepedido WHERE id_pedido = ?',
                [idPedido]
            );

            if (!detalles.length) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    error: 'El pedido no tiene productos registrados para empacar.'
                });
            }

            await connection.execute(
                'UPDATE detallepedido SET verificado_empleado = 1 WHERE id_pedido = ?',
                [idPedido]
            );

            await connection.execute(
                `UPDATE pedido
                    SET estado = 'preparando'
                  WHERE id_pedido = ?
                    AND estado IN ('pendiente', 'confirmado', 'preparando')`,
                [idPedido]
            );

            await connection.commit();

            const nombreEmpleado = empleado?.nombre_completo || 'Un empleado';
            const creadas = await notificarAdmins(io, {
                titulo: `Pedido #${idPedido} empacado`,
                mensaje: `${nombreEmpleado} marcó el pedido #${idPedido} como empacado y listo para despacho.`,
                tipo: 'pedido',
                datos: {
                    accion: 'pedido_empacado',
                    id_pedido: idPedido,
                    id_empleado: empleado?.id_empleado || null,
                    id_usuario: idUsuario || null,
                    empleado: nombreEmpleado
                }
            });

            emitirAdmin('pedido_empacado', {
                id_pedido: idPedido,
                id_empleado: empleado?.id_empleado || null,
                empleado: nombreEmpleado
            });

            if (io) {
                io.emit('pedido_estado_actualizado', { id_pedido: idPedido, estado: 'preparando' });
            }

            res.json({
                success: true,
                id_pedido: idPedido,
                estado: 'preparando',
                notificaciones: creadas.length,
                mensaje: `Pedido #${idPedido} marcado como empacado.`
            });
        } catch (error) {
            try { await connection.rollback(); } catch (_) { /* ignore */ }
            console.error('Error empacando pedido:', error);
            res.status(500).json({ success: false, error: error.message });
        } finally {
            connection.release();
        }
    });

    // ---------- Reportes de daño ----------
    router.get('/empleado/danos', checkDB, async (req, res) => {
        try {
            const limite = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
            const [rows] = await getPool().query(`
                SELECT rd.id_reporte,
                       rd.id_producto,
                       rd.id_empleado,
                       rd.id_usuario,
                       rd.cantidad,
                       rd.motivo,
                       rd.observaciones,
                       rd.fecha_reporte,
                       p.nombre AS producto,
                       u.nombre_completo AS reportado_por
                  FROM reporte_dano rd
                  LEFT JOIN producto p ON p.id_producto = rd.id_producto
                  LEFT JOIN usuario u ON u.id_usuario = rd.id_usuario
                 ORDER BY rd.fecha_reporte DESC, rd.id_reporte DESC
                 LIMIT ${limite}
            `);

            res.json({ success: true, danos: rows });
        } catch (error) {
            console.error('Error listando reportes de daño:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.post('/empleado/danos', checkDB, async (req, res) => {
        const pool = getPool();
        const connection = await pool.getConnection();
        try {
            const idProducto = numPositivo(req.body.id_producto);
            const cantidad = numPositivo(req.body.cantidad);
            const idUsuario = numPositivo(req.body.id_usuario);
            const motivo = texto(req.body.motivo, 150);
            const observaciones = texto(req.body.observaciones, 1000) || null;

            if (!idProducto || !cantidad || !motivo) {
                return res.status(400).json({
                    success: false,
                    error: 'Producto, cantidad y motivo son obligatorios.'
                });
            }

            const empleado = idUsuario ? await datosEmpleado(idUsuario) : null;

            await connection.beginTransaction();

            const [producto] = await connection.execute(
                'SELECT nombre FROM producto WHERE id_producto = ?',
                [idProducto]
            );
            if (!producto.length) {
                await connection.rollback();
                return res.status(404).json({ success: false, error: 'Producto no encontrado.' });
            }

            const [inventario] = await connection.execute(
                `SELECT id_inventario, existencia
                   FROM inventario
                  WHERE id_producto = ?
                  ORDER BY id_inventario ASC
                  FOR UPDATE`,
                [idProducto]
            );

            const existenciaActual = inventario.reduce(
                (total, fila) => total + Number(fila.existencia || 0),
                0
            );
            if (cantidad > existenciaActual) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    error: `Stock insuficiente. Solo hay ${existenciaActual} unidades.`
                });
            }

            // Descuenta la cantidad de una o varias filas de inventario.
            let restante = cantidad;
            for (const fila of inventario) {
                if (restante <= 0) break;
                const descuento = Math.min(Number(fila.existencia || 0), restante);
                if (descuento <= 0) continue;
                await connection.execute(
                    `UPDATE inventario
                        SET existencia = existencia - ?,
                            fecha_actualizacion = NOW()
                      WHERE id_inventario = ?`,
                    [descuento, fila.id_inventario]
                );
                restante -= descuento;
            }

            const [reporte] = await connection.execute(
                `INSERT INTO reporte_dano
                    (id_producto, id_empleado, id_usuario, cantidad, motivo, observaciones)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    idProducto,
                    empleado?.id_empleado || null,
                    idUsuario || null,
                    cantidad,
                    motivo,
                    observaciones
                ]
            );

            await connection.commit();

            const nombreEmpleado = empleado?.nombre_completo || 'Un empleado';
            const creadas = await notificarAdmins(io, {
                titulo: 'Producto dañado reportado',
                mensaje: `${nombreEmpleado} reportó ${cantidad} und de "${producto[0].nombre}" por ${motivo}.`,
                tipo: 'inventario',
                datos: {
                    accion: 'reporte_dano',
                    id_reporte: reporte.insertId,
                    id_producto: idProducto,
                    producto: producto[0].nombre,
                    cantidad,
                    motivo,
                    id_empleado: empleado?.id_empleado || null,
                    id_usuario: idUsuario || null,
                    empleado: nombreEmpleado
                }
            });

            emitirAdmin('reporte_dano', {
                id_reporte: reporte.insertId,
                id_producto: idProducto,
                producto: producto[0].nombre,
                cantidad,
                motivo,
                empleado: nombreEmpleado
            });

            const [nuevaExistencia] = await pool.execute(
                'SELECT COALESCE(SUM(existencia), 0) AS existencia FROM inventario WHERE id_producto = ?',
                [idProducto]
            );

            res.status(201).json({
                success: true,
                id_reporte: reporte.insertId,
                existencia: Number(nuevaExistencia[0]?.existencia || 0),
                notificaciones: creadas.length,
                mensaje: `Daño reportado: -${cantidad} de ${producto[0].nombre}.`
            });
        } catch (error) {
            try { await connection.rollback(); } catch (_) { /* ignore */ }
            console.error('Error reportando daño:', error);
            res.status(500).json({ success: false, error: error.message });
        } finally {
            connection.release();
        }
    });

    return router;
};
