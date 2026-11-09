// =====================================================================
// Ventanas y aluminio · Configuración del desglose (09/11/2026)
// ---------------------------------------------------------------------
// Por sistema: sus piezas (perfil, cristal o accesorio) con la fórmula de
// corte: (ancho o alto ÷ hojas si "por hoja") − descuento, y la cantidad
// (fija + por hoja). A la derecha, una ventana de prueba muestra los cortes
// al momento. "Restablecer" vuelve a los valores de fábrica (PROVISIONALES
// hasta que el taller dé los suyos). Arriba: largo de la barra y merma.
// SQL: sql/ventanas_desglose.sql
// =====================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Settings2, Loader2, Plus, Trash2, RotateCcw, Save, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { desgloseVentana, leerPulgadas, pulgadasTexto } from '@/lib/ventanas';

const campo = 'h-8 rounded-md border border-gray-300 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300';
const etiqueta = 'text-[11px] font-bold text-gray-600 uppercase';
// Descuento con signo y fracción: "1/2", "-1/2", "0.875", "7/8".
const leerDescuento = (t) => {
  const s = String(t ?? '').trim();
  if (!s) return 0;
  const neg = s.startsWith('-');
  const v = leerPulgadas(neg ? s.slice(1) : s);
  return v == null ? null : (neg ? -v : v);
};
const descuentoTexto = (v) => (Number(v) < 0 ? `-${pulgadasTexto(-Number(v))}` : pulgadasTexto(v));

