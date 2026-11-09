// =====================================================================
// Ventanas y aluminio · Precios (09/11/2026)
// ---------------------------------------------------------------------
// Por sistema (y si hace falta por color): cobrar POR PIE² (con un mínimo
// de pie² por ventana) o FIJO POR UNIDAD, el precio ya con ITBIS y el
// producto del catálogo que se factura (ej. "VENTANA TRADICIONAL BLANCO").
// El precio de un color manda sobre el general. Con esto el proyecto se
// convierte en cotización (vent_crear_cotizacion).
// SQL: sql/ventanas_presupuesto.sql
// =====================================================================
import React, { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { BadgeDollarSign, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import MontoInput from '@/components/ui/MontoInput';
import BuscarProducto from '@/components/ventanas/BuscarProducto';
import { COLORES_ALUMINIO } from '@/lib/ventanas';

const campo = 'h-8 rounded-md border border-gray-300 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300';

export default function PreciosVentanasPage() {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [cargando, setCargando] = useState(true);
  const [sistemas, setSistemas] = useState([]);
  const [filas, setFilas] = useState([]);            // precios (con cambios sin guardar)
  const [borradas, setBorradas] = useState([]);
  const [sucio, setSucio] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const error = useCallback((t, d) => toast({ title: t, description: d ? String(d) : undefined, variant: 'destructive' }), [toast]);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    setCargando(true);
    const [si, pr] = await Promise.all([
      supabase.from('vent_sistemas').select('id, nombre, activo, orden').eq('tenant_id', tenantId).order('orden'),
      supabase.from('vent_precios').select('*, productos(id, codigo, descripcion, precio, itbis_pct)').eq('tenant_id', tenantId),
    ]);
    setCargando(false);
    if (si.error || pr.error) { error('No se pudo cargar', (si.error || pr.error).message); return; }
    setSistemas(si.data || []);
    setFilas((pr.data || []).map((p) => ({ ...p, precio: String(p.precio), producto: p.productos || null })));
    setBorradas([]); setSucio(false);
  }, [tenantId, error]);
  useEffect(() => { cargar(); }, [cargar]);

  const cambiar = (id, k, v) => { setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, [k]: v } : f))); setSucio(true); };
  const agregar = (sistemaId, color = '') => {
    setFilas((fs) => [...fs, { id: `nuevo-${Date.now()}-${Math.random()}`, _nuevo: true, sistema_id: sistemaId, color, modo: 'pie2', precio: '', minimo_pie2: 0, producto: null }]);
    setSucio(true);
  };
  const quitar = (f) => { setFilas((fs) => fs.filter((x) => x.id !== f.id)); if (!f._nuevo) setBorradas((b) => [...b, f.id]); setSucio(true); };

  const guardar = async () => {
    const claves = new Set();
    for (const f of filas) {
      const clave = `${f.sistema_id}|${f.color || ''}`;
      if (claves.has(clave)) return error('Precio repetido', 'Un sistema tiene dos precios para el mismo color.');
      claves.add(clave);
    }
    setGuardando(true);
    try {
      if (borradas.length) {
        const { error: e } = await supabase.from('vent_precios').delete().in('id', borradas).eq('tenant_id', tenantId).select('id');
        if (e) throw e;
      }
      const datos = filas.map((f) => ({
        ...(f._nuevo ? {} : { id: f.id }),
        tenant_id: tenantId, sistema_id: f.sistema_id, color: f.color || '', modo: f.modo,
        precio: Number(f.precio) || 0, minimo_pie2: Number(f.minimo_pie2) || 0, producto_id: f.producto?.id || null,
        updated_at: new Date().toISOString(),
      }));
      const viejas = datos.filter((d) => d.id); const nuevas = datos.filter((d) => !d.id);
      if (viejas.length) { const { error: e } = await supabase.from('vent_precios').upsert(viejas, { onConflict: 'id' }).select('id'); if (e) throw e; }
      if (nuevas.length) { const { error: e } = await supabase.from('vent_precios').insert(nuevas).select('id'); if (e) throw e; }
      toast({ title: 'Precios guardados' });
      await cargar();
    } catch (e) {
      error('No se pudieron guardar los precios', e?.message);
    } finally {
      setGuardando(false);
    }
    return undefined;
  };

  if (cargando) return <div className="h-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="h-full overflow-y-auto p-6 bg-gray-50">
      <Helmet><title>Precios de ventanas</title></Helmet>
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <BadgeDollarSign className="w-6 h-6 text-blue-700" />
          <h1 className="text-xl font-black text-gray-900 uppercase">Precios de ventanas</h1>
          <Button className="ml-auto" onClick={guardar} disabled={guardando || !sucio}>
            {guardando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Guardar
          </Button>
        </div>
        <p className="text-sm text-gray-600">
          Precio de venta <b>con ITBIS</b>. Por pie²: ancho × alto ÷ 144 (con el mínimo de pie² por ventana). El producto es el que sale en la cotización y la factura
          (por ejemplo, VENTANA TRADICIONAL BLANCO). Si un color tiene otro precio, agrégalo aparte: manda sobre el general.
        </p>
        <div className="rounded-lg bg-white border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead><tr className="text-left text-[11px] uppercase text-gray-500 border-b">
              <th className="py-2 px-3">Sistema</th><th>Color</th><th>Cobrar</th><th>Precio (RD$)</th><th>Mínimo pie²</th><th className="w-[320px]">Producto que se factura</th><th />
            </tr></thead>
            <tbody>
              {sistemas.filter((s) => s.activo).map((s) => {
                const propias = filas.filter((f) => f.sistema_id === s.id).sort((a, b) => (a.color || '').localeCompare(b.color || ''));
                return (
                  <React.Fragment key={s.id}>
                    {propias.length === 0 && (
                      <tr className="border-b">
                        <td className="py-2 px-3 font-semibold">{s.nombre}</td>
                        <td colSpan={5} className="text-xs text-gray-400">Sin precio</td>
                        <td className="text-right pr-2"><Button size="sm" variant="outline" onClick={() => agregar(s.id)}><Plus className="w-4 h-4 mr-1" /> Precio</Button></td>
                      </tr>
                    )}
                    {propias.map((f, i) => (
                      <tr key={f.id} className="border-b">
                        <td className="py-1.5 px-3 font-semibold">{i === 0 ? s.nombre : ''}</td>
                        <td className="pr-1">
                          <select className={campo} value={f.color || ''} onChange={(e) => cambiar(f.id, 'color', e.target.value)}>
                            <option value="">Cualquier color</option>
                            {COLORES_ALUMINIO.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="pr-1">
                          <select className={campo} value={f.modo} onChange={(e) => cambiar(f.id, 'modo', e.target.value)}>
                            <option value="pie2">Por pie²</option><option value="unidad">Por unidad</option>
                          </select>
                        </td>
                        <td className="pr-1"><MontoInput className={`${campo} w-28 text-right`} value={f.precio} onChange={(v) => cambiar(f.id, 'precio', v)} /></td>
                        <td className="pr-1">
                          <input className={`${campo} w-20 text-right`} inputMode="decimal" disabled={f.modo !== 'pie2'} value={f.minimo_pie2}
                            onChange={(e) => cambiar(f.id, 'minimo_pie2', e.target.value.replace(/[^\d.]/g, ''))} />
                        </td>
                        <td className="pr-1"><BuscarProducto tenantId={tenantId} value={f.producto} onChange={(p) => cambiar(f.id, 'producto', p)} /></td>
                        <td className="text-right pr-2 whitespace-nowrap">
                          {i === propias.length - 1 && <Button size="sm" variant="ghost" title="Otro precio para un color" onClick={() => agregar(s.id, COLORES_ALUMINIO.find((c) => !propias.some((x) => x.color === c)) || '')}><Plus className="w-4 h-4" /></Button>}
                          <Button size="sm" variant="ghost" title="Quitar" onClick={() => quitar(f)}><Trash2 className="w-4 h-4 text-red-600" /></Button>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
