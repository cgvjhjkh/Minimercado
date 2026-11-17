// ============ DATA ============
let available = true;
let pedidos = [
  {id:'#1058',client:'María López',dir:'Calle 10 # 45-23',valor:25600,status:'Asignado'},
  {id:'#1057',client:'Juan Pérez',dir:'Cra 80 # 15-30',valor:32800,status:'Asignado'},
  {id:'#1056',client:'Ana Torres',dir:'Calle 5 # 12-40',valor:18500,status:'Asignado'},
];
let entregasHoy = [];
let gananciaHoy = 0;
let currentPedido = null;
let enCamino = false;
let routeInterval = null;
let routeProgress = 0;
let signatureSigned = false;
let hasPhoto = false;
let chatMessages = [];
let signCanvas, signCtx, drawing = false;

// ============ CLOCK ============
function updateClock() {
  const now = new Date();
  const t = now.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
  document.querySelectorAll('.time').forEach(el => el.textContent = t);
}
updateClock();
setInterval(updateClock, 10000);

// ============ TOAST ============
function showToast(msg, type='success') {
  const id = 't'+Date.now();
  const color = type==='success'?'#15803d':type==='danger'?'#dc2626':type==='warning'?'#d97706':'#2563eb';
  const icon = type==='success'?'bi-check-circle-fill':type==='danger'?'bi-x-circle-fill':type==='warning'?'bi-exclamation-triangle-fill':'bi-info-circle-fill';
  document.getElementById('toastContainer').insertAdjacentHTML('beforeend',
    `<div id="${id}" class="toast show text-white border-0 mb-2" style="background:${color};border-radius:12px;min-width:260px;"><div class="d-flex align-items-center gap-2 p-3"><i class="bi ${icon} fs-5"></i><span style="font-size:.88rem;font-weight:700;">${msg}</span><button class="btn-close btn-close-white ms-auto" onclick="document.getElementById('${id}').remove()"></button></div></div>`);
  setTimeout(()=>{const t=document.getElementById(id);if(t)t.remove();},3500);
}

// ============ TOGGLE AVAILABILITY ============
function toggleAvailability() {
  available = !available;
  const tog = document.getElementById('availToggle');
  const lbl = document.getElementById('toggleLabel');
  tog.className = 'big-toggle ' + (available?'on':'off');
  lbl.textContent = available ? 'Estado: En línea' : 'Estado: No disponible';
  document.getElementById('cp-estado').textContent = available ? 'Disponible' : 'No disponible';
  document.getElementById('cp-estado-sub').textContent = available ? 'Listo para recibir' : 'Pausado';
  showToast(available ? '✅ Ahora estás disponible' : '⏸ Te marcaste como no disponible', available?'success':'warning');
}

// ============ RENDER ORDERS ============
function renderOrders() {
  const el = document.getElementById('ordersList');
  const ph4 = document.getElementById('ph4-orders');
  if(!pedidos.length) {
    el.innerHTML='<div style="text-align:center;padding:30px 0;color:#94a3b8;font-size:.85rem;"><i class="bi bi-check-all" style="font-size:2rem;display:block;margin-bottom:8px;color:var(--green);"></i>Sin pedidos pendientes</div>';
    if(ph4) ph4.innerHTML=el.innerHTML;
    return;
  }
  const html = pedidos.map(p=>`
    <div class="order-card-delivery" onclick="abrirPedido('${p.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-weight:800;font-size:.9rem;">${p.id}</div>
          <div style="font-size:.8rem;color:#64748b;">${p.client}</div>
          <div style="font-size:.75rem;color:#94a3b8;">${p.dir}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:.95rem;font-weight:800;color:var(--green);">$${p.valor.toLocaleString('es-CO')}</div>
          <i class="bi bi-chevron-right" style="color:#cbd5e1;font-size:.9rem;"></i>
        </div>
      </div>
    </div>`).join('');
  el.innerHTML = html;
  if(ph4) ph4.innerHTML = html;
  document.getElementById('cp-pedidos').textContent = pedidos.length;
}

