// ============================================================
//  API del repartidor: pedidos, estados, estadísticas, perfil,
//  disponibilidad, ubicación en tiempo real y rutas históricas.
//  Montada en /api por server.js (factory para recibir io).
// ============================================================
const express = require('express');
const { getPool } = require('../config/db');

const ESTADOS_VALIDOS = ['pendiente', 'confirmado', 'preparando', 'en_camino', 'entregado', 'cancelado'];
const ESTADOS_ACTIVOS = ['pendiente', 'confirmado', 'preparando', 'en_camino'];
const ESTADOS_FINALES = ['entregado', 'cancelado'];

const SELECT_PEDIDO_REPARTIDOR = `
    SELECT p.id_pedido,
           p.estado,
           p.total_pagar,
           p.metodo_pago,
           p.fecha_pedido,
           p.fecha_entrega,
           p.tiempo_estimado_llegada,
           p.id_repartidor,
           d.id_direccion,
           d.calle,
           d.numero,
           d.complemento,
           d.barrio,
           d.latitud AS destino_lat,
           d.longitud AS destino_lng,
           c.id_cliente,
           u.nombre_completo AS cliente_nombre,
           u.telefono AS cliente_telefono
      FROM pedido p
      JOIN direccion d ON p.id_direccion = d.id_direccion
      JOIN cliente c   ON p.id_cliente = c.id_cliente
      JOIN usuario u   ON c.id_usuario = u.id_usuario
`;

