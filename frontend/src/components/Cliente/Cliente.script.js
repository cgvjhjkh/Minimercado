// ============ DATA ============
const PRODUCTS = [
  {id:1,name:"Arroz Premium 1kg",cat:"Alimentos",price:3200,oldPrice:4000,discount:20,img:"https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&q=80",desc:"Arroz de grano largo de alta calidad, ideal para toda ocasión."},
  {id:2,name:"Aceite de Girasol 900ml",cat:"Alimentos",price:6500,oldPrice:8000,discount:18,img:"https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400&q=80",desc:"Aceite vegetal puro de girasol, bajo en grasas saturadas."},
  {id:3,name:"Pasta Espagueti 500g",cat:"Alimentos",price:2000,oldPrice:null,discount:0,img:"https://images.unsplash.com/photo-1551462147-ff29053bfc14?w=400&q=80",desc:"Pasta de trigo duro de primera calidad, cocción perfecta en 8 minutos."},
  {id:4,name:"Detergente Líquido 1L",cat:"Aseo",price:5900,oldPrice:7000,discount:19,img:"https://images.unsplash.com/photo-1585232352617-e5e0c4a5d7d7?w=400&q=80",desc:"Detergente concentrado para ropa de colores y blanca."},
  {id:5,name:"Leche Entera 1L",cat:"Lácteos",price:2800,oldPrice:3100,discount:10,img:"https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&q=80",desc:"Leche entera pasteurizada, rica en calcio y vitaminas."},
  {id:6,name:"Café Molido 500g",cat:"Bebidas",price:8800,oldPrice:10000,discount:12,img:"https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400&q=80",desc:"Café 100% colombiano de origen, tostión media."},
  {id:7,name:"Galletas Vainilla 300g",cat:"Snacks",price:3500,oldPrice:null,discount:0,img:"https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=400&q=80",desc:"Galletas crujientes de vainilla, perfectas para el café."},
  {id:8,name:"Papel Higiénico 4und",cat:"Aseo",price:4200,oldPrice:5000,discount:16,img:"https://images.unsplash.com/photo-1584556812952-905ffd0c611a?w=400&q=80",desc:"Papel higiénico doble hoja, suave y resistente."},
  {id:9,name:"Jugo de Naranja 1L",cat:"Bebidas",price:4500,oldPrice:null,discount:0,img:"https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=400&q=80",desc:"Jugo de naranja natural sin azúcar añadida."},
  {id:10,name:"Pan Integral 500g",cat:"Alimentos",price:3800,oldPrice:4200,discount:9,img:"https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&q=80",desc:"Pan de molde integral con semillas, alto en fibra."},
  {id:11,name:"Jabón de Manos 250ml",cat:"Aseo",price:2200,oldPrice:null,discount:0,img:"https://images.unsplash.com/photo-1584301646682-e83bb06d98b5?w=400&q=80",desc:"Jabón líquido antibacterial con aloe vera."},
  {id:12,name:"Chocolate en Polvo 400g",cat:"Snacks",price:6800,oldPrice:8000,discount:15,img:"https://images.unsplash.com/photo-1606312619070-d48b4c652a52?w=400&q=80",desc:"Mezcla de chocolate premium para bebidas calientes."},
];

let cart = [];
let favorites = [];
let orders = [
  {id:"#1024",date:"28/05/2024",total:45700,status:"En Camino",step:2,items:["Arroz Premium 1kg","Leche Entera 1L","Café Molido 500g"]},
  {id:"#1019",date:"20/05/2024",total:32100,status:"Entregado",step:3,items:["Aceite de Girasol 900ml","Detergente Líquido 1L"]},
];
let currentFilter = "Todas";
let currentSort = "default";
let currentProduct = null;

// ============ TABS ============
function showTab(name, el) {
  document.querySelectorAll('.tab-pane').forEach(t => t.style.display = 'none');
  document.querySelectorAll('.view-tabs .nav-link').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.sidebar .nav-link').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).style.display = '';
  const tabBtn = document.getElementById('tab-' + name + '-btn');
  if(tabBtn) tabBtn.classList.add('active');
  if(el) el.classList.add('active');
  if(name === 'carrito') renderCart();
  if(name === 'checkout') renderCheckout();
  if(name === 'pedidos') renderOrders();
  if(name === 'favoritos') renderFavorites();
}

