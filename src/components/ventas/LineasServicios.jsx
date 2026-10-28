// =====================================================================
// Punto de venta de SERVICIOS e INMOBILIARIA (28/10/2026)
// ---------------------------------------------------------------------
// Una inmobiliaria no vende piezas con código y existencia: factura una
// comisión, un solar, un alquiler. Esta tabla reemplaza la de artículos (solo
// en esas empresas) y se llena como la factura de Grupo Ycast:
//
//   SERVICIO · DESCRIPCIÓN · REFERENCIA · MONTO
//
// Cada línea cuelga de un producto (el servicio o inmueble elegido del
// catálogo, o el SERVICIO GENERAL de la empresa) pero lleva su propia
// descripción y su propio monto — el mismo mecanismo de las cotizaciones
// Magna de Morla. Por eso todo lo demás (totales, NCF/e-CF, crédito,
// impresión, retenciones en la base) funciona igual que en cualquier venta.
//
// La referencia viaja dentro de la descripción ("… — PAGO DE 5%") para que
// salga en todos los formatos de impresión sin tocarlos.
// =====================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Percent, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';

const n = (v) => Number(v || 0);
const pct = (v) => { const x = n(v); return x > 1 ? x / 100 : x; };
const money = (v) => n(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let seq = 0;
const nuevoLid = () => `l${Date.now()}_${seq++}`;

// La descripción guardada = descripción + " — " + referencia.
const SEP = ' — ';
const partir = (it) => {
  if (it._desc !== undefined) return { desc: it._desc, ref: it._ref || '' };
  const d = String(it.descripcion || '');
  const i = d.lastIndexOf(SEP);
  return i > 0 ? { desc: d.slice(0, i), ref: d.slice(i + SEP.length) } : { desc: d, ref: '' };
};

export default function LineasServicios({ items, setItems, cliente, moneda = 'DOP', tasa = '' }) {
  // (28/10/2026) En US$ los montos se escriben en dólares y se guardan en
  // pesos (× tasa): la venta, la caja y el 607 siguen en pesos.
  const factor = moneda === 'USD' && n(tasa) > 0 ? n(tasa) : 1;
  const sim = moneda === 'USD' ? 'US$' : 'RD$';
  const { tenantId, fiscalActivo } = useAuth();
  const { toast } = useToast();
  const [catalogo, setCatalogo] = useState([]);
  const [general, setGeneral] = useState(null);
  const [conItbis, setConItbis] = useState(true);     // el monto que se escribe ya trae el ITBIS
  const [calc, setCalc] = useState(null);            // { lid, base, pct }
  const [cfg, setCfg] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [{ data: prods }, { data: gen, error: eGen }, { data: c }] = await Promise.all([
        supabase.from('productos').select('id, codigo, descripcion, precio, costo, itbis_pct, naturaleza, servicio_tipo')
          .eq('tenant_id', tenantId).eq('activo', true).in('naturaleza', ['servicio', 'inmueble']).order('descripcion').limit(500),
        supabase.rpc('asegurar_servicio_general'),
        supabase.from('config_empresa').select('emisor_persona_fisica, retencion_itbis_aplica, isr_retencion_pct').eq('tenant_id', tenantId).maybeSingle(),
      ]);
      if (!vivo) return;
      setCatalogo((prods || []).filter((p) => p.codigo !== 'SERV-GENERAL'));
      if (eGen) toast({ variant: 'destructive', title: 'Falta el SERVICIO GENERAL', description: 'Corre sql/servicio_general_por_empresa.sql.' });
      setGeneral(gen || null);
      setCfg(c || null);
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [tenantId, toast]);

  const porId = useMemo(() => Object.fromEntries([...(general ? [general] : []), ...catalogo].map((p) => [p.id, p])), [catalogo, general]);

  // Arma (o rehace) la línea con los mismos campos que usa toda la venta.
  const armar = useCallback((base, cambios) => {
    const it = { ...base, ...cambios };
    const prod = porId[it.producto_id] || general;
    const itbis_pct = it.naturaleza === 'inmueble' ? 0 : pct(prod?.itbis_pct ?? 0.18);
    const monto = n(it._monto);
    const enMoneda = (it._conItbis ?? conItbis) ? monto : monto * (1 + itbis_pct);
    const precio = enMoneda * factor;   // el sistema guarda precio CON ITBIS y EN PESOS
    const descTxt = String(it._desc ?? '').trim().toUpperCase();
    const refTxt = String(it._ref ?? '').trim().toUpperCase();
    return {
      ...it,
      id: prod?.id, producto_id: prod?.id, codigo: prod?.codigo,
      naturaleza: prod?.naturaleza || 'servicio', servicio_tipo: prod?.servicio_tipo || null,
      descripcion: (descTxt || prod?.descripcion || 'SERVICIO') + (refTxt ? SEP + refTxt : ''),
      cantidad: 1, descuento: 0, unidad: 'UND',
      itbis_pct, precio, importe: precio, itbis: precio - precio / (1 + itbis_pct),
      costo_unitario: n(prod?.costo), max_descuento: 0,
    };
  }, [porId, general, conItbis, factor]);

  // Las líneas que llegan de otro lado (editar una factura) se adoptan tal cual.
  const filas = useMemo(() => items.map((it, i) => {
    const { desc, ref } = partir(it);
    return { ...it, _lid: it._lid || `x${i}`, _desc: desc, _ref: ref, _monto: it._monto ?? (n(it.precio) * n(it.cantidad || 1)) / factor };
  }), [items]);

  const cambiar = (lid, cambios) => setItems((prev) => prev.map((it, i) => {
    const l = it._lid || `x${i}`;
    if (l !== lid) return it;
    const { desc, ref } = partir(it);
    return armar({ _lid: l, _desc: desc, _ref: ref, _monto: it._monto ?? n(it.precio) / factor, _conItbis: it._conItbis ?? conItbis, producto_id: it.producto_id, naturaleza: it.naturaleza }, cambios);
  }));

  const agregar = () => {
    if (!general) { toast({ variant: 'destructive', title: 'Todavía cargando el servicio general…' }); return; }
    setItems((prev) => [...prev, armar({ _lid: nuevoLid(), producto_id: general.id, _desc: '', _ref: '', _monto: 0, _conItbis: conItbis }, {})]);
  };

  // Cambió la moneda o la tasa: las líneas se rehacen con el monto que se
  // escribió (en su moneda), así el total en pesos sigue a la tasa.
  useEffect(() => {
    if (!general) return;
    setItems((prev) => prev.map((it, i) => (it._monto !== undefined
      ? armar({ ...it, _lid: it._lid || `x${i}` }, {}) : it)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factor]);

  // Si no hay líneas, se abre una vacía para escribir directo.
  useEffect(() => { if (!cargando && general && items.length === 0) agregar(); /* eslint-disable-next-line */ }, [cargando, general]);

  const elegirProducto = (lid, pid) => {
    const p = porId[pid];
    const fila = filas.find((f) => f._lid === lid);
    cambiar(lid, {
      producto_id: pid,
      naturaleza: p?.naturaleza,
      _desc: fila?._desc || (p && p.codigo !== 'SERV-GENERAL' ? p.descripcion : ''),
      _monto: n(fila?._monto) || n(p?.precio),
      _conItbis: true,
    });
  };

  // Totales y retención ESTIMADA (la definitiva la calcula la base al grabar,
  // con el NCF ya asignado): misma regla que recalcular_retenciones_factura.
  const t = useMemo(() => {
    const totalRD = filas.reduce((s, f) => s + n(f.precio) * n(f.cantidad || 1), 0);
    const total = totalRD / factor;
    const itbis = filas.reduce((s, f) => s + n(f.itbis), 0) / factor;
    let retI = 0; let retS = 0;
    if (cliente?.agente_retencion && cfg) {
      const fRet = cfg.emisor_persona_fisica ? 1 : (fiscalActivo ? 0 : (cfg.retencion_itbis_aplica !== false ? 0.30 : 0));
      for (const f of filas) {
        if (f.naturaleza !== 'servicio') continue;
        if (f.servicio_tipo === 'profesional') retI += (n(f.itbis) / factor) * fRet;
        if (cfg.emisor_persona_fisica && ['profesional', 'alquiler'].includes(f.servicio_tipo)) {
          retS += ((n(f.precio) - n(f.itbis)) / factor) * n(cfg.isr_retencion_pct ?? 15) / 100;
        }
      }
    }
    return { total, totalRD, itbis, subtotal: total - itbis, retI, retS };
  }, [filas, cliente, cfg, fiscalActivo, factor]);

  const celda = 'w-full bg-transparent px-2 py-1.5 text-[13px] focus:bg-yellow-50 focus:outline-none';

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b bg-slate-50 px-3 py-1.5 text-xs">
        <span className="font-bold uppercase text-slate-600">Detalle de la factura</span>
        <label className="flex items-center gap-1.5 text-slate-600">
          <input type="checkbox" checked={conItbis} onChange={(e) => setConItbis(e.target.checked)} />
          Los montos que escribo <b>incluyen ITBIS</b>
        </label>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-[#d9d4c7] text-left text-[12px] font-black uppercase text-slate-800">
            <th className="w-[22%] border-r border-slate-400 px-2 py-1.5">Servicio</th>
            <th className="border-r border-slate-400 px-2 py-1.5">Descripción</th>
            <th className="w-[16%] border-r border-slate-400 px-2 py-1.5">Referencia</th>
            <th className="w-[15%] border-r border-slate-400 px-2 py-1.5 text-right">Monto {sim}</th>
            <th className="w-[9%] border-r border-slate-400 px-2 py-1.5 text-right">ITBIS</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {cargando && (
            <tr><td colSpan={6} className="py-6 text-center text-slate-400"><Loader2 className="inline h-4 w-4 animate-spin" /> Cargando servicios…</td></tr>
          )}
          {filas.map((f) => (
            <React.Fragment key={f._lid}>
              <tr className="border-b border-slate-200 align-top odd:bg-white even:bg-slate-50/60">
                <td className="border-r border-slate-200">
                  <select className={celda} value={f.producto_id || ''} onChange={(e) => elegirProducto(f._lid, e.target.value)}>
                    {general && <option value={general.id}>Servicio general</option>}
                    {catalogo.filter((p) => p.naturaleza === 'servicio').length > 0 && (
                      <optgroup label="Servicios">
                        {catalogo.filter((p) => p.naturaleza === 'servicio').map((p) => <option key={p.id} value={p.id}>{p.descripcion}</option>)}
                      </optgroup>
                    )}
                    {catalogo.filter((p) => p.naturaleza === 'inmueble').length > 0 && (
                      <optgroup label="Inmuebles">
                        {catalogo.filter((p) => p.naturaleza === 'inmueble').map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.descripcion}</option>)}
                      </optgroup>
                    )}
                  </select>
                </td>
                <td className="border-r border-slate-200">
                  <textarea rows={2} className={`${celda} resize-y uppercase`} placeholder="Ej. Factura pago de comisión por venta de solares Primaveral"
                    value={f._desc} onChange={(e) => cambiar(f._lid, { _desc: e.target.value })} />
                </td>
                <td className="border-r border-slate-200">
                  <input className={`${celda} uppercase`} placeholder="Ej. Pago de 5%" value={f._ref}
                    onChange={(e) => cambiar(f._lid, { _ref: e.target.value })} />
                </td>
                <td className="border-r border-slate-200">
                  <div className="flex items-center">
                    <input className={`${celda} text-right font-mono font-bold`} inputMode="decimal" value={f._monto || ''}
                      placeholder="0.00" onChange={(e) => cambiar(f._lid, { _monto: e.target.value.replace(/[^0-9.]/g, '') })} />
                    <button type="button" title="Calcular un porcentaje (comisión)" className="px-1 text-slate-400 hover:text-blue-600"
                      onClick={() => setCalc(calc?.lid === f._lid ? null : { lid: f._lid, base: '', pct: '5' })}>
                      <Percent className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
                <td className="border-r border-slate-200 px-2 py-1.5 text-right font-mono text-[12px] text-slate-600">
                  {f.naturaleza === 'inmueble' ? <span title="El inmueble no lleva ITBIS">exento</span> : money(n(f.itbis) / factor)}
                </td>
                <td className="text-center">
                  <button type="button" title="Quitar línea" className="p-1.5 text-slate-400 hover:text-red-600"
                    onClick={() => setItems((prev) => prev.filter((it, i) => (it._lid || `x${i}`) !== f._lid))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
              {calc?.lid === f._lid && (
                <tr className="bg-blue-50">
                  <td colSpan={6} className="px-3 py-2 text-[12px]">
                    <span className="mr-2 font-semibold text-blue-900">Calcular comisión:</span>
                    <input className="h-7 w-40 rounded border px-2 text-right" inputMode="decimal" placeholder="Valor de la venta"
                      value={calc.base} onChange={(e) => setCalc({ ...calc, base: e.target.value.replace(/[^0-9.]/g, '') })} />
                    <span className="mx-1">×</span>
                    <input className="h-7 w-16 rounded border px-2 text-right" inputMode="decimal" value={calc.pct}
                      onChange={(e) => setCalc({ ...calc, pct: e.target.value.replace(/[^0-9.]/g, '') })} />
                    <span className="mx-1">% =</span>
                    <b>{money(n(calc.base) * n(calc.pct) / 100)}</b>
                    <button type="button" className="ml-3 rounded bg-blue-600 px-2 py-1 font-bold text-white"
                      onClick={() => {
                        cambiar(f._lid, {
                          _monto: (n(calc.base) * n(calc.pct) / 100).toFixed(2),
                          _ref: f._ref || `PAGO DE ${n(calc.pct)}%`,
                          _conItbis: false,   // la comisión es la base; el ITBIS va encima
                        });
                        setCalc(null);
                      }}>
                      Usar (más ITBIS)
                    </button>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-start justify-between gap-3 border-t bg-white px-3 py-2">
        <button type="button" onClick={agregar} className="inline-flex items-center gap-1 rounded border border-dashed border-slate-400 px-3 py-1.5 text-[12px] font-bold text-slate-600 hover:bg-slate-50">
          <Plus className="h-3.5 w-3.5" /> Agregar línea
        </button>
        <div className="min-w-[260px] text-[12px]">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-mono">{money(t.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">ITBIS</span><span className="font-mono">{money(t.itbis)}</span></div>
          <div className="flex justify-between font-bold"><span>Total {sim}</span><span className="font-mono">{money(t.total)}</span></div>
          {moneda === 'USD' && (
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>{n(tasa) > 0 ? `Equivale a (tasa ${n(tasa)})` : 'Falta la tasa del día'}</span>
              <span className="font-mono">{n(tasa) > 0 ? `RD$ ${money(t.totalRD)}` : '—'}</span>
            </div>
          )}
          {t.retI + t.retS > 0 && (
            <>
              {t.retI > 0 && <div className="flex justify-between text-amber-800"><span>ITBIS retenido por el cliente</span><span className="font-mono">-{money(t.retI)}</span></div>}
              {t.retS > 0 && <div className="flex justify-between text-amber-800"><span>ISR retenido por el cliente</span><span className="font-mono">-{money(t.retS)}</span></div>}
              <div className="flex justify-between border-t font-black text-emerald-800"><span>Neto a cobrar</span><span className="font-mono">{money(t.total - t.retI - t.retS)}</span></div>
              <div className="text-[10px] text-slate-400">Estimado: la retención definitiva se calcula al grabar.</div>
            </>
          )}
          {cliente?.agente_retencion && t.retI + t.retS === 0 && (
            <div className="text-[10px] text-slate-500">Cliente agente de retención: con e-CF y emisor persona jurídica no se retiene ITBIS (Norma 02-2026).</div>
          )}
        </div>
      </div>
    </div>
  );
}
