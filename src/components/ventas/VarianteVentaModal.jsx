// Color y Unidad/Pies al facturar (09/11/2026, como "Nueva Factura" de Desglo).
// SOLO empresas tipo 'aluminio' (VentasPage lo abre). Si el producto no tiene
// colores ni largo de barra, no se muestra nada: se agrega directo.
// · Color: cada color es su propio producto con su existencia.
// · Pies: la cantidad es la fracción de barra (5 pies de 20 = 0.25); el
//   precio queda el de la barra y el importe sale proporcional.
// SQL: sql/ventanas_variantes.sql (vent_variantes).
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Minus, Plus, Package, Ruler, Check } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const fmt = (v) => `RD$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r4 = (v) => Math.round(v * 10000) / 10000;

export default function VarianteVentaModal({ producto, onCancelar, onAgregar, onDirecto }) {
  const [cargando, setCargando] = useState(true);
  const [variantes, setVariantes] = useState([]);
  const [elegido, setElegido] = useState(null);
  const [modo, setModo] = useState('unidad');
  const [cantidad, setCantidad] = useState('1');

  useEffect(() => {
    let vivo = true;
    (async () => {
      // Una sola llamada: el largo de barra (el buscador no lo trae) y los colores.
      const { data, error } = await supabase.rpc('vent_variantes', { p_producto: producto.id });
      if (!vivo) return;
      const lista = !error && Array.isArray(data?.variantes) ? data.variantes : [];
      const largoPropio = Number(data?.largo_pies) || 0;
      if (!lista.length && !largoPropio) { onDirecto(); return; }   // producto normal: directo
      setVariantes(lista);
      setElegido(lista.find((v) => v.id === producto.id) || (lista.length ? null : {
        id: producto.id, codigo: producto.codigo, descripcion: producto.descripcion, color: null,
        precio: producto.precio, largo_pies: largoPropio, existencia: producto.existencia ?? null,
      }));
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [producto]); // eslint-disable-line react-hooks/exhaustive-deps

  const largo = Number(elegido?.largo_pies) || 0;
  const n = Number(cantidad) || 0;
  const fraccion = modo === 'pies' && largo ? r4(n / largo) : n;
  const total = useMemo(() => (Number(elegido?.precio) || 0) * fraccion, [elegido, fraccion]);
  const nombreBase = producto.descripcion;

  if (cargando) return null;

  const agregar = () => {
    if (!elegido) return;
    if (!(n > 0)) return;
    onAgregar({
      productoId: elegido.id,
      cantidad: fraccion,
      nota: modo === 'pies' ? `${n} PIES` : null,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onCancelar()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="leading-tight">{nombreBase}</DialogTitle></DialogHeader>
        <div className="text-sm text-blue-700 font-semibold -mt-2">{fmt(elegido?.precio)} / {largo ? `barra de ${largo}'` : 'unidad'}</div>

        {largo > 0 && (
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
            {[['unidad', 'Unidad', Package], ['pies', 'Pies', Ruler]].map(([k, t, Icon]) => (
              <button key={k} type="button" onClick={() => { setModo(k); setCantidad(k === 'pies' ? String(largo) : '1'); }}
                className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-semibold ${modo === k ? 'bg-blue-700 text-white' : 'text-gray-600'}`}>
                <Icon className="w-4 h-4" /> {t}
              </button>
            ))}
          </div>
        )}

        {variantes.length > 0 && (
          <div>
            <div className="text-xs font-bold text-gray-600 mb-1">Color</div>
            <div className="flex flex-wrap gap-1.5">
              {variantes.map((v) => {
                const ex = Number(v.existencia) || 0;
                const sel = elegido?.id === v.id;
                return (
                  <button key={v.id} type="button" onClick={() => setElegido(v)}
                    className={`px-3 py-1.5 rounded-lg border text-sm flex items-center gap-1.5 ${sel ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-400' : 'border-gray-300 bg-white'}`}>
                    {sel && <Check className="w-3.5 h-3.5 text-blue-700" />}
                    <b>{v.color}</b>
                    <span className={`text-[11px] ${ex > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{ex > 0 ? ex : 'Sin stock'}</span>
                  </button>
                );
              })}
            </div>
            {!elegido && <div className="text-xs text-amber-700 mt-1">Escoge el color.</div>}
          </div>
        )}

        <div>
          <div className="text-xs font-bold text-gray-600 mb-1">{modo === 'pies' ? 'Cantidad de pies' : 'Cantidad de unidades'}</div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setCantidad(String(Math.max(0, n - 1)))}><Minus className="w-4 h-4" /></Button>
            <input className="h-9 w-24 text-center rounded-md border border-gray-300 text-base font-semibold" inputMode="decimal" value={cantidad} autoFocus
              onChange={(e) => setCantidad(e.target.value.replace(/[^\d.]/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }} />
            <Button type="button" variant="outline" size="sm" onClick={() => setCantidad(String(n + 1))}><Plus className="w-4 h-4" /></Button>
            {modo === 'pies' && largo > 0 && <span className="text-xs text-gray-500">= {fraccion} de barra</span>}
          </div>
          {modo === 'pies' && n > largo && <div className="text-xs text-amber-700 mt-1">Más pies que una barra: se cobra como {fraccion} barras.</div>}
        </div>

        <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 flex items-center justify-between">
          <div className="text-sm text-gray-600">Total a agregar<br /><b>{modo === 'pies' ? `${n} pies` : `${n} unidad(es)`}</b></div>
          <div className="text-xl font-black text-blue-800">{fmt(total)}</div>
        </div>
        <p className="text-[11px] text-gray-500 -mt-1">Al agregarlo se aplica el precio del nivel del cliente, si tiene.</p>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
          <Button onClick={agregar} disabled={!elegido || !(n > 0)}>Agregar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
