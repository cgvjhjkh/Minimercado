import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePageScript } from '../../hooks/usePageScript';
import { usePortalNode } from '../../hooks/usePortalNode';
import CampanitaNotificaciones from '../Notificaciones/CampanitaNotificaciones';
import html from './Empleado.html?raw';
import script from './Empleado.script.js?raw';
import './Empleado.css';

export default function Empleado() {
  const campanitaNode = usePortalNode('campanita-root');

  useEffect(() => {
    document.title = "MiMini – Empleado";
  }, []);

  // Ejecuta la lógica original de la página una vez que el HTML ya está en el DOM
  usePageScript(script, "Empleado");

  return (
    <>
      <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html }} />
      {campanitaNode && createPortal(
        <CampanitaNotificaciones rol="empleado" />,
        campanitaNode
      )}
    </>
  );
}
