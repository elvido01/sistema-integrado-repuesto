import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Package, PackageX, Star, AlertTriangle } from 'lucide-react';

const SugerenciasEquivalentesModal = ({
  isOpen,
  onClose,
  productoOriginal,   // { codigo, descripcion, existencia }
  sugerencias,        // array de { id, codigo, descripcion, existencia, precio, costo, itbis_pct, es_preferido, margen_pct, grupo_nombre }
  onSelectSugerencia, // (producto) => void  -- reemplaza el item actual
}) => {
  // El cajero factura a punta de Enter; el aviso no debe reaccionar a esa
  // tecla, y durante los primeros ms tampoco a nada (Enter "en vuelo").
  const [armed, setArmed] = useState(false);
  const contentRef = useRef(null);
  useEffect(() => {
    if (!isOpen) { setArmed(false); return undefined; }
    const t = setTimeout(() => setArmed(true), 400);
    // Bloqueo GLOBAL en fase captura: si el foco quedara en la fila amarilla
    // del POS, Enter/Espacio seguirían avanzando cantidad→precio→agregar por
    // debajo del aviso. Aquí mueren antes de llegar a cualquier handler.
    const bloquear = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', bloquear, true);
    window.addEventListener('keyup', bloquear, true);
    window.addEventListener('keypress', bloquear, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', bloquear, true);
      window.removeEventListener('keyup', bloquear, true);
      window.removeEventListener('keypress', bloquear, true);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const grupoNombre = sugerencias?.[0]?.grupo_nombre || '';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        ref={contentRef}
        tabIndex={-1}
        className="max-w-2xl"
        onOpenAutoFocus={(e) => {
          // Sin foco en botones (Enter no activa nada), pero el foco SÍ debe
          // salir del POS: si se queda en la fila amarilla, las teclas que el
          // cajero siga tecleando (dígitos incluidos) caerían en esos campos.
          e.preventDefault();
          setTimeout(() => contentRef.current?.focus(), 0);
        }}
        onEscapeKeyDown={(e) => { if (!armed) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (!armed) e.preventDefault(); }}
        onKeyDownCapture={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Producto agotado — hay equivalentes con stock
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Producto original */}
          <div className="bg-red-50 border border-red-200 rounded p-2">
            <div className="flex items-center gap-2">
              <PackageX className="h-4 w-4 text-red-600" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-red-800 truncate">
                  {productoOriginal?.codigo} — {productoOriginal?.descripcion}
                </p>
                <p className="text-[10px] text-red-600">
                  Existencia: {productoOriginal?.existencia ?? 0}
                </p>
              </div>
            </div>
          </div>

          {grupoNombre && (
            <p className="text-xs text-slate-600">
              Grupo: <b>{grupoNombre}</b> · Estos equivalentes están disponibles:
            </p>
          )}

          {/* Sugerencias */}
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {sugerencias?.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  if (!armed) return;
                  onSelectSugerencia(s);
                  onClose();
                }}
                className={`w-full text-left p-2 rounded border-2 transition-all hover:shadow-md ${
                  s.es_preferido
                    ? 'border-amber-300 bg-amber-50 hover:bg-amber-100'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <Package className={`h-5 w-5 flex-shrink-0 mt-0.5 ${s.es_preferido ? 'text-amber-600' : 'text-slate-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-bold text-slate-800 truncate">
                        {s.codigo}
                      </span>
                      {s.es_preferido && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded-full font-bold">
                          <Star className="h-2.5 w-2.5 fill-amber-700" />
                          PREFERIDO
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-700 truncate">{s.descripcion}</p>
                    <div className="flex items-center gap-3 mt-1 text-[10px]">
                      <span className="text-green-700 font-semibold">
                        📦 {Number(s.existencia).toFixed(0)} und.
                      </span>
                      <span className="text-blue-700 font-semibold">
                        ${Number(s.precio).toFixed(2)}
                      </span>
                      {s.margen_pct > 0 && (
                        <span className="text-slate-500">
                          margen {Number(s.margen_pct).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] text-blue-600 font-semibold whitespace-nowrap">
                    Usar →
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="flex justify-between pt-1">
            <Button variant="outline" size="sm" onClick={() => { if (armed) onClose(); }}>
              No, mantener original
            </Button>
            <p className="text-[10px] text-slate-400 self-center">
              Esc mantiene el original · Enter no hace nada aquí
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SugerenciasEquivalentesModal;
