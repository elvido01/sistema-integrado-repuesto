import React, { Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePanels } from '@/contexts/PanelContext';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import HomePage from '@/pages/HomePage';

// (11/10/2026) Las pantallas se cargan al abrirlas (React.lazy en PanelContext).
// Tras publicar una versión nueva, una pestaña que siguiera abierta pide
// archivos que ya no existen ("Failed to fetch dynamically imported module"):
// se recarga la página (como máximo una vez por minuto) y abre la versión nueva.
const ES_ARCHIVO_VIEJO = /dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError/i;
class PantallaSegura extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  // (15/10/2026) Ya NO se recarga sola: recargar tiraba lo que hubiera a
  // medias en otras pantallas (una venta). Se precargan todas al entrar
  // (precargarPantallas) y, si aun así falla, el botón deja decidir cuándo.
  componentDidCatch(error) {
    if (ES_ARCHIVO_VIEJO.test(String(error?.message || error))) {
      console.warn('Pantalla de una versión anterior:', error?.message);
    }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-600">
          <div>
            <p className="mb-2 font-semibold">No se pudo abrir esta pantalla.</p>
            <p className="mb-3 text-xs text-slate-500">Puede que MotoFlow se haya actualizado. Recarga la página (Ctrl+F5).</p>
            <button type="button" className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white" onClick={() => window.location.reload()}>Recargar</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
const Cargando = () => (
  <div className="flex h-full items-center justify-center text-sm text-slate-400">Cargando…</div>
);

const PanelManager = () => {
  const { panels, activePanel, setActivePanel, closePanel } = usePanels();

  const getIcon = (panel) => {
    const Icon = panel.icon;
    return <Icon className="w-4 h-4 mr-2" />;
  };

  console.log("Panels:", panels, "Active:", activePanel);
  return (
    <div className="h-full flex flex-col bg-slate-100 dark:bg-gray-900">
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-1 p-1 bg-slate-200 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700">
          {panels.map((panel) => (
            <motion.div
              key={panel.id}
              layout
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Button
                variant="ghost"
                onClick={() => setActivePanel(panel.id)}
                className={cn(
                  'h-8 px-3 text-xs flex items-center',
                  activePanel === panel.id
                    ? 'bg-slate-100 dark:bg-gray-700 shadow-sm font-semibold border-t border-l border-r border-gray-300 rounded-b-none'
                    : 'hover:bg-slate-300 dark:hover:bg-gray-700 text-gray-600'
                )}
              >
                {getIcon(panel)}
                {panel.name}
                {panel.id !== 'inicio' && (
                  <X
                    className="w-3 h-3 ml-2 text-gray-500 dark:text-gray-400 hover:text-red-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      closePanel(panel.id);
                    }}
                  />
                )}
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="flex-grow relative overflow-hidden">
        {panels.map((panel) => {
          const PanelComponent = panel.component;
          const isActive = activePanel === panel.id;

          return (
            <div
              key={panel.id}
              className={cn(
                "absolute inset-0 w-full h-full min-w-0 transition-opacity duration-200 bg-slate-100 dark:bg-gray-900",
                panel.id === 'whatsapp-crm' ? 'p-0 overflow-hidden' : 'p-4 overflow-auto',
                isActive
                  ? "opacity-100 z-10 pointer-events-auto shadow-sm"
                  : "opacity-0 z-0 pointer-events-none"
              )}
            >
              <PantallaSegura>
                <Suspense fallback={<Cargando />}>
                  <PanelComponent extraData={panel.extraData} panelId={panel.id} />
                </Suspense>
              </PantallaSegura>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PanelManager;

