// ============================================================
// Mi Contabilidad — ayudante contable, Fase 1 (12/11/2026)
// ------------------------------------------------------------
// Para el dueño o el encargado, por mes:
//   1. ITBIS estimado antes de declarar el IT-1.
//   2. Lo que le falta al mes (compras que no entran al 606, ventas y
//      gastos sin comprobante) y cuánto ITBIS se pierde por eso.
//   3. Los compromisos con la DGII con su fecha, para marcarlos al
//      presentarlos; con avisos en la campanita si se encienden.
// Todo sale de la RPC contab_resumen_mes (sql/ayudante_contable_fase1.sql),
// la misma que usa la app. Es un ESTIMADO: no sustituye la declaración.
// Fase 3 (13/11/2026): pestañas «Hoja del IT-1» (casilla por casilla) y
// «Guía paso a paso» (components/contabilidad). Fase 4: «Pague menos».
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { usePanels } from '@/contexts/PanelContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, RefreshCw, Calculator, AlertTriangle, CalendarCheck, CheckCircle2, Circle, Bell, BellOff, FileText } from 'lucide-react';
import HojaIT1 from '@/components/contabilidad/HojaIT1';
import GuiaContable from '@/components/contabilidad/GuiaContable';
import RecomendacionesContables from '@/components/contabilidad/RecomendacionesContables';
import { formatFechaDMY } from '@/lib/dateUtils';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const fmt = (v) => `RD$ ${new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0)}`;
const hoyRD = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });

// Por qué una compra no entra al 606 y qué hacer (mismos motivos que Reportes DGII).
const MOTIVOS = {
  sin_ncf: ['Compras sin NCF', 'Pida la factura con comprobante fiscal y escriba el NCF en la compra.'],
  ncf_mal: ['NCF mal escrito', 'Revise el NCF en la compra: B + 10 dígitos, o E + 12 dígitos.'],
  consumo: ['Facturas de consumo (B02 / E32)', 'No dan crédito fiscal. Pida al suplidor factura de crédito fiscal (B01 o E31) a nombre de su RNC.'],
  tipo: ['Comprobante que no va en el 606', 'Revise que el NCF sea el de la factura del suplidor.'],
  rnc: ['Suplidor sin RNC o cédula válido', 'Complete el RNC (9 dígitos) o la cédula (11) en la ficha del suplidor.'],
  rnc_empresa: ['Falta el RNC de su empresa', 'Póngalo en Perfil Empresa: los gastos menores van con el RNC propio.'],
  repetida: ['Factura repetida (mismo RNC y NCF)', 'Está dos veces: en Compras y como comprobante de gasto, o digitada doble. Deje una sola.'],
  nota: ['Notas de crédito o débito del suplidor', 'No se pierde: agréguela a mano en la herramienta de la DGII con el NCF que modifica. La nota de crédito resta ITBIS.'],
  ret_isr: ['Compras con retención de ISR', 'No se pierde: agréguela a mano en la herramienta de la DGII escogiendo el tipo de retención.'],
};

