import { useEffect } from 'react';
import { usePageScript } from '../../hooks/usePageScript';
import html from './Repartidor.html?raw';
import script from './Repartidor.script.js?raw';
import './Repartidor.css';

export default function Repartidor() {
  useEffect(() => {
    document.title = "MiMini – Repartidor";
  }, []);

  // Ejecuta la lógica original de la página una vez que el HTML ya está en el DOM
  usePageScript(script, "Repartidor");

  return <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html }} />;
}
