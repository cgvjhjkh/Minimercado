# Minimercado

Sistema de minimercado con rastreo de pedidos en tiempo real.

```
Minimercado/
├── backend/            API Express + HTTP + Socket.io + MySQL2
│   └── src/
│       ├── config/db.js               conexión a MySQL (pool de conexiones)
│       ├── config/schema.js           migraciones de repartidores/rastreo (idempotentes)
│       ├── routes/adminUsuarios.js    CRUD de usuarios (contraseña con bcrypt)
│       ├── routes/repartidor.js       API del repartidor (pedidos, GPS, estadísticas)
│       ├── utils/password.js          hash / verificación bcrypt + legacy
│       ├── sockets/tracking.js        eventos de Socket.io para el rastreo
│       └── server.js                  Express, rutas /api y arranque
├── frontend/           React + Vite
│   ├── public/img/                    imágenes
│   └── src/
│       ├── components/                Inicio, Cliente, Empleado, Administrador, Repartidor
│       │   └── Repartidor/            panel React + monitor a pantalla completa
│       ├── hooks/usePageScript.js
│       ├── hooks/useRepartidor.js     pedidos, estados, perfil y disponibilidad
│       ├── hooks/useTrackingMap.js    mapa Leaflet + GPS + ruta OSRM
│       ├── lib/auth.js                login / registro (antes script.js)
│       ├── lib/repartidorApi.js       cliente HTTP/socket y modelo de pedido
│       ├── App.jsx                    rutas y guardia de sesión por rol
│       └── main.jsx
├── scripts/dev.js      arranca backend + frontend a la vez
└── start-dev.bat       atajo de Windows (doble clic)
```

## Puesta en marcha (desarrollo)

Necesitas Node.js 18+ y un MySQL/MariaDB con la base `minimercado`.

**Opción rápida en Windows:** doble clic en `start-dev.bat`.

**Opción con npm (desde la raíz del proyecto):**

```bash
npm run instalar     # solo la primera vez (instala backend y frontend)
npm run dev          # levanta backend (3000) y frontend (5173) juntos
```

**Opción manual (dos terminales):**

```bash
# Terminal 1 – backend (http://localhost:3000)
cd backend
copy .env.example .env      # ajusta usuario/contraseña de MySQL
npm install
npm run dev

# Terminal 2 – frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```

Abre **http://localhost:5173**. Vite reenvía `/api` y `/socket.io` al backend.

> Si abres `http://localhost:3000` sin haber compilado el frontend verás una
> página de ayuda: es el backend funcionando sin `frontend/dist`.

## Producción (un solo servidor)

```bash
npm run build                  # genera frontend/dist
npm start                      # API + frontend en http://localhost:3000
```

## Variables de entorno (backend/.env)

`PORT`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
(por defecto: localhost, 3306, root, root, minimercado).
Si MySQL no está disponible el servidor arranca en modo demo y la API responde 503.

## Usuarios y contraseñas

- Las contraseñas nuevas se guardan **encriptadas con bcrypt**.
- El login acepta bcrypt y también contraseñas antiguas en texto plano; al entrar
  una cuenta legacy se re-encripta automáticamente.
- El panel de administración **nunca** recibe ni muestra `contrasena_hash`.

### API de usuarios (panel de administración)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/admin/usuarios` | Lista real desde MySQL (sin contraseñas) |
| POST | `/api/admin/usuarios` | Crea usuario; roles: `empleado`, `repartidor`, `admin` |
| PUT | `/api/admin/usuarios/:id` | Edita datos (contraseña opcional) |
| PATCH | `/api/admin/usuarios/:id/estado` | Activa / desactiva (`activo`, `inactivo`, `suspendido`) |
| DELETE | `/api/admin/usuarios/:id` | Elimina (bloqueado si tiene pedidos asociados) |

Protecciones incluidas: correo único, validación de rol, contraseña mínima de 6
caracteres y no se puede desactivar/eliminar al último administrador activo.

## Módulo de repartidor

El panel `/repartidor` y el monitor `/repartidor/mapa` se implementaron en React
sobre la misma API del backend. Incluyen pedidos asignados, cambio de estado,
disponibilidad, perfil, estadísticas y rastreo GPS en tiempo real con mapa
Leaflet, cálculo de ruta (OSRM) y ruta histórica guardada en MySQL.

La asignación de pedidos **solo la puede hacer un administrador** (la API
rechaza la auto-asignación desde el panel del repartidor). Los estados
`preparando` y `cancelado` también están reservados a admin/empleado.

### API del repartidor

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/repartidor/:id/pedidos` | Pedidos asignados; `?todos=1` incluye historial |
| GET | `/api/repartidor/:id/pedidos-disponibles` | Pedidos sin asignar |
| PUT | `/api/repartidor/pedido/:id/asignar` | Asigna pedido (requiere `from_admin`) |
| PUT | `/api/repartidor/pedido/:id/estado` | Cambia el estado del pedido |
| GET | `/api/repartidor/:id/estadisticas` | Entregas, recaudado y ganancia (8 %) |
| PUT | `/api/repartidor/:id/disponibilidad` | Activa / pausa al repartidor |
| PUT | `/api/repartidor/:id/perfil` | Nombre, teléfono y vehículo |
| GET | `/api/repartidor/:id` | Datos del repartidor con su usuario |
| POST | `/api/ubicacion/actualizar` | Guarda y emite la ubicación GPS |
| GET | `/api/ubicacion/:id` | Última ubicación conocida |
| GET | `/api/ubicacion/:id/historial` | Historial de puntos (`?limit=`) |
| GET | `/api/ruta/:id_pedido` | Ruta histórica del pedido |
| GET | `/api/geocodificar?direccion=` | Geocodificación con Nominatim (cacheada) |

### Eventos Socket.io

`pedido_asignado`, `pedido_estado_actualizado`, `pedido_completado`,
`pedido_finalizado`, `repartidor_disponibilidad`, `ubicacion_actualizada` y
`mi_ubicacion`. El panel se une a la room `repartidor_<id>` con
`repartidor_conectado` / `unirse_repartidor`.

## Rutas del frontend

`/` inicio y login · `/cliente` · `/empleado` · `/administrador` ·
`/repartidor` · `/repartidor/mapa` (monitor; también para `admin`)
Cada ruta exige sesión y el rol correspondiente (si no, redirige). Las rutas
antiguas tipo `/repartidor.html` o `/mapa.html` se redirigen a las nuevas.
