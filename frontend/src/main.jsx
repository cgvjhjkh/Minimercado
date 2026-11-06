import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import * as bootstrap from 'bootstrap';
import App from './App.jsx';

// Los scripts de las pantallas usan `bootstrap.Modal` como variable global
window.bootstrap = bootstrap;

// Sin <StrictMode>: la lógica de las pantallas debe ejecutarse una sola vez por carga
createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
