import { useEffect, useRef } from 'react';
import { initAuthUI } from '../../lib/auth';
import html from './Inicio.html?raw';
import './Inicio.css';

export default function Inicio() {
  const iniciado = useRef(false);

  useEffect(() => {
    document.title = "Minimercado";
    if (iniciado.current) return;
    iniciado.current = true;
    initAuthUI();
  }, []);

  return <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html }} />;
}
