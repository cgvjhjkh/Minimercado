/* =====================================================================
   MINIMERCADO — LÓGICA DE LA PÁGINA
   =====================================================================
   Cambios de esta versión respecto a la anterior:
   - Se agregaron más productos al arreglo "offers" (ofertas especiales).
   - La fila de ofertas se dibuja DOS VECES seguidas en el DOM
     (lista + lista) para lograr el movimiento automático infinito
     hacia la derecha definido en la animación CSS ".marquee".
   - El carrusel principal ya no maneja imágenes (se quitaron del HTML),
     así que el JS del carrusel no cambia en su lógica, solo en los
     productos que puede agregar al carrito.
   ===================================================================== */

/* ---------------- DATA DE PRODUCTOS ---------------- */

// Ofertas especiales: se amplió la lista (antes 6, ahora 12 productos)
const offers = [
  { id:'o1',  name:'Aceite Girasol 1L',     img:'Aceite+Girasol',   price:9900,  oldPrice:13500, discount:'-27%' },
  { id:'o2',  name:'Arroz Diana 1kg',       img:'Arroz+1kg',        price:4200,  oldPrice:5600,  discount:'-25%' },
  { id:'o3',  name:'Detergente 2L',         img:'Detergente+2L',    price:14500, oldPrice:19900, discount:'-27%' },
  { id:'o4',  name:'Café Sello Rojo 500g',  img:'Cafe+500g',        price:12900, oldPrice:16000, discount:'-19%' },
  { id:'o5',  name:'Pan Tajado Integral',   img:'Pan+Tajado',       price:5200,  oldPrice:6900,  discount:'-25%' },
  { id:'o6',  name:'Jabón de Baño x3',      img:'Jabon+x3',         price:7800,  oldPrice:10200, discount:'-24%' },
  { id:'o7',  name:'Atún en Lata x3',       img:'Atun+x3',          price:11200, oldPrice:14900, discount:'-25%' },
  { id:'o8',  name:'Pasta Espagueti 500g',  img:'Pasta+500g',       price:3100,  oldPrice:4200,  discount:'-26%' },
  { id:'o9',  name:'Cerveza Six Pack',      img:'Cerveza+Six+Pack', price:19900, oldPrice:25900, discount:'-23%' },
  { id:'o10', name:'Chocolate de Mesa 250g',img:'Chocolate+250g',   price:6700,  oldPrice:8900,  discount:'-25%' },
  { id:'o11', name:'Suavizante 1.8L',       img:'Suavizante+1.8L',  price:13800, oldPrice:17900, discount:'-23%' },
  { id:'o12', name:'Galletas Surtidas',     img:'Galletas',         price:4500,  oldPrice:5900,  discount:'-24%' }
];

// Productos destacados
const featured = [
  { id:'f1', name:'Leche Entera 1L',       cat:'Lácteos',           img:'Leche+1L',        price:4300 },
  { id:'f2', name:'Manzana Roja x kg',     cat:'Frutas y verduras', img:'Manzana',         price:6200 },
  { id:'f3', name:'Papel Higiénico x6',    cat:'Aseo',              img:'Papel+Higienico', price:15900 },
  { id:'f4', name:'Huevos AA x30',         cat:'Mercado',           img:'Huevos+x30',      price:17800 },
  { id:'f5', name:'Jugo Natural 1L',       cat:'Bebidas',           img:'Jugo+Natural',    price:6800 },
  { id:'f6', name:'Croissant Artesanal',   cat:'Panadería',        img:'Croissant',       price:3200 },
  { id:'f7', name:'Pechuga de Pollo x kg', cat:'Carnes',            img:'Pechuga+Pollo',   price:14900 }
];

