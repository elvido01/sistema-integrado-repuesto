// Presupuesto de un proyecto de ventanas (09/11/2026): cada ventana con su
// precio (Ventanas → Precios: por pie² con mínimo, o por unidad), los extras
// del catálogo (mano de obra, screen, llavines…) y el total con ITBIS.
// "Crear cotización" arma la cotización de siempre (vent_crear_cotizacion)
// y el proyecto pasa a "cotizado".
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, FileText, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { usePanels } from '@/contexts/PanelContext';
import { Button } from '@/components/ui/button';
import MontoInput from '@/components/ui/MontoInput';
import BuscarProducto from '@/components/ventanas/BuscarProducto';
import { presupuestoProyecto, pulgadasTexto, cobroTexto } from '@/lib/ventanas';

const fmt = (v) => `RD$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const campo = 'h-8 rounded-md border border-gray-300 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300';

export default function PresupuestoProyecto({ proyecto, medidas, nombreSistema, tenantId, onError, onCotizado, piezasPorSistema = {} }) {
  const { openPanel } = usePanels();
  const [precios, setPrecios] = useState([]);
  const [extras, setExtras] = useState([]);
  const [cot, setCot] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [nuevo, setNuevo] = useState({ producto: null, cantidad: '1', precio: '' });
  const [dias, setDias] = useState('15');
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [pr, ex, ct] = await Promise.all([
      supabase.from('vent_precios').select('*').eq('tenant_id', tenantId),
      supabase.from('vent_proyecto_extras').select('*, productos(codigo, descripcion)').eq('proyecto_id', proyecto.id).eq('tenant_id', tenantId).order('orden').order('created_at'),
      proyecto.cotizacion_id
        ? supabase.from('cotizaciones').select('id, numero, total_cotizacion, estado').eq('id', proyecto.cotizacion_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setCargando(false);
    setPrecios(pr.data || []);
    setExtras(ex.data || []);
    setCot(ct.data || null);
  }, [tenantId, proyecto.id, proyecto.cotizacion_id]);
  useEffect(() => { cargar(); }, [cargar]);

  const calc = useMemo(() => presupuestoProyecto(medidas, precios, extras, piezasPorSistema), [medidas, precios, extras, piezasPorSistema]);

  const agregarExtra = async () => {
    if (!nuevo.producto) return onError('Falta el producto', 'Busca el producto del catálogo.');
    const cantidad = Number(nuevo.cantidad) || 0;
    const precio = Number(nuevo.precio === '' ? nuevo.producto.precio : nuevo.precio) || 0;
    if (cantidad <= 0) return onError('Cantidad no válida', 'Pon una cantidad mayor que cero.');
    const { error } = await supabase.from('vent_proyecto_extras').insert({
      tenant_id: tenantId, proyecto_id: proyecto.id, producto_id: nuevo.producto.id, cantidad, precio, orden: extras.length + 1,
    }).select('id');
    if (error) return onError('No se agregó', error.message);
    setNuevo({ producto: null, cantidad: '1', precio: '' });
    cargar();
    return undefined;
  };

  const quitarExtra = async (e) => {
    const { data, error } = await supabase.from('vent_proyecto_extras').delete().eq('id', e.id).eq('tenant_id', tenantId).select('id');
    if (error || !data?.length) { onError('No se pudo quitar', error?.message || 'Sin permiso'); return; }
    setExtras((xs) => xs.filter((x) => x.id !== e.id));
  };

  const crearCotizacion = async () => {
    if (cot && !window.confirm(`Este proyecto ya tiene la cotización ${cot.numero}. ¿Crear otra nueva con los precios de ahora?`)) return;
    setCreando(true);
    const { data, error } = await supabase.rpc('vent_crear_cotizacion', { p_proyecto: proyecto.id, p_dias_vigencia: parseInt(dias, 10) || 15 });
    setCreando(false);
    if (error) { onError('No se pudo crear la cotización', error.message); return; }
    onCotizado?.(data);
    cargar();
  };

  if (cargando) return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>;
  if (!medidas.length) return <div className="py-10 text-center text-sm text-gray-400">Primero agrega las medidas.</div>;

  return (
    <div className="space-y-4">
      {calc.faltan.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Sin precio: {[...new Set(calc.faltan.map((m) => `${nombreSistema(m.sistema_id)}${m.color ? ` ${m.color}` : ''}`))].join(', ')}.
            Ponlo en <button type="button" className="underline font-semibold" onClick={() => openPanel('vent-precios')}>Ventanas → Precios</button>.
          </span>
        </div>
      )}

      <table className="w-full text-sm">
        <thead><tr className="text-left text-[11px] uppercase text-gray-500 border-b">
          <th className="py-1.5">Descripción</th><th className="text-right">Cobro</th><th className="text-center">Cant.</th><th className="text-right">Precio</th><th className="text-right pr-2">Importe</th><th />
        </tr></thead>
        <tbody>
          {calc.lineas.map((l, i) => (l.tipo === 'ventana' ? (
            <tr key={`v${i}`} className="border-b">
              <td className="py-1.5">{nombreSistema(l.medida.sistema_id)}{l.medida.color ? ` ${l.medida.color}` : ''} · {pulgadasTexto(l.medida.ancho)}" × {pulgadasTexto(l.medida.alto)}"{l.medida.ubicacion ? ` · ${l.medida.ubicacion}` : ''}</td>
              <td className="text-right text-xs text-gray-600">{cobroTexto(l)}</td>
              <td className="text-center">{l.cantidad}</td>
              <td className="text-right font-mono">{fmt(l.unitario)}</td>
              <td className="text-right pr-2 font-mono">{fmt(l.importe)}</td><td />
            </tr>
          ) : (
            <tr key={l.extra.id} className="border-b bg-gray-50/60">
              <td className="py-1.5">{l.extra.descripcion || l.extra.productos?.descripcion} <span className="text-xs text-gray-400">({l.extra.productos?.codigo})</span></td>
              <td /><td className="text-center">{l.cantidad}</td>
              <td className="text-right font-mono">{fmt(l.unitario)}</td>
              <td className="text-right pr-2 font-mono">{fmt(l.importe)}</td>
              <td className="text-right"><Button size="sm" variant="ghost" onClick={() => quitarExtra(l.extra)} title="Quitar"><Trash2 className="w-4 h-4 text-red-600" /></Button></td>
            </tr>
          )))}
        </tbody>
        <tfoot><tr>
          <td colSpan={4} className="text-right py-2 font-bold">Total (ITBIS incluido)</td>
          <td className="text-right pr-2 py-2 font-mono font-black text-lg">{fmt(calc.total)}</td><td />
        </tr></tfoot>
      </table>

      <div className="rounded-md border border-gray-200 p-3">
        <div className="text-[11px] font-bold text-gray-600 uppercase mb-2">Agregar extra del catálogo (mano de obra, screen, llavines…)</div>
        <div className="flex flex-wrap items-center gap-2">
          <BuscarProducto tenantId={tenantId} value={nuevo.producto} className="flex-1 min-w-[260px]"
            onChange={(p) => setNuevo((x) => ({ ...x, producto: p, precio: p ? String(p.precio ?? '') : '' }))} />
          <input className={`${campo} w-20 text-center`} inputMode="decimal" value={nuevo.cantidad} onChange={(e) => setNuevo((x) => ({ ...x, cantidad: e.target.value.replace(/[^\d.]/g, '') }))} />
          <MontoInput className={`${campo} w-32 text-right`} placeholder="Precio" value={nuevo.precio} onChange={(v) => setNuevo((x) => ({ ...x, precio: v }))} />
          <Button size="sm" variant="outline" onClick={agregarExtra}><Plus className="w-4 h-4 mr-1" /> Agregar</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-md border border-blue-200 bg-blue-50/40 p-3">
        {cot ? (
          <span className="text-sm">Cotización <b>{cot.numero}</b> · {fmt(cot.total_cotizacion)} · {cot.estado}</span>
        ) : <span className="text-sm text-gray-600">Todavía sin cotización.</span>}
        <label className="text-xs text-gray-600 ml-auto">Vigencia
          <input className={`${campo} w-16 mx-1 text-center`} inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value.replace(/\D/g, ''))} /> días
        </label>
        {cot && <Button size="sm" variant="outline" onClick={() => openPanel('cotizaciones')}><FileText className="w-4 h-4 mr-1" /> Ver en Cotizaciones</Button>}
        <Button size="sm" onClick={crearCotizacion} disabled={creando || calc.faltan.length > 0}>
          {creando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />} {cot ? 'Crear cotización nueva' : 'Crear cotización'}
        </Button>
      </div>
    </div>
  );
}
