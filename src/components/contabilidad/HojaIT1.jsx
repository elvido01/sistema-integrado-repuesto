// ============================================================
// Hoja del IT-1 — ayudante contable, Fase 3 (13/11/2026)
// ------------------------------------------------------------
// Los números del mes casilla por casilla (Anexo A e IT-1) para copiarlos
// o compararlos en la Oficina Virtual, más el ISR retenido del IR-17.
// Todo sale de la RPC contab_hoja_it1 (sql/ayudante_contable_fase3.sql);
// las casillas siguen el "Instructivo Llenado del Formulario IT-1" de la DGII.
// Es una hoja de trabajo: no envía nada a la DGII.
// (23/11/2026) Formulario propio: ajustes a mano (importaciones, reparto de
// retenciones) que recalculan 25-34 y 68, copiar cada número con un clic e
// imprimir / guardar en PDF con encabezado (RNC, razón social registrada en
// la DGII, período y fecha límite). La DGII no recibe el IT-1 por sistema:
// se copia a la Oficina Virtual.
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Loader2, Info, Save, Printer, Copy } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const fmt = (v) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
// '1,234.50' / '1234,50' → número (vacío o inválido = 0).
const leer = (txt) => {
  let t = String(txt ?? '').trim().replace(/\s/g, '');
  if (!t) return 0;
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(/,(\d{1,2})$/, '.$1');
  const n = Number(t.replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

// El número tal cual lo pide la Oficina Virtual: sin comas, con 2 decimales.
const copiar = (v) => {
  try { navigator.clipboard?.writeText(r2(v).toFixed(2)); } catch { /* sin portapapeles */ }
};

const Fila = ({ cas, nombre, valor, cantidad, fuerte, nota, onCopiado }) => (
  <tr className={`border-t ${fuerte ? 'bg-slate-50 font-bold' : ''}`}>
    <td className="py-1.5 pr-2 w-10 text-xs font-mono text-slate-500 align-top">{cas}</td>
    <td className="py-1.5 pr-2">
      {nombre}
      {nota && <div className="text-[11px] font-normal text-slate-500">{nota}</div>}
    </td>
    {cantidad !== undefined && <td className="py-1.5 pr-3 text-right text-slate-600 w-16">{cantidad}</td>}
    <td className="py-1.5 text-right tabular-nums w-40">
      <button type="button" title="Copiar para la Oficina Virtual"
        onClick={() => { copiar(valor); onCopiado?.(cas); }}
        className="group inline-flex items-center gap-1 rounded px-1 hover:bg-blue-50">
        {fmt(valor)}
        <Copy className="w-3 h-3 text-slate-300 group-hover:text-blue-500" />
      </button>
    </td>
  </tr>
);

const Titulo = ({ children }) => (
  <tr><td colSpan={4} className="pt-3 pb-1 text-[11px] font-black uppercase tracking-wide text-slate-500">{children}</td></tr>
);

// Formulario imprimible (ventana aparte → Imprimir / Guardar como PDF).
function imprimirFormulario({ t, a, emisor, periodo }) {
  const sig = periodo.mes === 12 ? { anio: periodo.anio + 1, mes: 1 } : { anio: periodo.anio, mes: periodo.mes + 1 };
  const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fila = (cas, nombre, valor, fuerte) =>
    `<tr class="${fuerte ? 'f' : ''}"><td class="c">${esc(cas)}</td><td>${esc(nombre)}</td><td class="n">${fmt(valor)}</td></tr>`;
  const tit = (x) => `<tr><td colspan="3" class="t">${esc(x)}</td></tr>`;
  const ncf = (a.ncf || []).filter((n) => n.cantidad > 0 || [1, 2].includes(n.cas))
    .map((n) => fila(n.cas, `${n.nombre} (${n.cantidad})`, n.monto)).join('');
  const retenciones = t.c30 > 0
    ? tit('V. Retenciones que le hicieron sus clientes')
      + (t.r27 ? fila('27', 'Por tarjetas de crédito/débito', t.r27) : '')
      + (t.r29 ? fila('29', 'Por sociedades (servicios)', t.r29) : '')
      + (t.r31 ? fila('31', 'Por el Estado', t.r31) : '')
      + (t.rSinRepartir ? fila('27-31', 'Sin repartir', t.rSinRepartir) : '')
      + fila('30', 'Total retenciones', t.c30, true)
    : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>IT-1 ${MESES[periodo.mes - 1]} ${periodo.anio}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;font-size:12px}
  h1{font-size:16px;margin:0} h2{font-size:13px;margin:18px 0 4px;border-bottom:2px solid #111;padding-bottom:2px}
  .cab{display:flex;justify-content:space-between;gap:16px;border:1px solid #111;padding:8px 10px;margin:10px 0}
  .cab b{display:inline-block;min-width:110px}
  table{width:100%;border-collapse:collapse} td{border-bottom:1px solid #ddd;padding:3px 4px}
  td.c{width:46px;font-family:monospace;color:#555} td.n{text-align:right;width:130px;font-variant-numeric:tabular-nums}
  td.t{font-weight:bold;text-transform:uppercase;font-size:10px;color:#555;padding-top:10px;border:0}
  tr.f td{font-weight:bold;background:#f2f2f2}
  .nota{font-size:10px;color:#555;margin-top:14px}
  @media print{body{margin:10mm}}
</style></head><body>
<h1>Declaración Jurada del ITBIS (IT-1) · hoja de trabajo</h1>
<div class="cab"><div>
  <div><b>RNC / Cédula:</b> ${esc(emisor.rnc || '—')}</div>
  <div><b>Razón social:</b> ${esc(emisor.razon || '—')}</div>
  ${emisor.comercial && emisor.comercial !== emisor.razon ? `<div><b>Nombre comercial:</b> ${esc(emisor.comercial)}</div>` : ''}
</div><div>
  <div><b>Período:</b> ${MESES[periodo.mes - 1]} ${periodo.anio}</div>
  <div><b>Fecha límite:</b> 20 de ${MESES[sig.mes - 1].toLowerCase()} de ${sig.anio}</div>
  <div><b>Preparado:</b> ${new Date().toLocaleDateString('es-DO')} · MotoFlow</div>
</div></div>
<h2>Anexo A</h2><table>
${tit('II. Ventas por tipo de comprobante (sin impuestos)')}${ncf}${fila('11', 'Total de operaciones', a.c11, true)}
${tit('III. Ventas por forma de pago (con impuestos)')}
${fila('12', 'Efectivo', a.pago.c12)}${fila('13', 'Cheque / transferencia', a.pago.c13)}${fila('14', 'Tarjeta débito / crédito', a.pago.c14)}
${fila('15', 'A crédito', a.pago.c15)}${Number(a.pago.c18) > 0 ? fila('18', 'Otras formas de venta', a.pago.c18) : ''}${fila('19', 'Total por tipo de venta', a.c19, true)}
${tit('IV. Ventas por tipo de ingreso (sin impuestos)')}${fila('20', 'Ingresos por operaciones (no financieros)', a.c20)}${fila('26', 'Total por tipo de ingreso', a.c26, true)}
${retenciones}
${tit('IX. ITBIS pagado deducible')}${fila('50', 'En compras locales de bienes', a.c50)}${fila('51', 'En servicios', a.c51)}${t.c24 > 0 ? fila('52', 'En importaciones', t.c24) : ''}${fila('56', 'Total ITBIS deducible', t.c25, true)}
</table>
<h2>Formulario IT-1</h2><table>
${tit('II. Ingresos por operaciones')}${fila('1', 'Total de operaciones del período', t.c1)}${fila('4', 'Ventas locales exentas', t.c4)}${fila('9', 'Total operaciones no gravadas', t.c9)}
${fila('10', 'Total operaciones gravadas', t.c10, true)}${fila('11', 'Gravadas al 18 %', t.c11)}${Number(t.c12) > 0 ? fila('12', 'Gravadas al 16 %', t.c12) : ''}
${tit('III. Liquidación')}${fila('16', 'ITBIS cobrado (18 %)', t.c16)}${Number(t.c17) > 0 ? fila('17', 'ITBIS cobrado (16 %)', t.c17) : ''}${fila('21', 'Total ITBIS cobrado', t.c21, true)}
${fila('22', 'ITBIS pagado en compras locales', t.c22)}${fila('23', 'ITBIS pagado por servicios', t.c23)}${fila('24', 'ITBIS pagado en importaciones', t.c24)}${fila('25', 'Total ITBIS deducible', t.c25, true)}
${fila('26', 'Impuesto a pagar', t.c26)}${fila('27', 'Saldo a favor', t.c27)}${fila('29', 'Saldo a favor anterior', t.c29)}${fila('30', 'Pagos computables por retenciones', t.c30)}
${fila('33', 'Diferencia a pagar', t.c33, true)}${fila('34', 'Nuevo saldo a favor', t.c34, true)}
${Number(t.c60) > 0 ? tit('A. ITBIS retenido a suplidores') + fila('60', 'Impuesto a pagar por retenciones', t.c60) : ''}
${tit('Total')}${fila('68', 'Total general a pagar (sin recargos ni intereses)', t.c68, true)}
</table>
<div class="nota">Hoja de trabajo preparada con MotoFlow a partir de las ventas (607) y compras (606) registradas. No sustituye la declaración: se presenta en la Oficina Virtual de la DGII. Si la Oficina Virtual muestra otro número, revise la factura que falta o sobra antes de enviar.</div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open(); w.document.write(html); w.document.close();
  return true;
}

const HojaIT1 = ({ periodo, onSaldoGuardado }) => {
  const { toast } = useToast();
  const { empresa } = useAuth();
  const [data, setData] = useState(null);
  // Ajustes a mano (lo que MotoFlow no sabe): por período, no se guardan.
  const [imp, setImp] = useState('');
  const [ret, setRet] = useState({ r27: '', r29: '', r31: '' });
  const [emisor, setEmisor] = useState({ rnc: '', razon: '', comercial: '' });
  useEffect(() => { setImp(''); setRet({ r27: '', r29: '', r31: '' }); }, [periodo.anio, periodo.mes]);

  // Razón social como la tiene la DGII (persona física = nombre de la persona).
  useEffect(() => {
    const rnc = String(empresa?.rnc || '').replace(/\D/g, '');
    const base = { rnc, razon: empresa?.razon_social || empresa?.nombre || '', comercial: empresa?.nombre || '' };
    setEmisor(base);
    if (rnc.length !== 9 && rnc.length !== 11) return undefined;
    let vivo = true;
    supabase.rpc('dgii_emisor_registrado', { p_rnc: rnc }).then(({ data: d }) => {
      const fila = Array.isArray(d) ? d[0] : d;
      if (vivo && fila?.razon_social) setEmisor({ ...base, razon: fila.razon_social });
    });
    return () => { vivo = false; };
  }, [empresa?.rnc, empresa?.razon_social, empresa?.nombre]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const pedido = useRef(0); // descarta la respuesta de un mes que ya no se mira

  const cargar = useCallback(async () => {
    const n = ++pedido.current;
    setLoading(true);
    const { data: r, error } = await supabase.rpc('contab_hoja_it1', { p_anio: periodo.anio, p_mes: periodo.mes });
    if (n !== pedido.current) return;
    if (error) {
      toast({ variant: 'destructive', title: 'No se pudo cargar la hoja', description: error.message });
      setData(null);
    } else setData(r);
    setLoading(false);
  }, [periodo, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  if (loading) return <div className="bg-white rounded-lg border p-10 text-center"><Loader2 className="w-6 h-6 animate-spin inline text-slate-400" /></div>;
  if (!data) return null;

  const a = data.anexo;
  const s0 = data.it1;
  // Recalcular con los ajustes (mismas reglas que contab_hoja_it1).
  const c24 = r2(leer(imp));
  const rr = { r27: r2(leer(ret.r27)), r29: r2(leer(ret.r29)), r31: r2(leer(ret.r31)) };
  const repartido = r2(rr.r27 + rr.r29 + rr.r31);
  const retServidor = r2(s0.c30);
  const c30 = repartido > 0 ? repartido : retServidor;
  const c25 = r2(Number(s0.c22) + Number(s0.c23) + c24);
  const c21 = r2(s0.c21);
  const c26 = r2(Math.max(c21 - c25, 0));
  const c27 = r2(Math.max(c25 - c21, 0));
  const neto = r2(c26 - c27 - Number(s0.c29) - c30);
  const t = {
    ...s0, c24, c25, c26, c27, c30,
    c33: r2(Math.max(neto, 0)), c34: r2(Math.max(-neto, 0)),
    c68: r2(Math.max(neto, 0) + Number(s0.c60)),
    ...rr, rSinRepartir: repartido > 0 ? 0 : retServidor,
  };
  const hayAjustes = c24 > 0 || repartido > 0;
  const avisoCopiado = (cas) => toast({ title: `Casilla ${cas} copiada`, description: 'Péguela en la Oficina Virtual.', duration: 1500 });
  const sig = periodo.mes === 12 ? { anio: periodo.anio + 1, mes: 1 } : { anio: periodo.anio, mes: periodo.mes + 1 };

  // El "nuevo saldo a favor" de este mes es el "saldo a favor anterior" del siguiente.
  const guardarSaldoSiguiente = async () => {
    setGuardando(true);
    const { error } = await supabase.rpc('contab_guardar_saldo', { p_anio: sig.anio, p_mes: sig.mes, p_monto: Number(t.c34) || 0 });
    setGuardando(false);
    if (error) { toast({ variant: 'destructive', title: 'No se pudo guardar', description: error.message }); return; }
    toast({ title: 'Saldo a favor guardado', description: `${MESES[sig.mes - 1]} ${sig.anio} arranca con RD$ ${fmt(t.c34)} a favor.` });
    onSaldoGuardado?.();
  };

  const tiposNcf = (a.ncf || []).filter((n) => n.cantidad > 0 || [1, 2].includes(n.cas));

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 flex gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          Hoja de trabajo de <b>{MESES[periodo.mes - 1]} {periodo.anio}</b> con las casillas del formulario oficial.
          La Oficina Virtual llena sola varias con su 606 y su 607: si un número no coincide con esta hoja, no envíe todavía y revise qué factura falta o sobra.
          {!data.cerrado && <b> El mes no ha terminado: los números van a cambiar.</b>}
        </div>
      </div>

      {/* Imprimir y ajustes a mano */}
      <div className="bg-white rounded-lg border shadow-sm p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="mr-auto">
            <div className="text-sm font-extrabold text-slate-800">Formulario del mes</div>
            <div className="text-xs text-slate-500">
              {emisor.razon || 'Sin razón social'}{emisor.rnc ? ` · RNC ${emisor.rnc}` : ''} · vence el 20 de {MESES[sig.mes - 1].toLowerCase()}.
              Toque cualquier número para copiarlo.
            </div>
          </div>
          <Button size="sm" className="h-8" onClick={() => {
            if (!imprimirFormulario({ t, a, emisor, periodo })) {
              toast({ variant: 'destructive', title: 'El navegador bloqueó la ventana', description: 'Permita ventanas emergentes para motoflow y vuelva a intentar.' });
            }
          }}>
            <Printer className="w-3.5 h-3.5 mr-1" />Imprimir / PDF
          </Button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <label className="block">
            <span className="text-[11px] font-bold text-slate-600">Casilla 24 · ITBIS pagado en Aduanas</span>
            <input value={imp} onChange={(e) => setImp(e.target.value)} inputMode="decimal" placeholder="0.00"
              className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-right tabular-nums" />
          </label>
          {[['r27', 'Casilla 27 · le retuvieron las tarjetas'], ['r29', 'Casilla 29 · le retuvo una sociedad'], ['r31', 'Casilla 31 · le retuvo el Estado']].map(([k, l]) => (
            <label key={k} className="block">
              <span className="text-[11px] font-bold text-slate-600">{l}</span>
              <input value={ret[k]} onChange={(e) => setRet((p) => ({ ...p, [k]: e.target.value }))} inputMode="decimal" placeholder="0.00"
                className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-right tabular-nums" />
            </label>
          ))}
        </div>
        <div className="mt-2 text-[11px] text-slate-500">
          MotoFlow no sabe lo que pagó en Aduanas ni quién le retuvo. Lo que escriba aquí recalcula las casillas 25 a 34 y el total; no se guarda.
          {retServidor > 0 && repartido > 0 && Math.abs(repartido - retServidor) > 0.5 && (
            <b className="text-amber-700"> Ojo: en sus facturas las retenciones suman RD$ {fmt(retServidor)} y aquí repartió RD$ {fmt(repartido)}.</b>
          )}
          {hayAjustes && <b className="text-blue-700"> Números recalculados con sus ajustes.</b>}
        </div>
      </div>

      {/* Anexo A */}
      <div className="bg-white rounded-lg border shadow-sm p-4">
        <div className="text-sm font-extrabold text-slate-800">Anexo A <span className="font-normal text-slate-500">· se llena y se envía primero</span></div>
        <table className="w-full text-sm">
          <tbody>
            <Titulo>II. Ventas por tipo de comprobante (sin impuestos)</Titulo>
            {tiposNcf.map((n) => <Fila onCopiado={avisoCopiado} key={n.cas} cas={n.cas} nombre={n.nombre} cantidad={n.cantidad} valor={n.monto} />)}
            <Fila onCopiado={avisoCopiado} cas="11" nombre="Total de operaciones" cantidad="" valor={a.c11} fuerte />

            <Titulo>III. Ventas por forma de pago (con impuestos)</Titulo>
            <Fila onCopiado={avisoCopiado} cas="12" nombre="Efectivo" cantidad="" valor={a.pago.c12} />
            <Fila onCopiado={avisoCopiado} cas="13" nombre="Cheque / transferencia" cantidad="" valor={a.pago.c13} />
            <Fila onCopiado={avisoCopiado} cas="14" nombre="Tarjeta débito / crédito" cantidad="" valor={a.pago.c14} />
            <Fila onCopiado={avisoCopiado} cas="15" nombre="A crédito" cantidad="" valor={a.pago.c15} />
            {Number(a.pago.c18) > 0 && <Fila onCopiado={avisoCopiado} cas="18" nombre="Otras formas de venta" cantidad="" valor={a.pago.c18} />}
            <Fila onCopiado={avisoCopiado} cas="19" nombre="Total por tipo de venta" cantidad="" valor={a.c19} fuerte />

            <Titulo>IV. Ventas por tipo de ingreso (sin impuestos)</Titulo>
            <Fila onCopiado={avisoCopiado} cas="20" nombre="Ingresos por operaciones (no financieros)" cantidad="" valor={a.c20} />
            <Fila onCopiado={avisoCopiado} cas="26" nombre="Total por tipo de ingreso" cantidad="" valor={a.c26} fuerte />

            {(Number(a.retenciones_que_le_hicieron) > 0 || repartido > 0) && (
              <>
                <Titulo>V. Retenciones que le hicieron sus clientes</Titulo>
                {repartido > 0 ? (<>
                  {t.r27 > 0 && <Fila onCopiado={avisoCopiado} cas="27" nombre="Por tarjetas de crédito/débito" cantidad="" valor={t.r27} />}
                  {t.r29 > 0 && <Fila onCopiado={avisoCopiado} cas="29" nombre="Por sociedades (servicios)" cantidad="" valor={t.r29} />}
                  {t.r31 > 0 && <Fila onCopiado={avisoCopiado} cas="31" nombre="Por el Estado" cantidad="" valor={t.r31} />}
                  <Fila onCopiado={avisoCopiado} cas="30" nombre="Total retenciones" cantidad="" valor={t.c30} fuerte />
                </>) : (
                <Fila onCopiado={avisoCopiado} cas="27-31" nombre="ITBIS que le retuvieron" cantidad="" valor={a.retenciones_que_le_hicieron}
                  nota="Repártalo arriba según quién retuvo: tarjetas (27), una sociedad por servicios (29), el Estado (31)." />)}
              </>
            )}

            <Titulo>IX. ITBIS pagado deducible (viene del 606)</Titulo>
            <Fila onCopiado={avisoCopiado} cas="50" nombre="En compras locales de bienes" cantidad="" valor={a.c50} />
            <Fila onCopiado={avisoCopiado} cas="51" nombre="En servicios" cantidad="" valor={a.c51} />
            {c24 > 0 && <Fila onCopiado={avisoCopiado} cas="52" nombre="En importaciones" cantidad="" valor={c24} />}
            <Fila onCopiado={avisoCopiado} cas="56" nombre="Total ITBIS deducible" cantidad="" valor={t.c25} fuerte
              nota="No puede pasar del «ITBIS por adelantar» de su 606: si pasa, la Oficina Virtual no deja enviar." />
          </tbody>
        </table>
      </div>

      {/* IT-1 */}
      <div className="bg-white rounded-lg border shadow-sm p-4">
        <div className="text-sm font-extrabold text-slate-800">Formulario IT-1</div>
        <table className="w-full text-sm">
          <tbody>
            <Titulo>II. Ingresos por operaciones</Titulo>
            <Fila onCopiado={avisoCopiado} cas="1" nombre="Total de operaciones del período" valor={t.c1} nota="Viene de la casilla 11 del Anexo A." />
            <Fila onCopiado={avisoCopiado} cas="4" nombre="Ventas locales de bienes o servicios exentos" valor={t.c4} />
            <Fila onCopiado={avisoCopiado} cas="9" nombre="Total de operaciones no gravadas" valor={t.c9} />
            <Fila onCopiado={avisoCopiado} cas="10" nombre="Total de operaciones gravadas" valor={t.c10} fuerte />
            <Fila onCopiado={avisoCopiado} cas="11" nombre="Operaciones gravadas al 18 %" valor={t.c11} />
            {Number(t.c12) > 0 && <Fila onCopiado={avisoCopiado} cas="12" nombre="Operaciones gravadas al 16 %" valor={t.c12} />}

            <Titulo>III. Liquidación</Titulo>
            <Fila onCopiado={avisoCopiado} cas="16" nombre="ITBIS cobrado (18 % de la casilla 11)" valor={t.c16} />
            {Number(t.c17) > 0 && <Fila onCopiado={avisoCopiado} cas="17" nombre="ITBIS cobrado (16 % de la casilla 12)" valor={t.c17} />}
            <Fila onCopiado={avisoCopiado} cas="21" nombre="Total ITBIS cobrado" valor={t.c21} fuerte />
            <Fila onCopiado={avisoCopiado} cas="22" nombre="ITBIS pagado en compras locales" valor={t.c22} />
            <Fila onCopiado={avisoCopiado} cas="23" nombre="ITBIS pagado por servicios deducibles" valor={t.c23} />
            <Fila onCopiado={avisoCopiado} cas="24" nombre="ITBIS pagado en importaciones" valor={t.c24} nota={c24 > 0 ? 'El que escribió arriba.' : 'MotoFlow no lo tiene: si importó, escríbalo arriba.'} />
            <Fila onCopiado={avisoCopiado} cas="25" nombre="Total ITBIS deducible" valor={t.c25} fuerte />
            <Fila onCopiado={avisoCopiado} cas="26" nombre="Impuesto a pagar" valor={t.c26} />
            <Fila onCopiado={avisoCopiado} cas="27" nombre="Saldo a favor" valor={t.c27} />
            <Fila onCopiado={avisoCopiado} cas="29" nombre="Saldo a favor anterior" valor={t.c29} nota="El que guardó en el Resumen. La DGII lo valida contra su cuenta corriente." />
            <Fila onCopiado={avisoCopiado} cas="30" nombre="Pagos computables por retenciones" valor={t.c30} />
            <Fila onCopiado={avisoCopiado} cas="33" nombre="Diferencia a pagar" valor={t.c33} fuerte />
            <Fila onCopiado={avisoCopiado} cas="34" nombre="Nuevo saldo a favor" valor={t.c34} fuerte />

            {Number(t.c60) > 0 && (
              <>
                <Titulo>A. ITBIS que usted retuvo a suplidores</Titulo>
                <Fila onCopiado={avisoCopiado} cas="60" nombre="Impuesto a pagar por retenciones" valor={t.c60}
                  nota={`Debe cuadrar con el ITBIS retenido de su 606. A personas físicas: RD$ ${fmt(t.retenido_personas_fisicas)} · a sociedades: RD$ ${fmt(t.retenido_sociedades)}.`} />
              </>
            )}
            <Titulo>Total</Titulo>
            <Fila onCopiado={avisoCopiado} cas="68" nombre="Total general a pagar" valor={t.c68} fuerte nota="Sin recargos ni intereses: es lo que paga si declara a tiempo." />
          </tbody>
        </table>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <span className="mr-auto">
            Cuando haya declarado, guarde el nuevo saldo a favor (casilla 34) como punto de partida de {MESES[sig.mes - 1]} {sig.anio}.
            Si la Oficina Virtual le dio otro número, escríbalo en el Resumen de ese mes.
          </span>
          <Button size="sm" variant="outline" className="h-8" disabled={guardando} onClick={guardarSaldoSiguiente}>
            <Save className="w-3.5 h-3.5 mr-1" />Guardar RD$ {fmt(t.c34)} para {MESES[sig.mes - 1]}
          </Button>
        </div>
      </div>

      {/* IR-17 */}
      {data.ir17?.filas?.length > 0 && (
        <div className="bg-white rounded-lg border shadow-sm p-4">
          <div className="text-sm font-extrabold text-slate-800">IR-17 · ISR que le retuvo a suplidores</div>
          <div className="text-xs text-slate-500 mb-2">Se declara aparte, a más tardar el día 10. Primero el Anexo R9C y después el IR-17.</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1">Suplidor</th><th>RNC / cédula</th><th>NCF</th>
                <th className="text-right">Monto</th><th className="text-right">%</th><th className="text-right">ISR retenido</th>
              </tr>
            </thead>
            <tbody>
              {data.ir17.filas.map((f) => (
                <tr key={`${f.rnc}-${f.ncf}`} className="border-t">
                  <td className="py-1.5">{f.suplidor || '—'}</td><td>{f.rnc}</td><td>{f.ncf}</td>
                  <td className="text-right tabular-nums">{fmt(f.base)}</td>
                  <td className="text-right">{Number(f.pct)}</td>
                  <td className="text-right tabular-nums font-semibold">{fmt(f.monto)}</td>
                </tr>
              ))}
              <tr className="border-t bg-slate-50 font-bold">
                <td className="py-1.5" colSpan={5}>Total a pagar en el IR-17</td>
                <td className="text-right tabular-nums">{fmt(data.ir17.total_isr)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Lo que la hoja no cubre */}
      {data.avisos?.length > 0 && (
        <div className="bg-white rounded-lg border shadow-sm p-4">
          <div className="text-sm font-extrabold text-slate-800 mb-1">Antes de enviar, tenga en cuenta</div>
          <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
            {data.avisos.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};

export default HojaIT1;
