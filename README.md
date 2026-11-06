# Minimercado

Sistema de minimercado con rastreo de pedidos en tiempo real.

```
Minimercado/
├── backend/            API Express + HTTP + Socket.io + MySQL2
│   └── src/
│       ├── config/db.js          conexión a MySQL (pool + tablas de rastreo)
│       ├── sockets/tracking.js   eventos de Socket.io para el rastreo
│       └── server.js             Express, rutas /api y arranque
└── frontend/           React + Vite
    ├── public/img/               imágenes
    └── src/
        ├── components/           Inicio, Cliente, Empleado, Administrador, Repartidor
        ├── hooks/usePageScript.js
        ├── lib/auth.js           login / registro (antes script.js)
        ├── App.jsx               rutas y guardia de sesión por rol
        └── main.jsx
```

## Puesta en marcha (desarrollo)

Necesitas Node.js 18+ y un MySQL/MariaDB con la base `minimercado`.

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

Abre http://localhost:5173. Vite reenvía `/api` y `/socket.io` al backend.

## Producción (un solo servidor)

```bash
cd frontend && npm run build
cd ../backend && npm start      # sirve la API y frontend/dist en http://localhost:3000
```

## Variables de entorno (backend/.env)

`PORT`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
(por defecto: localhost, 3306, root, root, minimercado).
Si MySQL no está disponible el servidor arranca en modo demo y la API responde 503.

## Rutas del frontend

`/` inicio y login · `/cliente` · `/empleado` · `/administrador` · `/repartidor`
Cada ruta exige sesión y el rol correspondiente (si no, redirige).