// ============ ABRIR PEDIDO (Phone 2) ============
function abrirPedido(id) {
  const p = pedidos.find(x=>x.id===id);
  currentPedido = p;
  // Populate Phone 2
  document.getElementById('ruta-orderId').textContent = 'Pedido '+p.id;
  document.getElementById('ruta-client').textContent = p.client;
  document.getElementById('ruta-dir').textContent = p.dir;
  document.getElementById('ruta-valor').textContent = '$'+p.valor.toLocaleString('es-CO');
  // Random distance
  const km = (Math.random()*5+1).toFixed(1);
  const min = Math.round(km*3+2);
  document.getElementById('ruta-dist').textContent = km+' km';
  document.getElementById('ruta-tiempo').textContent = min+' min';
  // Reset route
  enCamino = false;
  routeProgress = 0;
  document.getElementById('routeProgress').style.width = '0%';
  document.getElementById('enrouteBtn').textContent = '';
  document.getElementById('enrouteBtn').innerHTML = '<i class="bi bi-truck me-2"></i>Marcar como "En Camino"';
  document.getElementById('enrouteBtn').style.background = 'var(--green)';
  document.getElementById('statusBtnArea').innerHTML = `<button class="btn-enroute" style="width:100%;margin:0;" id="enrouteBtn" onclick="marcarEnCamino()"><i class="bi bi-truck me-2"></i>Marcar como "En Camino"</button>`;
  // Phone 3 fill
  document.getElementById('conf-orderId').textContent = 'Pedido '+p.id+' · '+p.client;
  document.getElementById('conf-dir').textContent = p.dir;
  // Reset signature & photo
  signatureSigned = false;
  hasPhoto = false;
  document.getElementById('sigStatus').textContent = '';
  document.getElementById('sigPlaceholder').style.display = 'flex';
  document.getElementById('photoArea').className = 'photo-area';
  document.getElementById('photoLabel').textContent = 'Tomar Foto';
  clearSignature(true);
  showToast('📍 Pedido '+p.id+' abierto – '+p.client);
}

// ============ MARCAR EN CAMINO ============
function marcarEnCamino() {
  if(!currentPedido){showToast('Selecciona un pedido primero','warning');return;}
  enCamino = true;
  const btn = document.getElementById('enrouteBtn');
  btn.innerHTML = '<i class="bi bi-truck me-2"></i>En Camino…';
  btn.style.background = '#d97706';
  showToast('🚴 ¡En camino a '+currentPedido.client+'!');
  // Animate route progress
  routeProgress = 0;
  clearInterval(routeInterval);
  routeInterval = setInterval(() => {
    routeProgress += 2;
    document.getElementById('routeProgress').style.width = routeProgress+'%';
    if(routeProgress >= 100) {
      clearInterval(routeInterval);
      document.getElementById('statusBtnArea').innerHTML = `<button style="width:100%;background:#2563eb;color:#fff;border:none;border-radius:12px;padding:13px;font-size:.88rem;font-weight:800;cursor:pointer;box-shadow:0 4px 12px rgba(37,99,235,.3);" onclick="showConfirmScreen()"><i class="bi bi-check-circle me-2"></i>¡Llegué! Confirmar Entrega</button>`;
      showToast('📦 ¡Has llegado al destino!','info');
    }
  }, 80);
}

function showConfirmScreen() {
  // just a hint to go to Phone 3
  showToast('📝 Completa la confirmación en el teléfono 3');
}

// ============ LLAMAR CLIENTE ============
function callClient() {
  if(!currentPedido){showToast('Selecciona un pedido primero','warning');return;}
  showToast('📞 Llamando a '+currentPedido.client+'…','info');
  setTimeout(()=>showToast('📞 Llamada conectada con '+currentPedido.client,'success'),1800);
}

// ============ CHAT ============
function showScreen(name) {
  const screens = ['completado','historial','perfil','chat','inicio4'];
  screens.forEach(s => {
    const el = document.getElementById('screen-'+s);
    if(el) el.style.display = 'none';
  });
  const target = document.getElementById('screen-'+name);
  if(target) target.style.display = 'flex';
  document.getElementById('phone4Label').textContent = {
    completado:'4 · Pedido Completado',
    historial:'4 · Historial',
    perfil:'4 · Perfil',
    chat:'4 · Chat Cliente',
    inicio4:'4 · Vista General'
  }[name] || '4';
  if(name==='historial') renderHistorial();
  if(name==='perfil') renderPerfil();
  if(name==='inicio4') renderPh4();
  if(name==='chat') renderChat();
}

function sendMsg() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if(!msg) return;
  chatMessages.push({text:msg,sent:true,time:new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})});
  input.value='';
  renderChat();
  // Auto reply
  setTimeout(() => {
    const replies = ['Ok, te espero','¿Cuánto demora?','Gracias!','Perfecto, ya voy a la puerta','Está bien, sin problema'];
    chatMessages.push({text:replies[Math.floor(Math.random()*replies.length)],sent:false,time:new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})});
    renderChat();
  }, 1200);
}

