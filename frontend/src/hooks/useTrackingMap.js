import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  apiGet,
  apiSend,
  escapar,
  haversine,
  ESTADOS_FINALES
} from '../lib/repartidorApi';

const CENTRO_MEDELLIN = [6.2442, -75.5812];
const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const CARTO_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

// ============================================================
//  Mapa Leaflet + GPS del repartidor.
//  - Sigue la ubicación real (watchPosition) y la envía al backend.
//  - Dibuja el destino del pedido y calcula la ruta (OSRM).
//  - Recupera la ruta histórica guardada por pedido.
// ============================================================
export function useTrackingMap({ idRepartidor, pedido = null, onMetricas, onGps, onUbicacion, onAviso }) {
  const contenedorRef = useRef(null);
  const mapaRef = useRef(null);
  const yoRef = useRef(null);
  const destRef = useRef(null);
  const rutaRef = useRef(null);
  const histRef = useRef(null);

  const gpsWatchRef = useRef(null);
  const ultimaUbicacionRef = useRef(null);
  const ultimaEnviadaRef = useRef(null);
  const ultimoEnvioRef = useRef(0);
  const ultimaRutaRef = useRef(0);
  const ultimaActualizacionRef = useRef(null);
  const ultimoGpsRef = useRef(0);
  const destinoCoordRef = useRef(null);
  const destinoClaveRef = useRef('');
  const pedidoRef = useRef(pedido);
  const callbacksRef = useRef({ onMetricas, onGps, onUbicacion, onAviso });

  const [ubicacion, setUbicacion] = useState(null);
  const [destino, setDestino] = useState(null);
  const [gps, setGps] = useState({ texto: 'Iniciando GPS…', estado: '' });
  const [metricas, setMetricas] = useState({ distancia: '—', tiempo: '—' });
  const [actualizadoHace, setActualizadoHace] = useState(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    pedidoRef.current = pedido;
  }, [pedido]);

  useEffect(() => {
    callbacksRef.current = { onMetricas, onGps, onUbicacion, onAviso };
  }, [onMetricas, onGps, onUbicacion, onAviso]);

  const actualizarGps = useCallback((texto, estado = '') => {
    const valor = { texto, estado };
    setGps(valor);
    callbacksRef.current.onGps?.(valor);
  }, []);

  const actualizarMetricas = useCallback((valor) => {
    setMetricas(valor);
    callbacksRef.current.onMetricas?.(valor);
  }, []);

  // Marca el instante de la última posición conocida. El texto "hace Xs" se
  // recalcula cada segundo, así el panel sigue vivo sin recargar la página.
  const marcarActualizacion = useCallback(() => {
    ultimaActualizacionRef.current = Date.now();
    setActualizadoHace(0);
  }, []);

  const enviarUbicacion = useCallback(
    async (lat, lng, accuracy, speed) => {
      if (!idRepartidor) return;
      const actual = pedidoRef.current;
      const activo = actual && !ESTADOS_FINALES.includes(actual.estado);

      try {
        await apiSend('POST', '/ubicacion/actualizar', {
          id_repartidor: idRepartidor,
          id_pedido: activo ? actual.id : null,
          latitud: lat,
          longitud: lng,
          precision_gps: Math.round(accuracy || 0),
          velocidad:
            speed != null && Number.isFinite(Number(speed))
              ? Number(Number(speed).toFixed(2))
              : null
        });
      } catch (e) {
        console.warn('Enviando ubicación:', e.message);
      }
    },
    [idRepartidor]
  );

  const dibujarYo = useCallback((punto) => {
    const mapa = mapaRef.current;
    if (!mapa) return;

    if (yoRef.current) {
      yoRef.current.setLatLng([punto.lat, punto.lng]);
      return;
    }

    const icono = L.divIcon({
      className: '',
      html: '<div class="trk-you"><span class="trk-ring"></span><i class="bi bi-bicycle"></i></div>',
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      popupAnchor: [0, -22]
    });

    yoRef.current = L.marker([punto.lat, punto.lng], { icon: icono, zIndexOffset: 1000 })
      .addTo(mapa)
      .bindPopup('<b>Tu ubicación</b><br>Actualizada en tiempo real');
  }, []);

  const mostrarDestino = useCallback((p, coords) => {
    const mapa = mapaRef.current;
    if (!mapa || !coords) return;

    if (destRef.current) mapa.removeLayer(destRef.current);

    const icono = L.divIcon({
      className: 'trk-dest-marker',
      html: '<div class="trk-pin"><i class="bi bi-geo-alt-fill"></i></div>',
      iconSize: [34, 34],
      iconAnchor: [17, 34],
      popupAnchor: [0, -32]
    });

    destRef.current = L.marker([coords.lat, coords.lng], { icon: icono }).addTo(mapa);
    destRef.current.bindPopup(
      `<b>Pedido #${escapar(p.id)}</b><br>${escapar(p.cliente)}<br>${escapar(p.direccion)}`
    );
  }, []);

  const cargarRutaHistorica = useCallback(async (idPedido) => {
    const mapa = mapaRef.current;
    if (!mapa || !idPedido) return;

    try {
      const data = await apiGet(`/ruta/${idPedido}`);
      const ruta = data.ruta || [];

      if (histRef.current) {
        mapa.removeLayer(histRef.current);
        histRef.current = null;
      }
      if (ruta.length < 2) return;

      const puntos = ruta.map((p) => [Number(p.latitud), Number(p.longitud)]);
      histRef.current = L.polyline(puntos, {
        color: '#f59e0b',
        weight: 3,
        opacity: 0.6,
        dashArray: '6 7'
      }).addTo(mapa);
    } catch (e) {
      console.warn('Ruta histórica:', e.message);
    }
  }, []);

  const calcularRuta = useCallback(
    async (origen, dest, forzar = false) => {
      const mapa = mapaRef.current;
      if (!mapa || !origen || !dest) return;

      const ahora = Date.now();
      // La ruta se recalcula como máximo cada 9 s; el ciclo automático de 10 s
      // siempre alcanza a refrescar distancia y tiempo de llegada.
      if (!forzar && ahora - ultimaRutaRef.current < 9000) return;
      ultimaRutaRef.current = ahora;

      try {
        const url =
          'https://router.project-osrm.org/route/v1/driving/' +
          `${origen.lng},${origen.lat};${dest.lng},${dest.lat}` +
          '?overview=full&geometries=geojson';

        const res = await fetch(url);
        const data = await res.json();

        if (!data.routes || !data.routes.length) throw new Error('Sin ruta');

        const coords = data.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);

        if (rutaRef.current) mapa.removeLayer(rutaRef.current);
        rutaRef.current = L.polyline(coords, {
          color: '#22d3ee',
          weight: 5,
          opacity: 0.9,
          lineJoin: 'round',
          lineCap: 'round'
        }).addTo(mapa);

        const km = (data.routes[0].distance / 1000).toFixed(1);
        const min = Math.max(1, Math.round(data.routes[0].duration / 60));

        actualizarMetricas({ distancia: `${km} km`, tiempo: `${min} min` });

        if (forzar) mapa.fitBounds(rutaRef.current.getBounds(), { padding: [55, 55] });
      } catch {
        if (rutaRef.current) mapa.removeLayer(rutaRef.current);
        rutaRef.current = L.polyline(
          [
            [origen.lat, origen.lng],
            [dest.lat, dest.lng]
          ],
          { color: '#22d3ee', weight: 4, opacity: 0.8, dashArray: '10 10' }
        ).addTo(mapa);

        actualizarMetricas({
          distancia: `${(haversine(origen, dest) / 1000).toFixed(1)} km`,
          tiempo: '—'
        });

        if (forzar) {
          mapa.fitBounds(
            [
              [origen.lat, origen.lng],
              [dest.lat, dest.lng]
            ],
            { padding: [55, 55] }
          );
        }
      }
    },
    [actualizarMetricas]
  );

  const limpiarDestino = useCallback(() => {
    const mapa = mapaRef.current;
    destinoCoordRef.current = null;
    destinoClaveRef.current = '';

    if (mapa) {
      [destRef, rutaRef, histRef].forEach((ref) => {
        if (ref.current) {
          mapa.removeLayer(ref.current);
          ref.current = null;
        }
      });
    }

    setDestino(null);
    actualizarMetricas({ distancia: '—', tiempo: '—' });
  }, [actualizarMetricas]);

  const prepararDestino = useCallback(
    async (p, enfocar = false) => {
      if (!p) return;

      let coords =
        p.lat !== null && p.lat !== undefined && p.lng !== null && p.lng !== undefined
          ? { lat: Number(p.lat), lng: Number(p.lng) }
          : null;

      if (!coords) {
        callbacksRef.current.onAviso?.('Buscando la dirección en el mapa…', 'info');
        try {
          const data = await apiGet(`/geocodificar?direccion=${encodeURIComponent(p.direccion)}`);
          if (Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lng))) {
            coords = { lat: Number(data.lat), lng: Number(data.lng) };

            if (p.idDireccion) {
              apiSend('PUT', `/direccion/${p.idDireccion}/coordenadas`, {
                latitud: coords.lat,
                longitud: coords.lng
              }).catch(() => {});
            }
          }
        } catch (e) {
          console.warn('Geocodificación:', e.message);
        }
      }

      if (!coords) {
        callbacksRef.current.onAviso?.('No se pudo ubicar la dirección del pedido', 'warning');
        return;
      }

      destinoCoordRef.current = coords;
      setDestino({ ...coords, pedidoId: p.id });
      mostrarDestino(p, coords);

      const origen = ultimaUbicacionRef.current;
      if (origen) {
        calcularRuta(origen, coords, enfocar);
      } else if (enfocar && mapaRef.current) {
        mapaRef.current.setView([coords.lat, coords.lng], 15);
        destRef.current?.openPopup();
      }

      cargarRutaHistorica(p.id);
    },
    [calcularRuta, cargarRutaHistorica, mostrarDestino]
  );

  // ---------- Inicialización del mapa ----------
  useEffect(() => {
    if (!contenedorRef.current || mapaRef.current) return undefined;

    const mapa = L.map(contenedorRef.current, {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true
    }).setView(CENTRO_MEDELLIN, 13);

    const principal = L.tileLayer(OSM_URL, {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
      minZoom: 10
    }).addTo(mapa);

    let erroresTiles = 0;
    let usandoRespaldo = false;
    principal.on('tileerror', () => {
      erroresTiles += 1;
      if (erroresTiles < 4 || usandoRespaldo) return;
      usandoRespaldo = true;
      mapa.removeLayer(principal);
      L.tileLayer(CARTO_URL, {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20,
        minZoom: 10
      }).addTo(mapa);
    });

    mapaRef.current = mapa;
    setListo(true);

    const temporizador = setTimeout(() => mapa.invalidateSize(), 300);
    const alRedimensionar = () => mapa.invalidateSize();
    window.addEventListener('resize', alRedimensionar);

    return () => {
      clearTimeout(temporizador);
      window.removeEventListener('resize', alRedimensionar);
      try {
        mapa.remove();
      } catch {
        /* ignore */
      }
      mapaRef.current = null;
      yoRef.current = null;
      destRef.current = null;
      rutaRef.current = null;
      histRef.current = null;
    };
  }, []);

  // ---------- GPS ----------
  useEffect(() => {
    if (!navigator.geolocation) {
      actualizarGps('GPS no disponible', 'bad');
      return undefined;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy, speed } = position.coords;
        const punto = { lat: latitude, lng: longitude };

        ultimaUbicacionRef.current = punto;
        ultimoGpsRef.current = Date.now();
        setUbicacion(punto);
        callbacksRef.current.onUbicacion?.(punto);

        actualizarGps(`GPS ${Math.round(accuracy || 0)} m`, '');
        marcarActualizacion();
        dibujarYo(punto);

        const ahora = Date.now();
        const movido =
          !ultimaEnviadaRef.current || haversine(ultimaEnviadaRef.current, punto) > 8;

        if (movido && ahora - ultimoEnvioRef.current > 5000) {
          ultimoEnvioRef.current = ahora;
          ultimaEnviadaRef.current = punto;
          enviarUbicacion(latitude, longitude, accuracy, speed);
        }

        if (destinoCoordRef.current) {
          calcularRuta(punto, destinoCoordRef.current, false);
        }
      },
      (error) => {
        console.warn('GPS:', error.message);
        const textos = {
          1: 'Permiso de ubicación denegado',
          2: 'Ubicación no disponible',
          3: 'Tiempo de GPS agotado'
        };
        actualizarGps(textos[error.code] || 'Error de GPS', 'bad');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 4000 }
    );

    gpsWatchRef.current = watchId;
    return () => {
      if (gpsWatchRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchRef.current);
        gpsWatchRef.current = null;
      }
    };
  }, [actualizarGps, calcularRuta, dibujarYo, enviarUbicacion, marcarActualizacion]);

  // ---------- Última ubicación guardada ----------
  useEffect(() => {
    if (!idRepartidor) return;

    let cancelado = false;
    apiGet(`/ubicacion/${idRepartidor}`)
      .then((data) => {
        if (cancelado || !data.ubicacion || ultimaUbicacionRef.current) return;

        const punto = {
          lat: Number(data.ubicacion.latitud),
          lng: Number(data.ubicacion.longitud)
        };
        if (!Number.isFinite(punto.lat) || !Number.isFinite(punto.lng)) return;

        ultimaUbicacionRef.current = punto;
        setUbicacion(punto);
        dibujarYo(punto);
        mapaRef.current?.setView([punto.lat, punto.lng], 14);
        actualizarGps('Última ubicación guardada', 'warn');
        marcarActualizacion();

        if (destinoCoordRef.current) {
          calcularRuta(punto, destinoCoordRef.current, false);
        }
      })
      .catch(() => {});

    return () => {
      cancelado = true;
    };
  }, [idRepartidor, actualizarGps, calcularRuta, dibujarYo, marcarActualizacion]);

  // ---------- Destino del pedido seleccionado ----------
  useEffect(() => {
    if (!mapaRef.current) return;

    if (!pedido) {
      limpiarDestino();
      return;
    }

    const clave = `${pedido.id}:${pedido.lat}:${pedido.lng}`;
    if (clave === destinoClaveRef.current) return;

    destinoClaveRef.current = clave;
    prepararDestino(pedido, false);
  }, [pedido, limpiarDestino, prepararDestino]);

  // ---------- Reloj "hace Xs" ----------
  useEffect(() => {
    const intervalo = setInterval(() => {
      const ultimo = ultimaActualizacionRef.current;
      setActualizadoHace(
        ultimo ? Math.max(0, Math.floor((Date.now() - ultimo) / 1000)) : null
      );
    }, 1000);
    return () => clearInterval(intervalo);
  }, []);

  // ---------- Refresco automático cada 10 s ----------
  // Mantiene viva la posición y la ruta aunque el GPS del navegador no emita
  // (por ejemplo, el monitor siguiendo a otro repartidor). La posición se
  // recupera del backend y la ruta se vuelve a calcular con OSRM.
  useEffect(() => {
    if (!idRepartidor) return undefined;
    let cancelado = false;

    const refrescar = async () => {
      if (document.visibilityState !== 'visible') return;

      const sinGpsReciente = Date.now() - (ultimoGpsRef.current || 0) > 12000;
      if (sinGpsReciente) {
        try {
          const data = await apiGet(`/ubicacion/${idRepartidor}`);
          const guardada = data.ubicacion;
          if (!cancelado && guardada) {
            const punto = {
              lat: Number(guardada.latitud),
              lng: Number(guardada.longitud)
            };
            if (Number.isFinite(punto.lat) && Number.isFinite(punto.lng)) {
              const anterior = ultimaUbicacionRef.current;
              const seMovio = !anterior || haversine(anterior, punto) > 1;
              ultimaUbicacionRef.current = punto;
              if (seMovio) {
                setUbicacion(punto);
                dibujarYo(punto);
              }
              marcarActualizacion();
            }
          }
        } catch {
          // Sin conexión: se reintenta en el siguiente ciclo.
        }
      }

      if (cancelado) return;

      if (destinoCoordRef.current && ultimaUbicacionRef.current) {
        calcularRuta(ultimaUbicacionRef.current, destinoCoordRef.current, false);
      }

      const actual = pedidoRef.current;
      if (actual) cargarRutaHistorica(actual.id);
    };

    const intervalo = setInterval(refrescar, 10000);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [idRepartidor, calcularRuta, cargarRutaHistorica, dibujarYo, marcarActualizacion]);

  // ---------- Acciones expuestas ----------
  const centrarEnMi = useCallback(() => {
    const punto = ultimaUbicacionRef.current;
    if (!punto || !mapaRef.current) return false;
    mapaRef.current.setView([punto.lat, punto.lng], 16);
    return true;
  }, []);

  const centrarEnDestino = useCallback(() => {
    const dest = destinoCoordRef.current;
    if (!dest || !mapaRef.current) return false;
    mapaRef.current.setView([dest.lat, dest.lng], 16);
    destRef.current?.openPopup();
    return true;
  }, []);

  const verRuta = useCallback(() => {
    const dest = destinoCoordRef.current;
    if (!dest) return false;

    const origen = ultimaUbicacionRef.current;
    if (origen) {
      calcularRuta(origen, dest, true);
    } else if (mapaRef.current) {
      mapaRef.current.setView([dest.lat, dest.lng], 15);
      destRef.current?.openPopup();
    }
    return true;
  }, [calcularRuta]);

  return {
    contenedorRef,
    listo,
    ubicacion,
    destino,
    gps,
    metricas,
    actualizadoHace,
    centrarEnMi,
    centrarEnDestino,
    verRuta
  };
}
