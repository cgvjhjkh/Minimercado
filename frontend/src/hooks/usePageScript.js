import { useEffect } from 'react';

// Las pantallas (cliente, empleado, administrador, repartidor) conservan su lógica original,
// que usa funciones globales (onclick="...") y variables de nivel superior.
// Este hook inyecta ese código como <script> clásico cuando el HTML ya está montado.
export function usePageScript(code, name) {
  useEffect(() => {
    // Si el componente se vuelve a montar (p. ej. HMR en desarrollo) el script ya declaró
    // sus variables globales: se recarga la página para empezar limpio.
    if (window.__minimercadoPage) {
      window.location.reload();
      return;
    }
    window.__minimercadoPage = name;

    const script = document.createElement('script');
    script.setAttribute('data-page', name);
    script.textContent = code;
    document.body.appendChild(script);

    return () => script.remove();
  }, [code, name]);
}
