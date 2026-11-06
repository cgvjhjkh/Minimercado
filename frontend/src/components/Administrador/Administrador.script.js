// ========== DATA ==========
let products = [
  {id:'P001',name:'Arroz Premium 1kg',cat:'Alimentos',stock:150,price:3200,img:'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=80&q=70'},
  {id:'P002',name:'Aceite de Girasol 900ml',cat:'Alimentos',stock:78,price:6500,img:'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=80&q=70'},
  {id:'P003',name:'Detergente Líquido 1L',cat:'Aseo',stock:45,price:5900,img:''},
  {id:'P004',name:'Pasta Espagueti 500g',cat:'Alimentos',stock:120,price:2000,img:''},
  {id:'P005',name:'Leche Entera 1L',cat:'Lácteos',stock:60,price:3100,img:'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=80&q=70'},
  {id:'P006',name:'Café Molido 500g',cat:'Bebidas',stock:33,price:8800,img:'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=80&q=70'},
];

let users = [
  {id:'U001',name:'Laura Gómez',email:'laura@gmail.com',rol:'Cliente',tel:'300 123 4567',active:true},
  {id:'U002',name:'Pedro Martínez',email:'pedro@mimini.com',rol:'Empleado',tel:'310 222 3333',active:true},
  {id:'U003',name:'Javier Ruiz',email:'javier@mimini.com',rol:'Repartidor',tel:'320 444 5555',active:false},
  {id:'U004',name:'Ana Torres',email:'ana@gmail.com',rol:'Cliente',tel:'301 666 7777',active:true},
  {id:'U005',name:'Carlos Pérez',email:'carlos@mimini.com',rol:'Repartidor',tel:'315 888 9999',active:true},
];

let pedidos = [
  {id:'#1058',client:'María López',dir:'Calle 10 # 45-23',items:'Arroz 1kg, Leche 1L, Aceite',valor:25600,status:'Recibido',repartidor:''},
  {id:'#1057',client:'Juan Pérez',dir:'Cra 80 # 15-30',items:'Pasta 500g, Pan Integral',valor:32800,status:'En Preparación',repartidor:''},
  {id:'#1056',client:'Ana Torres',dir:'Calle 5 # 12-40',items:'Detergente 1L, Jabón',valor:18500,status:'Recibido',repartidor:''},
  {id:'#1055',client:'Carlos Ruiz',dir:'Cra 70 # 22-15',items:'Café Molido, Galletas',valor:27900,status:'En Camino',repartidor:'Carlos Pérez'},
  {id:'#1054',client:'Lucio Fernández',dir:'Calle 33 # 80-12',items:'Arroz 1kg, Leche 2L',valor:21400,status:'Entregado',repartidor:'Javier Ruiz'},
];

let promos = [
  {code:'BIENVENIDO10',desc:'Descuento bienvenida nuevos clientes',pct:10,date:'2024-12-31',uses:100,used:23,active:true},
  {code:'VERANO20',desc:'Promo verano en alimentos',pct:20,date:'2024-08-31',uses:50,used:50,active:false},
];

let editingUser = null, editingProd = null, deleteCallback = null;

// ========== NAV ==========
function goSection(name, el) {
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sidebar .nav-link').forEach(b => b.classList.remove('active'));
  document.getElementById('section-'+name).classList.add('active');
  if(el) el.classList.add('active');
  document.getElementById('pageTitle').textContent = {
    dashboard:'Dashboard',usuarios:'Gestión de Usuarios',productos:'Productos',
    pedidos:'Pedidos',asignacion:'Asignación de Pedidos',
    promociones:'Promociones',reportes:'Reportes'
  }[name] || name;
  if(name==='usuarios') renderUsers();
  if(name==='productos') renderProducts();
  if(name==='pedidos') renderPedidos();
  if(name==='asignacion') renderAsignacion();
  if(name==='promociones') renderPromos();
  if(name==='reportes') renderReportes();
  if(name==='dashboard') renderDashProducts();
}