function num(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function haversine(a, b) {
    if (!a || !b) return 0;
    const R = 6371000;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
}

// Fecha "hoy" real del sistema (YYYY-MM-DD) para las estadísticas diarias.
function fechaHoyReal() {
    const ahora = new Date();
    const y = ahora.getFullYear();
    const m = String(ahora.getMonth() + 1).padStart(2, '0');
    const d = String(ahora.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

async function recalcularPedidosActivos(connection, id_repartidor) {
    if (!id_repartidor) return;
    const placeholders = ESTADOS_ACTIVOS.map(() => '?').join(',');
    await connection.execute(
        `UPDATE repartidor
            SET pedidos_activos = (
                SELECT COUNT(*) FROM pedido
                 WHERE id_repartidor = ?
                   AND estado IN (${placeholders})
            )
          WHERE id_repartidor = ?`,
        [id_repartidor, ...ESTADOS_ACTIVOS, id_repartidor]
    );
}

module.exports = function crearRouterRepartidor(io) {
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

    const emitir = (evento, payload) => {
        if (io) io.emit(evento, payload);
    };

    // ---------- Pedidos asignados al repartidor ----------
    router.get('/repartidor/:id_repartidor/pedidos', checkDB, async (req, res) => {
        try {
            const id_repartidor = Number(req.params.id_repartidor);
            const todos = req.query.todos === '1' || req.query.todos === 'true';
            const filtroEstados = todos
                ? ''
                : `AND p.estado IN (${ESTADOS_ACTIVOS.map(() => '?').join(',')})`;

            const [rows] = await getPool().execute(`
                ${SELECT_PEDIDO_REPARTIDOR}
                 WHERE p.id_repartidor = ?
                   ${filtroEstados}
                 ORDER BY FIELD(p.estado, 'en_camino', 'preparando', 'confirmado', 'pendiente', 'entregado', 'cancelado'),
                          p.fecha_pedido ASC
            `, todos ? [id_repartidor] : [id_repartidor, ...ESTADOS_ACTIVOS]);

            res.json({ success: true, data: rows });
        } catch (error) {
            console.error('Error listando pedidos del repartidor:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ---------- Pedidos sin asignar ----------
    router.get('/repartidor/:id_repartidor/pedidos-disponibles', checkDB, async (req, res) => {
        try {
            const [rows] = await getPool().execute(`
                ${SELECT_PEDIDO_REPARTIDOR}
                 WHERE p.id_repartidor IS NULL
                   AND p.estado IN ('pendiente', 'confirmado', 'preparando')
                 ORDER BY p.fecha_pedido ASC
                 LIMIT 50
            `);

            res.json({ success: true, data: rows });
        } catch (error) {
            console.error('Error listando pedidos disponibles:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ---------- Asignación (solo administrador) ----------
    router.put('/repartidor/pedido/:id_pedido/asignar', checkDB, async (req, res) => {
        const pool = getPool();
        const connection = await pool.getConnection();
        try {
            const id_pedido = Number(req.params.id_pedido);
            const id_repartidor = Number(req.body.id_repartidor);

            // Los repartidores no pueden auto-asignarse pedidos.
            if (!req.body.from_admin && !req.body.asignado_por_admin) {
                return res.status(403).json({
                    success: false,
                    error: 'Los repartidores no pueden escoger pedidos. La asignación debe realizarla un administrador.'
                });
            }

            if (!id_pedido || !id_repartidor) {
                return res.status(400).json({ success: false, error: 'id_pedido e id_repartidor son requeridos' });
            }

            await connection.beginTransaction();

            const [rows] = await connection.execute(
                'SELECT id_pedido, id_repartidor, estado FROM pedido WHERE id_pedido = ? FOR UPDATE',
                [id_pedido]
            );

            if (!rows.length) {
                await connection.rollback();
                return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
            }

            if (rows[0].id_repartidor && Number(rows[0].id_repartidor) !== id_repartidor) {
                await connection.rollback();
                return res.status(409).json({ success: false, error: 'El pedido ya está asignado a otro repartidor' });
            }

            await connection.execute(
                `UPDATE pedido
                    SET id_repartidor = ?,
                        estado = IF(estado = 'pendiente', 'confirmado', estado)
                  WHERE id_pedido = ?`,
                [id_repartidor, id_pedido]
            );

            await recalcularPedidosActivos(connection, id_repartidor);
            await connection.commit();

            emitir('pedido_asignado', { id_pedido, id_repartidor });
            res.json({ success: true, id_pedido, id_repartidor });
        } catch (error) {
            try { await connection.rollback(); } catch (_) { /* ignore */ }
            console.error('Error asignando pedido:', error);
            res.status(500).json({ success: false, error: error.message });
        } finally {
            connection.release();
        }
    });

    // ---------- Cambio de estado ----------
    router.put('/repartidor/pedido/:id_pedido/estado', checkDB, async (req, res) => {
        const pool = getPool();
        const connection = await pool.getConnection();
        try {
            const id_pedido = Number(req.params.id_pedido);
            const id_repartidor = Number(req.body.id_repartidor) || null;
            const estado = String(req.body.estado || '').toLowerCase();
            const rolActor = String(req.body.rol_actor || req.body.rol || '').toLowerCase();
            const esAdminOEmpleado = ['admin', 'administrador', 'empleado'].includes(rolActor)
                || Boolean(req.body.from_admin)
                || Boolean(req.body.from_empleado);

            if (!ESTADOS_VALIDOS.includes(estado)) {
                return res.status(400).json({ success: false, error: 'Estado inválido' });
            }

            // Solo administrador/empleado pueden cancelar o pasar a "preparando".
            if ((estado === 'cancelado' || estado === 'preparando') && !esAdminOEmpleado) {
                return res.status(403).json({
                    success: false,
                    error: 'Solo un administrador o empleado puede cambiar el pedido a "' + estado + '".'
                });
            }

            if (!esAdminOEmpleado && !id_repartidor) {
                return res.status(400).json({ success: false, error: 'id_repartidor requerido' });
            }

            await connection.beginTransaction();

            const [rows] = await connection.execute(
                'SELECT id_pedido, id_repartidor, estado FROM pedido WHERE id_pedido = ? FOR UPDATE',
                [id_pedido]
            );

            if (!rows.length) {
                await connection.rollback();
                return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
            }

            const pedido = rows[0];

            if (!esAdminOEmpleado && pedido.id_repartidor && Number(pedido.id_repartidor) !== id_repartidor) {
                await connection.rollback();
                return res.status(403).json({ success: false, error: 'Este pedido está asignado a otro repartidor' });
            }

            const sets = ['estado = ?'];
            const valores = [estado];

            if (id_repartidor) {
                sets.push('id_repartidor = COALESCE(id_repartidor, ?)');
                valores.push(id_repartidor);
            } else if (esAdminOEmpleado && Object.prototype.hasOwnProperty.call(req.body, 'id_repartidor')) {
                sets.push('id_repartidor = ?');
                valores.push(null);
            }

            if (estado === 'entregado') {
                sets.push('fecha_entrega = COALESCE(fecha_entrega, NOW())');
            } else if (ESTADOS_ACTIVOS.includes(estado)) {
                sets.push('fecha_entrega = NULL');
            }

            valores.push(id_pedido);

            await connection.execute(
                `UPDATE pedido SET ${sets.join(', ')} WHERE id_pedido = ?`,
                valores
            );

            const repCalcular = id_repartidor || (pedido.id_repartidor ? Number(pedido.id_repartidor) : null);
            await recalcularPedidosActivos(connection, repCalcular);
            await connection.commit();

            const payload = { id_pedido, id_repartidor: repCalcular || null, estado };
            emitir('pedido_estado_actualizado', payload);
            if (estado === 'entregado') emitir('pedido_completado', payload);
            if (ESTADOS_FINALES.includes(estado)) emitir('pedido_finalizado', payload);

            res.json({ success: true, ...payload });
        } catch (error) {
            try { await connection.rollback(); } catch (_) { /* ignore */ }
            console.error('Error cambiando estado del pedido:', error);
            res.status(500).json({ success: false, error: error.message });
        } finally {
            connection.release();
        }
    });

    // ---------- Estadísticas ----------
    const consultaEstadisticas = `
        SELECT
            COUNT(*) AS total_asignados,
            COALESCE(SUM(CASE WHEN estado = 'entregado' THEN 1 ELSE 0 END), 0) AS entregas_completadas,
            COALESCE(SUM(CASE WHEN estado IN ('pendiente', 'confirmado', 'preparando', 'en_camino') THEN 1 ELSE 0 END), 0) AS pedidos_pendientes,
            COALESCE(SUM(CASE WHEN estado = 'entregado' AND DATE(fecha_entrega) = ? THEN 1 ELSE 0 END), 0) AS entregas_hoy,
            COALESCE(SUM(CASE WHEN estado = 'entregado' THEN total_pagar ELSE 0 END), 0) AS total_recaudado,
            COALESCE(SUM(CASE WHEN estado = 'entregado' AND DATE(fecha_entrega) = ? THEN total_pagar * 0.08 ELSE 0 END), 0) AS ganancia_hoy
          FROM pedido
         WHERE id_repartidor = ?
    `;

    const estadisticas = async (req, res) => {
        try {
            const { id_repartidor } = req.params;
            const hoy = fechaHoyReal();
            const [rows] = await getPool().execute(consultaEstadisticas, [hoy, hoy, id_repartidor]);
            res.json({ success: true, estadisticas: rows[0], fecha_hoy: hoy });
        } catch (error) {
            console.error('Error obteniendo estadísticas:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    };

    router.get('/repartidor/:id_repartidor/estadisticas', checkDB, estadisticas);
    // Alias compatible con versiones anteriores del mapa
    router.get('/repartidor/estadisticas/:id_repartidor', checkDB, estadisticas);

    // ---------- Disponibilidad ----------
    router.put('/repartidor/:id_repartidor/disponibilidad', checkDB, async (req, res) => {
        try {
            const { id_repartidor } = req.params;
            const disponible = req.body.disponible ? 1 : 0;

            const [result] = await getPool().execute(
                'UPDATE repartidor SET disponible = ? WHERE id_repartidor = ?',
                [disponible, id_repartidor]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, error: 'Repartidor no encontrado' });
            }

            emitir('repartidor_disponibilidad', {
                id_repartidor: Number(id_repartidor),
                disponible: Boolean(disponible)
            });

            res.json({ success: true, disponible: Boolean(disponible) });
        } catch (error) {
            console.error('Error cambiando disponibilidad:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ---------- Perfil ----------
    router.put('/repartidor/:id_repartidor/perfil', checkDB, async (req, res) => {
        const pool = getPool();
        const connection = await pool.getConnection();
        try {
            const { id_repartidor } = req.params;
            const { nombre_completo, telefono, vehiculo } = req.body;

            const [rows] = await connection.execute(
                'SELECT id_usuario FROM repartidor WHERE id_repartidor = ?',
                [id_repartidor]
            );

            if (!rows.length) {
                return res.status(404).json({ success: false, error: 'Repartidor no encontrado' });
            }

            await connection.beginTransaction();

            await connection.execute(`
                UPDATE usuario
                   SET nombre_completo = COALESCE(?, nombre_completo),
                       telefono = COALESCE(?, telefono)
                 WHERE id_usuario = ?
            `, [
                nombre_completo || null,
                telefono || null,
                rows[0].id_usuario
            ]);

            await connection.execute(
                'UPDATE repartidor SET vehiculo = COALESCE(?, vehiculo) WHERE id_repartidor = ?',
                [vehiculo || null, id_repartidor]
            );

            await connection.commit();
            res.json({ success: true });
        } catch (error) {
            try { await connection.rollback(); } catch (_) { /* ignore */ }
            console.error('Error actualizando perfil:', error);
            res.status(500).json({ success: false, error: error.message });
        } finally {
            connection.release();
        }
    });

    // ---------- Compatibilidad con versiones anteriores ----------
    router.get('/pedido/pendiente/:id_repartidor', checkDB, async (req, res) => {
        try {
            const { id_repartidor } = req.params;
            const [rows] = await getPool().execute(`
                ${SELECT_PEDIDO_REPARTIDOR}
                 WHERE p.id_repartidor = ?
                   AND p.estado IN (${ESTADOS_ACTIVOS.map(() => '?').join(',')})
                 ORDER BY p.fecha_pedido ASC
                 LIMIT 1
            `, [id_repartidor, ...ESTADOS_ACTIVOS]);

            if (rows.length > 0) {
                res.json({ success: true, pedido: rows[0] });
            } else {
                res.json({ success: false, pedido: null, mensaje: 'No hay pedidos pendientes' });
            }
        } catch (error) {
            console.error('Error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.post('/pedido/completar', checkDB, async (req, res) => {
        const pool = getPool();
        const connection = await pool.getConnection();
        try {
            const id_pedido = Number(req.body.id_pedido);
            const id_repartidor = Number(req.body.id_repartidor) || null;

            if (!id_pedido) {
                return res.status(400).json({ success: false, error: 'id_pedido requerido' });
            }

            await connection.beginTransaction();

            await connection.execute(
                `UPDATE pedido
                    SET estado = 'entregado',
                        fecha_entrega = COALESCE(fecha_entrega, NOW())
                  WHERE id_pedido = ?`,
                [id_pedido]
            );

            await recalcularPedidosActivos(connection, id_repartidor);
            await connection.commit();

            emitir('pedido_completado', { id_pedido, id_repartidor });
            res.json({ success: true, mensaje: 'Pedido completado exitosamente' });
        } catch (error) {
            try { await connection.rollback(); } catch (_) { /* ignore */ }
            console.error('Error completando pedido:', error);
            res.status(500).json({ success: false, error: error.message });
        } finally {
            connection.release();
        }
    });

    // ---------- Datos del repartidor ----------
    router.get('/repartidor/:id_repartidor', checkDB, async (req, res) => {
        try {
            const { id_repartidor } = req.params;
            const [rows] = await getPool().execute(`
                SELECT r.*, u.nombre_completo, u.telefono, u.correo, u.foto_perfil
                  FROM repartidor r
                  JOIN usuario u ON r.id_usuario = u.id_usuario
                 WHERE r.id_repartidor = ?
            `, [id_repartidor]);

            if (rows.length > 0) {
                res.json({ success: true, repartidor: rows[0] });
            } else {
                res.json({ success: false, error: 'Repartidor no encontrado' });
            }
        } catch (error) {
            console.error('Error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ---------- Ubicación en tiempo real ----------
    router.post('/ubicacion/actualizar', checkDB, async (req, res) => {
        try {
            const id_repartidor = Number(req.body.id_repartidor);
            const id_pedido = req.body.id_pedido ? Number(req.body.id_pedido) : null;
            const lat = num(req.body.latitud);
            const lng = num(req.body.longitud);
            const precision = num(req.body.precision_gps) || 0;
            const velocidad = num(req.body.velocidad);

            if (!id_repartidor || lat === null || lng === null) {
                return res.status(400).json({ success: false, error: 'Faltan datos de ubicación' });
            }

            const pool = getPool();
            const [ultimas] = await pool.execute(
                `SELECT latitud, longitud, timestamp
                   FROM ubicacion_repartidor
                  WHERE id_repartidor = ?
                  ORDER BY id_ubicacion DESC
                  LIMIT 1`,
                [id_repartidor]
            );

            let insertar = true;
            let distancia = 0;

            if (ultimas.length > 0) {
                const ultima = {
                    lat: Number(ultimas[0].latitud),
                    lng: Number(ultimas[0].longitud)
                };
                distancia = haversine(ultima, { lat, lng });
                const segundos = (Date.now() - new Date(ultimas[0].timestamp).getTime()) / 1000;
                if (segundos < 5 && distancia < 6) insertar = false;
            }

            if (insertar) {
                await pool.execute(`
                    INSERT INTO ubicacion_repartidor
                    (id_repartidor, id_pedido, latitud, longitud, precision_gps, velocidad)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [id_repartidor, id_pedido, lat, lng, precision, velocidad]);

                if (id_pedido && distancia > 10) {
                    await pool.execute(`
                        INSERT INTO ruta_historica
                        (id_pedido, id_repartidor, punto_orden, latitud, longitud)
                        VALUES (?, ?,
                            (SELECT COALESCE(MAX(punto_orden), 0) + 1
                               FROM (SELECT punto_orden FROM ruta_historica WHERE id_pedido = ?) AS t),
                            ?, ?)
                    `, [id_pedido, id_repartidor, id_pedido, lat, lng]);
                }
            }

            const payload = {
                id_repartidor,
                id_pedido,
                latitud: lat,
                longitud: lng,
                precision_gps: precision,
                velocidad,
                timestamp: new Date().toISOString()
            };

            emitir('ubicacion_actualizada', payload);
            if (io) io.to(`repartidor_${id_repartidor}`).emit('mi_ubicacion', payload);

            res.json({ success: true, ...payload });
        } catch (error) {
            console.error('Error actualizando ubicación:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/ubicacion/:id_repartidor', checkDB, async (req, res) => {
        try {
            const { id_repartidor } = req.params;
            const [rows] = await getPool().execute(`
                SELECT *
                  FROM ubicacion_repartidor
                 WHERE id_repartidor = ?
                 ORDER BY id_ubicacion DESC
                 LIMIT 1
            `, [id_repartidor]);

            res.json({ success: true, ubicacion: rows[0] || null });
        } catch (error) {
            console.error('Error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/ubicacion/:id_repartidor/historial', checkDB, async (req, res) => {
        try {
            const { id_repartidor } = req.params;
            const limite = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
            const id_pedido = req.query.id_pedido ? Number(req.query.id_pedido) : null;

            const filtro = id_pedido ? 'AND id_pedido = ?' : '';
            const valores = id_pedido ? [id_repartidor, id_pedido] : [id_repartidor];

            const [rows] = await getPool().execute(`
                SELECT *
                  FROM ubicacion_repartidor
                 WHERE id_repartidor = ?
                   ${filtro}
                 ORDER BY id_ubicacion DESC
                 LIMIT ${limite}
            `, valores);

            res.json({ success: true, data: rows.reverse() });
        } catch (error) {
            console.error('Error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/ruta/:id_pedido', checkDB, async (req, res) => {
        try {
            const { id_pedido } = req.params;
            const [rows] = await getPool().execute(`
                SELECT latitud, longitud, timestamp, punto_orden
                  FROM ruta_historica
                 WHERE id_pedido = ?
                 ORDER BY punto_orden ASC
            `, [id_pedido]);

            res.json({ success: true, ruta: rows });
        } catch (error) {
            console.error('Error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ---------- Geocodificación (Nominatim) ----------
    const geocodeCache = new Map();

    router.get('/geocodificar', checkDB, async (req, res) => {
        try {
            const direccion = String(req.query.direccion || '').trim();
            if (!direccion) {
                return res.status(400).json({ success: false, error: 'Dirección requerida' });
            }

            if (geocodeCache.has(direccion)) {
                return res.json({ success: true, ...geocodeCache.get(direccion), cached: true });
            }

            const consulta = `${direccion}, Medellín, Antioquia, Colombia`;
            const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=co&q=${encodeURIComponent(consulta)}`;
            const respuesta = await fetch(url, {
                headers: {
                    'User-Agent': 'MiMini-Minimercado/1.0',
                    'Accept-Language': 'es'
                }
            });

            if (!respuesta.ok) {
                throw new Error(`Nominatim respondió ${respuesta.status}`);
            }

            const data = await respuesta.json();
            if (!Array.isArray(data) || data.length === 0) {
                return res.status(404).json({ success: false, error: 'No se encontró la dirección' });
            }

            const salida = {
                lat: Number(data[0].lat),
                lng: Number(data[0].lon),
                display_name: data[0].display_name
            };

            geocodeCache.set(direccion, salida);
            res.json({ success: true, ...salida });
        } catch (error) {
            console.error('Error geocodificando:', error);
            res.status(502).json({ success: false, error: error.message });
        }
    });

    return router;
};
