/* ============================================================
   MiMini · Monitor de entregas en tiempo real
   Fuente de datos: base de datos MySQL de minimercado (/api)
   ============================================================ */
(function () {
  'use strict';

  const API = '/api';

  // ============================================================
  //  API DE MAPAS
  //  OpenStreetMap no necesita clave. Si tienes una API key de
  //  MapTiler, pégala en maptilerKey y se usará automáticamente.
  // ============================================================
  const MAP_API = {
    maptilerKey: '', // Ej: 'abc123...' (opcional)
    maptilerStyle: 'streets-v2',
    osmUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    cartoUrl: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    cartoDarkUrl: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    satelliteUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
  };

  function urlMapaPrincipal() {
    if (MAP_API.maptilerKey) {
      return 'https://api.maptiler.com/maps/' + MAP_API.maptilerStyle +
        '/{z}/{x}/{y}.png?key=' + encodeURIComponent(MAP_API.maptilerKey);
    }
    return MAP_API.osmUrl;
  }

  const ESTADOS_ACTIVOS = ['pendiente', 'confirmado', 'preparando', 'en_camino'];
  const ETIQUETAS_ESTADO = {
    pendiente: 'Pendiente',
    confirmado: 'Confirmado',
    preparando: 'Preparando',
    en_camino: 'En camino',
    entregado: 'Entregado',
    cancelado: 'Cancelado'
  };

  const DEFAULT_CENTER = { lat: 6.247637, lng: -75.565815 };
  const UMBRAL_ENVIO_METROS = 12;
  const UMBRAL_ENVIO_MS = 8000;
  const UMBRAL_RUTA_METROS = 35;
  const UMBRAL_RUTA_MS = 18000;

  let map = null;
  let marcadorMoto = null;
  let marcadorDestino = null;
  let lineaRuta = null;
  let lineaHistorica = null;
  let capaTiles = null;

  let socket = null;
  let watchId = null;

  let idRepartidor = null;
  let repartidorInfo = null;
  let pedidoActual = null;
  let pedidosActivos = [];
  let pedidosDisponibles = [];

  let miUbicacion = null;
  let ultimaUbicacionEnviada = null;
  let ultimaUbicacionServidor = null;
  let ultimoEnvioMs = 0;
  let ultimaRutaMs = 0;
  let ultimaRutaOrigen = null;
  let ultimoDestinoClave = null;
  let ultimaActualizacion = null;
  let siguiendo = true;
  let geocodificando = false;
  let cargandoPedidos = false;

  const $ = (id) => document.getElementById(id);

  /* ================= UTILIDADES ================= */

  function escapar(valor) {
    return String(valor == null ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function numero(valor) {
    if (valor === null || valor === undefined || valor === '') return null;
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
  }

  function coordenadaValida(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng) &&
      Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
      !(lat === 0 && lng === 0);
  }

  function haversine(a, b) {
    if (!a || !b) return 0;
    const R = 6371000;
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function moneda(valor) {
    const n = Number(valor) || 0;
    try {
      return n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
    } catch (e) {
      return '$' + Math.round(n);
    }
  }

  function hora(fecha) {
    const d = fecha ? new Date(fecha) : new Date();
    if (isNaN(d.getTime())) return '--:--:--';
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function distanciaTexto(metros) {
    if (!Number.isFinite(metros) || metros < 0) return '—';
    if (metros < 1000) return Math.round(metros) + ' m';
    return (metros / 1000).toFixed(metros < 10000 ? 1 : 0) + ' km';
  }

  function duracionTexto(minutos) {
    if (!Number.isFinite(minutos) || minutos < 0) return '—';
    const m = Math.max(1, Math.round(minutos));
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60);
    return h + ' h ' + (m % 60) + ' min';
  }

  function direccionPedido(p) {
    if (!p) return '';
    const partes = [];
    if (p.calle) partes.push(String(p.calle).trim() + (p.numero ? ' #' + String(p.numero).trim() : ''));
    else if (p.numero) partes.push('#' + String(p.numero).trim());
    if (p.complemento) partes.push(String(p.complemento).trim());
    if (p.barrio) partes.push(String(p.barrio).trim());
    if (!partes.length && p.nombre_direccion) partes.push(String(p.nombre_direccion).trim());
    return partes.join(', ');
  }

  function toast(mensaje, tipo) {
    const stack = $('toastStack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (tipo || '');
    el.textContent = mensaje;
    stack.appendChild(el);
    setTimeout(() => {
      el.classList.add('hide');
      setTimeout(() => el.remove(), 260);
    }, 4200);
  }

  async function apiGet(path) {
    const res = await fetch(API + path, { headers: { Accept: 'application/json' } });
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok || !data) {
      throw new Error((data && (data.error || data.mensaje)) || ('HTTP ' + res.status));
    }
    return data;
  }

  async function apiSend(method, path, body) {
    const res = await fetch(API + path, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body || {})
    });
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok || !data || data.success === false) {
      throw new Error((data && (data.error || data.mensaje)) || ('HTTP ' + res.status));
    }
    return data;
  }

  /* ================= IDENTIDAD ================= */

  function resolverRepartidor() {
    const usuario = window.usuarioActual || null;
    const params = new URLSearchParams(location.search);
    const param = Number(params.get('id_repartidor'));

    if (usuario && usuario.rol === 'repartidor') {
      const propio = Number(usuario.id_repartidor || localStorage.getItem('id_repartidor'));
      if (Number.isFinite(propio) && propio > 0) return propio;
      if (Number.isFinite(param) && param > 0) return param;
    }
    if (Number.isFinite(param) && param > 0) return param;

    const guardado = Number(localStorage.getItem('id_repartidor'));
    if (Number.isFinite(guardado) && guardado > 0) return guardado;

    return null;
  }

  async function pedirIdRepartidor() {
    const entrada = window.prompt('Ingresa tu ID de repartidor para iniciar el monitoreo:');
    const n = Number(entrada);
    if (Number.isFinite(n) && n > 0) {
      localStorage.setItem('id_repartidor', String(n));
      return n;
    }
    return null;
  }

  /* ================= MAPA ================= */

  function inicializarMapa() {
    map = L.map('map', {
      zoomControl: false,
      preferCanvas: true,
      center: [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
      zoom: 13,
      minZoom: 3,
      maxZoom: 19
    });

    const opcionesBase = {
      maxZoom: 19
    };

    const principal = L.tileLayer(urlMapaPrincipal(), Object.assign({}, opcionesBase, {
      attribution: MAP_API.maptilerKey
        ? '&copy; MapTiler &copy; OpenStreetMap'
        : '&copy; OpenStreetMap'
    })).addTo(map);

    capaTiles = principal;

    const oscuro = L.tileLayer(MAP_API.cartoDarkUrl, Object.assign({}, opcionesBase, {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd'
    }));

    const satelite = L.tileLayer(MAP_API.satelliteUrl, Object.assign({}, opcionesBase, {
      attribution: '&copy; Esri'
    }));

    L.control.layers({
      'Calles (OSM)': principal,
      'Oscuro (CARTO)': oscuro,
      'Satélite (Esri)': satelite
    }, null, { position: 'bottomleft' }).addTo(map);

    // Si el proveedor principal falla, cambia automáticamente a CARTO.
    let erroresPrincipal = 0;
    let cambiadoARespaldo = false;
    principal.on('tileerror', () => {
      erroresPrincipal += 1;
      if (erroresPrincipal < 4 || cambiadoARespaldo) return;
      cambiadoARespaldo = true;
      map.removeLayer(principal);
      const respaldo = L.tileLayer(MAP_API.cartoUrl, Object.assign({}, opcionesBase, {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd'
      })).addTo(map);
      capaTiles = respaldo;
      toast('El proveedor de mapas no respondió. Se activó CARTO como respaldo.', 'warn');
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    map.on('dragstart', () => { siguiendo = false; });
    setTimeout(() => map.invalidateSize(), 120);
    window.addEventListener('resize', () => { if (map) map.invalidateSize(); });
  }

  function iconoMoto() {
    return L.divIcon({
      className: '',
      html: '<div class="marker-moto">🛵</div>',
      iconSize: [44, 44],
      iconAnchor: [22, 22],
      popupAnchor: [0, -22]
    });
  }

  function iconoDestino() {
    return L.divIcon({
      className: '',
      html: '<div class="marker-destino">🏁</div>',
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -20]
    });
  }

  function pintarUbicacion(lat, lng, opciones) {
    if (!map || !coordenadaValida(lat, lng)) return;
    const punto = [lat, lng];

    if (marcadorMoto) {
      marcadorMoto.setLatLng(punto);
    } else {
      marcadorMoto = L.marker(punto, { icon: iconoMoto(), zIndexOffset: 500 }).addTo(map);
      marcadorMoto.bindPopup('🛵 Ubicación del repartidor');
    }

    if (siguiendo && (!opciones || opciones.centrar !== false)) {
      map.panTo(punto, { animate: true, duration: 0.4 });
    }
  }

  function pintarDestino(lat, lng) {
    if (!map || !coordenadaValida(lat, lng)) return;

    const popup = pedidoActual
      ? '<b>🏁 Destino</b><br>' +
        escapar(direccionPedido(pedidoActual)) + '<br>' +
        '<b>Cliente:</b> ' + escapar(pedidoActual.cliente_nombre || 'N/A') + '<br>' +
        '<b>Teléfono:</b> ' + escapar(pedidoActual.cliente_telefono || 'N/A') + '<br>' +
        '<b>Pedido #' + escapar(pedidoActual.id_pedido) + '</b>'
      : '🏁 Destino';

    if (marcadorDestino) {
      marcadorDestino.setLatLng([lat, lng]);
      marcadorDestino.setPopupContent(popup);
    } else {
      marcadorDestino = L.marker([lat, lng], { icon: iconoDestino(), zIndexOffset: 400 })
        .addTo(map)
        .bindPopup(popup);
    }
  }

  function limpiarDestinoMapa() {
    if (marcadorDestino) {
      map.removeLayer(marcadorDestino);
      marcadorDestino = null;
    }
    if (lineaRuta) {
      map.removeLayer(lineaRuta);
      lineaRuta = null;
    }
    if (lineaHistorica) {
      map.removeLayer(lineaHistorica);
      lineaHistorica = null;
    }
    ultimaRutaOrigen = null;
    ultimoDestinoClave = null;
    actualizarMetricas(null, null, null);
    $('routeStatus').textContent = 'Ruta: —';
  }

  function ajustarVista() {
    if (!map) return;
    const puntos = [];
    if (miUbicacion && coordenadaValida(miUbicacion.lat, miUbicacion.lng)) {
      puntos.push([miUbicacion.lat, miUbicacion.lng]);
    }
    if (marcadorDestino) puntos.push(marcadorDestino.getLatLng());
    if (lineaRuta) {
      try {
        map.fitBounds(lineaRuta.getBounds(), { padding: [70, 70], maxZoom: 16 });
        siguiendo = false;
        return;
      } catch (e) { /* ignora */ }
    }
    if (puntos.length >= 2) {
      map.fitBounds(L.latLngBounds(puntos), { padding: [70, 70], maxZoom: 16 });
      siguiendo = false;
    } else if (puntos.length === 1) {
      map.setView(puntos[0], 16, { animate: true });
    }
  }

  /* ================= DESTINO / GEOCODIFICACIÓN ================= */

  function destinoDesdePedido(p) {
    if (!p) return null;
    const lat = numero(p.destino_lat);
    const lng = numero(p.destino_lng);
    if (coordenadaValida(lat, lng)) return { lat, lng, geocodificado: false };
    return null;
  }

  async function geocodificarPedido(p) {
    const direccion = direccionPedido(p);
    if (!direccion) return null;
    try {
      const data = await apiGet('/geocodificar?direccion=' + encodeURIComponent(direccion));
      const lat = numero(data.lat);
      const lng = numero(data.lng);
      if (coordenadaValida(lat, lng)) {
        // Guarda las coordenadas resueltas en la dirección del pedido (DB).
        if (p.id_direccion) {
          apiSend('PUT', '/direccion/' + p.id_direccion + '/coordenadas', {
            latitud: lat,
            longitud: lng
          }).catch(() => {});
        }
        return { lat, lng, geocodificado: true };
      }
    } catch (error) {
      console.warn('No se pudo geocodificar la dirección:', error.message);
    }
    return null;
  }

  async function prepararDestino(pedido, forzar) {
    if (!map) return;
    const clave = pedido ? String(pedido.id_pedido) + '|' + direccionPedido(pedido) : '';

    if (!pedido) {
      limpiarDestinoMapa();
      return;
    }

    let destino = destinoDesdePedido(pedido);

    if (!destino && !geocodificando) {
      geocodificando = true;
      $('routeStatus').textContent = 'Ruta: geocodificando dirección…';
      destino = await geocodificarPedido(pedido);
      geocodificando = false;
      if (!destino) {
        $('routeStatus').textContent = 'Ruta: dirección sin coordenadas';
        toast('No se encontraron coordenadas para la dirección del pedido.', 'warn');
      }
    }

    if (!destino) return;

    pintarDestino(destino.lat, destino.lng);

    const cambioDestino = clave !== ultimoDestinoClave;
    ultimoDestinoClave = clave;

    if (cambioDestino || forzar) {
      cargarRutaHistorica(pedido.id_pedido);
    }

    const origen = miUbicacion || ultimaUbicacionServidor;
    if (origen) {
      await calcularRuta(origen, destino, cambioDestino || forzar);
    } else {
      map.setView([destino.lat, destino.lng], 15, { animate: true });
      actualizarMetricas(null, null, pedido.id_pedido);
    }
  }

  /* ================= RUTA ================= */

  async function calcularRuta(origen, destino, forzar) {
    if (!map || !origen || !destino) return;

    const ahora = Date.now();
    const movido = !ultimaRutaOrigen ? Infinity : haversine(ultimaRutaOrigen, origen);
    if (!forzar && lineaRuta && ahora - ultimaRutaMs < UMBRAL_RUTA_MS && movido < UMBRAL_RUTA_METROS) {
      return;
    }
    ultimaRutaMs = ahora;
    ultimaRutaOrigen = { lat: origen.lat, lng: origen.lng };

    try {
      const url = 'https://router.project-osrm.org/route/v1/driving/' +
        origen.lng + ',' + origen.lat + ';' + destino.lng + ',' + destino.lat +
        '?overview=full&geometries=geojson&steps=false';

      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const data = await res.json();

      if (data && data.code === 'Ok' && data.routes && data.routes.length) {
        const ruta = data.routes[0];
        const puntos = ruta.geometry.coordinates.map((c) => [c[1], c[0]]);

        if (lineaRuta) map.removeLayer(lineaRuta);
        lineaRuta = L.polyline(puntos, {
          color: '#00d4ff',
          weight: 5,
          opacity: 0.9,
          lineJoin: 'round',
          lineCap: 'round'
        }).addTo(map);

        const km = ruta.distance / 1000;
        const min = ruta.duration / 60;
        lineaRuta.bindTooltip('🛣️ ' + km.toFixed(1) + ' km · ' + Math.round(min) + ' min', {
          permanent: false,
          direction: 'center',
          className: 'route-tooltip'
        });

        actualizarMetricas(ruta.distance, min, pedidoActual ? pedidoActual.id_pedido : null);
        $('routeStatus').textContent = 'Ruta: ' + km.toFixed(1) + ' km · ' + Math.round(min) + ' min';

        if (forzar) {
          map.fitBounds(lineaRuta.getBounds(), { padding: [70, 70], maxZoom: 16 });
          siguiendo = false;
        }
        return;
      }
    } catch (error) {
      console.warn('OSRM no disponible:', error.message);
    }

    dibujarLineaRecta(origen, destino);
  }

  function dibujarLineaRecta(origen, destino) {
    if (!map) return;
    if (lineaRuta) map.removeLayer(lineaRuta);

    lineaRuta = L.polyline([
      [origen.lat, origen.lng],
      [destino.lat, destino.lng]
    ], {
      color: '#00d4ff',
      weight: 4,
      opacity: 0.75,
      dashArray: '10 10'
    }).addTo(map);

    const metros = haversine(origen, destino);
    const minutos = (metros / 1000) / 25 * 60;
    actualizarMetricas(metros, minutos, pedidoActual ? pedidoActual.id_pedido : null);
    $('routeStatus').textContent = 'Ruta: línea directa · ' + distanciaTexto(metros);
  }

  function actualizarMetricas(metros, minutos, idPedido) {
    $('metricDistancia').textContent = Number.isFinite(metros) ? distanciaTexto(metros) : '—';
    $('metricTiempo').textContent = Number.isFinite(minutos) ? duracionTexto(minutos) : '—';
    $('metricPedido').textContent = idPedido ? '#' + idPedido : '—';
  }

  async function cargarRutaHistorica(idPedido) {
    if (!map || !idPedido) return;
    try {
      const data = await apiGet('/ruta/' + idPedido);
      const ruta = Array.isArray(data.ruta) ? data.ruta : [];
      const puntos = ruta
        .map((p) => [numero(p.latitud), numero(p.longitud)])
        .filter((p) => coordenadaValida(p[0], p[1]));

      if (lineaHistorica) {
        map.removeLayer(lineaHistorica);
        lineaHistorica = null;
      }

      if (puntos.length >= 2) {
        lineaHistorica = L.polyline(puntos, {
          color: '#ffb020',
          weight: 3,
          opacity: 0.65,
          dashArray: '5 6'
        }).addTo(map);
        lineaHistorica.bindTooltip('Ruta recorrida', { permanent: false });
      }
    } catch (error) {
      console.warn('Sin ruta histórica:', error.message);
    }
  }

  /* ================= PEDIDOS ================= */

  async function cargarRepartidor() {
    try {
      const data = await apiGet('/repartidor/' + idRepartidor);
      if (!data.success || !data.repartidor) throw new Error(data.error || 'Repartidor no encontrado');

      repartidorInfo = data.repartidor;
      const nombre = repartidorInfo.nombre_completo || 'Repartidor';
      $('driverName').textContent = nombre;
      $('driverSub').textContent =
        (repartidorInfo.vehiculo ? repartidorInfo.vehiculo + ' · ' : '') +
        (repartidorInfo.telefono || 'Sin teléfono');
      $('driverAvatar').textContent = nombre.trim().charAt(0).toUpperCase() || 'R';

      const pill = $('disponibilidadPill');
      const disponible = Number(repartidorInfo.disponible) === 1;
      pill.textContent = disponible ? 'Disponible' : 'No disponible';
      pill.className = 'pill ' + (disponible ? 'on' : 'off');

      document.title = 'MiMini · ' + nombre + ' en vivo';
    } catch (error) {
      $('driverName').textContent = 'Repartidor #' + idRepartidor;
      $('driverSub').textContent = error.message;
      toast('No se pudo cargar el repartidor: ' + error.message, 'error');
    }
  }

  async function cargarEstadisticas() {
    try {
      const data = await apiGet('/repartidor/' + idRepartidor + '/estadisticas');
      const stats = data.estadisticas || {};
      $('statActivos').textContent = Number(stats.pedidos_pendientes) || 0;
      $('statEntregados').textContent = Number(stats.entregas_hoy) || 0;
      $('statRecaudado').textContent = moneda(stats.total_recaudado);
    } catch (error) {
      console.warn('Estadísticas no disponibles:', error.message);
    }
  }

  async function cargarPedidos() {
    if (cargandoPedidos) return;
    cargandoPedidos = true;
    try {
      const [activos, disponibles] = await Promise.all([
        apiGet('/repartidor/' + idRepartidor + '/pedidos').catch(() => ({ data: [] })),
        apiGet('/repartidor/' + idRepartidor + '/pedidos-disponibles').catch(() => ({ data: [] }))
      ]);

      pedidosActivos = Array.isArray(activos.data) ? activos.data : [];
      pedidosDisponibles = Array.isArray(disponibles.data) ? disponibles.data : [];

      if (pedidoActual) {
        const refrescado = pedidosActivos.find((p) => Number(p.id_pedido) === Number(pedidoActual.id_pedido));
        if (refrescado) {
          pedidoActual = refrescado;
        } else if (!pedidosActivos.some((p) => Number(p.id_pedido) === Number(pedidoActual.id_pedido))) {
          pedidoActual = null;
        }
      }

      if (!pedidoActual && pedidosActivos.length) {
        pedidoActual = pedidosActivos[0];
      }

      renderizarPedidos();

      if (pedidoActual) {
        actualizarPanelPedido();
        await prepararDestino(pedidoActual, false);
      } else {
        actualizarPanelPedido();
        limpiarDestinoMapa();
      }
    } catch (error) {
      toast('Error cargando pedidos: ' + error.message, 'error');
    } finally {
      cargandoPedidos = false;
      cargarEstadisticas();
    }
  }

  function renderizarPedidos() {
    const lista = $('orderList');
    lista.innerHTML = '';

    const todos = pedidosActivos.slice();
    if (!todos.length) {
      pedidosDisponibles.forEach((p) => {
        if (!todos.some((x) => Number(x.id_pedido) === Number(p.id_pedido))) todos.push(p);
      });
    }

    if (!todos.length) {
      lista.innerHTML =
        '<div class="empty-state"><span class="empty-icon">📭</span>' +
        '<p>No hay pedidos activos ni disponibles.</p></div>';
      $('statActivos').textContent = '0';
      return;
    }

    todos.forEach((p) => {
      const disponible = p.id_repartidor == null;
      const activo = pedidoActual && Number(pedidoActual.id_pedido) === Number(p.id_pedido);
      const card = document.createElement('article');
      card.className = 'order-card' + (activo ? ' active' : '');
      card.dataset.estado = p.estado || 'pendiente';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');

      card.innerHTML =
        '<div class="order-top">' +
          '<span class="order-id">Pedido #' + escapar(p.id_pedido) + '</span>' +
          '<span class="order-amount">' + escapar(moneda(p.total_pagar)) + '</span>' +
        '</div>' +
        '<div class="order-address">' + escapar(direccionPedido(p) || 'Sin dirección') + '</div>' +
        '<div class="order-bottom">' +
          '<span>' + escapar(p.cliente_nombre || 'Cliente') + '</span>' +
          '<span class="state-badge ' + escapar(p.estado || 'pendiente') + '">' +
            escapar(disponible ? 'Sin asignar' : (ETIQUETAS_ESTADO[p.estado] || p.estado || '—')) +
          '</span>' +
        '</div>';

      const seleccionar = async () => {
        if (disponible) {
          toast('Los repartidores no pueden escoger pedidos. Un administrador debe asignar el pedido #' + p.id_pedido + '.', 'warn');
          return;
        }
        pedidoActual = p;
        renderizarPedidos();
        actualizarPanelPedido();
        await prepararDestino(p, true);
      };

      card.addEventListener('click', seleccionar);
      card.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          seleccionar();
        }
      });

      lista.appendChild(card);
    });

    $('statActivos').textContent = String(pedidosActivos.length);
  }

  function actualizarPanelPedido() {
    const p = pedidoActual;
    const badge = $('pedidoEstado');

    if (!p) {
      $('destDireccion').textContent = 'Selecciona un pedido';
      $('destCliente').textContent = '—';
      badge.textContent = 'Sin pedido';
      badge.className = 'state-badge';
      $('btnEnCamino').disabled = true;
      $('btnEntregado').disabled = true;
      $('btnVerRuta').disabled = true;
      actualizarMetricas(null, null, null);
      return;
    }

    $('destDireccion').textContent = direccionPedido(p) || 'Dirección no registrada';
    $('destCliente').textContent =
      (p.cliente_nombre || 'Cliente') +
      (p.cliente_telefono ? ' · ' + p.cliente_telefono : '') +
      ' · Pedido #' + p.id_pedido;

    const estado = p.estado || 'pendiente';
    badge.textContent = ETIQUETAS_ESTADO[estado] || estado;
    badge.className = 'state-badge ' + estado;

    $('btnEnCamino').disabled = estado === 'en_camino' || estado === 'entregado' || estado === 'cancelado';
    $('btnEntregado').disabled = estado === 'entregado' || estado === 'cancelado';
    $('btnVerRuta').disabled = false;
    actualizarMetricas(null, null, p.id_pedido);
  }

  async function cambiarEstado(estado) {
    if (!pedidoActual) return;
    if (estado === 'entregado' && !window.confirm('¿Confirmar la entrega del pedido #' + pedidoActual.id_pedido + '?')) return;

    try {
      await apiSend('PUT', '/repartidor/pedido/' + pedidoActual.id_pedido + '/estado', {
        id_repartidor: idRepartidor,
        estado
      });
      toast('Pedido #' + pedidoActual.id_pedido + ' → ' + (ETIQUETAS_ESTADO[estado] || estado), 'success');

      if (estado === 'entregado') {
        pedidoActual = null;
        limpiarDestinoMapa();
      }
      await cargarPedidos();
    } catch (error) {
      toast('No se pudo cambiar el estado: ' + error.message, 'error');
    }
  }

  /* ================= UBICACIÓN ================= */

  function iniciarGPS() {
    if (!navigator.geolocation) {
      $('gpsStatus').textContent = 'GPS no soportado';
      $('gpsDot').classList.add('error');
      return;
    }

    if (watchId !== null) navigator.geolocation.clearWatch(watchId);

    watchId = navigator.geolocation.watchPosition(
      (posicion) => {
        const lat = posicion.coords.latitude;
        const lng = posicion.coords.longitude;
        const precision = posicion.coords.accuracy;

        miUbicacion = { lat, lng };
        ultimaActualizacion = new Date();

        pintarUbicacion(lat, lng, { centrar: siguiendo });

        $('gpsDot').classList.add('live');
        $('gpsDot').classList.remove('error');
        $('gpsStatus').textContent = 'GPS activo · ±' + Math.round(precision || 0) + ' m';
        $('lastUpdate').textContent = 'Última actualización: ' + hora(ultimaActualizacion);

        enviarUbicacion(lat, lng, precision, posicion.coords.speed);

        if (pedidoActual) {
          const destino = destinoDesdePedido(pedidoActual);
          if (destino) calcularRuta(miUbicacion, destino, false);
        }
      },
      (error) => {
        $('gpsDot').classList.remove('live');
        $('gpsDot').classList.add('error');
        $('gpsStatus').textContent = 'GPS: ' + (error.message || 'sin permiso');
        console.warn('Geolocalización:', error.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  async function enviarUbicacion(lat, lng, precision, velocidad) {
    if (!idRepartidor) return;

    const ahora = Date.now();
    const distancia = ultimaUbicacionEnviada ? haversine(ultimaUbicacionEnviada, { lat, lng }) : Infinity;

    if (distancia < UMBRAL_ENVIO_METROS && ahora - ultimoEnvioMs < UMBRAL_ENVIO_MS) return;

    ultimoEnvioMs = ahora;
    ultimaUbicacionEnviada = { lat, lng };

    try {
      await apiSend('POST', '/ubicacion/actualizar', {
        id_repartidor: idRepartidor,
        id_pedido: pedidoActual ? pedidoActual.id_pedido : null,
        latitud: lat,
        longitud: lng,
        precision_gps: Math.round(precision || 0),
        velocidad: Number.isFinite(velocidad) ? velocidad : null
      });
    } catch (error) {
      console.warn('No se pudo enviar la ubicación:', error.message);
    }
  }

  async function cargarUltimaUbicacion() {
    try {
      const data = await apiGet('/ubicacion/' + idRepartidor);
      const u = data.ubicacion;
      if (!u) return;
      const lat = numero(u.latitud);
      const lng = numero(u.longitud);
      if (!coordenadaValida(lat, lng)) return;

      ultimaUbicacionServidor = { lat, lng };

      if (!miUbicacion) {
        pintarUbicacion(lat, lng, { centrar: true });
        ultimaActualizacion = u.timestamp ? new Date(u.timestamp) : new Date();
        $('lastUpdate').textContent = 'Última actualización: ' + hora(ultimaActualizacion);
        $('gpsStatus').textContent = 'Última posición registrada en la BD';
      }

      if (pedidoActual) {
        const destino = destinoDesdePedido(pedidoActual);
        if (destino) calcularRuta({ lat, lng }, destino, false);
      }
    } catch (error) {
      /* aún no hay ubicaciones */
    }
  }

  /* ================= SOCKET ================= */

  function conectarSocket() {
    if (typeof io !== 'function') {
      $('connStatus').className = 'conn offline';
      $('connStatus').innerHTML = '<i></i> Sin Socket.IO';
      return;
    }

    socket = io({ transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      $('connStatus').className = 'conn online';
      $('connStatus').innerHTML = '<i></i> En vivo';
      socket.emit('repartidor_conectado', { id_repartidor: idRepartidor });
      socket.emit('unirse_repartidor', idRepartidor);
    });

    socket.on('disconnect', () => {
      $('connStatus').className = 'conn offline';
      $('connStatus').innerHTML = '<i></i> Desconectado';
    });

    socket.on('connect_error', () => {
      $('connStatus').className = 'conn offline';
      $('connStatus').innerHTML = '<i></i> Reconectando…';
    });

    socket.on('ubicacion_actualizada', (data) => {
      if (!data || Number(data.id_repartidor) !== Number(idRepartidor)) return;
      const lat = numero(data.latitud);
      const lng = numero(data.longitud);
      if (!coordenadaValida(lat, lng)) return;

      ultimaUbicacionServidor = { lat, lng };
      ultimaActualizacion = data.timestamp ? new Date(data.timestamp) : new Date();

      if (!miUbicacion) {
        pintarUbicacion(lat, lng, { centrar: siguiendo });
      }
      $('lastUpdate').textContent = 'Última actualización: ' + hora(ultimaActualizacion);
    });

    const refrescarPorPedido = (data) => {
      if (!data) return;
      if (data.id_repartidor != null && Number(data.id_repartidor) !== Number(idRepartidor)) return;
      cargarPedidos();
    };

    socket.on('pedido_asignado', refrescarPorPedido);
    socket.on('pedido_estado_actualizado', refrescarPorPedido);
    socket.on('pedido_completado', refrescarPorPedido);
    socket.on('nuevo_pedido', () => cargarPedidos());
  }

  /* ================= EVENTOS ================= */

  function conectarBotones() {
    $('btnRefresh').addEventListener('click', async () => {
      const btn = $('btnRefresh');
      btn.classList.add('spinning');
      await Promise.all([cargarRepartidor(), cargarPedidos()]);
      setTimeout(() => btn.classList.remove('spinning'), 400);
    });

    $('btnEnCamino').addEventListener('click', () => cambiarEstado('en_camino'));
    $('btnEntregado').addEventListener('click', () => cambiarEstado('entregado'));
    $('btnVerRuta').addEventListener('click', () => ajustarVista());

    $('btnCentrar').addEventListener('click', async () => {
      siguiendo = true;
      if (miUbicacion && map) {
        map.setView([miUbicacion.lat, miUbicacion.lng], 16, { animate: true });
      } else {
        await cargarUltimaUbicacion();
        if (ultimaUbicacionServidor && map) {
          map.setView([ultimaUbicacionServidor.lat, ultimaUbicacionServidor.lng], 16, { animate: true });
        } else {
          toast('Aún no hay una ubicación disponible.', 'warn');
        }
      }
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        pedidoActual = null;
        renderizarPedidos();
        actualizarPanelPedido();
        limpiarDestinoMapa();
      }
    });
  }

  /* ================= ARRANQUE ================= */

  async function iniciar() {
    idRepartidor = resolverRepartidor();
    if (!idRepartidor) idRepartidor = await pedirIdRepartidor();

    if (!idRepartidor) {
      toast('No se indicó un repartidor válido.', 'error');
      setTimeout(() => { window.location.href = 'repartidor.html'; }, 1600);
      return;
    }

    localStorage.setItem('id_repartidor', String(idRepartidor));

    inicializarMapa();
    conectarBotones();
    conectarSocket();

    await cargarRepartidor();
    await Promise.all([cargarPedidos(), cargarUltimaUbicacion(), cargarEstadisticas()]);

    iniciarGPS();

    setInterval(() => {
      if (pedidoActual) {
        const destino = destinoDesdePedido(pedidoActual);
        const origen = miUbicacion || ultimaUbicacionServidor;
        if (destino && origen) calcularRuta(origen, destino, false);
      }
    }, 45000);

    setInterval(() => {
      if (!miUbicacion) cargarUltimaUbicacion();
    }, 30000);

    setInterval(cargarPedidos, 60000);

    setInterval(() => {
      if (!ultimaActualizacion) return;
      const segundos = Math.floor((Date.now() - ultimaActualizacion.getTime()) / 1000);
      if (segundos > 90 && miUbicacion) {
        $('gpsStatus').textContent = 'GPS sin señal hace ' + segundos + ' s';
        $('gpsDot').classList.remove('live');
      }
    }, 15000);
  }

  document.addEventListener('DOMContentLoaded', () => {
    iniciar().catch((error) => {
      console.error(error);
      toast('Error inicializando el monitor: ' + error.message, 'error');
    });
  });
})();
