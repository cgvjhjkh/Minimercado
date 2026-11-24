// ============================================================
//  Panel del empleado conectado a la API real (/api/empleado).
//  Las acciones de daño y empacado avisan al administrador desde
//  el backend, que persiste la notificación y la emite por Socket.io.
// ============================================================

let inventario = [];
let pedidos = [];
let danosHistorial = [];
let activityLog = [];
let currentAjusteId = null;

// ---------- Cliente HTTP ----------
async function apiRequest(path, options = {}) {
  const init = {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);

  let respuesta;
  try {
    // En desarrollo Vite redirige /api al backend; en producción es el mismo origen.
    respuesta = await fetch('/api' + path, init);
  } catch (error) {
    throw new Error('No se pudo conectar con el servidor. Verifica que el backend esté activo.');
  }

  let data = null;
  try { data = await respuesta.json(); } catch (_) { /* respuesta vacía */ }

  if (!respuesta.ok || (data && data.success === false)) {
    throw new Error((data && data.error) || `Error ${respuesta.status}`);
  }
  return data || {};
}

function idUsuarioActual() {
  const sesion = window.usuarioActual || {};
  let id = Number(sesion.id_usuario);
  if (!id) {
    try {
      id = Number(JSON.parse(localStorage.getItem('usuario') || '{}').id_usuario);
    } catch (_) { /* sin sesión */ }
  }
  return Number.isFinite(id) && id > 0 ? id : null;
}

