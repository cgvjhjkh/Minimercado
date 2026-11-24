// ============================================================
//  Utilidades compartidas del módulo de repartidor:
//  cliente HTTP, socket, estados, formato y normalización.
// ============================================================
import { io } from 'socket.io-client';

// En desarrollo Vite reenvía /api y /socket.io al backend (3000).
// En producción el backend sirve el frontend en el mismo origen.
const RAW_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const API_BASE = RAW_BASE;
export const API = `${RAW_BASE}/api`;

export const ESTADOS = [
  { id: 'pendiente', label: 'Pendiente', icon: 'bi-hourglass-split', color: '#f59e0b' },
  { id: 'confirmado', label: 'Confirmado', icon: 'bi-check2-circle', color: '#3b82f6' },
  { id: 'preparando', label: 'Preparando', icon: 'bi-box-seam', color: '#8b5cf6' },
  { id: 'en_camino', label: 'En camino', icon: 'bi-truck', color: '#0ea5e9' },
  { id: 'entregado', label: 'Entregado', icon: 'bi-check2-all', color: '#22c55e' },
  { id: 'cancelado', label: 'Cancelado', icon: 'bi-x-circle', color: '#ef4444' }
];

export const ESTADOS_ACTIVOS = ['pendiente', 'confirmado', 'preparando', 'en_camino'];
export const ESTADOS_FINALES = ['entregado', 'cancelado'];
// El repartidor no puede establecer estos estados (solo admin/empleado).
export const ESTADOS_SOLO_ADMIN = ['preparando', 'cancelado'];

export function estadoInfo(id) {
  return ESTADOS.find((e) => e.id === id) || ESTADOS[0];
}

export function estadoLabel(id) {
  return estadoInfo(id).label;
}

export function fmtMoney(value) {
  const n = Number(value) || 0;
  return '$' + n.toLocaleString('es-CO', { maximumFractionDigits: 0 });
}

export function fmtFecha(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

export function fmtHora(value = new Date()) {
  return value.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export function haversine(a, b) {
  if (!a || !b) return 0;
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function escapar(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function parseResponse(res) {
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok || (data && data.success === false)) {
    throw new Error((data && data.error) || `Error ${res.status}`);
  }

  return data || { success: true };
}

export async function apiGet(path) {
  const res = await fetch(API + path, { headers: { Accept: 'application/json' } });
  return parseResponse(res);
}

export async function apiSend(method, path, body) {
  const init = { method, headers: { Accept: 'application/json' } };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const res = await fetch(API + path, init);
  return parseResponse(res);
}

// Normaliza la fila de MySQL al modelo que usan los componentes.
export function normalizarPedido(p) {
  const lat = p.destino_lat !== null && p.destino_lat !== undefined && p.destino_lat !== ''
    ? Number(p.destino_lat)
    : null;
  const lng = p.destino_lng !== null && p.destino_lng !== undefined && p.destino_lng !== ''
    ? Number(p.destino_lng)
    : null;
  const partes = [p.calle, p.numero, p.complemento, p.barrio].filter(Boolean);

  return {
    id: Number(p.id_pedido),
    estado: p.estado || 'pendiente',
    total: Number(p.total_pagar) || 0,
    fecha: p.fecha_pedido,
    fechaEntrega: p.fecha_entrega,
    cliente: p.cliente_nombre || 'Cliente',
    telefono: p.cliente_telefono || '',
    direccion: partes.join(' ') || 'Sin dirección registrada',
    idDireccion: p.id_direccion || null,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    metodoPago: p.metodo_pago || 'efectivo',
    idRepartidor: p.id_repartidor ? Number(p.id_repartidor) : null,
    tiempo: p.tiempo_estimado_llegada || null
  };
}

export function leerUsuario() {
  try {
    return JSON.parse(localStorage.getItem('usuario')) || null;
  } catch {
    return null;
  }
}

export function crearSocket() {
  return io(RAW_BASE || window.location.origin, {
    auth: { token: localStorage.getItem('token') || undefined }
  });
}