function renderChat() {
  const name = currentPedido ? currentPedido.client : 'Cliente';
  document.getElementById('chatTitle').textContent = 'Chat – '+name;
  const el = document.getElementById('chatMessages');
  if(!chatMessages.length){el.innerHTML='<div style="text-align:center;color:#94a3b8;font-size:.82rem;padding:20px;">Inicia la conversación</div>';return;}
  el.innerHTML = chatMessages.map(m=>`
    <div style="display:flex;justify-content:${m.sent?'flex-end':'flex-start'};margin-bottom:6px;">
      <div>
        <div class="chat-bubble ${m.sent?'sent':'recv'}">${m.text}</div>
        <div style="font-size:.62rem;color:#94a3b8;text-align:${m.sent?'right':'left'};margin-top:2px;">${m.time}</div>
      </div>
    </div>`).join('');
  el.scrollTop = el.scrollHeight;
}

// ============ SIGNATURE ============
function initSignCanvas() {
  const canvas = document.getElementById('signCanvas');
  if(!canvas) return;
  const area = document.getElementById('signatureArea');
  canvas.width = area.offsetWidth || 280;
  canvas.height = area.offsetHeight || 120;
  signCtx = canvas.getContext('2d');
  signCtx.strokeStyle = '#1a1a1a';
  signCtx.lineWidth = 2.5;
  signCtx.lineCap = 'round';

  const getPos = (e) => {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return {x:(src.clientX-r.left)*(canvas.width/r.width), y:(src.clientY-r.top)*(canvas.height/r.height)};
  };

  canvas.addEventListener('mousedown', e=>{drawing=true;const p=getPos(e);signCtx.beginPath();signCtx.moveTo(p.x,p.y);});
  canvas.addEventListener('mousemove', e=>{if(!drawing)return;const p=getPos(e);signCtx.lineTo(p.x,p.y);signCtx.stroke();});
  canvas.addEventListener('mouseup', ()=>{if(drawing){drawing=false;signatureSigned=true;document.getElementById('sigPlaceholder').style.display='none';document.getElementById('sigStatus').textContent='✅ Firma registrada';}});
  canvas.addEventListener('touchstart', e=>{e.preventDefault();drawing=true;const p=getPos(e);signCtx.beginPath();signCtx.moveTo(p.x,p.y);},{passive:false});
  canvas.addEventListener('touchmove', e=>{e.preventDefault();if(!drawing)return;const p=getPos(e);signCtx.lineTo(p.x,p.y);signCtx.stroke();},{passive:false});
  canvas.addEventListener('touchend', ()=>{if(drawing){drawing=false;signatureSigned=true;document.getElementById('sigPlaceholder').style.display='none';document.getElementById('sigStatus').textContent='✅ Firma registrada';}});
}

function clearSignature(silent=false) {
  if(signCtx) signCtx.clearRect(0,0,signCanvas ? signCanvas.width:300,signCanvas?signCanvas.height:120);
  signatureSigned = false;
  const ph = document.getElementById('sigPlaceholder');
  if(ph) ph.style.display='flex';
  const st = document.getElementById('sigStatus');
  if(st) st.textContent='';
  if(!silent) showToast('Firma borrada','warning');
}

// ============ TOMAR FOTO ============
function tomarFoto() {
  const area = document.getElementById('photoArea');
  const lbl = document.getElementById('photoLabel');
  if(hasPhoto) { hasPhoto=false; area.className='photo-area'; lbl.textContent='Tomar Foto'; showToast('Foto eliminada','warning'); return; }
  showToast('📸 Procesando foto…','info');
  setTimeout(()=>{
    hasPhoto=true;
    area.className='photo-area has-photo';
    lbl.textContent='✅ Foto capturada (toca para eliminar)';
    area.innerHTML='';
    area.innerHTML='<i class="bi bi-check-circle-fill" style="font-size:1.6rem;"></i><span id="photoLabel">✅ Foto capturada (toca para eliminar)</span>';
    showToast('📸 Foto de evidencia guardada');
  },800);
}

// ============ CONFIRMAR ENTREGA ============
function confirmarEntrega() {
  if(!currentPedido){showToast('Selecciona un pedido primero','warning');return;}
  if(!signatureSigned){showToast('El cliente debe firmar primero','danger');return;}
  if(!hasPhoto){showToast('Toma una foto como evidencia','danger');return;}
  // Complete order
  const p = currentPedido;
  const comision = Math.round(p.valor * 0.08);
  gananciaHoy += comision;
  entregasHoy.push({...p, comision, fecha: new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})});
  pedidos = pedidos.filter(x=>x.id!==p.id);
  // Update Phone 4 completion screen
  document.getElementById('done-valor').textContent = '$'+p.valor.toLocaleString('es-CO');
  document.getElementById('done-info').textContent = 'Pedido '+p.id+' · '+p.client;
  document.getElementById('done-totalPedido').textContent = '$'+p.valor.toLocaleString('es-CO');
  document.getElementById('done-comision').textContent = '$'+comision.toLocaleString('es-CO');
  // Update KPIs
  document.getElementById('cp-entregas').textContent = entregasHoy.length;
  document.getElementById('cp-ganancia').textContent = '$'+gananciaHoy.toLocaleString('es-CO');
  document.getElementById('cp-pedidos').textContent = pedidos.length;
  clearInterval(routeInterval);
  routeProgress = 0;
  showToast('🎉 ¡Entrega confirmada exitosamente!');
  showScreen('completado');
  renderOrders();
  currentPedido = null;
}