function esc(valor) {
  return String(valor == null ? '' : valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------- Carga de datos ----------
function normalizarInventario(filas) {
  return (filas || []).map((p) => ({
    id: p.id_producto,
    name: p.nombre || 'Producto',
    cat: p.categoria || 'Sin categoría',
    stock: Number(p.existencia || 0),
    stockMin: Number(p.stock_minimo || 0),
    ubic: p.ubicacion || 'Sin ubicación'
  }));
}

function normalizarPedidos(filas) {
  return (filas || []).map((p) => ({
    id: String(p.id_pedido),
    estado: p.estado || 'pendiente',
    client: p.cliente_nombre || 'Cliente',
    dir: p.direccion_completa || 'Sin dirección registrada',
    empacado: p.estado === 'preparando',
    items: (p.items || []).map((item) => ({
      id_detalle: item.id_detalle,
      id_producto: item.id_producto,
      name: item.nombre || 'Producto',
      qty: Number(item.cantidad || 0),
      done: Boolean(item.verificado)
    }))
  }));
}

function normalizarDanos(filas) {
  const hoy = new Date().toLocaleDateString('es-CO');
  return (filas || []).map((d) => {
    const fecha = d.fecha_reporte ? new Date(d.fecha_reporte) : null;
    return {
      prod: d.producto || 'Producto',
      qty: Number(d.cantidad || 0),
      motivo: d.motivo || '',
      obs: d.observaciones || '',
      reportadoPor: d.reportado_por || '',
      date: fecha && !Number.isNaN(fecha.getTime())
        ? fecha.toLocaleDateString('es-CO')
        : '—',
      today: fecha && !Number.isNaN(fecha.getTime())
        ? fecha.toLocaleDateString('es-CO') === hoy
        : false
    };
  });
}

async function cargarDatos() {
  try {
    const [respInventario, respPedidos, respDanos] = await Promise.all([
      apiRequest('/empleado/inventario'),
      apiRequest('/empleado/pedidos'),
      apiRequest('/empleado/danos?limit=50')
    ]);

    inventario = normalizarInventario(respInventario.inventario);
    pedidos = normalizarPedidos(respPedidos.pedidos);
    danosHistorial = normalizarDanos(respDanos.danos);
    actualizarVistas();
  } catch (error) {
    showToast('No se pudieron cargar los datos: ' + error.message, 'danger');
    console.error('Error cargando datos del empleado:', error);
  }
}

async function recargarInventario() {
  const data = await apiRequest('/empleado/inventario');
  inventario = normalizarInventario(data.inventario);
  poblarSelects();
  renderInventario();
  updateKPIs();
}

async function recargarPedidos() {
  const data = await apiRequest('/empleado/pedidos');
  pedidos = normalizarPedidos(data.pedidos);
  renderPickingSelect();
  renderPedidosLista();
  updateKPIs();
}

async function recargarDanos() {
  const data = await apiRequest('/empleado/danos?limit=50');
  danosHistorial = normalizarDanos(data.danos);
  renderDanosHistorial();
  updateKPIs();
}

function actualizarVistas() {
  aplicarSesionUsuario();
  poblarSelects();
  updateKPIs();
  renderPickingSelect();
  renderPedidosLista();
  renderDanosSection();
  renderHistorial();
}

// ---------- NAV ----------
function goSection(name, el) {
  document.querySelectorAll('.tab-section').forEach((s) => s.classList.remove('active'));
  document.querySelectorAll('.sidebar .nav-link').forEach((b) => b.classList.remove('active'));
  document.getElementById('section-' + name).classList.add('active');
  if (el) el.classList.add('active');
  const titles = {
    operaciones: 'Inventario y Logística',
    inventario: 'Inventario General',
    picking: 'Picking List',
    danos: 'Productos Dañados',
    historial: 'Historial de Actividad'
  };
  document.getElementById('pageTitle').innerHTML =
    `<i class="bi bi-boxes me-2" style="color:var(--purple);"></i>${titles[name] || name}`;
  if (name === 'inventario') renderInventario();
  if (name === 'picking') renderPedidosLista();
  if (name === 'danos') renderDanosSection();
  if (name === 'historial') renderHistorial();
  if (name === 'operaciones') { updateKPIs(); renderPickingSelect(); renderPicking(); }
}

// ---------- TOAST / LOG ----------
function showToast(msg, type = 'success') {
  const id = 't' + Date.now();
  const color = type === 'success' ? '#193C76' : type === 'danger' ? '#dc2626' : '#f59e0b';
  const icon = type === 'success' ? 'bi-check-circle-fill'
    : type === 'danger' ? 'bi-x-circle-fill' : 'bi-info-circle-fill';
  const contenedor = document.getElementById('toastContainer');
  if (!contenedor) return;
  contenedor.insertAdjacentHTML('beforeend',
    `<div id="${id}" class="toast show text-white border-0 mb-2" style="background:${color};border-radius:12px;min-width:280px;"><div class="d-flex align-items-center gap-2 p-3"><i class="bi ${icon} fs-5"></i><span style="font-size:.9rem;font-weight:700;">${esc(msg)}</span><button class="btn-close btn-close-white ms-auto" onclick="document.getElementById('${id}').remove()"></button></div></div>`);
  setTimeout(() => { const t = document.getElementById(id); if (t) t.remove(); }, 4000);
}

function logActivity(msg) {
  activityLog.unshift({
    msg,
    time: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
  });
  renderHistorial();
}

// ---------- KPIs ----------
function updateKPIs() {
  const texto = (id, valor) => {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
  };
  texto('kpi-stock', inventario.length);
  texto('kpi-bajo', inventario.filter((p) => p.stock < 50).length);
  texto('kpi-pedidos', pedidos.filter((p) => !p.empacado).length);
  texto('kpi-danos', danosHistorial.filter((d) => d.today).length);
}

// ---------- BUSCAR PRODUCTO ----------
function buscarProducto() {
  const campo = document.getElementById('buscar-prod');
  const res = document.getElementById('buscar-results');
  const q = campo.value.toLowerCase().trim();
  if (!q) { res.style.display = 'none'; return; }
  const found = inventario.filter((p) =>
    p.name.toLowerCase().includes(q) || String(p.id).includes(q)
  );
  if (!found.length) { res.style.display = 'none'; return; }
  res.style.display = 'block';
  res.innerHTML = found.map((p) =>
    `<div style="padding:8px 12px;cursor:pointer;font-size:.85rem;font-weight:600;border-bottom:1px solid #f1f5fc;" onmousedown="selectProduct('${esc(p.id)}')" onmouseover="this.style.background='#f1f5fc'" onmouseout="this.style.background=''">${esc(p.name)} <span style="color:#94a3b8;font-weight:400;">(Stock: ${p.stock})</span></div>`
  ).join('');
}

function selectProduct(id) {
  const prod = inventario.find((p) => String(p.id) === String(id));
  if (!prod) return;
  document.getElementById('buscar-prod').value = prod.name;
  document.getElementById('buscar-results').style.display = 'none';
  document.getElementById('entrada-prod').value = prod.id;
}

// ---------- ENTRADA ----------
async function registrarEntrada() {
  const prodId = document.getElementById('entrada-prod').value;
  const qty = parseInt(document.getElementById('entrada-qty').value);
  const ubic = document.getElementById('entrada-ubic').value;
  if (!prodId) { showToast('Selecciona un producto', 'danger'); return; }
  if (!qty || qty < 1) { showToast('La cantidad debe ser mayor a 0', 'danger'); return; }
  if (!ubic) { showToast('Selecciona una ubicación', 'danger'); return; }

  try {
    const data = await apiRequest(`/empleado/inventario/${encodeURIComponent(prodId)}/entrada`, {
      method: 'POST',
      body: { cantidad: qty, ubicacion: ubic }
    });
    await recargarInventario();
    logActivity(`Entrada: +${qty} und (${data.mensaje || 'producto actualizado'})`);
    showToast(`✅ ${data.mensaje || `Entrada registrada: +${qty}`}`);
    document.getElementById('entrada-prod').value = '';
    document.getElementById('entrada-qty').value = 1;
    document.getElementById('entrada-ubic').value = '';
    document.getElementById('buscar-prod').value = '';
  } catch (error) {
    showToast(error.message, 'danger');
  }
}

// ---------- PICKING ----------
function renderPickingSelect() {
  const sel = document.getElementById('pickingSelect');
  if (!sel) return;
  sel.innerHTML = pedidos.map((p) =>
    `<option value="${esc(p.id)}">#${esc(p.id)} – ${esc(p.client)}${p.empacado ? ' (empacado)' : ''}</option>`
  ).join('');
  renderPicking();
}

function renderPicking() {
  const sel = document.getElementById('pickingSelect');
  const body = document.getElementById('pickingBody');
  if (!sel || !body) return;
  const pedido = pedidos.find((p) => p.id === sel.value);
  if (!pedido) {
    body.innerHTML = '<div class="text-center text-muted py-4">Sin pedidos pendientes</div>';
    return;
  }
  const items = pedido.items || [];
  const done = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const listaItems = items.map((item, i) => `
    <tr style="${item.done ? 'opacity:.5;text-decoration:line-through' : ''}">
      <td><div class="check-circle ${item.done ? 'done' : ''}" onclick="toggleItem('${esc(pedido.id)}',${i})">${item.done ? '✓' : ''}</div></td>
      <td><div style="width:34px;height:34px;border-radius:7px;background:#f1f5fc;display:flex;align-items:center;justify-content:center;font-size:.8rem;">📦</div></td>
      <td><strong>${esc(item.name)}</strong></td>
      <td><span style="background:#f1f5fc;border-radius:6px;padding:2px 8px;font-size:.8rem;font-weight:700;">${item.qty} und</span></td>
    </tr>`).join('');

  body.innerHTML = `
    <div class="order-header">
      <div class="d-flex justify-content-between align-items-start">
        <div>
          <div class="order-id">Pedido #${esc(pedido.id)} – ${esc(pedido.client)}</div>
          <div class="order-info">Dirección: ${esc(pedido.dir)} · Total items: ${items.length}</div>
        </div>
        <span style="background:${pedido.empacado ? '#ede9fe;color:#6d28d9' : '#dcfce7;color:#15803d'};border-radius:20px;font-size:.72rem;font-weight:800;padding:4px 12px;">${pedido.empacado ? 'Empacado' : esc(pedido.estado)}</span>
      </div>
    </div>
    <div class="picking-table">
      <table class="table">
        <thead><tr><th>✓</th><th>Img</th><th>Producto</th><th>Cant.</th></tr></thead>
        <tbody>${listaItems || '<tr><td colspan="4" class="text-center text-muted py-3">Sin productos</td></tr>'}</tbody>
      </table>
    </div>
    <div class="d-flex justify-content-between align-items-center mt-1 mb-1">
      <small class="fw-bold text-muted">Progreso: ${done}/${items.length} items</small>
      <small class="text-muted">${pct}%</small>
    </div>
    <div style="background:#f1f5fc;border-radius:10px;height:8px;margin-bottom:14px;">
      <div style="width:${pct}%;background:var(--purple);border-radius:10px;height:100%;transition:width .4s;"></div>
    </div>
    ${pedido.empacado
      ? '<div class="text-center text-muted py-2 fw-bold"><i class="bi bi-check2-circle me-1"></i>Este pedido ya fue empacado y notificado al administrador.</div>'
      : `<button class="btn-print" onclick="imprimirEtiqueta('${esc(pedido.id)}')"><i class="bi bi-printer-fill"></i>Empacar e Imprimir Etiqueta de Despacho</button>`}`;
}

function obtenerPedido(id) {
  return pedidos.find((p) => String(p.id) === String(id));
}

async function toggleItem(pedidoId, idx) {
  const pedido = obtenerPedido(pedidoId);
  const item = pedido?.items?.[idx];
  if (!item || !item.id_detalle || pedido.empacado) return;

  const nuevo = !item.done;
  item.done = nuevo;
  renderPicking();
  renderPedidosLista();
  try {
    await apiRequest(`/empleado/pedidos/${pedido.id}/items/${item.id_detalle}`, {
      method: 'PATCH',
      body: { verificado: nuevo }
    });
    if (nuevo) logActivity(`Item marcado: "${item.name}" del pedido #${pedido.id}`);
  } catch (error) {
    item.done = !nuevo;
    renderPicking();
    showToast(error.message, 'danger');
  }
}

async function empacarPedido(pedidoId) {
  const pedido = obtenerPedido(pedidoId);
  if (!pedido) return;
  if (pedido.empacado) {
    showToast('Este pedido ya fue empacado', 'warning');
    return;
  }
  const items = pedido.items || [];
  if (!items.length || !items.every((i) => i.done)) {
    const undone = items.filter((i) => !i.done).length;
    showToast(`⚠️ Faltan ${undone} items por recoger`, 'warning');
    return;
  }

  try {
    const data = await apiRequest(`/empleado/pedidos/${pedido.id}/empacar`, {
      method: 'POST',
      body: { id_usuario: idUsuarioActual() }
    });
    logActivity(`Pedido #${pedido.id} empacado y listo para despacho`);
    showToast(`✅ Pedido #${pedido.id} empacado. Aviso enviado al administrador.`, 'success');
    await recargarPedidos();
    const detalle = document.getElementById('pickingDetalle');
    if (detalle) {
      detalle.innerHTML = '<div class="text-center py-5 text-muted"><i class="bi bi-check-circle-fill fs-2 d-block mb-2" style="color:var(--green);"></i>Pedido empacado y notificado al administrador</div>';
    }
  } catch (error) {
    showToast(error.message, 'danger');
  }
}

function imprimirEtiqueta(pedidoId) {
  empacarPedido(pedidoId);
}

// ---------- INVENTARIO ----------
function renderInventario() {
  const tabla = document.getElementById('inventarioTable');
  if (!tabla) return;
  const q = (document.getElementById('inv-search') || { value: '' }).value.toLowerCase();
  const cat = (document.getElementById('inv-cat') || { value: '' }).value;
  const list = inventario.filter((p) =>
    (!q || p.name.toLowerCase().includes(q) || String(p.id).toLowerCase().includes(q)) &&
    (!cat || p.cat === cat)
  );

  tabla.innerHTML = list.map((p) => {
    const rowClass = p.stock <= 0 ? 'status-row-bad' : p.stock < 50 ? 'status-row-warn' : 'status-row-ok';
    const estadoBadge = p.stock <= 0
      ? '<span class="badge bg-danger">Sin stock</span>'
      : p.stock < 50
        ? '<span class="badge" style="background:#fef9c3;color:#a16207;">Stock bajo</span>'
        : '<span class="badge" style="background:#dcfce7;color:#15803d;">OK</span>';
    return `<tr class="${rowClass}">
      <td class="text-muted">${esc(p.id)}</td>
      <td><strong>${esc(p.name)}</strong></td>
      <td><span style="background:#f1f5fc;border-radius:6px;padding:2px 8px;font-size:.78rem;font-weight:700;">${esc(p.cat)}</span></td>
      <td><strong>${p.stock}</strong></td>
      <td style="font-size:.8rem;color:#64748b;">${esc(p.ubic)}</td>
      <td>${estadoBadge}</td>
      <td><button style="background:var(--purple-light);border:none;border-radius:7px;padding:4px 10px;font-size:.78rem;font-weight:700;color:var(--purple);cursor:pointer;" onclick="openAjuste('${esc(p.id)}')"><i class="bi bi-pencil me-1"></i>Ajustar</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" class="text-center text-muted py-4">Sin productos</td></tr>';
}

function openAjuste(id) {
  const p = inventario.find((x) => String(x.id) === String(id));
  if (!p) return;
  currentAjusteId = p.id;
  document.getElementById('ajusteTitle').textContent = 'Ajustar Stock – ' + p.name;
  document.getElementById('ajusteDesc').textContent = `Stock actual: ${p.stock} unidades`;
  document.getElementById('ajusteValor').value = p.stock;
  new bootstrap.Modal(document.getElementById('ajusteModal')).show();
}

async function guardarAjuste() {
  const val = parseInt(document.getElementById('ajusteValor').value);
  if (isNaN(val) || val < 0) { showToast('Valor no válido', 'danger'); return; }
  if (!currentAjusteId) return;
  try {
    const data = await apiRequest(`/empleado/inventario/${encodeURIComponent(currentAjusteId)}/stock`, {
      method: 'PATCH',
      body: { existencia: val }
    });
    logActivity(`Ajuste de stock: ${data.mensaje || `existencia ${val}`}`);
    showToast(`✅ ${data.mensaje || `Stock ajustado a ${val} unidades`}`);
    bootstrap.Modal.getInstance(document.getElementById('ajusteModal')).hide();
    await recargarInventario();
  } catch (error) {
    showToast(error.message, 'danger');
  }
}

// ---------- DAÑOS ----------
function renderDanosSection() {
  const sel = document.getElementById('dano-prod');
  if (!sel) return;
  sel.innerHTML = '<option value="">Seleccionar…</option>' + inventario.map((p) =>
    `<option value="${esc(p.id)}">${esc(p.name)} (Stock: ${p.stock})</option>`
  ).join('');
  renderDanosHistorial();
}

async function reportarDano() {
  const prodId = document.getElementById('dano-prod').value;
  const qty = parseInt(document.getElementById('dano-qty').value);
  const motivo = document.getElementById('dano-motivo').value;
  const obs = document.getElementById('dano-obs').value;
  if (!prodId) { showToast('Selecciona un producto', 'danger'); return; }
  if (!qty || qty < 1) { showToast('La cantidad debe ser mayor a 0', 'danger'); return; }
  if (!motivo) { showToast('Selecciona un motivo', 'danger'); return; }

  const prod = inventario.find((p) => String(p.id) === String(prodId));
  if (prod && qty > prod.stock) {
    showToast(`Stock insuficiente. Solo hay ${prod.stock} unidades`, 'danger');
    return;
  }

  try {
    const data = await apiRequest('/empleado/danos', {
      method: 'POST',
      body: {
        id_producto: Number(prodId),
        cantidad: qty,
        motivo,
        observaciones: obs,
        id_usuario: idUsuarioActual()
      }
    });
    await Promise.all([recargarInventario(), recargarDanos()]);
    renderDanosSection();
    logActivity(`Daño reportado: ${qty} und de "${prod?.name || prodId}" – ${motivo}`);
    showToast(`⚠️ ${data.mensaje || 'Daño reportado'}. Aviso enviado al administrador.`, 'warning');
    document.getElementById('dano-prod').value = '';
    document.getElementById('dano-qty').value = 1;
    document.getElementById('dano-motivo').value = '';
    document.getElementById('dano-obs').value = '';
  } catch (error) {
    showToast(error.message, 'danger');
  }
}

function renderDanosHistorial() {
  const tb = document.getElementById('danosHistorial');
  if (!tb) return;
  if (!danosHistorial.length) {
    tb.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4" style="font-size:.85rem;">Sin reportes de daño</td></tr>';
    return;
  }
  tb.innerHTML = danosHistorial.map((d) => `
    <tr>
      <td style="font-size:.85rem;padding:10px 14px;"><strong>${esc(d.prod)}</strong></td>
      <td style="padding:10px 14px;"><span style="background:#fee2e2;color:#b91c1c;border-radius:6px;padding:2px 8px;font-size:.78rem;font-weight:700;">-${d.qty}</span></td>
      <td style="font-size:.82rem;padding:10px 14px;">${esc(d.motivo)}</td>
      <td style="font-size:.78rem;color:#94a3b8;padding:10px 14px;">${esc(d.date)}</td>
    </tr>`).join('');
}

// ---------- PEDIDOS LISTA / DETALLE ----------
function renderPedidosLista() {
  const el = document.getElementById('pedidosLista');
  if (!el) return;
  el.innerHTML = pedidos.map((p) => {
    const done = (p.items || []).filter((i) => i.done).length;
    const total = (p.items || []).length;
    return `<div style="padding:12px 16px;border-bottom:1px solid #f1f5fc;cursor:pointer;" onclick="showPickingDetalle('${esc(p.id)}')" onmouseover="this.style.background='#f7f9fd'" onmouseout="this.style.background=''">
      <div style="font-weight:800;font-size:.9rem;color:var(--purple);">#${esc(p.id)} ${p.empacado ? '<span style="font-size:.68rem;color:#6d28d9;">✓ Empacado</span>' : ''}</div>
      <div style="font-size:.8rem;color:#64748b;">${esc(p.client)}</div>
      <div style="font-size:.75rem;color:#94a3b8;">${done}/${total} items listos</div>
    </div>`;
  }).join('') || '<div class="text-center text-muted py-4" style="font-size:.85rem;">Sin pedidos pendientes</div>';
}

function showPickingDetalle(id) {
  const pedido = obtenerPedido(id);
  const el = document.getElementById('pickingDetalle');
  if (!pedido || !el) return;
  const items = pedido.items || [];
  const done = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  el.innerHTML = `
    <div class="order-header">
      <div class="order-id">Pedido #${esc(pedido.id)} – ${esc(pedido.client)}</div>
      <div class="order-info">${esc(pedido.dir)}</div>
    </div>
    <div class="picking-table"><table class="table"><thead><tr><th>✓</th><th>Producto</th><th>Cant.</th></tr></thead><tbody>
    ${items.map((item, i) => `
      <tr style="${item.done ? 'opacity:.5' : ''}" onclick="toggleItemDetalle('${esc(pedido.id)}',${i})">
        <td><div class="check-circle ${item.done ? 'done' : ''}" style="cursor:pointer;">${item.done ? '✓' : ''}</div></td>
        <td style="cursor:pointer;"><strong>${esc(item.name)}</strong></td>
        <td><span style="background:#f1f5fc;border-radius:6px;padding:2px 8px;font-size:.8rem;font-weight:700;">${item.qty}</span></td>
      </tr>`).join('') || '<tr><td colspan="3" class="text-center text-muted py-3">Sin productos</td></tr>'}
    </tbody></table></div>
    <div class="d-flex justify-content-between mb-1"><small class="fw-bold text-muted">Progreso: ${done}/${items.length}</small><small>${pct}%</small></div>
    <div style="background:#f1f5fc;border-radius:10px;height:8px;margin-bottom:14px;"><div style="width:${pct}%;background:var(--purple);border-radius:10px;height:100%;"></div></div>
    ${pedido.empacado
      ? '<div class="text-center text-muted py-2 fw-bold"><i class="bi bi-check2-circle me-1"></i>Este pedido ya fue empacado y notificado al administrador.</div>'
      : `<button class="btn-print" onclick="imprimirDesdeDetalle('${esc(pedido.id)}')"><i class="bi bi-printer-fill"></i>Empacar e Imprimir Etiqueta</button>`}`;
}

function toggleItemDetalle(pedidoId, idx) {
  toggleItem(pedidoId, idx).then(() => showPickingDetalle(pedidoId));
}

function imprimirDesdeDetalle(pedidoId) {
  empacarPedido(pedidoId);
}

// ---------- HISTORIAL ----------
function renderHistorial() {
  const el = document.getElementById('historialLista');
  if (!el) return;
  if (!activityLog.length) {
    el.innerHTML = '<div class="text-center py-5 text-muted"><i class="bi bi-clock-history fs-2 d-block mb-2"></i>Sin actividad registrada aún</div>';
    return;
  }
  el.innerHTML = activityLog.map((a) => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f1f5fc;">
      <div style="width:8px;height:8px;background:var(--purple);border-radius:50%;flex-shrink:0;"></div>
      <div style="flex:1;font-size:.88rem;font-weight:600;">${esc(a.msg)}</div>
      <div style="font-size:.75rem;color:#94a3b8;">${esc(a.time)}</div>
    </div>`).join('');
}

// ---------- UTILS ----------
function cambiarNum(id, delta) {
  const el = document.getElementById(id);
  const v = parseInt(el.value) || 0;
  el.value = Math.max(1, v + delta);
}

function handleLogout() {
  new bootstrap.Modal(document.getElementById('logoutModal')).show();
}

function confirmLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  window.location.href = '/';
}

// ---------- SESIÓN ----------
function aplicarSesionUsuario() {
  const usuario = window.usuarioActual ||
    (() => { try { return JSON.parse(localStorage.getItem('usuario')); } catch { return null; } })();
  if (!usuario) return;
  const inicial = (usuario.nombre_completo || '?').trim().charAt(0).toUpperCase();
  const primerNombre = (usuario.nombre_completo || '').trim().split(' ')[0];
  const topbarAvatar = document.getElementById('topbarAvatar');
  if (topbarAvatar) topbarAvatar.textContent = inicial;
  const topbarUserName = document.getElementById('topbarUserName');
  if (topbarUserName) topbarUserName.textContent = primerNombre || 'Empleado';
}

function poblarSelects() {
  const s = document.getElementById('entrada-prod');
  if (!s) return;
  s.innerHTML = '<option value="">Seleccionar producto…</option>' + inventario.map((p) =>
    `<option value="${esc(p.id)}">${esc(p.name)}</option>`
  ).join('');
}

// ---------- INIT ----------
aplicarSesionUsuario();
poblarSelects();
updateKPIs();
renderPickingSelect();
renderDanosSection();
cargarDatos();
