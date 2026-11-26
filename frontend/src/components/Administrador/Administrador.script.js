// ========== DATA ==========
let products = [
  {id:'P001',name:'Arroz Premium 1kg',cat:'Alimentos',stock:150,price:3200,img:'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=80&q=70'},
  {id:'P002',name:'Aceite de Girasol 900ml',cat:'Alimentos',stock:78,price:6500,img:'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=80&q=70'},
  {id:'P003',name:'Detergente Líquido 1L',cat:'Aseo',stock:45,price:5900,img:''},
  {id:'P004',name:'Pasta Espagueti 500g',cat:'Alimentos',stock:120,price:2000,img:''},
  {id:'P005',name:'Leche Entera 1L',cat:'Lácteos',stock:60,price:3100,img:'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=80&q=70'},
  {id:'P006',name:'Café Molido 500g',cat:'Bebidas',stock:33,price:8800,img:'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=80&q=70'},
];

// Usuarios reales cargados desde MySQL (/api/admin/usuarios)
let usuarios = [];
let usuariosCargados = false;
let cargandoUsuarios = false;
const API_USUARIOS = '/api/admin/usuarios';

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

// ===== RUTA Y FILTROS =====
// La URL es la fuente de verdad: /administrador?tab=productos&filtro=stock-bajo
let filtroProductos = '';   // '', 'stock-bajo', 'agotados'
let filtroPedidos = '';     // '', 'pendientes'
let aplicandoRuta = false;

// ========== NAV ==========
function irA(tab, filtro = '') {
  if (typeof window.adminNavegar === 'function') {
    window.adminNavegar(tab, filtro); // React Router actualiza la URL
    return;
  }

  // Fallback si el HTML se abre fuera de React.
  const params = new URLSearchParams({ tab });
  if (filtro) params.set('filtro', filtro);
  window.location.href = `/administrador?${params.toString()}`;
}

// La llama el componente React cada vez que cambia la URL.
function aplicarRutaAdmin(tab = 'dashboard', filtro = '') {
  filtroProductos = tab === 'productos' ? filtro : '';
  filtroPedidos = tab === 'pedidos' ? filtro : '';
  aplicandoRuta = true;
  goSection(tab);
  aplicandoRuta = false;
}

function limpiarFiltroProductos() {
  irA('productos');
}

function actualizarContadoresDashboard() {
  const stockBajo = products.filter((p) => p.stock < 50).length;
  const elStock = document.getElementById('stockBajoCount');
  if (elStock) elStock.textContent = stockBajo;
}

