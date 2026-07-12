import React, { useCallback, useState } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Star } from 'lucide-react';
import { getEquivalentesDetalle } from '@/lib/equivalentesInfo';

const fmtPrecio = (n) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(n || 0);

/**
 * Badge 🔗 con tarjeta de detalle al pasar el mouse: lista los equivalentes
 * del grupo con su existencia en vivo, precio y cuál es el ⭐ preferido.
 * El detalle se carga perezoso (primer hover) vía get_equivalentes_producto.
 *
 * props:
 *   productoId  — producto cuyo grupo se consulta
 *   info        — { grupo_nombre, total_miembros, prioridad } (de loadGruposMap)
 *   invert      — true cuando la fila está seleccionada (fondo azul)
 */
const EquivalentesHoverCard = ({ productoId, info, invert = false }) => {
  const [detalle, setDetalle] = useState(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    if (cargando) return;
    setCargando(true);
    try {
      setDetalle(await getEquivalentesDetalle(productoId));
    } catch (_) {
      setDetalle([]);
    } finally {
      setCargando(false);
    }
  }, [productoId, cargando]);

  if (!info) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            onMouseEnter={cargar}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            className={`inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[9px] font-bold whitespace-nowrap cursor-help flex-shrink-0 ${
              invert ? 'bg-white/25 text-white' : 'bg-purple-100 text-purple-700'
            }`}
          >
            🔗 {info.total_miembros}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          className="z-[10001] max-w-[340px] p-0 bg-white text-slate-800 border border-slate-200 shadow-xl"
        >
          <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 rounded-t-md">
            <p className="text-xs font-bold text-slate-800">{info.grupo_nombre}</p>
            <p className="text-[10px] text-slate-500">
              {info.total_miembros} en el grupo
              {info.prioridad === 1 && ' · ⭐ este es el preferido'}
            </p>
          </div>
          <div className="px-2 py-1.5 max-h-64 overflow-y-auto">
            {(cargando && !detalle) ? (
              <div className="flex items-center gap-2 px-1 py-2 text-[11px] text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando equivalentes…
              </div>
            ) : (detalle && detalle.length > 0) ? (
              detalle.map((eq) => {
                const conStock = Number(eq.existencia) > 0;
                return (
                  <div key={eq.producto_id} className="px-1 py-1 border-b border-slate-50 last:border-b-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-blue-900">{eq.codigo}</span>
                      {eq.prioridad === 1 && (
                        <Star className="h-3 w-3 text-amber-500 fill-amber-400 flex-shrink-0" />
                      )}
                      <span className={`ml-auto text-[10px] font-bold whitespace-nowrap ${conStock ? 'text-green-700' : 'text-red-600'}`}>
                        {Number(eq.existencia).toFixed(0)} und.
                      </span>
                      <span className="text-[10px] font-semibold text-blue-700 whitespace-nowrap">
                        {fmtPrecio(eq.precio)}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-600 truncate">{eq.descripcion}</p>
                  </div>
                );
              })
            ) : (
              <p className="px-1 py-2 text-[11px] text-slate-500 italic">
                No hay otros productos en este grupo.
              </p>
            )}
          </div>
          <p className="px-3 py-1 text-[9px] text-slate-400 border-t border-slate-100">
            Verde = disponible ahora · ⭐ = preferido del grupo
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default EquivalentesHoverCard;