// ============ TOAST ============
function showToast(msg, type='success') {
  const id = 'toast-' + Date.now();
  const color = type === 'success' ? '#1a7a3e' : type === 'danger' ? '#dc2626' : '#f5a623';
  const icon = type === 'success' ? 'bi-check-circle-fill' : type === 'danger' ? 'bi-x-circle-fill' : 'bi-info-circle-fill';
  const html = `<div id="${id}" class="toast show align-items-center text-white border-0 mb-2" role="alert" style="background:${color};border-radius:12px;min-width:280px;">
    <div class="d-flex align-items-center gap-2 p-3">
      <i class="bi ${icon} fs-5"></i><span style="font-size:.9rem;font-weight:700;">${msg}</span>
      <button type="button" class="btn-close btn-close-white ms-auto" onclick="document.getElementById('${id}').remove()"></button>
    </div>
  </div>`;
  document.getElementById('toastContainer').insertAdjacentHTML('beforeend', html);
  setTimeout(() => { const t = document.getElementById(id); if(t) t.remove(); }, 3500);
}

// ============ PRODUCTS ============
function getFiltered() {
  let list = [...PRODUCTS];
  const q = document.getElementById('searchInput').value.toLowerCase();
  if(q) list = list.filter(p => p.name.toLowerCase().includes(q) || p.cat.toLowerCase().includes(q));
  if(currentFilter === 'Ofertas') list = list.filter(p => p.discount > 0);
  else if(currentFilter !== 'Todas') list = list.filter(p => p.cat === currentFilter);
  if(currentSort === 'price-asc') list.sort((a,b) => a.price - b.price);
  else if(currentSort === 'price-desc') list.sort((a,b) => b.price - a.price);
  else if(currentSort === 'name') list.sort((a,b) => a.name.localeCompare(b.name));
  return list;
}

