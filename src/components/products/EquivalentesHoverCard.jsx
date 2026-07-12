import React, { useCallback, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, Star } from 'lucide-react';
import { getEquivalentesDetalle } from '@/lib/equivalentesInfo';

const fmtPrecio = (n) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(n || 0);

/**
 * Badge 🔗 con tarjeta al pasar el mouse: lista los equivalentes del grupo
 * con su existencia en vivo, precio y cuál es el ⭐ preferido. El detalle se
 * carga perezoso (primer hover) vía get_equivalentes_producto.
 *
 * Se usa Popover (no Tooltip) para que la tarjeta sea CLICABLE: si se pasa
 * `onUseEquivalente`, cada fila es un botón "Usar →" que selecciona ese
 * producto (Buscar Producto). Sin el callback es solo informativa (Maestro).
 *
 * props:
 *   productoId       — producto cuyo grupo se consulta
 *   info             — { grupo_nombre, total_miembros, prioridad } (de loadGruposMap)
 *   invert           — true cuando la fila está seleccionada (fondo azul)
 *   onUseEquivalente — opcional: (eq) => void al hacer clic en un equivalente
 */
const EquivalentesHoverCard = ({ productoId, info, invert = false, onUseEquivalente = null }) => {
  const [open, setOpen] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [cargando, setCargando] = useState(false);
  const cerrarTimerRef = useRef(null);

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

  const abrir = () => {
    if (cerrarTimerRef.current) clearTimeout(cerrarTimerRef.current);
    setOpen(true);
    cargar();
  };
  // Pequeño respiro para que el mouse pueda viajar del badge a la tarjeta.
  const cerrarConRetardo = () => {
    if (cerrarTimerRef.current) clearTimeout(cerrarTimerRef.current);
    cerrarTimerRef.current = setTimeout(() => setOpen(false), 200);
  };

  if (!info) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          onMouseEnter={abrir}
          onMouseLeave={cerrarConRetardo}
          onClick={(e) => { e.stopPropagation(); abrir(); }}
          onDoubleClick={(e) => e.stopPropagation()}
          className={`inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[9px] font-bold whitespace-nowrap cursor-help flex-shrink-0 ${
            invert ? 'bg-white/25 text-white' : 'bg-purple-100 text-purple-700'
          }`}
        >
          🔗 {info.total_miembros}
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        className="z-[10001] w-[340px] p-0 bg-white text-slate-800 border border-slate-200 shadow-xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={abrir}
        onMouseLeave={cerrarConRetardo}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
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
              const clicable = !!onUseEquivalente;
              const Fila = clicable ? 'button' : 'div';
              return (
                <Fila
                  key={eq.producto_id}
                  type={clicable ? 'button' : undefined}
                  onClick={clicable ? (e) => {
                    e.stopPropagation();
                    setOpen(false);
                    onUseEquivalente(eq);
                  } : undefined}
                  className={`w-full text-left px-1 py-1 border-b border-slate-50 last:border-b-0 block ${
                    clicable ? 'rounded hover:bg-blue-50 cursor-pointer transition-colors' : ''
                  }`}
                >
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
                    {clicable && (
                      <span className="text-[10px] font-bold text-blue-600 whitespace-nowrap">Usar →</span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-600 truncate">{eq.descripcion}</p>
                </Fila>
              );
            })
          ) : (
            <p className="px-1 py-2 text-[11px] text-slate-500 italic">
              No hay otros productos en este grupo.
            </p>
          )}
        </div>
        <p className="px-3 py-1 text-[9px] text-slate-400 border-t border-slate-100">
          Verde = disponible ahora · ⭐ = preferido{onUseEquivalente ? ' · clic = usar ese producto' : ''}
        </p>
      </PopoverContent>
    </Popover>
  );
};

export default EquivalentesHoverCard;