const MiContabilidadPage = () => {
  const { toast } = useToast();
  const { openPanel } = usePanels();
  // Por defecto el mes pasado: es el que se está declarando.
  const [periodo, setPeriodo] = useState(() => {
    const [y, m] = hoyRD().split('-').map(Number);
    return m === 1 ? { anio: y - 1, mes: 12 } : { anio: y, mes: m - 1 };
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saldo, setSaldo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [tab, setTab] = useState('resumen'); // resumen | hoja | ahorro | guia

  const pedido = useRef(0); // descarta la respuesta de un mes que ya no se mira

  const cargar = useCallback(async () => {
    const n = ++pedido.current;
    setLoading(true);
    const { data: r, error } = await supabase.rpc('contab_resumen_mes', { p_anio: periodo.anio, p_mes: periodo.mes });
    if (n !== pedido.current) return;
    if (error) {
      toast({ variant: 'destructive', title: 'No se pudo cargar', description: error.message });
      setData(null);
    } else {
      setData(r);
      setSaldo(String(r?.saldo_favor_anterior ?? 0));
    }
    setLoading(false);
  }, [periodo, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const accion = async (fn, args, ok) => {
    setGuardando(true);
    const { error } = await supabase.rpc(fn, args);
    setGuardando(false);
    if (error) { toast({ variant: 'destructive', title: 'No se pudo guardar', description: error.message }); return; }
    if (ok) toast({ title: ok });
    cargar();
  };

  const guardarSaldo = () => {
    const n = Number(String(saldo).replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 0) { toast({ variant: 'destructive', title: 'Monto inválido' }); return; }
    accion('contab_guardar_saldo', { p_anio: periodo.anio, p_mes: periodo.mes, p_monto: n }, 'Saldo a favor guardado');
  };

  const it = data?.itbis;
  const compras = data?.compras;
  const ventas = data?.ventas;
  const gastos = data?.gastos_sin_comprobante;
  const cg = data?.comprobantes_gastos || { por_revisar: 0, por_revisar_itbis: 0, aprobados: 0, aprobados_itbis: 0 };
  const hoy = hoyRD();
  const anios = [periodo.anio - 1, periodo.anio, periodo.anio + 1].filter((a, i, arr) => arr.indexOf(a) === i);

  return (
    <div className="p-3 bg-slate-100 min-h-full">
      <Helmet><title>Mi Contabilidad</title></Helmet>
      <div className="max-w-5xl mx-auto space-y-3">
        {/* Cabecera */}
        <div className="bg-white rounded-lg border shadow-sm p-3 flex flex-wrap items-center gap-2">
          <Calculator className="w-5 h-5 text-blue-700" />
          <h1 className="text-lg font-extrabold text-slate-800 mr-auto">Mi Contabilidad</h1>
          <select value={periodo.mes} onChange={(e) => setPeriodo((p) => ({ ...p, mes: Number(e.target.value) }))}
            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm">
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={periodo.anio} onChange={(e) => setPeriodo((p) => ({ ...p, anio: Number(e.target.value) }))}
            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm">
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={cargar} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="flex flex-wrap gap-1 bg-white rounded-lg border shadow-sm p-1">
          {[['resumen', 'Resumen del mes'], ['hoja', 'Hoja del IT-1'], ['ahorro', 'Pague menos'], ['guia', 'Guía paso a paso']].map(([k, t]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`flex-1 min-w-[120px] rounded-md px-3 py-1.5 text-sm font-bold ${tab === k ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'hoja' ? (
          <HojaIT1 periodo={periodo} onSaldoGuardado={cargar} />
        ) : tab === 'ahorro' ? (
          <RecomendacionesContables periodo={periodo} onVerPestana={setTab} />
        ) : tab === 'guia' ? (
          <GuiaContable periodo={periodo} onVerPestana={setTab} />
        ) : loading && !data ? (
          <div className="bg-white rounded-lg border p-10 text-center"><Loader2 className="w-6 h-6 animate-spin inline text-slate-400" /></div>
        ) : !data ? null : (
          <>
            {/* 1. ITBIS estimado */}
            <div className="bg-white rounded-lg border shadow-sm p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase text-slate-500">ITBIS estimado de {MESES[periodo.mes - 1]} {periodo.anio}</div>
                  {it.a_pagar > 0 ? (
                    <div className="text-3xl font-black text-rose-700">{fmt(it.a_pagar)} <span className="text-sm font-bold">a pagar</span></div>
                  ) : (
                    <div className="text-3xl font-black text-emerald-700">{fmt(it.saldo_a_favor)} <span className="text-sm font-bold">a favor</span></div>
                  )}
                  <div className="text-[11px] text-slate-500 mt-1">
                    {data.cerrado ? 'Mes cerrado.' : 'El mes todavía no termina: el número cambia con cada venta y compra.'}
                    {' '}Es un estimado para el IT-1; confirme en la Oficina Virtual antes de pagar.
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => openPanel('reportes-dgii')}>
                  <FileText className="w-4 h-4 mr-1" />Reportes DGII (606 / 607 / 608)
                </Button>
              </div>
              <table className="w-full text-sm mt-3">
                <tbody>
                  <tr className="border-t">
                    <td className="py-1.5">ITBIS de las ventas con comprobante ({ventas.con_ncf})
                      {Number(data.devoluciones_itbis) > 0 && <span className="text-xs text-slate-500"> · ya restadas las devoluciones ({fmt(data.devoluciones_itbis)})</span>}
                    </td>
                    <td className="py-1.5 text-right font-semibold">{fmt(it.ventas)}</td>
                  </tr>
                  <tr className="border-t">
                    <td className="py-1.5">− ITBIS adelantado en compras que entran al 606 ({compras.en_606})</td>
                    <td className="py-1.5 text-right font-semibold">{fmt(it.adelantado)}</td>
                  </tr>
                  <tr className="border-t">
                    <td className="py-1.5">− ITBIS que le retuvieron sus clientes</td>
                    <td className="py-1.5 text-right font-semibold">{fmt(it.retenido_por_clientes)}</td>
                  </tr>
                  <tr className="border-t">
                    <td className="py-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>− Saldo a favor del mes anterior</span>
                        <Input value={saldo} onChange={(e) => setSaldo(e.target.value)} inputMode="decimal"
                          className="h-7 w-32 text-right text-sm" title="Lo que le quedó a favor en el IT-1 anterior (casilla de saldo a favor)" />
                        <Button size="sm" variant="outline" className="h-7" onClick={guardarSaldo}
                          disabled={guardando || Number(saldo) === Number(data.saldo_favor_anterior)}>Guardar</Button>
                      </div>
                    </td>
                    <td className="py-1.5 text-right font-semibold">{fmt(it.saldo_favor_anterior)}</td>
                  </tr>
                </tbody>
              </table>
              {Number(it.retenido_a_suplidores) > 0 && (
                <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
                  En el mismo IT-1 paga además el <b>ITBIS que usted le retuvo a suplidores</b>: {fmt(it.retenido_a_suplidores)}.
                  {' '}Total a pagar en el IT-1: <b>{fmt(it.total_a_pagar)}</b>.
                </div>
              )}
              {Number(compras.isr_retenido_a_suplidores) > 0 && (
                <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
                  Aparte, por el <b>IR-17</b> (día 10) paga el ISR que le retuvo a suplidores: {fmt(compras.isr_retenido_a_suplidores)}.
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="h-7" onClick={() => setTab('hoja')}>Ver casilla por casilla (Hoja del IT-1)</Button>
                <Button size="sm" variant="outline" className="h-7" onClick={() => setTab('ahorro')}>¿Cómo pagar menos?</Button>
                <Button size="sm" variant="outline" className="h-7" onClick={() => setTab('guia')}>¿Cómo se declara? Guía paso a paso</Button>
              </div>
            </div>

            {/* 2. Lo que le falta al mes */}
            <div className="bg-white rounded-lg border shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <div className="text-sm font-extrabold text-slate-800">Lo que le falta al mes</div>
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                <span className="mr-auto">
                  {cg.por_revisar > 0
                    ? <><b>{cg.por_revisar} comprobante(s) de gastos por revisar</b> (ITBIS {fmt(cg.por_revisar_itbis)}): hasta que los apruebe no cuentan.</>
                    : <>Facturas de gastos con NCF (supermercado, combustible, servicios): suba la foto y entran al 606.{cg.aprobados > 0 ? ` Este mes van ${cg.aprobados} aprobadas (ITBIS ${fmt(cg.aprobados_itbis)}).` : ''}</>}
                </span>
                <Button size="sm" variant="outline" className="h-7" onClick={() => openPanel('comprobantes-gastos')}>
                  {cg.por_revisar > 0 ? 'Revisarlos' : 'Subir comprobantes'}
                </Button>
              </div>
              {compras.fuera === 0 && ventas.sin_ncf === 0 && gastos.cantidad === 0 ? (
                <div className="text-sm text-emerald-700">Todo en orden: todas las compras entran al 606 y todas las ventas llevan comprobante.</div>
              ) : (
                <div className="space-y-2 text-sm">
                  {compras.fuera > 0 && (
                    <div className="rounded-md border border-rose-200 bg-rose-50 p-3">
                      <div className="font-bold text-rose-800">
                        {compras.fuera} compra(s) no salen en el TXT del 606{Number(compras.itbis_perdido) > 0 ? <>: se pierden {fmt(compras.itbis_perdido)} de ITBIS que podría restar</> : null}.
                      </div>
                      <ul className="mt-1.5 space-y-1">
                        {compras.motivos.map((m) => (
                          <li key={m.motivo} className="text-xs text-rose-900">
                            <b>{(MOTIVOS[m.motivo] || [m.motivo])[0]}:</b> {m.cantidad} · ITBIS {fmt(m.itbis)}.{' '}
                            <span className="text-rose-700">{(MOTIVOS[m.motivo] || [])[1]}</span>
                          </li>
                        ))}
                      </ul>
                      <Button size="sm" variant="outline" className="mt-2 h-7" onClick={() => openPanel('reportes-dgii')}>
                        Ver cuáles son en Reportes DGII
                      </Button>
                    </div>
                  )}
                  {ventas.sin_ncf > 0 && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                      <b>{ventas.sin_ncf} venta(s) sin comprobante fiscal</b> por {fmt(ventas.sin_ncf_total)}: no salen en el 607 ni en este estimado.
                      Si su empresa ya tiene comprobantes autorizados, revise las secuencias en Comprobantes Fiscales.
                    </div>
                  )}
                  {gastos.cantidad > 0 && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                      <b>{gastos.cantidad} gasto(s) diarios por {fmt(gastos.monto)}</b> sin comprobante registrado: no entran al 606.
                      Los que tengan factura con NCF a nombre de la empresa conviene registrarlos como compra para aprovechar su ITBIS.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3. Compromisos */}
            <div className="bg-white rounded-lg border shadow-sm p-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <CalendarCheck className="w-4 h-4 text-blue-700" />
                <div className="text-sm font-extrabold text-slate-800 mr-auto">Compromisos de {MESES[periodo.mes - 1]} {periodo.anio}</div>
                <Button size="sm" variant={data.avisos ? 'default' : 'outline'} className="h-7" disabled={guardando}
                  onClick={() => accion('contab_configurar', { p_avisos: !data.avisos }, data.avisos ? 'Avisos apagados' : 'Avisos encendidos: 3 días antes y el día que vence')}>
                  {data.avisos ? <Bell className="w-3.5 h-3.5 mr-1" /> : <BellOff className="w-3.5 h-3.5 mr-1" />}
                  {data.avisos ? 'Avisos encendidos' : 'Avisarme en la campanita'}
                </Button>
              </div>
              <div className="divide-y">
                {data.compromisos.map((c) => {
                  const vencido = !c.hecho && c.vence < hoy;
                  const pronto = !c.hecho && !vencido && c.vence <= new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
                  return (
                    <div key={`${c.clave}-${c.periodo}`} className="flex items-start gap-2 py-2">
                      <button type="button" disabled={guardando} title={c.hecho ? 'Desmarcar' : 'Marcar como presentado'}
                        onClick={() => accion('contab_marcar', { p_clave: c.clave, p_periodo: c.periodo, p_hecho: !c.hecho })}>
                        {c.hecho ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Circle className="w-5 h-5 text-slate-300" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-semibold ${c.hecho ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{c.nombre}</div>
                        <div className="text-xs text-slate-500">{c.detalle}</div>
                      </div>
                      <div className={`text-xs font-bold whitespace-nowrap ${c.hecho ? 'text-slate-400' : vencido ? 'text-rose-700' : pronto ? 'text-amber-700' : 'text-slate-700'}`}>
                        {c.hecho ? 'Presentado' : vencido ? 'VENCIDO · ' : ''}{!c.hecho && formatFechaDMY(c.vence)}
                        {c.confirmar && !c.hecho && <div className="font-normal text-[10px] text-slate-500 text-right">fecha por confirmar</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="text-[11px] text-slate-500 mt-2">
                Fechas de la página «Pago de impuestos» de la DGII. Si la fecha cae en fin de semana pasa al lunes; los feriados no se calculan.
                {' '}Cierre fiscal: {MESES[(data.cierre_fiscal_mes || 12) - 1]}.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MiContabilidadPage;
