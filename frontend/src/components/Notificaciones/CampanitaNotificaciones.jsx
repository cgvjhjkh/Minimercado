import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import './CampanitaNotificaciones.css';

const RAW_BASE = (
  import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3000' : '')
).replace(/\/$/, '');
const API = `${RAW_BASE}/api`;

function leerUsuario() {
  try {
    return JSON.parse(localStorage.getItem('usuario')) || null;
  } catch {
    return null;
  }
}

const ESTILOS_TIPO = {
  pedido: { icono: 'bi-box-seam', color: '#193C76', fondo: '#dbeafe' },
  inventario: { icono: 'bi-exclamation-triangle', color: '#b91c1c', fondo: '#fee2e2' },
  empleado: { icono: 'bi-person-badge', color: '#6d28d9', fondo: '#ede9fe' },
  pago: { icono: 'bi-credit-card', color: '#15803d', fondo: '#dcfce7' },
  promocion: { icono: 'bi-tag', color: '#a16207', fondo: '#fef9c3' },
  sistema: { icono: 'bi-info-circle', color: '#475569', fondo: '#f1f5f9' }
};

function fechaLegible(valor) {
  if (!valor) return '';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleString('es-CO', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

function datosDe(notificacion) {
  const datos = notificacion?.datos_adicionales;
  if (!datos) return null;
  if (typeof datos === 'object') return datos;
  try {
    return JSON.parse(datos);
  } catch {
    return null;
  }
}

export default function CampanitaNotificaciones({ rol }) {
  const usuario = leerUsuario();
  const idUsuario = Number(usuario?.id_usuario);

  const [notificaciones, setNotificaciones] = useState([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const raizRef = useRef(null);

  const cargar = useCallback(async () => {
    if (!idUsuario) return;
    try {
      const respuesta = await fetch(`${API}/notificaciones/${idUsuario}?limit=30`, {
        headers: { Accept: 'application/json' }
      });
      const data = await respuesta.json();
      if (!respuesta.ok || data.success === false) {
        throw new Error(data.error || `Error ${respuesta.status}`);
      }
      setNotificaciones(data.notificaciones || []);
      setNoLeidas(Number(data.no_leidas || 0));
      setError('');
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las notificaciones');
    } finally {
      setCargando(false);
    }
  }, [idUsuario]);

  useEffect(() => {
    setCargando(true);
    cargar();
  }, [cargar]);

  // Un solo socket por campanita: se une a su sala de usuario y recarga la
  // lista en cuanto llega una notificación nueva (por ejemplo un daño o un
  // pedido empacado reportado por un empleado).
  useEffect(() => {
    if (!idUsuario) return undefined;

    const socket = io(RAW_BASE || window.location.origin, {
      transports: ['websocket', 'polling'],
      auth: { token: localStorage.getItem('token') || undefined }
    });

    socket.on('connect', () => {
      socket.emit('join_room', { rol: rol || usuario?.rol, id_usuario: idUsuario });
    });
    socket.on('nueva_notificacion', () => cargar());
    socket.on('contador_no_leidos', (data) => setNoLeidas(Number(data?.count || 0)));
    socket.on('contador_actualizado', (data) => setNoLeidas(Number(data?.count || 0)));

    return () => socket.disconnect();
  }, [idUsuario, rol, cargar, usuario?.rol]);

  useEffect(() => {
    if (!abierto) return undefined;
    const alHacerClic = (evento) => {
      if (!raizRef.current?.contains(evento.target)) setAbierto(false);
    };
    document.addEventListener('click', alHacerClic);
    return () => document.removeEventListener('click', alHacerClic);
  }, [abierto]);

  const marcarLeida = async (notificacion) => {
    if (notificacion.leida) return;
    const id = Number(notificacion.id_notificacion);
    if (!id) return;

    // Actualización optimista.
    setNotificaciones((lista) => lista.map((n) =>
      n.id_notificacion === id ? { ...n, leida: true } : n
    ));
    setNoLeidas((prev) => Math.max(0, prev - 1));

    try {
      await fetch(`${API}/notificaciones/${id}/leida`, { method: 'PATCH' });
    } catch {
      cargar();
    }
  };

  const marcarTodas = async () => {
    if (!noLeidas) return;
    setNotificaciones((lista) => lista.map((n) => ({ ...n, leida: true })));
    setNoLeidas(0);
    try {
      await fetch(`${API}/notificaciones/usuario/${idUsuario}/leer-todas`, {
        method: 'PATCH'
      });
    } catch {
      cargar();
    }
  };

  if (!idUsuario) return null;

  return (
    <div className="campanita" ref={raizRef}>
      <button
        type="button"
        className={`icon-btn campanita-boton${abierto ? ' abierto' : ''}`}
        title="Notificaciones"
        aria-label="Notificaciones"
        aria-expanded={abierto}
        onClick={() => setAbierto((valor) => !valor)}
      >
        <i className="bi bi-bell" />
        {noLeidas > 0 && (
          <span className="badge-dot campanita-contador">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div className="campanita-panel">
          <div className="campanita-cabecera">
            <strong>Notificaciones</strong>
            {noLeidas > 0 && (
              <button type="button" className="campanita-leer-todas" onClick={marcarTodas}>
                Marcar todas como leídas
              </button>
            )}
          </div>

          <div className="campanita-lista">
            {cargando && (
              <div className="campanita-estado">Cargando notificaciones…</div>
            )}
            {!cargando && error && (
              <div className="campanita-estado text-danger">{error}</div>
            )}
            {!cargando && !error && notificaciones.length === 0 && (
              <div className="campanita-estado">
                <i className="bi bi-bell-slash d-block mb-2" />
                No tienes notificaciones
              </div>
            )}
            {!cargando && notificaciones.map((notificacion) => {
              const estilo = ESTILOS_TIPO[notificacion.tipo] || ESTILOS_TIPO.sistema;
              const datos = datosDe(notificacion);
              return (
                <button
                  type="button"
                  key={notificacion.id_notificacion}
                  className={`campanita-item${notificacion.leida ? '' : ' sin-leer'}`}
                  onClick={() => marcarLeida(notificacion)}
                >
                  <span
                    className="campanita-icono"
                    style={{ background: estilo.fondo, color: estilo.color }}
                  >
                    <i className={`bi ${estilo.icono}`} />
                  </span>
                  <span className="campanita-texto">
                    <span className="campanita-titulo">
                      {notificacion.titulo || 'Notificación'}
                      {datos?.empleado && (
                        <small className="campanita-origen"> · {datos.empleado}</small>
                      )}
                    </span>
                    <span className="campanita-mensaje">
                      {notificacion.mensaje}
                    </span>
                    <span className="campanita-fecha">{fechaLegible(notificacion.fecha_envio)}</span>
                  </span>
                  {!notificacion.leida && <span className="campanita-punto" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
