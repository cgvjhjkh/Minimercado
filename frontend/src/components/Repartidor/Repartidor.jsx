import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRepartidor } from '../../hooks/useRepartidor';
import { useTrackingMap } from '../../hooks/useTrackingMap';
import {
  ESTADOS,
  ESTADOS_FINALES,
  ESTADOS_SOLO_ADMIN,
  estadoInfo,
  estadoLabel,
  fmtFecha,
  fmtMoney,
  leerUsuario
} from '../../lib/repartidorApi';
import './Repartidor.css';
import './tracking.css';

const ICONO_TOAST = {
  success: 'bi-check-circle-fill',
  danger: 'bi-x-circle-fill',
  warning: 'bi-exclamation-triangle-fill',
  info: 'bi-info-circle-fill'
};

export default function Repartidor() {
  const usuario = useMemo(() => leerUsuario() || {}, []);
  const idRepartidor = Number(usuario.id_repartidor) || null;

  const {
    pedidos,
    historial,
    todos,
    estadisticas,
    disponible,
    cargando,
    error,
    recargar,
    cambiarEstado,
    toggleDisponibilidad,
    actualizarPerfil
  } = useRepartidor(idRepartidor);

  const [tab, setTab] = useState('activos');
  const [seleccionadoId, setSeleccionadoId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmandoSalida, setConfirmandoSalida] = useState(false);

  const [toasts, setToasts] = useState([]);
  const toast = useCallback((message, type = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const [perfilForm, setPerfilForm] = useState(null);
  const [perfilActual, setPerfilActual] = useState(() => ({
    nombre: usuario.nombre_completo || 'Repartidor',
    telefono: usuario.telefono || '',
    vehiculo: usuario.vehiculo || 'Moto'
  }));

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
  } = useTrackingMap({ idRepartidor, pedido: pedidoActual, onAviso: toast });

  useEffect(() => {
    document.title = 'MiMini – Panel Repartidor';
  }, []);

  // Selecciona automáticamente el primer pedido activo.
  useEffect(() => {
    if (seleccionadoId && todos.some((p) => p.id === seleccionadoId)) return;
    if (pedidos.length > 0) {
      setSeleccionadoId(pedidos[0].id);
      return;
    }
    if (seleccionadoId && !todos.some((p) => p.id === seleccionadoId)) {
      setSeleccionadoId(null);
    }
  }, [pedidos, todos, seleccionadoId]);

  const kpis = {
    asignados: Number(estadisticas.pedidos_pendientes ?? pedidos.length) || 0,
    entregasHoy: Number(estadisticas.entregas_hoy || 0),
    gananciaHoy: fmtMoney(estadisticas.ganancia_hoy || 0),
    entregasTotal: Number(estadisticas.entregas_completadas || 0)
  };

  const alAlternarDisponibilidad = async () => {
    try {
      const nuevo = await toggleDisponibilidad();
      toast(
        nuevo ? 'Ahora estás disponible' : 'Te marcaste como no disponible',
        nuevo ? 'success' : 'warning'
      );
    } catch (e) {
      toast(e.message, 'danger');
    }
  };

  const sincronizar = async () => {
    try {
      await recargar();
      toast('Datos sincronizados', 'info');
    } catch (e) {
      toast(e.message, 'danger');
    }
  };

  const cerrarSesion = () => setConfirmandoSalida(true);

  const confirmarCierreSesion = () => {
    localStorage.removeItem('usuario');
    localStorage.removeItem('id_repartidor');
    localStorage.removeItem('token');
    window.location.href = '/';
  };

  const alCambiarEstado = async (estado) => {
    if (!pedidoActual || guardando) return;

    if (pedidoActual.estado === estado) {
      toast('El pedido ya está en estado ' + estadoLabel(estado), 'info');
      return;
    }

    if (estado === 'entregado' && !window.confirm(`¿Confirmar la entrega del pedido #${pedidoActual.id}?`)) {
      return;
    }

    if (estado === 'cancelado' && !window.confirm(`¿Cancelar el pedido #${pedidoActual.id}?`)) {
      return;
    }

    setGuardando(true);
    try {
      await cambiarEstado(pedidoActual.id, estado);
      toast(
        `Pedido #${pedidoActual.id} → ${estadoLabel(estado)}`,
        estado === 'cancelado' ? 'warning' : 'success'
      );
      if (ESTADOS_FINALES.includes(estado)) setTab('historial');
    } catch (e) {
      toast(e.message, 'danger');
    } finally {
      setGuardando(false);
    }
  };

  const abrirPerfil = () => {
    setPerfilForm({ ...perfilActual });
  };

  const guardarPerfil = async () => {
    if (!perfilForm) return;
    const nombre = perfilForm.nombre.trim();

    if (!nombre) {
      toast('El nombre es obligatorio', 'warning');
      return;
    }

    try {
      const actualizado = await actualizarPerfil({
        nombre_completo: nombre,
        telefono: perfilForm.telefono.trim(),
        vehiculo: perfilForm.vehiculo
      });

      setPerfilActual({
        nombre: actualizado.nombre_completo || nombre,
        telefono: actualizado.telefono || '',
        vehiculo: actualizado.vehiculo || perfilForm.vehiculo
      });
      setPerfilForm(null);
      toast('Perfil actualizado', 'success');
    } catch (e) {
      toast(e.message, 'danger');
    }
  };

  const lista = tab === 'activos' ? pedidos : historial;
  const finalizado = pedidoActual ? ESTADOS_FINALES.includes(pedidoActual.estado) : false;
  const gpsClase = gps.estado ? ` ${gps.estado}` : '';

  if (!idRepartidor) {
    return (
      <div className="repartidor-page">
        <div className="rp-layout" style={{ gridTemplateColumns: '1fr' }}>
          <div className="rp-aviso">
            <i className="bi bi-exclamation-triangle me-2" />
            No se encontró tu ID de repartidor en la sesión. Vuelve a iniciar sesión.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="repartidor-page">
      {/* ================= TOPBAR ================= */}
      <header className="rp-topbar">
        <div className="rp-brand">
          <div className="rp-brand-logo">
            <i className="bi bi-bicycle" />
          </div>
          <div>
            <div className="rp-brand-name">MiMini</div>
            <div className="rp-brand-sub">Panel Repartidor</div>
          </div>
        </div>

        <div className="rp-driver-chip">
          <div className="rp-avatar">{(perfilActual.nombre || 'R').trim().charAt(0).toUpperCase()}</div>
          <div>
            <div className="rp-driver-name">{perfilActual.nombre || 'Repartidor'}</div>
            <div className="rp-driver-role">{disponible ? 'En línea · disponible' : 'Pausado'}</div>
          </div>
        </div>

        <div className="rp-topbar-spacer" />

        <div className={`rp-avail-box ${disponible ? 'on' : ''}`}>
          <span className="rp-txt">{disponible ? 'Disponible' : 'Pausado'}</span>
          <div
            className={`rp-switch ${disponible ? 'on' : ''}`}
            role="switch"
            aria-checked={disponible}
            tabIndex={0}
            onClick={alAlternarDisponibilidad}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                alAlternarDisponibilidad();
              }
            }}
          />
        </div>

        <button className="rp-icon-btn" title="Sincronizar pedidos" onClick={sincronizar}>
          <i className="bi bi-arrow-repeat" />
        </button>
        <button className="rp-icon-btn" title="Mi perfil" onClick={abrirPerfil}>
          <i className="bi bi-person-gear" />
        </button>
        <Link
          className="rp-icon-btn"
          to="/repartidor/mapa"
          target="_blank"
          rel="noreferrer"
          title="Mapa en pantalla completa"
        >
          <i className="bi bi-fullscreen" />
        </Link>
        <button className="rp-icon-btn danger" title="Cerrar sesión" onClick={cerrarSesion}>
          <i className="bi bi-box-arrow-right" />
        </button>
      </header>

      {/* ================= CONTENIDO ================= */}
      <main className="rp-layout">
        <aside className="rp-side">
          <section className="rp-kpis">
            <div className="rp-kpi" style={{ '--accent': 'var(--green)' }}>
              <div className="rp-lab">Asignados</div>
              <div className="rp-val">{kpis.asignados}</div>
            </div>
            <div className="rp-kpi" style={{ '--accent': 'var(--cyan)' }}>
              <div className="rp-lab">Entregas hoy</div>
              <div className="rp-val">{kpis.entregasHoy}</div>
            </div>
            <div className="rp-kpi" style={{ '--accent': 'var(--amber)' }}>
              <div className="rp-lab">Ganancia hoy</div>
              <div className="rp-val">{kpis.gananciaHoy}</div>
            </div>
            <div className="rp-kpi" style={{ '--accent': 'var(--violet)' }}>
              <div className="rp-lab">Entregas totales</div>
              <div className="rp-val">{kpis.entregasTotal}</div>
            </div>
          </section>

          <section className="rp-panel rp-orders-panel">
            <div className="rp-tabs">
              <button
                className={`rp-tab ${tab === 'activos' ? 'active' : ''}`}
                onClick={() => setTab('activos')}
              >
                <i className="bi bi-box-seam" /> Asignados{' '}
                <span className="rp-count">{pedidos.length}</span>
              </button>
              <button
                className={`rp-tab ${tab === 'historial' ? 'active' : ''}`}
                onClick={() => setTab('historial')}
              >
                <i className="bi bi-clock-history" /> Historial
              </button>
            </div>

            <div className="rp-orders-list">
              {cargando && lista.length === 0 && (
                <div className="rp-empty-list">
                  <i className="bi bi-arrow-repeat" />
                  Cargando pedidos…
                </div>
              )}

              {!cargando && lista.length === 0 && (
                <div className="rp-empty-list">
                  <i
                    className={
                      tab === 'activos' ? 'bi bi-check2-all' : 'bi bi-clock-history'
                    }
                  />
                  {tab === 'activos'
                    ? 'No tienes pedidos activos asignados. Un administrador te asignará los pedidos.'
                    : 'Aún no hay entregas en el historial.'}
                </div>
              )}

              {lista.map((p) => {
                const e = estadoInfo(p.estado);
                return (
                  <button
                    key={p.id}
                    className={`rp-order-card ${pedidoActual && pedidoActual.id === p.id ? 'active' : ''}`}
                    onClick={() => setSeleccionadoId(p.id)}
                  >
                    <div className="rp-oc-top">
                      <span className="rp-oc-id">Pedido #{p.id}</span>
                      <span className="rp-state-badge" style={{ '--c': e.color }}>
                        {e.label}
                      </span>
                    </div>
                    <div className="rp-oc-client">{p.cliente}</div>
                    <div className="rp-oc-addr">
                      <i className="bi bi-geo-alt-fill" />
                      <span>{p.direccion}</span>
                    </div>
                    <div className="rp-oc-bottom">
                      <span className="rp-money">{fmtMoney(p.total)}</span>
                      <span className="rp-go">
                        Ver detalle <i className="bi bi-chevron-right" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </aside>

        <section className="rp-main">
          <div className="rp-map-card">
            <div ref={contenedorRef} className="trk-map" />

            <div className="rp-map-top">
              <div className={`rp-map-pill${gpsClase}`}>
                <span className="rp-dot" /> <span>{gps.texto}</span>
              </div>

              {pedidoActual && (
                <div className="rp-map-pill">
                  <i className="bi bi-geo-alt-fill" style={{ color: 'var(--red)' }} />
                  <span>
                    #{pedidoActual.id} · {pedidoActual.cliente}
                  </span>
                </div>
              )}

              <div className="rp-map-pill" style={{ marginLeft: 'auto' }}>
                <i className="bi bi-clock" />{' '}
                <span>{actualizadoHace != null ? `hace ${actualizadoHace}s` : '—'}</span>
              </div>
            </div>

            <div className="rp-map-bottom">
              <div className="rp-route-box">
                <div>
                  <div className="rp-rl">Distancia</div>
                  <div className="rp-rv cyan">{metricas.distancia}</div>
                </div>
                <div>
                  <div className="rp-rl">Tiempo</div>
                  <div className="rp-rv">{metricas.tiempo}</div>
                </div>
                <div>
                  <div className="rp-rl">Pedido</div>
                  <div className="rp-rv">{pedidoActual ? `#${pedidoActual.id}` : '—'}</div>
                </div>
              </div>
            </div>
          </div>

          <section className="rp-panel rp-detail-panel">
            {!pedidoActual && (
              <div className="rp-detail-empty">
                <i className="bi bi-signpost-2" />
                <p>
                  Estos son los pedidos en cola asignados por el administrador. Selecciona uno
                  para ver la ruta y actualizar su estado de entrega.
                </p>
              </div>
            )}

            {pedidoActual && (
              <>
                <div className="rp-detail-head">
                  <div style={{ minWidth: 0 }}>
                    <div className="rp-d-id">Pedido #{pedidoActual.id}</div>
                    <div className="rp-d-client">{pedidoActual.cliente}</div>
                    <div className="rp-d-addr">
                      <i className="bi bi-geo-alt-fill" />
                      <span>{pedidoActual.direccion}</span>
                    </div>
                    <div className="rp-d-addr" style={{ marginTop: 3 }}>
                      <i className="bi bi-telephone" />
                      <span>{pedidoActual.telefono || 'Sin teléfono registrado'}</span>
                    </div>
                  </div>
                  <div className="rp-d-total">
                    <div className="rp-lab">Total pedido</div>
                    <div className="rp-val">{fmtMoney(pedidoActual.total)}</div>
                  </div>
                </div>

                <div className="rp-state-block">
                  <div className="rp-state-title">
                    <span>Estado del pedido</span>
                    <span
                      className="rp-state-badge"
                      style={{ '--c': estadoInfo(pedidoActual.estado).color }}
                    >
                      {estadoLabel(pedidoActual.estado)}
                    </span>
                  </div>

                  <div className="rp-state-options">
                    {ESTADOS.map((est) => {
                      const restringido = ESTADOS_SOLO_ADMIN.includes(est.id);
                      const deshabilitado = finalizado || restringido || guardando;
                      return (
                        <button
                          key={est.id}
                          type="button"
                          className={`rp-state-btn ${pedidoActual.estado === est.id ? 'active' : ''}`}
                          style={{ '--c': est.color }}
                          disabled={deshabilitado}
                          title={
                            restringido
                              ? 'Solo administrador o empleado puede seleccionar este estado'
                              : undefined
                          }
                          onClick={() => alCambiarEstado(est.id)}
                        >
                          <i className={`bi ${est.icon}`} />
                          <span>{est.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="rp-state-hint">
                    {finalizado ? (
                      <>
                        Este pedido está <b>finalizado</b> ({estadoLabel(pedidoActual.estado)}). Los
                        estados están bloqueados.
                      </>
                    ) : (
                      <>
                        Estado actual: <b>{estadoLabel(pedidoActual.estado)}</b>. Los estados{' '}
                        <b>Preparando</b> y <b>Cancelado</b> solo los puede cambiar un administrador
                        o empleado.
                      </>
                    )}
                  </div>
                </div>

                <div className="rp-detail-actions">
                  <a
                    className="rp-btn-soft green"
                    href={pedidoActual.telefono ? `tel:${pedidoActual.telefono.replace(/[^0-9+]/g, '')}` : '#'}
                    style={
                      pedidoActual.telefono
                        ? undefined
                        : { opacity: 0.5, pointerEvents: 'none' }
                    }
                  >
                    <i className="bi bi-telephone-fill" /> Llamar
                  </a>
                  <button className="rp-btn-soft blue" onClick={verRuta}>
                    <i className="bi bi-signpost-split" /> Calcular ruta
                  </button>
                  <button className="rp-btn-soft" onClick={centrarEnDestino}>
                    <i className="bi bi-crosshair" /> Centrar en el destino
                  </button>
                  <button
                    className="rp-btn-soft"
                    onClick={() => {
                      if (!centrarEnMi()) {
                        toast('Todavía no hay una ubicación GPS disponible', 'warning');
                      }
                    }}
                  >
                    <i className="bi bi-geo-alt" /> Mi ubicación
                  </button>
                  <span className="rp-state-hint" style={{ marginLeft: 'auto', marginTop: 0 }}>
                    Creado: {fmtFecha(pedidoActual.fecha)}
                  </span>
                </div>
              </>
            )}
          </section>
        </section>
      </main>

      {error && (
        <div style={{ maxWidth: 1700, margin: '0 auto', padding: '0 22px 22px' }}>
          <div className="rp-aviso">
            <i className="bi bi-exclamation-triangle me-2" /> {error}
          </div>
        </div>
      )}

      {/* ================= TOASTS ================= */}
      <div className="rp-toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`rp-toast ${t.type}`}>
            <i className={`bi ${ICONO_TOAST[t.type] || ICONO_TOAST.success}`} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* ================= MODAL PERFIL ================= */}
      {perfilForm && (
        <div className="rp-modal-backdrop" onClick={() => setPerfilForm(null)}>
          <div className="rp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rp-modal-head">
              <span>
                <i className="bi bi-person-gear me-2" style={{ color: 'var(--green)' }} /> Mi perfil
              </span>
              <button className="rp-modal-close" onClick={() => setPerfilForm(null)} aria-label="Cerrar">
                <i className="bi bi-x-lg" />
              </button>
            </div>

            <div className="rp-modal-body">
              <div className="rp-field">
                <label htmlFor="rp-pf-nombre">Nombre completo</label>
                <input
                  id="rp-pf-nombre"
                  type="text"
                  value={perfilForm.nombre}
                  onChange={(e) => setPerfilForm({ ...perfilForm, nombre: e.target.value })}
                  placeholder="Tu nombre"
                />
              </div>
              <div className="rp-field">
                <label htmlFor="rp-pf-telefono">Teléfono</label>
                <input
                  id="rp-pf-telefono"
                  type="text"
                  value={perfilForm.telefono}
                  onChange={(e) => setPerfilForm({ ...perfilForm, telefono: e.target.value })}
                  placeholder="Tu teléfono"
                />
              </div>
              <div className="rp-field">
                <label htmlFor="rp-pf-vehiculo">Vehículo</label>
                <select
                  id="rp-pf-vehiculo"
                  value={perfilForm.vehiculo}
                  onChange={(e) => setPerfilForm({ ...perfilForm, vehiculo: e.target.value })}
                >
                  <option value="Moto">Moto</option>
                  <option value="Bicicleta">Bicicleta</option>
                  <option value="A pie">A pie</option>
                  <option value="Carro">Carro</option>
                </select>
              </div>
            </div>

            <div className="rp-modal-foot">
              <button className="rp-btn-soft" onClick={() => setPerfilForm(null)}>
                Cancelar
              </button>
              <button className="rp-btn-soft green" onClick={guardarPerfil}>
                <i className="bi bi-check2" /> Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL CERRAR SESIÓN ================= */}
      {confirmandoSalida && (
        <div className="rp-modal-backdrop" onClick={() => setConfirmandoSalida(false)}>
          <div className="rp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rp-modal-head">
              <span>
                <i className="bi bi-box-arrow-right me-2" style={{ color: '#ef4444' }} /> Cerrar
                sesión
              </span>
              <button
                className="rp-modal-close"
                onClick={() => setConfirmandoSalida(false)}
                aria-label="Cerrar"
              >
                <i className="bi bi-x-lg" />
              </button>
            </div>

            <div className="rp-modal-body">
              <div className="rp-logout-msg">
                <i className="bi bi-exclamation-triangle-fill" />
                <div>
                  <strong>¿Estás seguro de cerrar sesión?</strong>
                  <span>
                    Si tienes una entrega en curso, podrás volver a entrar cuando quieras.
                  </span>
                </div>
              </div>
            </div>

            <div className="rp-modal-foot">
              <button className="rp-btn-soft" onClick={() => setConfirmandoSalida(false)}>
                Cancelar
              </button>
              <button className="rp-btn-soft red" onClick={confirmarCierreSesion}>
                <i className="bi bi-box-arrow-right" /> Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
