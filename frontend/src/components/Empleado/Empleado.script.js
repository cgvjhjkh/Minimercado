// ========== DATA ==========
let inventario = [
  {id:'P001',name:'Arroz Premium 1kg',cat:'Alimentos',stock:150,ubic:'Pasillo A - Estante 1'},
  {id:'P002',name:'Aceite de Girasol 900ml',cat:'Alimentos',stock:78,ubic:'Pasillo A - Estante 2'},
  {id:'P003',name:'Detergente Líquido 1L',cat:'Aseo',stock:45,ubic:'Pasillo B - Estante 1'},
  {id:'P004',name:'Pasta Espagueti 500g',cat:'Alimentos',stock:120,ubic:'Pasillo B - Estante 3'},
  {id:'P005',name:'Leche Entera 1L',cat:'Lácteos',stock:60,ubic:'Refrigeración - Zona A'},
  {id:'P006',name:'Café Molido 500g',cat:'Bebidas',stock:33,ubic:'Pasillo A - Estante 1'},
  {id:'P007',name:'Galletas Vainilla 300g',cat:'Snacks',stock:18,ubic:'Pasillo B - Estante 3'},
  {id:'P008',name:'Papel Higiénico 4und',cat:'Aseo',stock:200,ubic:'Depósito Central'},
];

let pedidos = [
  {id:'#1058',client:'María López',dir:'Calle 10 # 45-23',status:'Aprobado',items:[
    {name:'Arroz Premium 1kg',qty:1,img:'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=60',done:false},
    {name:'Aceite de Girasol 900ml',qty:1,img:'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=60',done:false},
    {name:'Leche Entera 1L',qty:2,img:'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=60',done:false},
    {name:'Pan Integral',qty:1,img:'',done:false},
    {name:'Huevos x 12',qty:1,img:'',done:false},
    {name:'Manzana Roja 1kg',qty:1,img:'',done:false},
  ]},
  {id:'#1057',client:'Juan Pérez',dir:'Cra 80 # 15-30',status:'Aprobado',items:[
    {name:'Pasta Espagueti 500g',qty:2,img:'',done:false},
    {name:'Café Molido 500g',qty:1,img:'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=60',done:false},
    {name:'Galletas Vainilla 300g',qty:3,img:'',done:false},
  ]},
  {id:'#1056',client:'Ana Torres',dir:'Calle 5 # 12-40',status:'Aprobado',items:[
    {name:'Detergente Líquido 1L',qty:1,img:'',done:false},
    {name:'Papel Higiénico 4und',qty:2,img:'',done:false},
  ]},
];

let danosHistorial = [];
let activityLog = [];
let currentAjusteId = null;

// ========== NAV ==========
function goSection(name, el) {
  document.querySelectorAll('.tab-section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.sidebar .nav-link').forEach(b=>b.classList.remove('active'));
  document.getElementById('section-'+name).classList.add('active');
  if(el) el.classList.add('active');
  const titles={operaciones:'Inventario y Logística',inventario:'Inventario General',picking:'Picking List',danos:'Productos Dañados',historial:'Historial de Actividad'};
  document.getElementById('pageTitle').innerHTML = `<i class="bi bi-boxes me-2" style="color:var(--purple);"></i>${titles[name]||name}`;
  if(name==='inventario') renderInventario();
  if(name==='picking') renderPedidosLista();
  if(name==='danos') renderDanosSection();
  if(name==='historial') renderHistorial();
  if(name==='operaciones') { updateKPIs(); renderPickingSelect(); renderPicking(); }
}

// ========== TOAST ==========
function showToast(msg,type='success') {
  const id='t'+Date.now();
  const color=type==='success'?'#5b21b6':type==='danger'?'#dc2626':'#f59e0b';
  const icon=type==='success'?'bi-check-circle-fill':type==='danger'?'bi-x-circle-fill':'bi-info-circle-fill';
  document.getElementById('toastContainer').insertAdjacentHTML('beforeend',
    `<div id="${id}" class="toast show text-white border-0 mb-2" style="background:${color};border-radius:12px;min-width:280px;"><div class="d-flex align-items-center gap-2 p-3"><i class="bi ${icon} fs-5"></i><span style="font-size:.9rem;font-weight:700;">${msg}</span><button class="btn-close btn-close-white ms-auto" onclick="document.getElementById('${id}').remove()"></button></div></div>`);
  setTimeout(()=>{const t=document.getElementById(id);if(t)t.remove();},3500);
}

