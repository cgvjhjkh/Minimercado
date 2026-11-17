import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  apiGet,
  apiSend,
  crearSocket,
  leerUsuario,
  normalizarPedido,
  ESTADOS_FINALES
} from '../lib/repartidorApi';

// ============================================================
//  Estado y acciones del repartidor contra la API real.
//  Mantiene pedidos activos, historial, estadísticas y
//  disponibilidad sincronizados por WebSocket.
// ============================================================
export function useRepartidor(idRepartidor) {
  const usuario = useMemo(() => leerUsuario() || {}, []);
  const [pedidos, setPedidos] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [estadisticas, setEstadisticas] = useState({});
  const [disponible, setDisponible] = useState(
    usuario.disponible !== 0 && usuario.disponible !== false
  );
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [conectado, setConectado] = useState(false);

  const socketRef = useRef(null);
  const refrescoRef = useRef(null);

  const todos = useMemo(() => [...pedidos, ...historial], [pedidos, historial]);

  const cargarPedidos = useCallback(async () => {
    if (!idRepartidor) return [];
    const data = await apiGet(`/repartidor/${idRepartidor}/pedidos?todos=1`);
    const lista = (data.data || []).map(normalizarPedido);

    setPedidos(lista.filter((p) => !ESTADOS_FINALES.includes(p.estado)));
    setHistorial(lista.filter((p) => ESTADOS_FINALES.includes(p.estado)));
    return lista;
  }, [idRepartidor]);

  const cargarEstadisticas = useCallback(async () => {
    if (!idRepartidor) return;
    try {
      const data = await apiGet(`/repartidor/${idRepartidor}/estadisticas`);
      setEstadisticas(data.estadisticas || {});
    } catch {
      // Las estadísticas no deben romper el panel.
      setEstadisticas({});
    }
  }, [idRepartidor]);

  const recargar = useCallback(async () => {
    if (!idRepartidor) {
      setCargando(false);
      return null;
    }

    try {
      const [lista] = await Promise.all([cargarPedidos(), cargarEstadisticas()]);
      setError(null);
      return lista;
    } catch (e) {
      setError(e.message || 'No se pudieron cargar los pedidos');
      throw e;
    } finally {
      setCargando(false);
    }
  }, [idRepartidor, cargarPedidos, cargarEstadisticas]);

  const programarRefresco = useCallback(() => {
    clearTimeout(refrescoRef.current);
    refrescoRef.current = setTimeout(() => {
      recargar().catch(() => {});
    }, 450);
  }, [recargar]);

  // Carga inicial + refresco periódico de respaldo.
  useEffect(() => {
    if (!idRepartidor) {
      setCargando(false);
      return undefined;
    }

    let activo = true;
    recargar().catch(() => {});

    const intervalo = setInterval(() => {
      if (activo && document.visibilityState === 'visible') {
        recargar().catch(() => {});
      }
    }, 25000);

    return () => {
      activo = false;
      clearInterval(intervalo);
      clearTimeout(refrescoRef.current);
    };
  }, [idRepartidor, recargar]);

  // Eventos en tiempo real.
  useEffect(() => {
    if (!idRepartidor) return undefined;

    const socket = crearSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      setConectado(true);
      socket.emit('repartidor_conectado', { id_repartidor: idRepartidor });
    });
    socket.on('disconnect', () => setConectado(false));
    socket.on('connect_error', () => setConectado(false));

    const esMio = (data) => Number(data && data.id_repartidor) === Number(idRepartidor);

    socket.on('pedido_estado_actualizado', (data) => {
      if (esMio(data)) programarRefresco();
    });
    socket.on('pedido_completado', (data) => {
      if (esMio(data)) programarRefresco();
    });
    socket.on('pedido_finalizado', (data) => {
      if (esMio(data)) programarRefresco();
    });
    socket.on('pedido_asignado', (data) => {
      if (esMio(data)) recargar().catch(() => {});
    });
    socket.on('nuevo_pedido', () => {
      cargarEstadisticas().catch(() => {});
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [idRepartidor, programarRefresco, recargar, cargarEstadisticas]);

  const cambiarEstado = useCallback(
    async (idPedido, estado) => {
      if (!idRepartidor) throw new Error('Sesión de repartidor no válida');
      await apiSend('PUT', `/repartidor/pedido/${idPedido}/estado`, {
        id_repartidor: idRepartidor,
        estado
      });
      await recargar();
    },
    [idRepartidor, recargar]
  );

  const toggleDisponibilidad = useCallback(async () => {
    if (!idRepartidor) throw new Error('Sesión de repartidor no válida');
    const nuevo = !disponible;

    await apiSend('PUT', `/repartidor/${idRepartidor}/disponibilidad`, {
      disponible: nuevo
    });

    setDisponible(nuevo);
    const actual = leerUsuario() || {};
    actual.disponible = nuevo ? 1 : 0;
    localStorage.setItem('usuario', JSON.stringify(actual));
    window.usuarioActual = actual;

    return nuevo;
  }, [disponible, idRepartidor]);

  const actualizarPerfil = useCallback(
    async (datos) => {
      if (!idRepartidor) throw new Error('Sesión de repartidor no válida');
      await apiSend('PUT', `/repartidor/${idRepartidor}/perfil`, datos);

      const actual = leerUsuario() || {};
      const actualizado = { ...actual, ...datos };
      localStorage.setItem('usuario', JSON.stringify(actualizado));
      window.usuarioActual = actualizado;

      return actualizado;
    },
    [idRepartidor]
  );

  return {
    usuario,
    pedidos,
    historial,
    todos,
    estadisticas,
    disponible,
    cargando,
    conectado,
    error,
    recargar,
    cambiarEstado,
    toggleDisponibilidad,
    actualizarPerfil
  };
}