function renderProducts() {
  const list = getFiltered();
  const g = document.getElementById('productsGrid');
  if(!list.length) { g.innerHTML = '<div class="col-12 text-center py-5 text-muted"><i class="bi bi-search fs-1 d-block mb-2"></i>No se encontraron productos</div>'; return; }
  g.innerHTML = list.map(p => {
    const inCart = cart.some(c => c.id === p.id);
    const inFav = favorites.includes(p.id);
    return `<div class="col-6 col-md-4 col-lg-3 col-xl-2">
      <div class="product-card" onclick="openProduct(${p.id})" style="cursor:pointer;">
        <div class="img-wrap">
          <img src="${p.img}" alt="${p.name}" loading="lazy"/>
          ${p.discount ? `<span class="badge-discount">-${p.discount}%</span>` : ''}
          <button class="fav-btn ${inFav?'active':''}" onclick="event.stopPropagation();toggleFav(${p.id})" id="fav-${p.id}"><i class="bi bi-heart${inFav?'-fill':''}"></i></button>
        </div>
        <div class="card-body">
          <div class="cat">${p.cat}</div>
          <div class="name">${p.name}</div>
          <div class="price-wrap">
            <span class="price">$${p.price.toLocaleString('es-CO')}</span>
            ${p.oldPrice ? `<span class="old-price">$${p.oldPrice.toLocaleString('es-CO')}</span>` : ''}
          </div>
          <button class="btn-add ${inCart?'added':''}" onclick="event.stopPropagation();addToCart(${p.id})" id="btn-${p.id}">
            ${inCart ? '<i class="bi bi-check me-1"></i>En carrito' : '<i class="bi bi-cart-plus me-1"></i>Agregar'}
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function filterCat(cat, el) {
  currentFilter = cat;
  document.querySelectorAll('#filterPills .btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderProducts();
}

function filterProducts() { renderProducts(); }
function sortProducts(val) { currentSort = val; renderProducts(); }

// ============ CART ============
function addToCart(id) {
  const p = PRODUCTS.find(x => x.id === id);
  const exists = cart.find(x => x.id === id);
  if(exists) { exists.qty++; }
  else { cart.push({...p, qty:1}); }
  updateCartUI();
  showToast(`${p.name} agregado al carrito 🛒`);
  renderProducts();
}

function updateCartUI() {
  const total = cart.reduce((s,i) => s + i.qty, 0);
  document.getElementById('cartBadge').textContent = total;
  document.getElementById('cartCount').textContent = total;
  document.getElementById('tab-carrito-btn').textContent = `Mi Carrito (${total})`;
}

function removeFromCart(id) {
  cart = cart.filter(x => x.id !== id);
  updateCartUI();
  renderCart();
  renderCheckout();
  renderProducts();
  showToast('Producto eliminado del carrito', 'warning');
}

function changeQty(id, delta) {
  const item = cart.find(x => x.id === id);
  if(!item) return;
  item.qty += delta;
  if(item.qty <= 0) { removeFromCart(id); return; }
  updateCartUI();
  renderCart();
  renderCheckout();
}

function renderCart() {
  const el = document.getElementById('cartItems');
  const lbl = document.getElementById('cartBadgeLabel');
  const total = cart.reduce((s,i) => s + i.qty, 0);
  lbl.textContent = total + ' items';
  if(!cart.length) {
    el.innerHTML = '<div class="empty-cart"><i class="bi bi-cart-x"></i>Tu carrito está vacío<br><small>Agrega productos desde el catálogo</small><br><button class="btn mt-3" style="background:var(--green);color:#fff;border-radius:8px;font-weight:700;" onclick="showTab(\'catalogo\')">Ver Catálogo</button></div>';
    document.getElementById('summarySubtotal').textContent = '$0';
    document.getElementById('summaryTotal').textContent = '$3.000';
    return;
  }
  const subtotal = cart.reduce((s,i) => s + i.price * i.qty, 0);
  el.innerHTML = cart.map(item => `
    <div class="cart-item">
      <img src="${item.img}" alt="${item.name}"/>
      <div class="info">
        <div class="n">${item.name}</div>
        <div class="p">$${(item.price * item.qty).toLocaleString('es-CO')}</div>
      </div>
      <div class="qty-ctrl">
        <button onclick="changeQty(${item.id},-1)">-</button>
        <span>${item.qty}</span>
        <button onclick="changeQty(${item.id},1)">+</button>
      </div>
      <button class="btn btn-sm text-danger border-0" onclick="removeFromCart(${item.id})"><i class="bi bi-trash"></i></button>
    </div>`).join('');
  document.getElementById('summarySubtotal').textContent = '$' + subtotal.toLocaleString('es-CO');
  document.getElementById('summaryTotal').textContent = '$' + (subtotal + 3000).toLocaleString('es-CO');
}

function goCheckout() {
  if(!cart.length) { showToast('El carrito está vacío','warning'); return; }
  showTab('checkout');
}

function renderCheckout() {
  const subtotal = cart.reduce((s,i) => s + i.price * i.qty, 0);
  const el = document.getElementById('checkoutItems');
  el.innerHTML = cart.map(i => `<div class="summary-row"><span>${i.name} x${i.qty}</span><span>$${(i.price*i.qty).toLocaleString('es-CO')}</span></div>`).join('');
  document.getElementById('coSubtotal').textContent = '$' + subtotal.toLocaleString('es-CO');
  document.getElementById('coTotal').textContent = '$' + (subtotal + 3000).toLocaleString('es-CO');
}

function selectPayment(method) {
  ['efectivo','transferencia','tarjeta'].forEach(m => {
    document.getElementById('m-'+m).classList.remove('selected');
    document.getElementById('m-'+m).querySelector('input').checked = false;
  });
  document.getElementById('m-'+method).classList.add('selected');
  document.getElementById('m-'+method).querySelector('input').checked = true;
}

function submitOrder() {
  const nombre = document.getElementById('co-nombre').value.trim();
  const tel = document.getElementById('co-tel').value.trim();
  const dir = document.getElementById('co-dir').value.trim();
  if(!nombre || !tel || !dir) { showToast('Completa todos los campos obligatorios','danger'); return; }
  if(!cart.length) { showToast('El carrito está vacío','warning'); return; }
  const subtotal = cart.reduce((s,i) => s + i.price * i.qty, 0);
  const newOrder = {
    id: '#' + (1025 + orders.length),
    date: new Date().toLocaleDateString('es-CO'),
    total: subtotal + 3000,
    status: "Recibido",
    step: 0,
    items: cart.map(i => `${i.name} x${i.qty}`)
  };
  orders.unshift(newOrder);
  cart = [];
  updateCartUI();
  renderProducts();
  showToast('¡Pedido realizado exitosamente! 🎉');
  setTimeout(() => showTab('pedidos'), 500);
}

// ============ ORDERS ============
function renderOrders() {
  const el = document.getElementById('ordersList');
  if(!orders.length) { el.innerHTML = '<div class="text-center py-5 text-muted"><i class="bi bi-receipt fs-1 d-block mb-2"></i>No tienes pedidos aún</div>'; return; }
  const steps = ['Recibido','En Preparación','En Camino','Entregado'];
  const icons = ['bi-check','bi-box','bi-truck','bi-house-check'];
  el.innerHTML = orders.map(o => `
    <div class="order-card mb-3">
      <div class="d-flex justify-content-between align-items-start">
        <div>
          <div class="fw-bold">Pedido ${o.id}</div>
          <div class="text-muted" style="font-size:.8rem;">Fecha: ${o.date} · Total: <strong class="text-success">$${o.total.toLocaleString('es-CO')}</strong></div>
          <div style="font-size:.75rem;color:#aaa;margin-top:3px;">${o.items.join(', ')}</div>
        </div>
        <div class="d-flex flex-column align-items-end gap-1">
          <span class="badge" style="background:var(--green-light);color:var(--green);font-size:.72rem;padding:4px 10px;border-radius:20px;">${o.status}</span>
          <button class="btn btn-sm" style="font-size:.72rem;color:var(--green);font-weight:700;" onclick="viewOrder(${orders.indexOf(o)})">Ver detalle</button>
        </div>
      </div>
      <div class="order-steps mt-3">
        ${steps.map((s,i) => `
          <div class="step-item ${i > o.step ? 'inactive' : ''}">
            <div class="step-circle ${i > o.step ? 'inactive' : ''}"><i class="bi ${icons[i]}"></i></div>
            <div class="step-label">${s}</div>
          </div>`).join('')}
      </div>
    </div>`).join('');
}

function viewOrder(idx) {
  const o = orders[idx];
  document.getElementById('orderModalBody').innerHTML = `
    <div class="mb-3"><strong>Pedido:</strong> ${o.id}</div>
    <div class="mb-2"><strong>Fecha:</strong> ${o.date}</div>
    <div class="mb-2"><strong>Estado:</strong> <span style="color:var(--green);font-weight:700;">${o.status}</span></div>
    <div class="mb-2"><strong>Productos:</strong><ul class="mt-1">${o.items.map(i => `<li>${i}</li>`).join('')}</ul></div>
    <div class="mb-2"><strong>Total:</strong> <span style="color:var(--green);font-weight:800;font-size:1.1rem;">$${o.total.toLocaleString('es-CO')}</span></div>`;
  new bootstrap.Modal(document.getElementById('orderModal')).show();
}

// ============ FAVORITES ============
function toggleFav(id) {
  if(favorites.includes(id)) {
    favorites = favorites.filter(f => f !== id);
    showToast('Eliminado de favoritos','warning');
  } else {
    favorites.push(id);
    showToast('Agregado a favoritos ❤️');
  }
  renderProducts();
  if(document.getElementById('tab-favoritos').style.display !== 'none') renderFavorites();
}

function renderFavorites() {
  const el = document.getElementById('favGrid');
  const favProds = PRODUCTS.filter(p => favorites.includes(p.id));
  if(!favProds.length) { el.innerHTML = '<div class="col-12 text-center py-5 text-muted"><i class="bi bi-heart fs-1 d-block mb-2"></i>No tienes favoritos aún<br><small>Haz clic en el corazón de un producto</small></div>'; return; }
  el.innerHTML = favProds.map(p => `<div class="col-6 col-md-4 col-lg-3">
    <div class="product-card" onclick="openProduct(${p.id})" style="cursor:pointer;">
      <div class="img-wrap">
        <img src="${p.img}" alt="${p.name}" loading="lazy"/>
        ${p.discount ? `<span class="badge-discount">-${p.discount}%</span>` : ''}
        <button class="fav-btn active" onclick="event.stopPropagation();toggleFav(${p.id})"><i class="bi bi-heart-fill"></i></button>
      </div>
      <div class="card-body">
        <div class="cat">${p.cat}</div>
        <div class="name">${p.name}</div>
        <div class="price-wrap"><span class="price">$${p.price.toLocaleString('es-CO')}</span></div>
        <button class="btn-add" onclick="event.stopPropagation();addToCart(${p.id})"><i class="bi bi-cart-plus me-1"></i>Agregar</button>
      </div>
    </div>
  </div>`).join('');
}

// ============ PRODUCT MODAL ============
function openProduct(id) {
  const p = PRODUCTS.find(x => x.id === id);
  currentProduct = p;
  document.getElementById('modal-img').src = p.img;
  document.getElementById('modal-cat').textContent = p.cat;
  document.getElementById('modal-name').textContent = p.name;
  document.getElementById('modal-price').textContent = '$' + p.price.toLocaleString('es-CO');
  document.getElementById('modal-old').textContent = p.oldPrice ? '$' + p.oldPrice.toLocaleString('es-CO') : '';
  document.getElementById('modal-desc').textContent = p.desc;
  const inFav = favorites.includes(id);
  document.getElementById('modal-fav-btn').innerHTML = `<i class="bi bi-heart${inFav?'-fill':''}" style="color:${inFav?'#dc2626':'inherit'}"></i>`;
  new bootstrap.Modal(document.getElementById('productModal')).show();
}

function addFromModal() {
  if(currentProduct) { addToCart(currentProduct.id); bootstrap.Modal.getInstance(document.getElementById('productModal')).hide(); }
}

function toggleFavFromModal() {
  if(currentProduct) { toggleFav(currentProduct.id); openProduct(currentProduct.id); }
}

// ============ PROFILE ============
function saveProfile() {
  const nombre = document.getElementById('prf-nombre').value.trim();
  if(!nombre) { showToast('El nombre es obligatorio','danger'); return; }
  showToast('Perfil actualizado correctamente ✅');
}

function changePassword() {
  const old = document.getElementById('prf-pass-old').value;
  const nw = document.getElementById('prf-pass-new').value;
  const conf = document.getElementById('prf-pass-confirm').value;
  if(!old || !nw || !conf) { showToast('Completa todos los campos','danger'); return; }
  if(nw !== conf) { showToast('Las contraseñas no coinciden','danger'); return; }
  if(nw.length < 6) { showToast('La contraseña debe tener al menos 6 caracteres','danger'); return; }
  ['prf-pass-old','prf-pass-new','prf-pass-confirm'].forEach(id => document.getElementById(id).value = '');
  showToast('Contraseña actualizada correctamente 🔒');
}

// ============ LOGOUT ============
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
  if (topbarUserName) topbarUserName.textContent = primerNombre;

  const profileAvatar = document.getElementById('profileAvatar');
  if (profileAvatar) profileAvatar.textContent = inicial;
  const profileName = document.getElementById('profileName');
  if (profileName) profileName.textContent = usuario.nombre_completo;

  const prfNombre = document.getElementById('prf-nombre');
  if (prfNombre) prfNombre.value = usuario.nombre_completo || '';
  const prfEmail = document.getElementById('prf-email');
  if (prfEmail) prfEmail.value = usuario.correo || '';
  const prfTel = document.getElementById('prf-tel');
  if (prfTel && usuario.telefono) prfTel.value = usuario.telefono;

  const coNombre = document.getElementById('co-nombre');
  if (coNombre) coNombre.value = usuario.nombre_completo || '';
  const coTel = document.getElementById('co-tel');
  if (coTel && usuario.telefono) coTel.value = usuario.telefono;
}

// ============ INIT ============
aplicarSesionUsuario();
renderProducts();