export default function DesgloseConfigPage() {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [cargando, setCargando] = useState(true);
  const [sistemas, setSistemas] = useState([]);
  const [sel, setSel] = useState('');
  const [piezas, setPiezas] = useState([]);          // del sistema escogido (con cambios sin guardar)
  const [borradas, setBorradas] = useState([]);
  const [sucio, setSucio] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [barraPies, setBarraPies] = useState('20');
  const [merma, setMerma] = useState('1/8');
  const [fraccion, setFraccion] = useState(false);
  const [plancha, setPlancha] = useState({ ancho: '96', alto: '72' });
  const [guardando, setGuardando] = useState(false);
  const [prueba, setPrueba] = useState({ ancho: '40', alto: '40', hojas: 2 });
  const [nuevoSistema, setNuevoSistema] = useState('');

  const error = useCallback((t, d) => toast({ title: t, description: d ? String(d) : undefined, variant: 'destructive' }), [toast]);

  const cargarSistemas = useCallback(async () => {
    if (!tenantId) return;
    setCargando(true);
    const { count } = await supabase.from('vent_config').select('tenant_id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    if (!count) await supabase.rpc('vent_preparar_empresa');
    const [si, cf] = await Promise.all([
      supabase.from('vent_sistemas').select('*').eq('tenant_id', tenantId).order('orden').order('nombre'),
      supabase.from('vent_config').select('*').eq('tenant_id', tenantId).maybeSingle(),
    ]);
    setCargando(false);
    if (si.error) return error('No se pudo cargar', si.error.message);
    setSistemas(si.data || []);
    setSel((s) => s || si.data?.[0]?.id || '');
    if (cf.data) {
      setCfg(cf.data);
      setBarraPies(String(Number(cf.data.largo_barra) / 12));
      setMerma(pulgadasTexto(cf.data.merma_corte));
      setFraccion(!!cf.data.mostrar_fraccion);
      if (cf.data.plancha_ancho) setPlancha({ ancho: pulgadasTexto(cf.data.plancha_ancho), alto: pulgadasTexto(cf.data.plancha_alto) });
    }
    return undefined;
  }, [tenantId, error]);
  useEffect(() => { cargarSistemas(); }, [cargarSistemas]);

  const cargarPiezas = useCallback(async (sistemaId) => {
    if (!sistemaId) return;
    const { data, error: e } = await supabase.from('vent_piezas').select('*').eq('sistema_id', sistemaId).eq('tenant_id', tenantId).order('orden');
    if (e) return error('No se pudieron cargar las piezas', e.message);
    setPiezas((data || []).map((p) => ({ ...p, _desc: descuentoTexto(p.descuento) })));
    setBorradas([]); setSucio(false);
    return undefined;
  }, [tenantId, error]);
  useEffect(() => { cargarPiezas(sel); }, [sel, cargarPiezas]);

  const sistema = sistemas.find((s) => s.id === sel);
  const cambiar = (id, k, v) => { setPiezas((ps) => ps.map((p) => (p.id === id ? { ...p, [k]: v } : p))); setSucio(true); };

  const escogerSistema = (id) => {
    if (sucio && !window.confirm('Tienes cambios sin guardar en este sistema. ¿Dejarlos?')) return;
    setSel(id);
  };

  const agregarPieza = () => {
    const id = `nuevo-${Date.now()}`;
    setPiezas((ps) => [...ps, { id, _nuevo: true, codigo: `PIEZA_${ps.length + 1}`, nombre: 'Pieza nueva', tipo: 'perfil', base: 'ancho', por_hoja: false, descuento: 0, _desc: '0', cant_fija: 1, cant_por_hoja: 0, perfil: '', orden: ps.length + 1, activo: true }]);
    setSucio(true);
  };
  const quitarPieza = (p) => {
    setPiezas((ps) => ps.filter((x) => x.id !== p.id));
    if (!p._nuevo) setBorradas((b) => [...b, p.id]);
    setSucio(true);
  };

  const guardar = async () => {
    for (const p of piezas) {
      if (leerDescuento(p._desc) == null) return error('Descuento no válido', `${p.nombre}: escribe por ejemplo 1/2, 7/8, -1/2 o 0.875.`);
      if (!String(p.nombre || '').trim()) return error('Falta el nombre', 'Toda pieza necesita nombre.');
    }
    setGuardando(true);
    try {
      if (borradas.length) {
        const { error: e } = await supabase.from('vent_piezas').delete().in('id', borradas).eq('tenant_id', tenantId).select('id');
        if (e) throw e;
      }
      const filas = piezas.map((p, i) => ({
        ...(p._nuevo ? {} : { id: p.id }),
        tenant_id: tenantId, sistema_id: sel,
        codigo: String(p.codigo || `PIEZA_${i + 1}`).trim().toUpperCase(),
        nombre: String(p.nombre).trim(), tipo: p.tipo, base: p.base, por_hoja: !!p.por_hoja,
        descuento: leerDescuento(p._desc), cant_fija: parseInt(p.cant_fija, 10) || 0, cant_por_hoja: parseInt(p.cant_por_hoja, 10) || 0,
        perfil: String(p.perfil || '').trim() || null, orden: i + 1, activo: p.activo !== false,
      }));
      const nuevas = filas.filter((f) => !f.id);
      const viejas = filas.filter((f) => f.id);
      if (viejas.length) {
        const { error: e } = await supabase.from('vent_piezas').upsert(viejas, { onConflict: 'id' }).select('id');
        if (e) throw e;
      }
      if (nuevas.length) {
        const { error: e } = await supabase.from('vent_piezas').insert(nuevas).select('id');
        if (e) throw e;
      }
      toast({ title: `Desglose de ${sistema?.nombre} guardado` });
      await cargarPiezas(sel);
    } catch (e) {
      error('No se pudo guardar', e?.message?.includes('duplicate') ? 'Dos piezas tienen el mismo código.' : e?.message);
    } finally {
      setGuardando(false);
    }
    return undefined;
  };

  const restablecer = async () => {
    if (!window.confirm(`¿Volver ${sistema?.nombre} a los valores de fábrica? Se pierden los cambios de este sistema.`)) return;
    const { error: e } = await supabase.rpc('vent_restablecer_piezas', { p_sistema: sel });
    if (e) { error('No se pudo restablecer', e.message); return; }
    toast({ title: 'Valores de fábrica restablecidos' });
    cargarPiezas(sel);
  };

  const guardarConfig = async () => {
    const pies = Number(String(barraPies).replace(',', '.'));
    const mm = leerPulgadas(merma);
    const pa = leerPulgadas(plancha.ancho); const ph = leerPulgadas(plancha.alto);
    if (!(pies > 0) || mm == null) return error('Datos no válidos', 'Largo de barra en pies (ej. 20) y merma en pulgadas (ej. 1/8).');
    if (!(pa > 0) || !(ph > 0)) return error('Plancha no válida', 'Ancho y alto de la plancha de vidrio en pulgadas (ej. 96 × 72).');
    const { data, error: e } = await supabase.from('vent_config').upsert({
      tenant_id: tenantId, largo_barra: pies * 12, merma_corte: mm,
      mostrar_fraccion: fraccion, plancha_ancho: pa, plancha_alto: ph, updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id' }).select('*');
    if (e || !data?.length) return error('No se guardó', e?.message || 'Sin permiso');
    setCfg(data[0]);
    toast({ title: 'Barras guardadas', description: `${pies}' (${pies * 12}") · merma ${pulgadasTexto(mm)}" por corte` });
    return undefined;
  };

  const alternarSistema = async (s, campoS, valor) => {
    const { data, error: e } = await supabase.from('vent_sistemas').update({ [campoS]: valor }).eq('id', s.id).eq('tenant_id', tenantId).select('*');
    if (e || !data?.length) { error('No se guardó', e?.message || 'Sin permiso'); return; }
    setSistemas((ss) => ss.map((x) => (x.id === s.id ? data[0] : x)));
  };

  const crearSistema = async () => {
    const n = nuevoSistema.trim();
    if (!n) return;
    const codigo = n.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
    const { data, error: e } = await supabase.from('vent_sistemas').insert({ tenant_id: tenantId, codigo, nombre: n, orden: sistemas.length + 1 }).select('*').single();
    if (e) { error('No se pudo crear', e.message.includes('duplicate') ? 'Ya hay un sistema con ese nombre.' : e.message); return; }
    setNuevoSistema('');
    setSistemas((ss) => [...ss, data]);
    setSel(data.id);
  };

  // Vista previa con los valores que se están editando.
  const piezasCalc = useMemo(() => piezas.map((p) => ({ ...p, descuento: leerDescuento(p._desc) ?? 0 })), [piezas]);
  const pa = leerPulgadas(prueba.ancho); const pl = leerPulgadas(prueba.alto);
  const vista = useMemo(() => (pa && pl ? desgloseVentana({ ancho: pa, alto: pl, hojas: prueba.hojas, cantidad: 1 }, piezasCalc) : []),
    [pa, pl, prueba.hojas, piezasCalc]);

  if (cargando) return <div className="h-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="h-full overflow-y-auto p-6 bg-gray-50">
      <Helmet><title>Configuración del desglose</title></Helmet>
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Settings2 className="w-6 h-6 text-blue-700" />
          <h1 className="text-xl font-black text-gray-900 uppercase">Configuración del desglose</h1>
        </div>

        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Los valores de fábrica son <b>PROVISIONALES</b>. Cámbialos por los de tu taller (pieza por pieza) y pulsa Guardar. "Restablecer" vuelve a los de fábrica.</span>
        </div>

        {/* Barras */}
        <section className="rounded-lg bg-white border border-gray-200 p-3 flex flex-wrap items-end gap-4">
          <label><span className={etiqueta}>Largo de la barra (pies)</span>
            <input className={`${campo} mt-1 w-24 block`} value={barraPies} onChange={(e) => setBarraPies(e.target.value)} />
          </label>
          <label><span className={etiqueta}>Se pierde por corte (pulgadas)</span>
            <input className={`${campo} mt-1 w-24 block`} value={merma} onChange={(e) => setMerma(e.target.value)} />
          </label>
          <label><span className={etiqueta}>Plancha de vidrio (pulgadas)</span>
            <span className="flex items-center gap-1 mt-1">
              <input className={`${campo} w-16`} value={plancha.ancho} onChange={(e) => setPlancha((x) => ({ ...x, ancho: e.target.value }))} />×
              <input className={`${campo} w-16`} value={plancha.alto} onChange={(e) => setPlancha((x) => ({ ...x, alto: e.target.value }))} />
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm mb-1.5" title="Última barra y planchas en 1/4, 1/2, 3/4 en vez de redondear a la unidad completa">
            <input type="checkbox" checked={fraccion} onChange={(e) => setFraccion(e.target.checked)} /> Mostrar fracción de materiales (¼ ½ ¾)
          </label>
          <Button size="sm" variant="outline" onClick={guardarConfig}><Save className="w-4 h-4 mr-1" /> Guardar barras y planchas</Button>
          {cfg && <span className="text-xs text-gray-500">Actual: {Number(cfg.largo_barra) / 12}' ({Number(cfg.largo_barra)}") · merma {pulgadasTexto(cfg.merma_corte)}"</span>}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr] gap-4">
          {/* Sistemas */}
          <section className="rounded-lg bg-white border border-gray-200 p-2 h-fit">
            <div className={`${etiqueta} px-2 py-1`}>Sistemas</div>
            {sistemas.map((s) => (
              <div key={s.id} className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${sel === s.id ? 'bg-blue-50' : ''}`}>
                <input type="checkbox" checked={s.activo} title="Activo (sale al medir)" onChange={() => alternarSistema(s, 'activo', !s.activo)} />
                <button type="button" onClick={() => escogerSistema(s.id)} className={`flex-1 text-left text-sm ${sel === s.id ? 'font-bold text-blue-800' : s.activo ? 'text-gray-800' : 'text-gray-400'}`}>{s.nombre}</button>
              </div>
            ))}
            <div className="flex gap-1 mt-2 px-1">
              <input className={`${campo} flex-1 min-w-0`} placeholder="Sistema nuevo" value={nuevoSistema} onChange={(e) => setNuevoSistema(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && crearSistema()} />
              <Button size="sm" variant="outline" onClick={crearSistema}><Plus className="w-4 h-4" /></Button>
            </div>
          </section>

          {/* Piezas del sistema */}
          <section className="rounded-lg bg-white border border-gray-200 p-3 space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-bold text-gray-900">{sistema?.nombre}</h2>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                Hojas que admite:
                {[1, 2, 3, 4].map((h) => (
                  <label key={h} className="flex items-center gap-1">
                    <input type="checkbox" checked={sistema?.hojas?.includes(h) || false}
                      onChange={() => {
                        const hs = sistema.hojas.includes(h) ? sistema.hojas.filter((x) => x !== h) : [...sistema.hojas, h].sort();
                        if (hs.length) alternarSistema(sistema, 'hojas', hs);
                      }} /> {h}
                  </label>
                ))}
              </div>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={restablecer}><RotateCcw className="w-4 h-4 mr-1" /> Restablecer</Button>
                <Button size="sm" onClick={guardar} disabled={guardando || !sucio}>{guardando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Guardar</Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead><tr className="text-left text-[11px] uppercase text-gray-500 border-b">
                  <th className="py-1.5">Pieza</th><th>Tipo</th><th>Medida de</th><th className="text-center" title="La medida se divide entre las hojas">÷ hojas</th>
                  <th title="Pulgadas que se restan (negativo suma): 1/2, 7/8, -1/2">Descuento</th><th title="Cantidad fija por ventana">Cant. fija</th><th title="Cantidad por cada hoja">+ por hoja</th>
                  <th title="Perfil para las barras (vacío = el nombre de la pieza)">Perfil (barras)</th><th className="text-center">Activa</th><th />
                </tr></thead>
                <tbody>
                  {piezas.map((p) => {
                    const descMal = leerDescuento(p._desc) == null;
                    return (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-1 pr-1"><input className={`${campo} w-44`} value={p.nombre} onChange={(e) => cambiar(p.id, 'nombre', e.target.value)} /></td>
                        <td className="pr-1"><select className={campo} value={p.tipo} onChange={(e) => cambiar(p.id, 'tipo', e.target.value)}>
                          <option value="perfil">Perfil</option><option value="cristal">Cristal</option><option value="accesorio">Accesorio</option></select></td>
                        <td className="pr-1"><select className={campo} value={p.base} onChange={(e) => cambiar(p.id, 'base', e.target.value)}>
                          <option value="ancho">Ancho</option><option value="alto">Alto</option></select></td>
                        <td className="text-center"><input type="checkbox" checked={!!p.por_hoja} onChange={(e) => cambiar(p.id, 'por_hoja', e.target.checked)} /></td>
                        <td className="pr-1"><input className={`${campo} w-20 ${descMal ? 'border-red-500' : ''}`} value={p._desc} onChange={(e) => cambiar(p.id, '_desc', e.target.value)} /></td>
                        <td className="pr-1"><input className={`${campo} w-16`} inputMode="numeric" value={p.cant_fija} onChange={(e) => cambiar(p.id, 'cant_fija', e.target.value.replace(/[^\d-]/g, ''))} /></td>
                        <td className="pr-1"><input className={`${campo} w-16`} inputMode="numeric" value={p.cant_por_hoja} onChange={(e) => cambiar(p.id, 'cant_por_hoja', e.target.value.replace(/[^\d-]/g, ''))} /></td>
                        <td className="pr-1"><input className={`${campo} w-32`} placeholder={p.nombre} value={p.perfil || ''} onChange={(e) => cambiar(p.id, 'perfil', e.target.value)} /></td>
                        <td className="text-center"><input type="checkbox" checked={p.activo !== false} onChange={(e) => cambiar(p.id, 'activo', e.target.checked)} /></td>
                        <td className="text-right"><Button size="sm" variant="ghost" onClick={() => quitarPieza(p)} title="Quitar"><Trash2 className="w-4 h-4 text-red-600" /></Button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Button size="sm" variant="outline" onClick={agregarPieza}><Plus className="w-4 h-4 mr-1" /> Agregar pieza</Button>
            <p className="text-xs text-gray-500">
              Medida de corte = (ancho o alto ÷ hojas si está marcado) − descuento. Cantidad por ventana = fija + (por hoja × hojas);
              ej. enganches: fija −2 y por hoja 2 → 2 en 2 hojas, 4 en 3 hojas.
            </p>

            {/* Vista previa */}
            <div className="rounded-md border border-blue-200 bg-blue-50/40 p-3">
              <div className="flex flex-wrap items-end gap-3 mb-2">
                <span className="text-sm font-bold text-blue-800">Ventana de prueba</span>
                <label className="text-xs">Ancho <input className={`${campo} w-20 ml-1`} value={prueba.ancho} onChange={(e) => setPrueba((x) => ({ ...x, ancho: e.target.value }))} /></label>
                <label className="text-xs">Alto <input className={`${campo} w-20 ml-1`} value={prueba.alto} onChange={(e) => setPrueba((x) => ({ ...x, alto: e.target.value }))} /></label>
                {(sistema?.hojas || [2]).map((h) => (
                  <button key={h} type="button" onClick={() => setPrueba((x) => ({ ...x, hojas: h }))}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border ${prueba.hojas === h ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-gray-300'}`}>{h} hojas</button>
                ))}
              </div>
              {vista.length ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 text-sm">
                  {vista.map((c) => (
                    <div key={c.pieza.id} className="flex justify-between border-b border-blue-100 py-0.5">
                      <span>{c.pieza.nombre}</span><span className="font-mono"><b>{c.cantidad}</b> × {pulgadasTexto(c.largo)}"</span>
                    </div>
                  ))}
                </div>
              ) : <div className="text-xs text-gray-500">Escribe un ancho y un alto.</div>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