function logActivity(msg) {
  activityLog.unshift({msg, time: new Date().toLocaleTimeString('es-CO', {hour:'2-digit',minute:'2-digit'})});
}

// ========== KPIs ==========
function updateKPIs() {
  document.getElementById('kpi-stock').textContent = inventario.length;
  document.getElementById('kpi-bajo').textContent = inventario.filter(p=>p.stock<50).length;
  document.getElementById('kpi-pedidos').textContent = pedidos.length;
  document.getElementById('kpi-danos').textContent = danosHistorial.filter(d=>d.today).length;
}

// ========== BUSCAR PRODUCTO ==========
function buscarProducto() {
  const q = document.getElementById('buscar-prod').value.toLowerCase();
  const res = document.getElementById('buscar-results');
  if(!q) { res.style.display='none'; return; }
  const found = inventario.filter(p=>p.name.toLowerCase().includes(q));
  if(!found.length) { res.style.display='none'; return; }
  res.style.display='block';
  res.innerHTML = found.map(p=>`<div style="padding:8px 12px;cursor:pointer;font-size:.85rem;font-weight:600;border-bottom:1px solid #f5f3ff;" onmousedown="selectProduct('${p.id}','${p.name}')" onmouseover="this.style.background='#f5f3ff'" onmouseout="this.style.background=''">${p.name} <span style="color:#94a3b8;font-weight:400;">(Stock: ${p.stock})</span></div>`).join('');
}

function selectProduct(id, name) {
  document.getElementById('buscar-prod').value = name;
  document.getElementById('buscar-results').style.display='none';
  document.getElementById('entrada-prod').value = id;
}

// ========== ENTRADA ==========
function registrarEntrada() {
  const prodId = document.getElementById('entrada-prod').value;
  const qty = parseInt(document.getElementById('entrada-qty').value);
  const ubic = document.getElementById('entrada-ubic').value;
  if(!prodId){showToast('Selecciona un producto','danger');return;}
  if(!qty||qty<1){showToast('La cantidad debe ser mayor a 0','danger');return;}
  if(!ubic){showToast('Selecciona una ubicación','danger');return;}
  const prod = inventario.find(p=>p.id===prodId);
  prod.stock += qty;
  prod.ubic = ubic;
  logActivity(`Entrada: +${qty} und de "${prod.name}" en ${ubic}`);
  showToast(`✅ Entrada registrada: +${qty} de ${prod.name}`);
  document.getElementById('entrada-prod').value='';
  document.getElementById('entrada-qty').value=1;
  document.getElementById('entrada-ubic').value='';
  document.getElementById('buscar-prod').value='';
  updateKPIs();
}

// ========== PICKING ==========
function renderPickingSelect() {
  const sel = document.getElementById('pickingSelect');
  sel.innerHTML = pedidos.map(p=>`<option value="${p.id}">${p.id} – ${p.client}</option>`).join('');
  renderPicking();
}