// Diccionario único con todos los productos (para poder agregarlos al carrito
// desde cualquier parte de la página, incluido el carrusel superior).
const allProducts = {};
offers.forEach(p => allProducts[p.id] = { name:p.name, price:p.price, img:p.img });
featured.forEach(p => allProducts[p.id] = { name:p.name, price:p.price, img:p.img });
allProducts['slide-coca']   = { name:'Coca-Cola 3L',        price:8500,  img:'Coca-Cola+3L' };
allProducts['slide-pan']    = { name:'Combo Panadería',     price:6300,  img:'Combo+Panaderia' };
allProducts['slide-frutas'] = { name:'Frutas Frescas',      price:10900, img:'Frutas+Frescas' };
allProducts['slide-aseo']   = { name:'Combo de Aseo',       price:24500, img:'Combo+Aseo' };

const cart = {}; // id -> {name, price, qty, img}

/* ---------------- UTILIDAD ---------------- */
function money(n){ return '$' + n.toLocaleString('es-CO'); }

/* ---------------- PLANTILLA DE UNA TARJETA DE OFERTA ---------------- */
// La separamos en su propia función porque la necesitamos DOS VECES
// (lista original + lista duplicada) para el efecto de marquee infinito.
function offerCardHTML(p, copyIndex){
  // copyIndex evita ids duplicados en el HTML cuando repetimos la lista
  const btnId = `btn-${p.id}-${copyIndex}`;
  return `
    <div class="product-card">
      <div class="product-media">
        <img src="https://placehold.co/230x150/E8F5E9/2E7D32?text=${p.img}" alt="${p.name}">
        <span class="badge-discount">${p.discount} 🔥</span>
      </div>
      <div class="product-body">
        <div class="product-name">${p.name}</div>
        <div class="product-prices">
          <span class="old">${money(p.oldPrice)}</span>
          <span class="new">${money(p.price)}</span>
        </div>
        <button class="add-btn" id="${btnId}" onclick="addToCart('${p.id}', '${btnId}')">🛒 Agregar</button>
      </div>
    </div>`;
}

/* ---------------- RENDER: OFERTAS (con lista duplicada para el marquee) ---------------- */
function renderOffers(){
  const row = document.getElementById('offerRow');
  const originalCards  = offers.map(p => offerCardHTML(p, 'a')).join('');
  const duplicateCards = offers.map(p => offerCardHTML(p, 'b')).join('');
  // Duplicamos la lista completa: la animación CSS mueve el track
  // exactamente el 50% de su ancho, así que la segunda mitad (duplicada)
  // ocupa el lugar donde iba la primera y el ciclo se ve continuo.
  row.innerHTML = originalCards + duplicateCards;
}

/* ---------------- RENDER: PRODUCTOS DESTACADOS ---------------- */
function renderFeatured(){
  const row = document.getElementById('featRow');
  row.innerHTML = featured.map(p => `
    <div class="product-card">
      <div class="product-media">
        <img src="https://placehold.co/230x150/E8F5E9/2E7D32?text=${p.img}" alt="${p.name}">
      </div>
      <div class="product-body">
        <div class="product-cat">${p.cat}</div>
        <div class="product-name">${p.name}</div>
        <div class="product-avail">✓ Disponible</div>
        <div class="product-prices"><span class="new">${money(p.price)}</span></div>
        <button class="add-btn" id="btn-${p.id}" onclick="addToCart('${p.id}', 'btn-${p.id}')">🛒 Agregar al carrito</button>
      </div>
    </div>
  `).join('');
}

/* ---------------- CARRITO: agregar producto ---------------- */
function addToCart(id, btnId){
  const p = allProducts[id];
  if(!p) return;
  if(!cart[id]) cart[id] = {...p, qty:0};
  cart[id].qty += 1;
  updateCartUI();

  if(btnId){
    const btn = document.getElementById(btnId);
    if(btn){
      const original = btn.innerHTML;
      btn.classList.add('added');
      btn.innerHTML = '✓ Agregado';
      setTimeout(()=>{ btn.classList.remove('added'); btn.innerHTML = original; }, 900);
    }
  }
}