// GO SECTION: navegación sidebar + sync URL
function goSection(name, el) {
  // Navegación manual (sidebar, botones): limpia filtros y refleja la URL.
  if (!aplicandoRuta) {
    filtroProductos = '';
    filtroPedidos = '';
    irA(name);
  }

  const navEl = el || document.querySelector(`.sidebar .nav-link[data-section="${name}"]`);

  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sidebar .nav-link').forEach(b => b.classList.remove('active'));
  document.getElementById('section-'+name).classList.add('active');
  if(navEl) navEl.classList.add('active');
  document.getElementById('pageTitle').textContent = {
    dashboard:'Dashboard',usuarios:'Gestión de Usuarios',productos:'Productos',
    pedidos:'Pedidos',asignacion:'Asignación de Pedidos',
    promociones:'Promociones',reportes:'Reportes'
  }[name] || name;
  if(name==='usuarios') cargarUsuarios();
  if(name==='productos') renderProducts();
  if(name==='pedidos') renderPedidos();
  if(name==='asignacion') {
    // La asignación necesita la lista real de repartidores activos.
    if (usuariosCargados) {
      renderAsignacion();
    } else {
      cargarUsuarios(true).then(renderAsignacion);
    }
  }
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

// ========== PRODUCTOS ==========
function renderDashProducts() {
  const tb = document.getElementById('dashProductsTable');
  tb.innerHTML = `<thead><tr><th>ID</th><th>Nombre</th><th>Categoría</th><th>Stock</th><th>Precio</th></tr></thead>
  <tbody>${products.slice(0,5).map(p=>`<tr><td class="text-muted">${p.id}</td><td><strong>${p.name}</strong></td><td><span class="badge bg-light text-secondary border">${p.cat}</span></td><td><span class="${p.stock<50?'text-danger':'text-success'} fw-bold">${p.stock}</span></td><td><strong>$${p.price.toLocaleString('es-CO')}</strong></td></tr>`).join('')}</tbody>`;
}

function renderProducts() {
  const q = (document.getElementById('prodSearch')?.value || '').toLowerCase();
  const catF = document.getElementById('prodCatFilter')?.value || '';

  const list = products.filter((p) => {
    if (q && !(p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))) return false;
    if (catF && p.cat !== catF) return false;

    if (filtroProductos === 'stock-bajo' && p.stock >= 50) return false;
    if (filtroProductos === 'agotados' && p.stock > 0) return false;

    return true;
  });

  const chip = document.getElementById('prodFiltroActivo');
  if (chip) {
    chip.classList.toggle('d-none', !filtroProductos);
    chip.classList.toggle('d-flex', !!filtroProductos);
    const texto = document.getElementById('prodFiltroTexto');
    if (texto) {
      texto.textContent = filtroProductos === 'stock-bajo'
        ? 'Stock bajo (menos de 50 unidades)'
        : filtroProductos === 'agotados'
          ? 'Productos agotados'
          : '';
    }
  }

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
    </tr>`).join('') : '<tr><td colspan="7" class="text-center text-muted py-4">No hay productos que coincidan con el filtro</td></tr>';
}

// ... (resto del script sigue igual: openProductModal, editProduct, confirmDelete, showToast, etc.)

// ========== PROMOS ==========
function renderPromos() {
  // ... (igual que en la copia completa)
}

// ========== REPORTES ==========
function renderReportes() {
  // ... (igual que en la copia completa)
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

// ========== USUARIOS ==========
function cargarUsuarios(force = false) {
  if (!force && usuariosCargados) return;
  fetch('/api/admin/usuarios')
    .then(r => r.json())
    .then(d => { usuarios = d.usuarios || []; usuariosCargados = true; })
    .catch(() => { usuarios = []; usuariosCargados = true; });
}

// ... (resto: openProductModal, editProduct, confirmDelete, showToast, toggleUserPassword, updatePedidoStatus, handleLogout, confirmLogout, etc.)

// ============ SESIÓN: MOSTRAR DATOS DEL USUARIO ============
function aplicarSesionUsuario(usuario = window.usuarioActual) {
  if (!usuario) return;
  const inicial = (usuario.nombre_completo || '?').trim().charAt(0).toUpperCase();
  const primerNombre = (usuario.nombre_completo || '').trim().split(' ')[0];
  const topbarAvatar = document.getElementById('topbarAvatar');
  if (topbarAvatar) {
    if (usuario.foto_perfil) {
      topbarAvatar.style.backgroundImage = `url("${usuario.foto_perfil}")`;
      topbarAvatar.style.backgroundSize = 'cover';
      topbarAvatar.style.backgroundPosition = 'center';
      topbarAvatar.textContent = '';
    } else {
      topbarAvatar.style.backgroundImage = '';
      topbarAvatar.textContent = inicial;
    }
  }
  const topbarUserName = document.getElementById('topbarUserName');
  if (topbarUserName) topbarUserName.textContent = primerNombre || 'Admin';
}

// El menú de perfil avisa cuando se guardan cambios.
window.addEventListener('perfil:actualizado', (evento) => {
  aplicarSesionUsuario(evento.detail);
});

// INIT
// Leer parámetros de la URL y aplicar la sección/filtro correspondientes.
const parametrosIniciales = new URLSearchParams(window.location.search);
aplicarRutaAdmin(
  parametrosIniciales.get('tab') || 'dashboard',
  parametrosIniciales.get('filtro') || ''
);

aplicarSesionUsuario();
renderDashProducts();
actualizarContadoresDashboard();
renderProducts();