// ========== TOAST ==========
function showToast(msg, type='success') {
  const id = 'toast-' + Date.now();
  const color = type==='success'?'#16a34a':type==='danger'?'#dc2626':'#f59e0b';
  const icon = type==='success'?'bi-check-circle-fill':type==='danger'?'bi-x-circle-fill':'bi-info-circle-fill';
  document.getElementById('toastContainer').insertAdjacentHTML('beforeend',
    `<div id="${id}" class="toast show align-items-center text-white border-0 mb-2" style="background:${color};border-radius:12px;min-width:280px;"><div class="d-flex align-items-center gap-2 p-3"><i class="bi ${icon} fs-5"></i><span style="font-size:.9rem;font-weight:700;">${msg}</span><button class="btn-close btn-close-white ms-auto" onclick="document.getElementById('${id}').remove()"></button></div></div>`);
  setTimeout(()=>{ const t=document.getElementById(id);if(t)t.remove(); },3500);
}

// ========== PRODUCTS ==========
function renderDashProducts() {
  const tb = document.getElementById('dashProductsTable');
  tb.innerHTML = `<thead><tr><th>ID</th><th>Nombre</th><th>Categoría</th><th>Stock</th><th>Precio</th></tr></thead>
  <tbody>${products.slice(0,5).map(p=>`<tr><td class="text-muted">${p.id}</td><td><strong>${p.name}</strong></td><td><span class="badge bg-light text-secondary border">${p.cat}</span></td><td><span class="${p.stock<50?'text-danger':'text-success'} fw-bold">${p.stock}</span></td><td><strong>$${p.price.toLocaleString('es-CO')}</strong></td></tr>`).join('')}</tbody>`;
}

function renderProducts() {
  const q = document.getElementById('prodSearch').value.toLowerCase();
  const catF = document.getElementById('prodCatFilter').value;
  const list = products.filter(p => (!q||(p.name.toLowerCase().includes(q)||p.id.toLowerCase().includes(q))) && (!catF||p.cat===catF));
  document.getElementById('productsTable').innerHTML = list.length ? list.map(p => `
    <tr>
      <td class="text-muted">${p.id}</td>
      <td>${p.img?`<img src="${p.img}" style="width:36px;height:36px;object-fit:cover;border-radius:7px;">`:`<div style="width:36px;height:36px;border-radius:7px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;"><i class="bi bi-box text-secondary"></i></div>`}</td>
      <td><strong>${p.name}</strong></td>
      <td><span class="badge bg-light text-secondary border">${p.cat}</span></td>
      <td><span class="${p.stock<50?'text-danger':'text-success'} fw-bold">${p.stock}</span></td>
      <td><strong>$${p.price.toLocaleString('es-CO')}</strong></td>
      <td>
        <button class="btn-icon me-1" onclick="editProduct('${p.id}')"><i class="bi bi-pencil text-primary"></i></button>
        <button class="btn-icon" onclick="confirmDelete('producto','${p.id}')"><i class="bi bi-trash text-danger"></i></button>
      </td>
    </tr>`).join('') : '<tr><td colspan="7" class="text-center text-muted py-4">No se encontraron productos</td></tr>';
}

function openProductModal(id=null) {
  editingProd = id;
  document.getElementById('prodModalTitle').textContent = id ? 'Editar Producto' : 'Nuevo Producto';
  if(id) {
    const p = products.find(x=>x.id===id);
    document.getElementById('p-nombre').value = p.name;
    document.getElementById('p-cat').value = p.cat;
    document.getElementById('p-precio').value = p.price;
    document.getElementById('p-old-precio').value = '';
    document.getElementById('p-stock').value = p.stock;
    document.getElementById('p-desc').value = '';
  } else {
    ['p-nombre','p-precio','p-old-precio','p-stock','p-desc'].forEach(id=>document.getElementById(id).value=id==='p-stock'?'0':'');
  }
  new bootstrap.Modal(document.getElementById('productModal')).show();
}
function editProduct(id) { openProductModal(id); }

function saveProduct() {
  const nombre = document.getElementById('p-nombre').value.trim();
  const precio = parseInt(document.getElementById('p-precio').value);
  const stock = parseInt(document.getElementById('p-stock').value);
  if(!nombre) { showToast('El nombre es obligatorio','danger'); return; }
  if(!precio || precio <= 0) { showToast('El precio debe ser mayor a 0','danger'); return; }
  if(isNaN(stock)) { showToast('El stock no es válido','danger'); return; }
  if(editingProd) {
    const p = products.find(x=>x.id===editingProd);
    p.name=nombre; p.cat=document.getElementById('p-cat').value; p.price=precio; p.stock=stock;
    showToast('Producto actualizado correctamente ✅');
  } else {
    const newId = 'P' + String(products.length+1).padStart(3,'0');
    products.push({id:newId,name:nombre,cat:document.getElementById('p-cat').value,stock,price:precio,img:''});
    showToast('Producto creado correctamente ✅');
  }
  bootstrap.Modal.getInstance(document.getElementById('productModal')).hide();
  renderProducts();
}

