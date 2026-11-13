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
//
// (13/11/2026) Propina (si la empresa la usa) y retención a servicios
// técnicos (ISR 3 %): sql/retencion_tecnicos_y_propina.sql.
// =====================================================================
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Plus, Trash2, Percent, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { cleanRncCedula } from '@/lib/dgiiExport';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';

const n = (v) => Number(v || 0);
const pct = (v) => { const x = n(v); return x > 1 ? x / 100 : x; };
const money = (v) => n(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let seq = 0;
const nuevoLid = () => `l${Date.now()}_${seq++}`;

// La descripción guardada = descripción + " — " + referencia.
const SEP = ' — ';
// (11/11/2026) La DGII admite 80 caracteres en el nombre del artículo del e-CF
// (BRIMAR E310000000003 rechazado con 86). Descripción + " — " + referencia
// no pasan de 80. (El comprobante igual corta en 80 por si llega más largo.)
const MAX_NOMBRE = 80;
const largo = (t) => [...String(t || '')].length;
const largoRef = (ref) => (String(ref || '').trim() ? largo(ref) + SEP.length : 0);
// (11/11/2026) El cotejo «incluyen ITBIS» se recuerda por empresa en esta
// computadora, aunque se salga del sistema, hasta que se cambie a mano.
const CLAVE_CON_ITBIS = 'servicios_incluyen_itbis_';
const leerConItbis = (tenantId) => {
  if (!tenantId) return true;
  try { const v = localStorage.getItem(CLAVE_CON_ITBIS + tenantId); return v === null ? true : v === '1'; } catch { return true; }
};
const recortar = (t, max) => [...String(t || '')].slice(0, Math.max(0, max)).join('');
const partir = (it) => {
  if (it._desc !== undefined) return { desc: it._desc, ref: it._ref || '' };
  const d = String(it.descripcion || '');
  const i = d.lastIndexOf(SEP);
  return i > 0 ? { desc: d.slice(0, i), ref: d.slice(i + SEP.length) } : { desc: d, ref: '' };
};

export default function LineasServicios({ items, setItems, cliente, moneda = 'DOP', tasa = '', emiteEcf: emiteEcfProp, movil = false, propina = 0, setPropina, onRetencion }) {
  // (28/10/2026) En US$ los montos se escriben en dólares y se guardan en
  // pesos (× tasa): la venta, la caja y el 607 siguen en pesos.
  const factor = moneda === 'USD' && n(tasa) > 0 ? n(tasa) : 1;
  const sim = moneda === 'USD' ? 'US$' : 'RD$';
  const { tenantId, fiscalActivo, fiscalModo } = useAuth();
  // (11/11/2026) Sale e-CF solo en PRODUCCIÓN; en pruebas la factura lleva NCF
  // de papel (B01) y la base SÍ calcula la retención del 30% (Grupo Ycast):
  // la pantalla mostraba 0 y la factura impresa traía la retención.
  const emiteEcf = emiteEcfProp ?? (fiscalActivo && fiscalModo === 'produccion');
  const { toast } = useToast();
  const [catalogo, setCatalogo] = useState([]);
  const [general, setGeneral] = useState(null);
  // El monto que se escribe ya trae el ITBIS. (11/11/2026) Se recuerda como se
  // dejó la última vez en esta computadora y empresa, aunque se salga del
  // sistema, hasta que se cambie a mano.
  const [conItbis, setConItbis] = useState(() => leerConItbis(tenantId));
  const conItbisRef = useRef(conItbis);
  conItbisRef.current = conItbis;
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
        supabase.from('config_empresa').select('rnc, emisor_persona_fisica, retencion_itbis_aplica, isr_retencion_pct, isr_retencion_tecnico_pct, usa_propina').eq('tenant_id', tenantId).maybeSingle(),
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
    // (11/11/2026) El monto que se TECLEA se lee con el cotejo de ahora. Antes
    // la línea se quedaba con el cotejo de cuando se abrió (BRIMAR: quitó el
    // cotejo, escribió 52,000 y salió con el ITBIS dentro). Lo que no se teclea
    // (precio del catálogo, comisión «más ITBIS», factura guardada) trae su
    // propio _conItbis y el cotejo no lo cambia.
    const tecleado = '_monto' in cambios && !('_conItbis' in cambios);
    const extra = tecleado ? { _conItbis: conItbis, _tecleado: true } : {};
    // Línea guardada (sin _monto): su total = precio × cantidad, con ITBIS.
    const sinMonto = it._monto === undefined;
    return armar({
      _lid: l, _desc: desc, _ref: ref,
      _monto: sinMonto ? (n(it.precio) * n(it.cantidad || 1)) / factor : it._monto,
      _conItbis: sinMonto ? true : (it._conItbis ?? conItbis), _tecleado: it._tecleado,
      producto_id: it.producto_id, naturaleza: it.naturaleza,
    }, { ...cambios, ...extra });
  }));

  // Cambiar el cotejo vuelve a leer SOLO los montos tecleados: 52,000 sin
  // cotejo = 52,000 + 18%.
  // guardar=false: se aplica la preferencia guardada (no la cambió el usuario).
  const cambiarConItbis = (v, guardar = true) => {
    if (guardar && tenantId) {
      try { localStorage.setItem(CLAVE_CON_ITBIS + tenantId, v ? '1' : '0'); } catch { /* sin storage: solo esta vez */ }
    }
    setConItbis(v);
    setItems((prev) => prev.map((it, i) => (it._tecleado
      ? armar({ ...it, _lid: it._lid || `x${i}`, _conItbis: v }, {}) : it)));
  };

  // La sesión puede llegar sin empresa en el primer render: cuando llega, se
  // aplica SU preferencia y se releen las líneas ya tecleadas (el cotejo y
  // los montos nunca quedan distintos).
  useEffect(() => {
    if (!tenantId) return;
    const v = leerConItbis(tenantId);
    if (v !== conItbisRef.current) cambiarConItbis(v, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

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
      // También aquí rige el tope de 80 (descripción + referencia).
      _desc: recortar(fila?._desc || (p && p.codigo !== 'SERV-GENERAL' ? p.descripcion : ''), MAX_NOMBRE - largoRef(fila?._ref)),
      // Lo ya tecleado se queda como se escribió; si no, el precio del catálogo (trae ITBIS).
      ...(n(fila?._monto) && fila?._tecleado
        ? { _monto: fila._monto, _conItbis: fila._conItbis ?? conItbis }
        : { _monto: n(fila?._monto) || n(p?.precio), _conItbis: true, _tecleado: false }),
    });
  };

  // Totales y retención ESTIMADA (la definitiva la calcula la base al grabar,
  // con el NCF ya asignado): misma regla que recalcular_retenciones_factura.
  // Persona física: el indicador o un RNC de 11 dígitos (cédula). Misma regla
  // que recalcular_retenciones_factura (sql/retencion_tecnicos_y_propina.sql).
  const pf = !!cfg && (!!cfg.emisor_persona_fisica || cleanRncCedula(cfg.rnc).length === 11);
  const t = useMemo(() => {
    const totalRD = filas.reduce((s, f) => s + n(f.precio) * n(f.cantidad || 1), 0);
    const total = totalRD / factor;
    const itbis = filas.reduce((s, f) => s + n(f.itbis), 0) / factor;
    let retI = 0; let retS = 0;
    // Persona física: el indicador o un RNC de 11 dígitos (cédula).
    if (cliente?.agente_retencion && cfg) {
      const fRet = pf ? 1 : (emiteEcf ? 0 : (cfg.retencion_itbis_aplica !== false ? 0.30 : 0));
      for (const f of filas) {
        if (f.naturaleza !== 'servicio') continue;
        // A persona física se le retiene el ITBIS de todo servicio; a sociedad, solo el de los profesionales.
        if (pf || f.servicio_tipo === 'profesional') retI += (n(f.itbis) / factor) * fRet;
        const base = (n(f.precio) - n(f.itbis)) / factor;
        if (pf && ['profesional', 'alquiler'].includes(f.servicio_tipo)) retS += base * n(cfg.isr_retencion_pct ?? 15) / 100;
        if (pf && f.servicio_tipo === 'tecnico') retS += base * n(cfg.isr_retencion_tecnico_pct ?? 3) / 100;
      }
    }
    // La propina se escribe en la moneda de la venta y se guarda en pesos.
    const prop = n(propina) / factor;
    return { total: total + prop, totalRD: totalRD + n(propina), itbis, subtotal: total - itbis, prop, retI, retS };
  }, [filas, cliente, cfg, pf, emiteEcf, factor, propina]);
  // La venta sabe cuánto le van a retener (para no cobrarla de contado por el total).
  useEffect(() => { onRetencion?.(Math.round((t.retI + t.retS) * factor * 100) / 100); }, [t.retI, t.retS, factor, onRetencion]);
  const usaPropina = !!cfg?.usa_propina || n(propina) > 0;
  // Lo que se teclea se guarda como texto (si no, el punto decimal se borra al escribir).
  const [propTxt, setPropTxt] = useState('');
  useEffect(() => {
    // Propina puesta desde afuera (factura cargada, venta nueva): se muestra.
    if (Math.round(n(propTxt) * factor * 100) !== Math.round(n(propina) * 100)) {
      setPropTxt(n(propina) ? String(Math.round((n(propina) / factor) * 100) / 100) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propina, factor]);
  const ponPropina = (v) => {
    const limpio = String(v).replace(/[^0-9.]/g, '').replace(/^(\d*\.\d{0,2}).*$/, '$1');
    setPropTxt(limpio);
    setPropina?.(Math.round(n(limpio) * factor * 100) / 100);
  };

  const celda = 'w-full bg-transparent px-2 py-1.5 text-[13px] focus:bg-yellow-50 focus:outline-none';

  // Opciones del servicio (las dos vistas).
  const opciones = (
    <>
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
    </>
  );
  const quitar = (lid) => setItems((prev) => prev.filter((it, i) => (it._lid || `x${i}`) !== lid));
  const ponDesc = (f, v) => cambiar(f._lid, { _desc: recortar(v, MAX_NOMBRE - largoRef(f._ref)) });
  const ponRef = (f, v) => cambiar(f._lid, { _ref: recortar(v, MAX_NOMBRE - largo(f._desc) - SEP.length) });
  const ponMonto = (f, v) => cambiar(f._lid, { _monto: v.replace(/[^0-9.]/g, '') });
  const usarCalc = (f) => {
    cambiar(f._lid, {
      _monto: (n(calc.base) * n(calc.pct) / 100).toFixed(2),
      _ref: f._ref || recortar(`PAGO DE ${n(calc.pct)}%`, MAX_NOMBRE - largo(f._desc) - SEP.length),
      _conItbis: false,   // la comisión es la base; el ITBIS va encima
      _tecleado: false,   // el cotejo no la cambia
    });
    setCalc(null);
  };
  const contador = (f) => (
    <div className={`px-2 pb-1 text-right text-[10px] ${largo(f._desc) + largoRef(f._ref) >= MAX_NOMBRE ? 'font-bold text-red-600' : 'text-slate-400'}`}>
      {largo(f._desc) + largoRef(f._ref)}/{MAX_NOMBRE}
    </div>
  );
  const calculadora = (f) => (
    <>
      <span className="mr-2 font-semibold text-blue-900">Calcular comisión:</span>
      <input className="h-7 w-40 rounded border px-2 text-right" inputMode="decimal" placeholder="Valor de la venta"
        value={calc.base} onChange={(e) => setCalc({ ...calc, base: e.target.value.replace(/[^0-9.]/g, '') })} />
      <span className="mx-1">×</span>
      <input className="h-7 w-16 rounded border px-2 text-right" inputMode="decimal" value={calc.pct}
        onChange={(e) => setCalc({ ...calc, pct: e.target.value.replace(/[^0-9.]/g, '') })} />
      <span className="mx-1">% =</span>
      <b>{money(n(calc.base) * n(calc.pct) / 100)}</b>
      <button type="button" className="ml-3 rounded bg-blue-600 px-2 py-1 font-bold text-white" onClick={() => usarCalc(f)}>
        Usar (más ITBIS)
      </button>
    </>
  );

  return (
    <div className="flex flex-col">
      <div className={`flex border-b bg-slate-50 px-3 py-1.5 text-xs ${movil ? 'flex-col gap-1 py-2 text-sm' : 'items-center justify-between'}`}>
        <span className="font-bold uppercase text-slate-600">Detalle de la factura</span>
        {/* Apagado se marca en ámbar: se recuerda entre sesiones y cambia el total (+18%). */}
        <label className={`flex items-center gap-1.5 rounded px-1.5 ${conItbis ? 'text-slate-600' : 'bg-amber-100 font-semibold text-amber-900 ring-1 ring-amber-300'}`}
          title="Se recuerda como lo dejes en esta computadora, hasta que lo cambies">
          <input type="checkbox" className={movil ? 'h-5 w-5' : ''} checked={conItbis} onChange={(e) => cambiarConItbis(e.target.checked)} />
          Los montos que escribo <b>incluyen ITBIS</b>
          {!conItbis && <span>— se le suma el 18%</span>}
        </label>
      </div>

      {movil ? (
        <div className="space-y-3 bg-slate-100 p-2">
          {cargando && <div className="py-6 text-center text-slate-400"><Loader2 className="inline h-4 w-4 animate-spin" /> Cargando servicios…</div>}
          {filas.map((f, i) => (
            <div key={f._lid} className="space-y-2 rounded-lg border border-slate-300 bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-400">{i + 1}</span>
                <select className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold"
                  value={f.producto_id || ''} onChange={(e) => elegirProducto(f._lid, e.target.value)}>
                  {opciones}
                </select>
                <button type="button" title="Quitar línea" className="p-2 text-slate-400" onClick={() => quitar(f._lid)}>
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
              <div>
                <textarea rows={2} className="w-full resize-none rounded-md border border-slate-300 px-2 py-1.5 text-base uppercase"
                  placeholder="Descripción del servicio" value={f._desc} onChange={(e) => ponDesc(f, e.target.value)} />
                {contador(f)}
              </div>
              <input className="h-10 w-full rounded-md border border-slate-300 px-2 text-base uppercase" placeholder="Referencia (opcional)"
                value={f._ref} onChange={(e) => ponRef(f, e.target.value)} />
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">{sim}</span>
                  <input className="h-12 w-full rounded-md border border-slate-300 pl-11 pr-2 text-right font-mono text-xl font-black" inputMode="decimal"
                    placeholder="0.00" value={f._monto || ''} onChange={(e) => ponMonto(f, e.target.value)} />
                </div>
                <button type="button" title="Calcular un porcentaje (comisión)"
                  className={`flex h-12 w-12 items-center justify-center rounded-md border ${calc?.lid === f._lid ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-500'}`}
                  onClick={() => setCalc(calc?.lid === f._lid ? null : { lid: f._lid, base: '', pct: '5' })}>
                  <Percent className="h-5 w-5" />
                </button>
              </div>
              <div className="text-right text-xs text-slate-500">
                ITBIS: {f.naturaleza === 'inmueble' ? 'exento' : <span className="font-mono">{money(n(f.itbis) / factor)}</span>}
              </div>
              {calc?.lid === f._lid && (
                <div className="space-y-2 rounded-md bg-blue-50 p-2 text-sm">
                  <div className="font-semibold text-blue-900">Calcular comisión</div>
                  <div className="flex items-center gap-1">
                    <input className="h-10 min-w-0 flex-1 rounded border px-2 text-right text-base" inputMode="decimal" placeholder="Valor de la venta"
                      value={calc.base} onChange={(e) => setCalc({ ...calc, base: e.target.value.replace(/[^0-9.]/g, '') })} />
                    <span>×</span>
                    <input className="h-10 w-16 rounded border px-2 text-right text-base" inputMode="decimal" value={calc.pct}
                      onChange={(e) => setCalc({ ...calc, pct: e.target.value.replace(/[^0-9.]/g, '') })} />
                    <span>%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <b className="font-mono">= {money(n(calc.base) * n(calc.pct) / 100)}</b>
                    <button type="button" className="h-10 rounded bg-blue-600 px-3 font-bold text-white" onClick={() => usarCalc(f)}>Usar (más ITBIS)</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
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
                    {opciones}
                  </select>
                </td>
                <td className="border-r border-slate-200">
                  <textarea rows={2} className={`${celda} resize-y uppercase`} placeholder="Ej. Factura pago de comisión por venta de solares Primaveral"
                    value={f._desc} onChange={(e) => ponDesc(f, e.target.value)} />
                  {contador(f)}
                </td>
                <td className="border-r border-slate-200">
                  <input className={`${celda} uppercase`} placeholder="Ej. Pago de 5%" value={f._ref}
                    onChange={(e) => ponRef(f, e.target.value)} />
                </td>
                <td className="border-r border-slate-200">
                  <div className="flex items-center">
                    <input className={`${celda} text-right font-mono font-bold`} inputMode="decimal" value={f._monto || ''}
                      placeholder="0.00" onChange={(e) => ponMonto(f, e.target.value)} />
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
                    onClick={() => quitar(f._lid)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
              {calc?.lid === f._lid && (
                <tr className="bg-blue-50">
                  <td colSpan={6} className="px-3 py-2 text-[12px]">
                    {calculadora(f)}
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3 border-t bg-white px-3 py-2">
        <button type="button" onClick={agregar} className={`inline-flex items-center gap-1 rounded border border-dashed border-slate-400 font-bold text-slate-600 hover:bg-slate-50 ${movil ? 'h-11 w-full justify-center text-sm' : 'px-3 py-1.5 text-[12px]'}`}>
          <Plus className="h-3.5 w-3.5" /> Agregar línea
        </button>
        <div className={movil ? 'w-full text-sm' : 'min-w-[260px] text-[12px]'}>
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-mono">{money(t.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">ITBIS</span><span className="font-mono">{money(t.itbis)}</span></div>
          {usaPropina && setPropina && (
            <div className="flex items-center justify-between gap-2 py-0.5">
              <span className="text-slate-500">Propina</span>
              <span className="flex items-center gap-1">
                <button type="button" title="Propina legal: 10% del monto sin ITBIS" disabled={emiteEcf}
                  className="rounded border border-slate-300 px-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  onClick={() => ponPropina((t.subtotal * 0.10).toFixed(2))}>10%</button>
                <input className={`rounded border border-slate-300 px-1.5 text-right font-mono ${movil ? 'h-9 w-28 text-base' : 'h-6 w-24'}`}
                  inputMode="decimal" placeholder="0.00" value={propTxt}
                  onChange={(e) => ponPropina(e.target.value)} disabled={emiteEcf}
                  title={emiteEcf ? 'La propina todavía no va en la factura electrónica' : 'No lleva ITBIS ni retención'} />
              </span>
            </div>
          )}
          {usaPropina && emiteEcf && <div className="text-[10px] text-amber-700">La propina todavía no se puede poner en un e-CF.</div>}
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
              <div className="flex justify-between border-t font-black text-emerald-800"><span>Total a pagar (neto)</span><span className="font-mono">{money(t.total - t.retI - t.retS)}</span></div>
              <div className="text-[10px] text-slate-400">Estimado: la retención definitiva se calcula al grabar. Va a crédito: el cliente paga el neto.</div>
            </>
          )}
          {cliente?.agente_retencion && t.retI + t.retS === 0 && emiteEcf && !pf && (
            <div className="text-[10px] text-slate-500">Cliente agente de retención: con e-CF y emisor persona jurídica no se retiene ITBIS (Norma 02-2026).</div>
          )}
        </div>
      </div>
    </div>
  );
}