/* ---------------- CARRITO: cambiar cantidad / eliminar ---------------- */
function changeQty(id, delta){
  if(!cart[id]) return;
  cart[id].qty += delta;
  if(cart[id].qty <= 0) delete cart[id];
  updateCartUI();
}

function removeItem(id){
  delete cart[id];
  updateCartUI();
}

/* ---------------- CARRITO: redibujar contador y panel ---------------- */
function updateCartUI(){
  const ids = Object.keys(cart);
  const totalCount = ids.reduce((s,id)=>s+cart[id].qty,0);
  document.getElementById('cartCount').textContent = totalCount;

  const itemsEl = document.getElementById('cartItems');
  if(ids.length === 0){
    itemsEl.innerHTML = '<div class="cart-empty">Tu carrito está vacío.<br>Agrega productos para comenzar tu compra.</div>';
  } else {
    itemsEl.innerHTML = ids.map(id => {
      const it = cart[id];
      return `
        <div class="cart-item">
          <img src="https://placehold.co/56x56/E8F5E9/2E7D32?text=${encodeURIComponent(it.img)}" alt="${it.name}">
          <div class="cart-item-info">
            <div class="name">${it.name}</div>
            <div class="price">${money(it.price)}</div>
            <div class="qty-row">
              <button class="qty-btn" onclick="changeQty('${id}',-1)">−</button>
              <span>${it.qty}</span>
              <button class="qty-btn" onclick="changeQty('${id}',1)">+</button>
              <button class="remove-btn" onclick="removeItem('${id}')">Eliminar</button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  const subtotal = ids.reduce((s,id)=>s + cart[id].price*cart[id].qty, 0);
  const discount = Math.round(subtotal * 0.05); // descuento simbólico de ejemplo
  document.getElementById('cartSubtotal').textContent = money(subtotal);
  document.getElementById('cartDiscount').textContent = '-' + money(subtotal ? discount : 0);
  document.getElementById('cartTotal').textContent = money(subtotal - (subtotal?discount:0));
}

/* ---------------- CARRITO: abrir/cerrar panel lateral ---------------- */
function toggleCart(force){
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('overlay');
  const open = force !== undefined ? force : !drawer.classList.contains('open');
  drawer.classList.toggle('open', open);
  overlay.classList.toggle('open', open);
}
document.getElementById('cartToggle').addEventListener('click', ()=>toggleCart());

/* ---------------- CARRUSEL PRINCIPAL (sin imágenes) ---------------- */
let slideIndex = 0;
const track = document.getElementById('carouselTrack');
const slideCount = track.children.length;
const dotsWrap = document.getElementById('carouselDots');
for(let i=0;i<slideCount;i++){
  const d = document.createElement('div');
  d.className = 'dot' + (i===0?' active':'');
  d.onclick = () => { slideIndex = i; updateCarousel(); };
  dotsWrap.appendChild(d);
}
function updateCarousel(){
  track.style.transform = `translateX(-${slideIndex*100}%)`;
  [...dotsWrap.children].forEach((d,i)=>d.classList.toggle('active', i===slideIndex));
}
function moveCarousel(dir){
  slideIndex = (slideIndex + dir + slideCount) % slideCount;
  updateCarousel();
}
let autoTimer = setInterval(()=>moveCarousel(1), 6000);
document.querySelector('.carousel').addEventListener('mouseenter', ()=>clearInterval(autoTimer));
document.querySelector('.carousel').addEventListener('mouseleave', ()=>{autoTimer = setInterval(()=>moveCarousel(1), 6000);});

/* ---------------- SCROLL MANUAL DE FILAS (categorías / destacados) ---------------- */
function scrollRow(id, dir){
  const row = document.getElementById(id);
  row.scrollBy({left: dir * 260, behavior:'smooth'});
}

/* ---------------- INICIALIZACIÓN ---------------- */
renderOffers();
renderFeatured();
updateCartUI();
