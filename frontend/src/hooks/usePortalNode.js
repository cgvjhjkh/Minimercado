import { useEffect, useState } from 'react';

// Las pantallas clásicas inyectan su HTML con dangerouslySetInnerHTML.
// El nodo destino existe recién después del commit, por eso se busca en un
// efecto y se devuelve por estado para poder usar createPortal.
export function usePortalNode(id) {
  const [node, setNode] = useState(null);

  useEffect(() => {
    setNode(document.getElementById(id) || null);
    return () => setNode(null);
  }, [id]);

  return node;
}