// ========== USERS ==========
function renderUsers() {
  const q = document.getElementById('userSearch').value.toLowerCase();
  const rolF = document.getElementById('userRolFilter').value;
  const list = users.filter(u => (!q||(u.name.toLowerCase().includes(q)||u.email.toLowerCase().includes(q))) && (!rolF||u.rol===rolF));
  document.getElementById('usersTable').innerHTML = list.length ? list.map(u => `
    <tr>
      <td class="text-muted">${u.id}</td>
      <td><strong>${u.name}</strong></td>
      <td class="text-muted" style="font-size:.82rem;">${u.email}</td>
      <td><span class="badge bg-light text-secondary border">${u.rol}</span></td>
      <td><div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" ${u.active?'checked':''} onchange="toggleUser('${u.id}',this.checked)"></div></td>
      <td>
        <button class="btn-icon me-1" onclick="editUser('${u.id}')"><i class="bi bi-pencil text-primary"></i></button>
        <button class="btn-icon" onclick="confirmDelete('usuario','${u.id}')"><i class="bi bi-trash text-danger"></i></button>
      </td>
    </tr>`).join('') : '<tr><td colspan="6" class="text-center text-muted py-4">No se encontraron usuarios</td></tr>';
}

function toggleUser(id, val) {
  const u = users.find(x=>x.id===id);
  u.active = val;
  showToast(`Usuario ${val?'activado':'desactivado'} correctamente`);
}

function openUserModal() { editingUser=null; document.getElementById('userModalTitle').textContent='Nuevo Usuario'; ['u-nombre','u-email','u-tel'].forEach(id=>document.getElementById(id).value=''); new bootstrap.Modal(document.getElementById('userModal')).show(); }
function editUser(id) {
  editingUser=id;
  const u=users.find(x=>x.id===id);
  document.getElementById('userModalTitle').textContent='Editar Usuario';
  document.getElementById('u-nombre').value=u.name;
  document.getElementById('u-email').value=u.email;
  document.getElementById('u-rol').value=u.rol;
  document.getElementById('u-tel').value=u.tel||'';
  new bootstrap.Modal(document.getElementById('userModal')).show();
}
function saveUser() {
  const nombre=document.getElementById('u-nombre').value.trim();
  const email=document.getElementById('u-email').value.trim();
  if(!nombre||!email){showToast('Nombre y email son obligatorios','danger');return;}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){showToast('Email no válido','danger');return;}
  if(editingUser){
    const u=users.find(x=>x.id===editingUser);
    u.name=nombre;u.email=email;u.rol=document.getElementById('u-rol').value;u.tel=document.getElementById('u-tel').value;
    showToast('Usuario actualizado correctamente ✅');
  } else {
    const newId='U'+String(users.length+1).padStart(3,'0');
    users.push({id:newId,name:nombre,email,rol:document.getElementById('u-rol').value,tel:document.getElementById('u-tel').value,active:true});
    showToast('Usuario creado correctamente ✅');
  }
  bootstrap.Modal.getInstance(document.getElementById('userModal')).hide();
  renderUsers();
}

// ========== PEDIDOS ==========
function renderPedidos() {
  const f=document.getElementById('pedidoFilter').value;
  const list=pedidos.filter(p=>!f||p.status===f);
  const statusColor={Recibido:'#fef9c3;color:#a16207',['En Preparación']:'#dbeafe;color:#1d4ed8',['En Camino']:'#e0f2fe;color:#0369a1',Entregado:'#dcfce7;color:#15803d'};
  document.getElementById('pedidosTable').innerHTML = list.map(p=>`
    <tr>
      <td><strong>${p.id}</strong></td>
      <td>${p.client}</td>
      <td class="text-muted" style="font-size:.8rem;">${p.dir}</td>
      <td style="font-size:.78rem;">${p.items}</td>
      <td class="text-success fw-bold">$${p.valor.toLocaleString('es-CO')}</td>
      <td><span class="badge" style="background:${statusColor[p.status]||'#f1f5f9;color:#64748b'};border-radius:20px;font-size:.72rem;padding:4px 10px;">${p.status}</span></td>
      <td>
        <select class="form-select form-select-sm" style="width:140px;font-size:.78rem;" onchange="updatePedidoStatus('${p.id}',this.value)">
          <option ${p.status==='Recibido'?'selected':''}>Recibido</option>
          <option ${p.status==='En Preparación'?'selected':''}>En Preparación</option>
          <option ${p.status==='En Camino'?'selected':''}>En Camino</option>
          <option ${p.status==='Entregado'?'selected':''}>Entregado</option>
        </select>
      </td>
    </tr>`).join('');
}

