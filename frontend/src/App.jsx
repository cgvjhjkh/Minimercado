import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PAGINA_POR_ROL } from './lib/auth';
import PerfilMenu from './components/Perfil/PerfilMenu.jsx';
import { SocketProvider } from './context/SocketContext';

const Inicio = lazy(() => import('./components/Inicio/Inicio.jsx'));
const Cliente = lazy(() => import('./components/Cliente/Cliente.jsx'));
const Empleado = lazy(() => import('./components/Empleado/Empleado.jsx'));
const Administrador = lazy(() => import('./components/Administrador/Administrador.jsx'));
const Repartidor = lazy(() => import('./components/Repartidor/Repartidor.jsx'));
const MapaMonitor = lazy(() => import('./components/Repartidor/MapaMonitor.jsx'));

function leerUsuario() {
  try {
    return JSON.parse(localStorage.getItem('usuario'));
  } catch {
    return null;
  }
}

const normalizarRol = (rol) => (rol === 'administrador' ? 'admin' : rol);

function RutaProtegida({ rol, roles, children }) {
  const usuario = leerUsuario();
  if (!usuario) return <Navigate to="/" replace />;
  const rolActual = normalizarRol(usuario.rol);
  const permitidos = (roles || [rol]).map(normalizarRol);
  if (!permitidos.includes(rolActual)) {
    return <Navigate to={PAGINA_POR_ROL[usuario.rol] || '/'} replace />;
  }
  window.usuarioActual = usuario;
  return children;
}

export default function App() {
  const usuario = leerUsuario();
  const rol = usuario ? (usuario.rol === 'administrador' ? 'admin' : usuario.rol) : null;
  const id_usuario = usuario ? usuario.id_usuario : null;

  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/cliente" element={<RutaProtegida rol="cliente"><Cliente /></RutaProtegida>} />
        <Route path="/empleado" element={<RutaProtegida rol="empleado"><Empleado /></RutaProtegida>} />
        <Route path="/administrador" element={<RutaProtegida rol="admin"><Administrador /><PerfilMenu /></RutaProtegida>} />
        <Route path="/repartidor" element={<RutaProtegida rol="repartidor"><Repartidor /></RutaProtegida>} />
        <Route path="/repartidor/mapa" element={<RutaProtegida roles={['repartidor', 'admin']}><MapaMonitor /></RutaProtegida>} />

        <Route path="/index.html" element={<Navigate to="/" replace />} />
        <Route path="/cliente.html" element={<Navigate to="/cliente" replace />} />
        <Route path="/empleado.html" element={<Navigate to="/empleado" replace />} />
        <Route path="/administrador.html" element={<Navigate to="/administrador" replace />} />
        <Route path="/repartidor.html" element={<Navigate to="/repartidor" replace />} />
        <Route path="/mapa.html" element={<Navigate to="/repartidor/mapa" replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}