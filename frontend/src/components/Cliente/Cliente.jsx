import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePageScript } from '../../hooks/usePageScript';
import { usePortalNode } from '../../hooks/usePortalNode';
import CampanitaNotificaciones from '../Notificaciones/CampanitaNotificaciones';
import html from './Cliente.html?raw';
import script from './Cliente.script.js?raw';
import './Cliente.css';

export default function Cliente() {
  const campanitaNode = usePortalNode('campanita-root');

  useEffect(() => {
    document.title = "MiMini – Cliente";
  }, []);

  // Ejecuta la lógica original de la página una vez que el HTML ya está en el DOM
  usePageScript(script, "Cliente");

  return (
    <>
      <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html }} />
      {campanitaNode && createPortal(
        <CampanitaNotificaciones rol="cliente" />,
        campanitaNode
      )}
    </>
  );
}
