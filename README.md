# Minimercado

Sistema de minimercado con rastreo de pedidos en tiempo real.

```
Minimercado/
├── backend/            API Express + HTTP + Socket.io + MySQL2
│   └── src/
│       ├── config/db.js               conexión a MySQL (pool + tablas de rastreo)
│       ├── routes/adminUsuarios.js    CRUD de usuarios (contraseña con bcrypt)
│       ├── utils/password.js          hash / verificación bcrypt + legacy
│       ├── sockets/tracking.js        eventos de Socket.io para el rastreo
│       └── server.js                  Express, rutas /api y arranque
├── frontend/           React + Vite
│   ├── public/img/                    imágenes
│   └── src/
│       ├── components/                Inicio, Cliente, Empleado, Administrador, Repartidor
│       ├── hooks/usePageScript.js
│       ├── lib/auth.js                login / registro (antes script.js)
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

## Rutas del frontend

`/` inicio y login · `/cliente` · `/empleado` · `/administrador` · `/repartidor`
Cada ruta exige sesión y el rol correspondiente (si no, redirige).