function updatePedidoStatus(id, newStatus) {
  const p=pedidos.find(x=>x.id===id);
  p.status=newStatus;
  showToast(`Pedido ${id} → ${newStatus}`);
  renderPedidos();
  document.getElementById('pendientesCount').textContent = pedidos.filter(x=>x.status==='Recibido').length;
}

// ========== ASIGNACION ==========
function renderAsignacion() {
  const repartidores = users.filter(u=>u.rol==='Repartidor'&&u.active);
  const pendientes = pedidos.filter(p=>p.status==='Recibido'||p.status==='En Preparación');
  document.getElementById('asignTable').innerHTML = pendientes.length ? pendientes.map(p=>`
    <tr>
      <td><strong>${p.id}</strong></td>
      <td>${p.client}</td>
      <td class="text-muted" style="font-size:.8rem;">${p.dir}</td>
      <td class="text-success fw-bold">$${p.valor.toLocaleString('es-CO')}</td>
      <td><select class="form-select form-select-sm" id="rep-${p.id.replace('#','')}">
        <option value="">Seleccionar…</option>
        ${repartidores.map(r=>`<option ${p.repartidor===r.name?'selected':''}>${r.name}</option>`).join('')}
      </select></td>
      <td><button class="btn btn-sm text-white fw-bold" style="background:var(--blue);border-radius:8px;" onclick="asignarPedido('${p.id}')">Asignar</button></td>
    </tr>`).join('') : '<tr><td colspan="6" class="text-center text-muted py-4">No hay pedidos pendientes de asignación</td></tr>';
}

function asignarPedido(id) {
  const sel = document.getElementById('rep-'+id.replace('#','')).value;
  if(!sel){showToast('Selecciona un repartidor','warning');return;}
  const p=pedidos.find(x=>x.id===id);
  p.repartidor=sel;p.status='En Camino';
  showToast(`Pedido ${id} asignado a ${sel} ✅`);
  renderAsignacion();
}

// ========== PROMOCIONES ==========
function renderPromos() {
  document.getElementById('promosTable').innerHTML = promos.map((p,i)=>`
    <tr>
      <td><strong style="font-family:monospace;color:var(--blue);">${p.code}</strong></td>
      <td style="font-size:.85rem;">${p.desc}</td>
      <td><span class="badge bg-light text-dark border">${p.pct}%</span></td>
      <td style="font-size:.83rem;">${p.date}</td>
      <td style="font-size:.83rem;">${p.used}/${p.uses}</td>
      <td><span class="badge" style="background:${p.active?'#dcfce7;color:#15803d':'#fee2e2;color:#b91c1c'};border-radius:20px;">${p.active?'Activa':'Inactiva'}</span></td>
      <td>
        <button class="btn-icon me-1" onclick="togglePromo(${i})"><i class="bi bi-${p.active?'pause':'play'}-fill text-primary"></i></button>
        <button class="btn-icon" onclick="confirmDelete('promo',${i})"><i class="bi bi-trash text-danger"></i></button>
      </td>
    </tr>`).join('');
}

function openPromoModal() {
  document.getElementById('promo-code').value='';document.getElementById('promo-desc').value='';
  document.getElementById('promo-pct').value=10;document.getElementById('promo-uses').value=100;
  document.getElementById('promo-date').value='';
  new bootstrap.Modal(document.getElementById('promoModal')).show();
}

function savePromo() {
  const code=document.getElementById('promo-code').value.trim().toUpperCase();
  const desc=document.getElementById('promo-desc').value.trim();
  const pct=parseInt(document.getElementById('promo-pct').value);
  const date=document.getElementById('promo-date').value;
  const uses=parseInt(document.getElementById('promo-uses').value);
  if(!code||!desc||!date){showToast('Completa todos los campos','danger');return;}
  if(pct<1||pct>100){showToast('El descuento debe ser entre 1% y 100%','danger');return;}
  promos.push({code,desc,pct,date,uses,used:0,active:true});
  showToast('Promoción creada correctamente ✅');
  bootstrap.Modal.getInstance(document.getElementById('promoModal')).hide();
  renderPromos();
}

