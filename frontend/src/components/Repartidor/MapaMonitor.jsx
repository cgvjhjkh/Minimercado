import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useRepartidor } from '../../hooks/useRepartidor';
import { useTrackingMap } from '../../hooks/useTrackingMap';
import {
  ESTADOS_FINALES,
  apiGet,
  estadoInfo,
  estadoLabel,
  fmtMoney,
  leerUsuario
} from '../../lib/repartidorApi';
import './tracking.css';
import './MapaMonitor.css';

function SelectorRepartidor({ onElegir }) {
  const [valor, setValor] = useState('');

  return (
    <div className="monitor-page mon-selector-page">
      <form
        className="mon-selector"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(valor);
          if (Number.isFinite(n) && n > 0) onElegir(n);
        }}
      >
        <i className="bi bi-broadcast" />
        <h1>Monitor de entregas</h1>
        <p>Ingresa el ID del repartidor que quieres monitorear.</p>
        <input
          type="number"
          min="1"
          placeholder="ID de repartidor"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
        <button type="submit">Ver monitor</button>
        <Link to="/repartidor">Volver al panel</Link>
      </form>
    </div>
  );
}

function Monitor({ idRepartidor }) {
  const {
    pedidos,
    historial,
    todos,
    estadisticas,
    disponible,
    conectado,
    cambiarEstado
  } = useRepartidor(idRepartidor);

  const [seleccionadoId, setSeleccionadoId] = useState(null);
  const [info, setInfo] = useState(null);
  const [aviso, setAviso] = useState(null);

  const mostrarAviso = (texto, tipo = 'info') => {
    setAviso({ texto, tipo });
    window.setTimeout(() => setAviso(null), 4000);
  };

  const pedidoActual = useMemo(
    () => todos.find((p) => p.id === seleccionadoId) || null,
    [todos, seleccionadoId]
  );

  const {
    contenedorRef,
    gps,
    metricas,
    actualizadoHace,
    centrarEnMi,
    centrarEnDestino,
    verRuta
  } = useTrackingMap({ idRepartidor, pedido: pedidoActual, onAviso: mostrarAviso });

  useEffect(() => {
    document.title = 'MiMini – Monitor de entregas';
  }, []);

  useEffect(() => {
    if (seleccionadoId && todos.some((p) => p.id === seleccionadoId)) return;
    if (pedidos.length > 0) {
      setSeleccionadoId(pedidos[0].id);
      return;
    }
    setSeleccionadoId(null);
  }, [pedidos, todos, seleccionadoId]);

  useEffect(() => {
    if (!idRepartidor) return undefined;
    let activo = true;
    apiGet(`/repartidor/${idRepartidor}`)
      .then((data) => {
        if (activo) setInfo(data.repartidor || null);
      })
      .catch(() => {});
    return () => {
      activo = false;
    };
  }, [idRepartidor]);

  const cambiarEstadoPedido = async (estado) => {
    if (!pedidoActual) return;
    if (!window.confirm(`¿Marcar el pedido #${pedidoActual.id} como "${estadoLabel(estado)}"?`)) return;

    try {
      await cambiarEstado(pedidoActual.id, estado);
      mostrarAviso(`Pedido #${pedidoActual.id} → ${estadoLabel(estado)}`, 'success');
    } catch (e) {
      mostrarAviso(e.message, 'danger');
    }
  };

  const nombre = info?.nombre_completo || leerUsuario()?.nombre_completo || 'Repartidor';
  const inicial = (nombre || 'R').trim().charAt(0).toUpperCase();
  const activos = pedidos.length;
  const entregadosHoy = Number(estadisticas.entregas_hoy || 0);
  const recaudadoHoy = fmtMoney(estadisticas.total_recaudado || 0);
  const finalizado = pedidoActual ? ESTADOS_FINALES.includes(pedidoActual.estado) : false;

  return (
    <div className="monitor-page">
      <div ref={contenedorRef} className="trk-map" />

      {/* ================= CABECERA ================= */}
      <header className="mon-topbar mon-glass">
        <div className="mon-brand">
          <span className={`mon-dot ${conectado ? 'on' : ''}`} />
          <div>
            <strong>MiMini</strong>
            <small>Monitor de entregas</small>
          </div>
        </div>

        <div className="mon-top-center">
          <div className="mon-driver-chip">
            <span className="mon-avatar">{inicial}</span>
            <div>
              <span className="mon-driver-name">{nombre}</span>
              <span className="mon-driver-sub">
                {info?.vehiculo || 'Repartidor'} · {disponible ? 'Disponible' : 'Pausado'}
              </span>
            </div>
          </div>
          <span className={`mon-pill ${disponible ? 'on' : ''}`}>
            {disponible ? 'Disponible' : 'No disponible'}
          </span>
        </div>

        <div className="mon-top-right">
          <span className="mon-conn">
            <i className={conectado ? 'on' : ''} /> {conectado ? 'En vivo' : 'Conectando…'}
          </span>
          <Link className="mon-btn ghost" to="/repartidor">
            Panel
          </Link>
        </div>
      </header>

      {/* ================= PANEL IZQUIERDO ================= */}
      <aside className="mon-sidebar mon-glass">
        <div className="mon-sidebar-head">
          <h2>Pedidos activos</h2>
          <button className="mon-icon-btn" onClick={() => window.location.reload()} title="Actualizar">
            <i className="bi bi-arrow-repeat" />
          </button>
        </div>

        <div className="mon-order-list">
          {pedidos.length === 0 && (
            <div className="mon-empty">
              <i className="bi bi-inbox" />
              <p>No hay pedidos activos.</p>
            </div>
          )}

          {pedidos.map((p) => {
            const e = estadoInfo(p.estado);
            return (
              <button
                key={p.id}
                className={`mon-order ${pedidoActual && pedidoActual.id === p.id ? 'active' : ''}`}
                onClick={() => setSeleccionadoId(p.id)}
              >
                <div className="mon-order-top">
                  <span className="mon-order-id">#{p.id}</span>
                  <span className="mon-order-state" style={{ '--c': e.color }}>
                    {e.label}
                  </span>
                </div>
                <div className="mon-order-client">{p.cliente}</div>
                <div className="mon-order-addr">
                  <i className="bi bi-geo-alt-fill" /> {p.direccion}
                </div>
                <div className="mon-order-bottom">
                  <span>{fmtMoney(p.total)}</span>
                  <span className="mon-order-price">{p.metodoPago}</span>
                </div>
              </button>
            );
          })}

          {historial.slice(0, 3).map((p) => (
            <button
              key={`hist-${p.id}`}
              className={`mon-order done ${pedidoActual && pedidoActual.id === p.id ? 'active' : ''}`}
              onClick={() => setSeleccionadoId(p.id)}
            >
              <div className="mon-order-top">
                <span className="mon-order-id">#{p.id}</span>
                <span className="mon-order-state" style={{ '--c': estadoInfo(p.estado).color }}>
                  {estadoLabel(p.estado)}
                </span>
              </div>
              <div className="mon-order-client">{p.cliente}</div>
            </button>
          ))}
        </div>

        <div className="mon-sidebar-foot">
          <div>
            <span>Activos</span>
            <strong>{activos}</strong>
          </div>
          <div>
            <span>Entregados hoy</span>
            <strong>{entregadosHoy}</strong>
          </div>
          <div>
            <span>Recaudado hoy</span>
            <strong>{recaudadoHoy}</strong>
          </div>
        </div>
      </aside>

      {/* ================= PANEL DE DESTINO ================= */}
      <section className="mon-destination mon-glass">
        <div className="mon-destination-head">
          <span className="mon-eyebrow">Destino del pedido</span>
          <span
            className="mon-order-state"
            style={{ '--c': pedidoActual ? estadoInfo(pedidoActual.estado).color : '#64748b' }}
          >
            {pedidoActual ? estadoLabel(pedidoActual.estado) : 'Sin pedido'}
          </span>
        </div>

        <div className="mon-destination-body">
          <div className="mon-dest-icon">
            <i className="bi bi-geo-alt-fill" />
          </div>
          <div className="mon-dest-text">
            <strong>{pedidoActual ? pedidoActual.direccion : 'Selecciona un pedido'}</strong>
            <small>{pedidoActual ? pedidoActual.cliente : '—'}</small>
          </div>
        </div>

        <div className="mon-metrics">
          <div>
            <span>Distancia</span>
            <strong>{metricas.distancia}</strong>
          </div>
          <div>
            <span>Tiempo</span>
            <strong>{metricas.tiempo}</strong>
          </div>
          <div>
            <span>Pedido</span>
            <strong>{pedidoActual ? `#${pedidoActual.id}` : '—'}</strong>
          </div>
        </div>

        <div className="mon-actions">
          <button
            className="mon-btn primary"
            disabled={!pedidoActual || finalizado}
            onClick={() => cambiarEstadoPedido('en_camino')}
          >
            En camino
          </button>
          <button
            className="mon-btn success"
            disabled={!pedidoActual || finalizado}
            onClick={() => cambiarEstadoPedido('entregado')}
          >
            Entregado
          </button>
          <button className="mon-btn ghost" disabled={!pedidoActual} onClick={verRuta}>
            Ver ruta
          </button>
          <button
            className="mon-btn ghost"
            onClick={() => {
              if (!centrarEnMi()) mostrarAviso('GPS sin ubicación todavía', 'warning');
            }}
          >
            Centrar
          </button>
        </div>
      </section>

      {/* ================= PIE ================= */}
      <footer className="mon-statusbar mon-glass">
        <div className={`mon-status-item ${gps.estado || ''}`}>
          <span className={`mon-gps-dot ${gps.estado || ''}`} />
          <span>{gps.texto}</span>
        </div>
        <div className="mon-status-item">
          Última actualización: {actualizadoHace != null ? `hace ${actualizadoHace}s` : '—'}
        </div>
        <div className="mon-status-item">
          Ruta: {metricas.distancia} · {metricas.tiempo}
        </div>
        {pedidoActual && (
          <button className="mon-link" onClick={centrarEnDestino}>
            Centrar destino
          </button>
        )}
      </footer>

      {aviso && (
        <div className={`mon-toast ${aviso.tipo}`}>
          <i
            className={`bi ${
              aviso.tipo === 'danger'
                ? 'bi-x-circle-fill'
                : aviso.tipo === 'warning'
                  ? 'bi-exclamation-triangle-fill'
                  : aviso.tipo === 'success'
                    ? 'bi-check-circle-fill'
                    : 'bi-info-circle-fill'
            }`}
          />
          {aviso.texto}
        </div>
      )}
    </div>
  );
}

export default function MapaMonitor() {
  const usuario = useMemo(() => leerUsuario() || {}, []);
  const [params, setParams] = useSearchParams();
  const idSesion = Number(usuario.id_repartidor) || null;
  const idParam = Number(params.get('id_repartidor')) || null;
  const [idManual, setIdManual] = useState(null);

  const idRepartidor = idSesion || idParam || idManual;

  if (!idRepartidor) {
    return (
      <SelectorRepartidor
        onElegir={(id) => {
          setIdManual(id);
          setParams({ id_repartidor: String(id) }, { replace: true });
        }}
      />
    );
  }

  return <Monitor idRepartidor={idRepartidor} />;
}
