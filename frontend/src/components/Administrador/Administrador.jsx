import { useEffect } from 'react';
import { usePageScript } from '../../hooks/usePageScript';
import html from './Administrador.html?raw';
import script from './Administrador.script.js?raw';
import './Administrador.css';

export default function Administrador() {
  useEffect(() => {
    document.title = "MiMini – Administrador";
  }, []);

  // Ejecuta la lógica original de la página una vez que el HTML ya está en el DOM
  usePageScript(script, "Administrador");

  return <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html }} />;
}