// ============ NUEVO INICIO ============
function nuevoInicio() {
  showScreen('inicio4');
  renderOrders();
}

// ============ BACK ============
function backToInicio() { showToast('Volviendo al inicio','info'); }
function backToRuta() { showToast('Volviendo a la ruta','info'); }

// ============ HISTORIAL ============
function renderHistorial() {
  const el = document.getElementById('historialList');
  if(!entregasHoy.length){el.innerHTML='<div style="text-align:center;padding:40px 16px;color:#94a3b8;"><i class="bi bi-clock-history" style="font-size:2rem;display:block;margin-bottom:8px;"></i>Sin entregas completadas aún</div>';return;}
  el.innerHTML = entregasHoy.map(e=>`
    <div class="hist-item">
      <div style="display:flex;justify-content:space-between;">
        <div class="hid">${e.id}</div>
        <div style="font-size:.75rem;color:#94a3b8;">${e.fecha}</div>
      </div>
      <div class="hdet">${e.client} · ${e.dir}</div>
      <div style="display:flex;justify-content:space-between;margin-top:4px;">
        <span style="font-size:.78rem;font-weight:700;color:var(--green);">$${e.valor.toLocaleString('es-CO')}</span>
        <span style="font-size:.75rem;color:#64748b;">Comisión: $${e.comision.toLocaleString('es-CO')}</span>
      </div>
    </div>`).join('');
}

// ============ PERFIL ============
function renderPerfil() {
  document.getElementById('prf-total').textContent = entregasHoy.length;
  document.getElementById('prf-hoy').textContent = entregasHoy.length;
  document.getElementById('prf-ganancia').textContent = '$'+gananciaHoy.toLocaleString('es-CO');
}

function savePerfil() {
  const nombre = document.getElementById('prf-nombre').value.trim();
  if(!nombre){showToast('El nombre es obligatorio','danger');return;}
  showToast('Perfil actualizado correctamente ✅');
}

// ============ PH4 ============
function renderPh4() {
  document.getElementById('ph4-entregas').textContent = entregasHoy.length;
  document.getElementById('ph4-ganancia').textContent = '$'+gananciaHoy.toLocaleString('es-CO');
  renderOrders();
}

// ============ PROBLEMA ============
function reportarProblema() { new bootstrap.Modal(document.getElementById('problemaModal')).show(); }
function enviarProblema() {
  const tipo = document.getElementById('prob-tipo').value;
  if(!tipo){showToast('Selecciona el tipo de problema','danger');return;}
  showToast('⚠️ Problema reportado al administrador','warning');
  bootstrap.Modal.getInstance(document.getElementById('problemaModal')).hide();
}

// ============ MENU / LOGOUT ============
function openMenu() { new bootstrap.Modal(document.getElementById('menuModal')).show(); }
function handleLogout() { new bootstrap.Modal(document.getElementById('logoutModal')).show(); }
function confirmLogout() {
  localStorage.removeItem('usuario');
  window.location.href = '/';
}

// ============ SESIÓN: MOSTRAR DATOS DEL USUARIO ============
function aplicarSesionUsuario() {
  const usuario = window.usuarioActual;
  if (!usuario) return;
  const inicial = (usuario.nombre_completo || '?').trim().charAt(0).toUpperCase();

  const topbarAvatarR = document.getElementById('topbarAvatarR');
  if (topbarAvatarR) topbarAvatarR.textContent = inicial;

  const menuAvatar = document.getElementById('menuAvatar');
  if (menuAvatar) menuAvatar.textContent = inicial;
  const menuUserName = document.getElementById('menuUserName');
  if (menuUserName) menuUserName.textContent = usuario.nombre_completo || 'Repartidor';

  const prfNombre = document.getElementById('prf-nombre');
  if (prfNombre) prfNombre.value = usuario.nombre_completo || '';
  const prfTel = document.getElementById('prf-tel');
  if (prfTel && usuario.telefono) prfTel.value = usuario.telefono;
}

// ============ INIT ============
window.addEventListener('load', () => {
  aplicarSesionUsuario();
  initSignCanvas();
  renderOrders();
  // Set today's date
  const today = new Date().toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long'});
});
