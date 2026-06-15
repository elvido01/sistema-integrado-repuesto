// panelCore.js — Context + hook de paneles SIN importar páginas.
//
// Existe para romper los import cycles que Graphify detectó entre
// PanelContext.jsx (que importa páginas para `componentMapping`) y las
// páginas que necesitan `usePanels()`. Las páginas importan de aquí
// (panelCore) en vez de PanelContext.jsx, así no participan del ciclo.
//
// PanelContext.jsx sigue exponiendo los mismos símbolos vía re-export,
// para no romper consumidores existentes (32 archivos).

import { createContext, useContext } from 'react';

export const PanelContext = createContext(null);

export const usePanels = () => {
  const ctx = useContext(PanelContext);
  if (!ctx) {
    throw new Error('usePanels must be used within PanelProvider');
  }
  return ctx;
};
