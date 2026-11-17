import { useEffect } from 'react';
import { usePageScript } from '../../hooks/usePageScript';
import html from './Cliente.html?raw';
import script from './Cliente.script.js?raw';
import './Cliente.css';

export default function Cliente() {
  useEffect(() => {
    document.title = "MiMini – Cliente";
  }, []);

  // Ejecuta la lógica original de la página una vez que el HTML ya está en el DOM
  usePageScript(script, "Cliente");

  return <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html }} />;
}