function togglePromo(i) {
  promos[i].active = !promos[i].active;
  showToast(`Promoción ${promos[i].active?'activada':'desactivada'}`);
  renderPromos();
}

// ========== DELETE ==========
function confirmDelete(type, id) {
  document.getElementById('deleteMsg').textContent = `¿Seguro que deseas eliminar este ${type}? Esta acción no se puede deshacer.`;
  deleteCallback = () => {
    if(type==='producto'){products=products.filter(x=>x.id!==id);renderProducts();}
    if(type==='usuario'){users=users.filter(x=>x.id!==id);renderUsers();}
    if(type==='promo'){promos.splice(parseInt(id),1);renderPromos();}
    showToast(`${type.charAt(0).toUpperCase()+type.slice(1)} eliminado correctamente`,'warning');
    bootstrap.Modal.getInstance(document.getElementById('deleteModal')).hide();
  };
  document.getElementById('confirmDeleteBtn').onclick = deleteCallback;
  new bootstrap.Modal(document.getElementById('deleteModal')).show();
}

// ========== REPORTES ==========
function renderReportes() {
  const topProds = [
    {name:'Arroz Premium 1kg',pct:85},
    {name:'Leche Entera 1L',pct:72},
    {name:'Aceite de Girasol 900ml',pct:65},
    {name:'Café Molido 500g',pct:58},
    {name:'Detergente Líquido 1L',pct:44},
  ];
  document.getElementById('topProductsChart').innerHTML = topProds.map(p=>`
    <div class="mb-3">
      <div class="d-flex justify-content-between mb-1"><small class="fw-bold">${p.name}</small><small class="text-muted">${p.pct}%</small></div>
      <div style="background:#f1f5f9;border-radius:8px;height:8px;"><div style="width:${p.pct}%;background:var(--blue);border-radius:8px;height:100%;transition:width .6s;"></div></div>
    </div>`).join('');
  const cats=[{n:'Alimentos',v:45},{n:'Aseo',v:20},{n:'Bebidas',v:18},{n:'Lácteos',v:10},{n:'Snacks',v:7}];
  const colors=['#2563eb','#16a34a','#f59e0b','#ef4444','#8b5cf6'];
  document.getElementById('catChart').innerHTML = `<div class="d-flex flex-wrap gap-2 mb-3">${cats.map((c,i)=>`<span class="badge" style="background:${colors[i]};font-size:.78rem;padding:5px 12px;">${c.n} ${c.v}%</span>`).join('')}</div>`
    + cats.map((c,i)=>`<div class="mb-2"><div class="d-flex justify-content-between mb-1"><small class="fw-bold" style="color:${colors[i]}">${c.n}</small><small class="text-muted">${c.v}%</small></div><div style="background:#f1f5f9;border-radius:8px;height:8px;"><div style="width:${c.v*1.8}%;background:${colors[i]};border-radius:8px;height:100%;"></div></div></div>`).join('');
}

// ========== CHART TOOLTIPS ==========
document.querySelectorAll('.mini-chart .bar').forEach((bar,i)=>{
  bar.addEventListener('mouseenter', () => {
    const tip=document.createElement('div');
    tip.style.cssText='position:absolute;background:#0f172a;color:#fff;padding:4px 8px;border-radius:6px;font-size:.72rem;font-weight:700;pointer-events:none;z-index:999;';
    tip.textContent=bar.title;tip.id='chartTip';
    bar.style.position='relative';bar.appendChild(tip);
  });
  bar.addEventListener('mouseleave', ()=>{ const t=document.getElementById('chartTip');if(t)t.remove(); });
});

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
  const primerNombre = (usuario.nombre_completo || '').trim().split(' ')[0];
  const topbarAvatar = document.getElementById('topbarAvatar');
  if (topbarAvatar) topbarAvatar.textContent = inicial;
  const topbarUserName = document.getElementById('topbarUserName');
  if (topbarUserName) topbarUserName.textContent = primerNombre || 'Admin';
}

// INIT
aplicarSesionUsuario();
renderDashProducts();