function renderPicking() {
  const selId = document.getElementById('pickingSelect').value;
  const pedido = pedidos.find(p=>p.id===selId);
  const body = document.getElementById('pickingBody');
  if(!pedido){body.innerHTML='<div class="text-center text-muted py-4">Sin pedidos</div>';return;}
  const done = pedido.items.filter(i=>i.done).length;
  const pct = Math.round((done/pedido.items.length)*100);
  body.innerHTML = `
    <div class="order-header">
      <div class="d-flex justify-content-between align-items-start">
        <div>
          <div class="order-id">Pedido ${pedido.id} – ${pedido.client}</div>
          <div class="order-info">Dirección: ${pedido.dir} · Total items: ${pedido.items.length}</div>
        </div>
        <span style="background:#dcfce7;color:#15803d;border-radius:20px;font-size:.72rem;font-weight:800;padding:4px 12px;">${pedido.status}</span>
      </div>
    </div>
    <div class="picking-table">
      <table class="table">
        <thead><tr><th>✓</th><th>Img</th><th>Producto</th><th>Cant.</th></tr></thead>
        <tbody>${pedido.items.map((item,i)=>`
          <tr style="${item.done?'opacity:.5;text-decoration:line-through':''}">
            <td><div class="check-circle ${item.done?'done':''}" onclick="toggleItem('${pedido.id}',${i})">${item.done?'✓':''}</div></td>
            <td>${item.img?`<img src="${item.img}" style="width:34px;height:34px;object-fit:cover;border-radius:7px;">`:`<div style="width:34px;height:34px;border-radius:7px;background:#f5f3ff;display:flex;align-items:center;justify-content:center;font-size:.8rem;">📦</div>`}</td>
            <td><strong>${item.name}</strong></td>
            <td><span style="background:#f5f3ff;border-radius:6px;padding:2px 8px;font-size:.8rem;font-weight:700;">${item.qty} und</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="d-flex justify-content-between align-items-center mt-1 mb-1">
      <small class="fw-bold text-muted">Progreso: ${done}/${pedido.items.length} items</small>
      <small class="text-muted">${pct}%</small>
    </div>
    <div style="background:#f5f3ff;border-radius:10px;height:8px;margin-bottom:14px;">
      <div style="width:${pct}%;background:var(--purple);border-radius:10px;height:100%;transition:width .4s;"></div>
    </div>
    <button class="btn-print" onclick="imprimirEtiqueta('${pedido.id}')"><i class="bi bi-printer-fill"></i>Imprimir Etiqueta de Despacho</button>`;
}

function toggleItem(pedidoId, idx) {
  const pedido = pedidos.find(p=>p.id===pedidoId);
  pedido.items[idx].done = !pedido.items[idx].done;
  if(pedido.items[idx].done) logActivity(`Item marcado: "${pedido.items[idx].name}" del pedido ${pedidoId}`);
  renderPicking();
}

function imprimirEtiqueta(pedidoId) {
  const pedido = pedidos.find(p=>p.id===pedidoId);
  const allDone = pedido.items.every(i=>i.done);
  if(!allDone) {
    const undone = pedido.items.filter(i=>!i.done).length;
    showToast(`⚠️ Faltan ${undone} items por recoger`,'warning');
    return;
  }
  logActivity(`Etiqueta impresa para pedido ${pedidoId}`);
  showToast(`🖨️ Etiqueta de despacho impresa para ${pedidoId}`);
  const idx = pedidos.indexOf(pedido);
  pedidos.splice(idx,1);
  renderPickingSelect();
  updateKPIs();
}

// ========== INVENTARIO ==========
function renderInventario() {
  const q=(document.getElementById('inv-search')||{value:''}).value.toLowerCase();
  const cat=(document.getElementById('inv-cat')||{value:''}).value;
  const list=inventario.filter(p=>(!q||(p.name.toLowerCase().includes(q)||p.id.toLowerCase().includes(q)))&&(!cat||p.cat===cat));
  document.getElementById('inventarioTable').innerHTML=list.map(p=>{
    const rowClass = p.stock<=0?'status-row-bad':p.stock<50?'status-row-warn':'status-row-ok';
    const estadoBadge = p.stock<=0?'<span class="badge bg-danger">Sin stock</span>':p.stock<50?'<span class="badge" style="background:#fef9c3;color:#a16207;">Stock bajo</span>':'<span class="badge" style="background:#dcfce7;color:#15803d;">OK</span>';
    return `<tr class="${rowClass}">
      <td class="text-muted">${p.id}</td>
      <td><strong>${p.name}</strong></td>
      <td><span style="background:#f5f3ff;border-radius:6px;padding:2px 8px;font-size:.78rem;font-weight:700;">${p.cat}</span></td>
      <td><strong>${p.stock}</strong></td>
      <td style="font-size:.8rem;color:#64748b;">${p.ubic}</td>
      <td>${estadoBadge}</td>
      <td><button style="background:var(--purple-light);border:none;border-radius:7px;padding:4px 10px;font-size:.78rem;font-weight:700;color:var(--purple);cursor:pointer;" onclick="openAjuste('${p.id}')"><i class="bi bi-pencil me-1"></i>Ajustar</button></td>
    </tr>`;
  }).join('');
}

function openAjuste(id) {
  currentAjusteId=id;
  const p=inventario.find(x=>x.id===id);
  document.getElementById('ajusteTitle').textContent='Ajustar Stock – '+p.name;
  document.getElementById('ajusteDesc').textContent=`Stock actual: ${p.stock} unidades`;
  document.getElementById('ajusteValor').value=p.stock;
  new bootstrap.Modal(document.getElementById('ajusteModal')).show();
}

function guardarAjuste() {
  const val=parseInt(document.getElementById('ajusteValor').value);
  if(isNaN(val)||val<0){showToast('Valor no válido','danger');return;}
  const p=inventario.find(x=>x.id===currentAjusteId);
  const prev=p.stock;
  p.stock=val;
  logActivity(`Ajuste de stock: "${p.name}" ${prev} → ${val}`);
  showToast(`Stock de "${p.name}" ajustado a ${val} unidades`);
  bootstrap.Modal.getInstance(document.getElementById('ajusteModal')).hide();
  renderInventario();
  updateKPIs();
}

// ========== DAÑOS ==========
function renderDanosSection() {
  const sel=document.getElementById('dano-prod');
  sel.innerHTML='<option value="">Seleccionar…</option>'+inventario.map(p=>`<option value="${p.id}">${p.name} (Stock: ${p.stock})</option>`).join('');
  renderDanosHistorial();
}

function reportarDano() {
  const prodId=document.getElementById('dano-prod').value;
  const qty=parseInt(document.getElementById('dano-qty').value);
  const motivo=document.getElementById('dano-motivo').value;
  if(!prodId){showToast('Selecciona un producto','danger');return;}
  if(!qty||qty<1){showToast('La cantidad debe ser mayor a 0','danger');return;}
  if(!motivo){showToast('Selecciona un motivo','danger');return;}
  const prod=inventario.find(p=>p.id===prodId);
  if(qty>prod.stock){showToast(`Stock insuficiente. Solo hay ${prod.stock} unidades`,'danger');return;}
  prod.stock-=qty;
  const report={prod:prod.name,qty,motivo,obs:document.getElementById('dano-obs').value,date:new Date().toLocaleDateString('es-CO'),today:true};
  danosHistorial.unshift(report);
  logActivity(`Daño reportado: ${qty} und de "${prod.name}" – ${motivo}`);
  showToast(`⚠️ Daño reportado: -${qty} de ${prod.name}`,'warning');
  document.getElementById('dano-prod').value='';document.getElementById('dano-qty').value=1;document.getElementById('dano-motivo').value='';document.getElementById('dano-obs').value='';
  renderDanosHistorial();
  updateKPIs();
  renderDanosSection();
}

function renderDanosHistorial() {
  const tb=document.getElementById('danosHistorial');
  if(!danosHistorial.length){tb.innerHTML='<tr><td colspan="4" class="text-center text-muted py-4" style="font-size:.85rem;">Sin reportes de daño</td></tr>';return;}
  tb.innerHTML=danosHistorial.map(d=>`<tr><td style="font-size:.85rem;padding:10px 14px;"><strong>${d.prod}</strong></td><td style="padding:10px 14px;"><span style="background:#fee2e2;color:#b91c1c;border-radius:6px;padding:2px 8px;font-size:.78rem;font-weight:700;">-${d.qty}</span></td><td style="font-size:.82rem;padding:10px 14px;">${d.motivo}</td><td style="font-size:.78rem;color:#94a3b8;padding:10px 14px;">${d.date}</td></tr>`).join('');
}

// ========== PEDIDOS LISTA ==========
function renderPedidosLista() {
  const el=document.getElementById('pedidosLista');
  el.innerHTML=pedidos.map(p=>`<div style="padding:12px 16px;border-bottom:1px solid #f5f3ff;cursor:pointer;" onclick="showPickingDetalle('${p.id}')" onmouseover="this.style.background='#faf9ff'" onmouseout="this.style.background=''">
    <div style="font-weight:800;font-size:.9rem;color:var(--purple);">${p.id}</div>
    <div style="font-size:.8rem;color:#64748b;">${p.client}</div>
    <div style="font-size:.75rem;color:#94a3b8;">${p.items.filter(i=>i.done).length}/${p.items.length} items listos</div>
  </div>`).join('');
}

function showPickingDetalle(id) {
  const pedido=pedidos.find(p=>p.id===id);
  const el=document.getElementById('pickingDetalle');
  const done=pedido.items.filter(i=>i.done).length;
  const pct=Math.round((done/pedido.items.length)*100);
  el.innerHTML=`<div class="order-header"><div class="order-id">Pedido ${pedido.id} – ${pedido.client}</div><div class="order-info">${pedido.dir}</div></div>
  <div class="picking-table"><table class="table"><thead><tr><th>✓</th><th>Producto</th><th>Cant.</th></tr></thead><tbody>
  ${pedido.items.map((item,i)=>`<tr style="${item.done?'opacity:.5':''}" onclick="toggleItemDetalle('${pedido.id}',${i})"><td><div class="check-circle ${item.done?'done':''}" style="cursor:pointer;">${item.done?'✓':''}</div></td><td style="cursor:pointer;"><strong>${item.name}</strong></td><td><span style="background:#f5f3ff;border-radius:6px;padding:2px 8px;font-size:.8rem;font-weight:700;">${item.qty}</span></td></tr>`).join('')}
  </tbody></table></div>
  <div class="d-flex justify-content-between mb-1"><small class="fw-bold text-muted">Progreso: ${done}/${pedido.items.length}</small><small>${pct}%</small></div>
  <div style="background:#f5f3ff;border-radius:10px;height:8px;margin-bottom:14px;"><div style="width:${pct}%;background:var(--purple);border-radius:10px;height:100%;"></div></div>
  <button class="btn-print" onclick="imprimirDesdeDetalle('${pedido.id}')"><i class="bi bi-printer-fill"></i>Imprimir Etiqueta</button>`;
}

function toggleItemDetalle(pedidoId, idx) {
  const pedido=pedidos.find(p=>p.id===pedidoId);
  pedido.items[idx].done=!pedido.items[idx].done;
  showPickingDetalle(pedidoId);
  renderPedidosLista();
}

function imprimirDesdeDetalle(pedidoId) {
  const pedido=pedidos.find(p=>p.id===pedidoId);
  const allDone=pedido.items.every(i=>i.done);
  if(!allDone){showToast('⚠️ Faltan items por recoger','warning');return;}
  logActivity(`Etiqueta impresa para pedido ${pedidoId}`);
  showToast(`🖨️ Etiqueta impresa para ${pedidoId}`);
  pedidos.splice(pedidos.indexOf(pedido),1);
  document.getElementById('pickingDetalle').innerHTML='<div class="text-center py-5 text-muted"><i class="bi bi-check-circle-fill fs-2 d-block mb-2" style="color:var(--green);"></i>Pedido completado</div>';
  renderPedidosLista();
}

// ========== HISTORIAL ==========
function renderHistorial() {
  const el=document.getElementById('historialLista');
  if(!activityLog.length){el.innerHTML='<div class="text-center py-5 text-muted"><i class="bi bi-clock-history fs-2 d-block mb-2"></i>Sin actividad registrada aún</div>';return;}
  el.innerHTML=activityLog.map(a=>`<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f5f3ff;">
    <div style="width:8px;height:8px;background:var(--purple);border-radius:50%;flex-shrink:0;"></div>
    <div style="flex:1;font-size:.88rem;font-weight:600;">${a.msg}</div>
    <div style="font-size:.75rem;color:#94a3b8;">${a.time}</div>
  </div>`).join('');
}

// ========== UTILS ==========
function cambiarNum(id, delta) {
  const el=document.getElementById(id);
  const v=parseInt(el.value)||0;
  el.value=Math.max(1,v+delta);
}

function handleLogout(){new bootstrap.Modal(document.getElementById('logoutModal')).show();}
function confirmLogout() {
  localStorage.removeItem('usuario');
  window.location.href = '/';
}

// ============ SESIÓN: MOSTRAR DATOS DEL USUARIO ============
function aplicarSesionUsuario() {
  const usuario = window.usuarioActual;
  if (!usuario) return;
  const inicial = (usuario.nombre_completo || '?').trim().charAt(0).toUpperCase();
  const primerNombre = (usuario.nombre_completo || '').trim().split(' ')[0];
  const topbarAvatar = document.getElementById('topbarAvatar');
  if (topbarAvatar) topbarAvatar.textContent = inicial;
  const topbarUserName = document.getElementById('topbarUserName');
  if (topbarUserName) topbarUserName.textContent = primerNombre || 'Empleado';
}

// ========== INIT ==========
function poblarSelects() {
  const s=document.getElementById('entrada-prod');
  s.innerHTML='<option value="">Seleccionar producto…</option>'+inventario.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
}

aplicarSesionUsuario();
poblarSelects();
updateKPIs();
renderPickingSelect();
