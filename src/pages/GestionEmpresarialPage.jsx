// GestionEmpresarialPage.jsx — Gestión Empresarial IA (submódulo de MOTOFLOW IA CEO)
// Dos preguntas distintas, separadas a propósito:
//   ESTADO ACTUAL — "¿qué tengo encima HOY?" Empieza por las cuotas vencidas
//     (cuántas y cuánto): deuda exigible, no proyección.
//   MES POR MES  — "¿cuánto tengo que facturar para cubrir lo que viene?"
//     6 meses, y cada fila SOLO con lo que vence dentro de ese mes.
// Antes iban mezclados: el mes en curso arrastraba todo lo vencido y no se
// podía distinguir lo que hay que resolver de lo que hay que planificar.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import {
  Loader2, RefreshCw, TrendingUp, Receipt, Truck, Wallet, Target, Info, AlertTriangle, Activity, Bike,
} from 'lucide-react';

const money = (v) => `RD$ ${(Number(v) || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (v) => `RD$ ${(Number(v) || 0).toLocaleString('es-DO', { maximumFractionDigits: 0 })}`;
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const mesLabel = (ym) => {
  const [a, m] = String(ym || '').split('-');
  return m ? `${MESES[Number(m) - 1]} ${a}` : ym;
};

// Semaforo del cumplimiento. Los cortes no son caprichosos: por debajo de
// 50% el mes ya no se recupera solo, y sobre 90% se considera cumplido.
const tonoPct = (pct) => {
  if (pct == null) return 'text-slate-400';
  if (pct >= 90) return 'text-emerald-600';
  if (pct >= 50) return 'text-amber-600';
  return 'text-rose-600';
};
const barraPct = (pct) => (pct >= 90 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500');

// Una linea del cumplimiento: lo que tocaba, lo que se pago, lo que falta.
const FilaCumplimiento = ({ icon: Icon, etiqueta, nota, cant, debia, pagado, pct }) => {
  const falta = Math.max(0, Number(debia || 0) - Number(pagado || 0));
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold text-slate-800">
              {etiqueta}
              {cant != null && <span className="text-slate-400 font-normal"> · {cant}</span>}
            </div>
            {nota && <div className="text-[11px] text-slate-500">{nota}</div>}
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right text-slate-700">{money0(debia)}</td>
      <td className="px-3 py-2.5 text-right text-emerald-700 font-semibold">{money0(pagado)}</td>
      <td className="px-3 py-2.5 text-right text-rose-600">{money0(falta)}</td>
      <td className="px-3 py-2.5 text-right">
        <div className={`font-black ${tonoPct(pct)}`}>{pct != null ? `${pct}%` : '—'}</div>
        {/* la barra hace comparable de un vistazo lo que el numero dice exacto */}
        <div className="h-1.5 rounded-full bg-slate-200 mt-1 overflow-hidden">
          <div className={`h-full rounded-full ${barraPct(pct)}`}
            style={{ width: `${Math.min(100, Math.max(0, Number(pct) || 0))}%` }} />
        </div>
      </td>
    </tr>
  );
};

const Tarjeta = ({ icon: Icon, titulo, valor, detalle, tono = 'slate', pie = null }) => {
  const tonos = {
    slate:   'bg-slate-50 text-slate-700 border-slate-200',
    rose:    'bg-rose-50 text-rose-700 border-rose-200',
    amber:   'bg-amber-50 text-amber-700 border-amber-200',
    indigo:  'bg-indigo-50 text-indigo-700 border-indigo-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  return (
    <div className={`rounded-xl border p-4 ${tonos[tono]}`}>
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide">
        <Icon className="w-4 h-4" /> {titulo}
      </div>
      <div className="text-2xl font-black mt-1 leading-tight">{valor}</div>
      {detalle && <div className="text-[11px] opacity-80 mt-0.5">{detalle}</div>}
      {pie && (
        <div className="text-[11px] font-semibold mt-2 pt-2 border-t border-current/15">{pie}</div>
      )}
    </div>
  );
};

const GestionEmpresarialPage = () => {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [falta, setFalta] = useState(false);   // el SQL aún no se ha corrido

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data: res, error } = await supabase.rpc('get_gestion_empresarial_ia', { p_meses: 6 });
    if (error) {
      // Si la función no existe todavía se explica en pantalla, sin alarmar.
      if (/get_gestion_empresarial_ia|function/i.test(error.message)) setFalta(true);
      else toast({ variant: 'destructive', title: 'No se pudo calcular', description: error.message });
      setData(null);
    } else {
      setFalta(false);
      setData(res || null);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const meses = data?.meses || [];
  const tot = data?.totales || {};
  const margen = data?.margen_pct;
  // Estado actual = la foto de HOY. Va arriba y no entra en ningún mes.
  const estado = data?.estado_actual || {};
  const vencidasCant = Number(estado.cuotas_vencidas_cant) || 0;
  const vencidasMonto = Number(estado.cuotas_vencidas_monto) || 0;
  const motosCant = Number(estado.motos_unidades) || 0;
  const motosValor = Number(estado.motos_valor) || 0;
  const grupo = Number(data?.empresas_grupo) || 1;

  // Escala de las barras: el mes más pesado marca el 100%
  const maxMes = useMemo(
    () => Math.max(1, ...meses.map((m) => Number(m.total_cubrir) || 0)),
    [meses]
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Helmet><title>Gestión Empresarial IA — MotoFlow</title></Helmet>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="p-2 rounded-lg bg-indigo-600 text-white"><TrendingUp className="w-5 h-5" /></div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-slate-800 leading-tight">Gestión Empresarial IA</h1>
          <p className="text-xs text-muted-foreground">
            Lo que la empresa debe cubrir en los próximos 6 meses y cuánto hay que facturar para lograrlo.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={cargar} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>

      {falta && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0" />
          <div className="text-sm text-amber-900">
            <b>Falta activar el cálculo.</b> Corre <code>sql/gestion_empresarial_ia.sql</code> en la base
            de datos y vuelve a entrar.
          </div>
        </div>
      )}

      {loading && !data && (
        <div className="py-16 text-center text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Calculando…
        </div>
      )}

      {data && (
        <>
          {/* Resumen de los 6 meses */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Las cuotas VENCIDAS viven aquí: es un numero de alarma, no un
                analisis. El recuadro verde quedo para el cumplimiento. */}
            <Tarjeta icon={Receipt} tono="rose" titulo="Compromisos (6m)"
              valor={money0(tot.compromisos)} detalle="Nómina, alquiler, servicios…"
              pie={vencidasCant > 0 && (
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <b>{vencidasCant}</b> cuotas vencidas · <b>{money0(vencidasMonto)}</b>
                </span>
              )} />
            {/* Frente a lo que se debe, con que se responde */}
            <Tarjeta icon={Truck} tono="amber" titulo="Suplidores (6m)"
              valor={money0(tot.suplidores)}
              detalle={data.suplidores_de
                ? `Cuentas por pagar de ${data.suplidores_de}`
                : 'Cuentas por pagar pendientes'}
              pie={motosCant > 0 && (
                <span className="flex items-center gap-1.5">
                  <Bike className="w-3.5 h-3.5 flex-shrink-0" />
                  <b>{motosCant}</b> motos en inventario · <b>{money0(motosValor)}</b>
                </span>
              )} />
            <Tarjeta icon={Wallet} tono="slate" titulo="Gastos estimados (6m)"
              valor={money0(tot.gastos)}
              detalle={`≈ ${money0(data.gasto_diario)}/día (real 90 días)${grupo > 1 ? ` · ${grupo} empresas` : ''}`} />
            <Tarjeta icon={Target} tono="indigo" titulo="Total a cubrir (6m)"
              valor={money0(tot.total_cubrir)} detalle="Compromisos + suplidores + gastos" />
          </div>

          {/* ESTADO ACTUAL = CUMPLIMIENTO DEL MES. No "cuánto debo" (eso está
              arriba y abajo), sino "de lo que tocaba este mes, cuánto llevo
              pagado". Es la única cifra del panel que mide desempeño. */}
          <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Activity className="w-5 h-5 text-emerald-700" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                Estado actual — cumplimiento de {mesLabel(estado.mes)}
              </span>
              <span className="flex-1" />
              {estado.total_pct != null && (
                <span className={`text-2xl font-black ${tonoPct(estado.total_pct)}`}>
                  {estado.total_pct}%
                </span>
              )}
            </div>

            <div className="rounded-lg bg-white/80 border border-emerald-200 overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="text-[10px] uppercase tracking-wide text-slate-500 border-b">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Concepto</th>
                    <th className="text-right px-3 py-2 font-semibold">Se debía pagar</th>
                    <th className="text-right px-3 py-2 font-semibold">Pagado</th>
                    <th className="text-right px-3 py-2 font-semibold">Falta</th>
                    <th className="text-right px-3 py-2 font-semibold">Cumplimiento</th>
                  </tr>
                </thead>
                <tbody>
                  <FilaCumplimiento icon={Receipt} etiqueta="Compromisos"
                    nota="Nómina, alquiler, servicios, préstamos"
                    cant={estado.compromisos_cant} debia={estado.compromisos_debia}
                    pagado={estado.compromisos_pagado} pct={estado.compromisos_pct} />
                  <FilaCumplimiento icon={Truck} etiqueta="Pagos a suplidores"
                    nota="Cuotas que vencen dentro del mes"
                    cant={estado.suplidores_cant} debia={estado.suplidores_debia}
                    pagado={estado.suplidores_pagado} pct={estado.suplidores_pct} />
                </tbody>
                <tfoot className="border-t-2 border-emerald-200 bg-emerald-50/60">
                  <tr className="font-bold">
                    <td className="px-3 py-2">Total del mes</td>
                    <td className="px-3 py-2 text-right">{money0(estado.total_debia)}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{money0(estado.total_pagado)}</td>
                    <td className="px-3 py-2 text-right text-rose-600">
                      {money0(Number(estado.total_debia || 0) - Number(estado.total_pagado || 0))}
                    </td>
                    <td className={`px-3 py-2 text-right ${tonoPct(estado.total_pct)}`}>
                      {estado.total_pct != null ? `${estado.total_pct}%` : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Facturación necesaria — esto SÍ es proyección, va aparte */}
          <div className="rounded-xl border bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <TrendingUp className="w-4 h-4 text-slate-600" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                Facturación necesaria — próximos 6 meses
              </span>
              <span className="flex-1" />
              <span className="text-2xl font-black text-slate-700">{money0(tot.facturacion_necesaria)}</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {margen != null ? (
                <>Calculado con el margen real de la empresa (<b>{margen}%</b> de los últimos 90 días):
                  para cubrir {money0(tot.total_cubrir)} hay que vender más, porque cada venta deja solo su margen.</>
              ) : (
                <>Aún no hay datos de costo suficientes para calcular el margen, así que se muestra el monto
                  a cubrir tal cual. Al registrar costos en las ventas, este número se ajusta solo.</>
              )}
            </p>
          </div>

          {/* Mes por mes */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-4 py-2 border-b bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-600">
              Mes por mes
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs">
                  <tr>
                    <th className="text-left px-3 py-2">Mes</th>
                    <th className="text-right px-3 py-2">Compromisos</th>
                    <th className="text-right px-3 py-2">
                      Suplidores
                      {data.suplidores_de && (
                        <div className="font-normal normal-case text-[10px] text-amber-700">{data.suplidores_de}</div>
                      )}
                    </th>
                    <th className="text-right px-3 py-2">Gastos est.</th>
                    <th className="text-right px-3 py-2">Total a cubrir</th>
                    <th className="text-right px-3 py-2">Hay que facturar</th>
                  </tr>
                </thead>
                <tbody>
                  {meses.map((m, i) => (
                    <tr key={m.mes} className={`border-b last:border-0 ${i === 0 ? 'bg-indigo-50/40' : ''}`}>
                      <td className="px-3 py-2 font-semibold whitespace-nowrap">
                        {mesLabel(m.mes)}
                        {i === 0 && <span className="ml-1 text-[10px] text-indigo-700 font-bold">(actual)</span>}
                        <div className="h-1.5 rounded-full bg-slate-200 mt-1 w-28 overflow-hidden">
                          <motion.div className="h-full rounded-full bg-indigo-500"
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, (Number(m.total_cubrir) / maxMes) * 100)}%` }}
                            transition={{ duration: 0.6 }} />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-rose-700">
                        {money(m.compromisos)}
                        {m.compromisos_cant > 0 && <div className="text-[10px] text-muted-foreground">{m.compromisos_cant} pago{m.compromisos_cant !== 1 ? 's' : ''}</div>}
                      </td>
                      <td className="px-3 py-2 text-right text-amber-700">
                        {money(m.suplidores)}
                        {m.suplidores_cant > 0 && <div className="text-[10px] text-muted-foreground">{m.suplidores_cant} cuota{m.suplidores_cant !== 1 ? 's' : ''}</div>}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">{money(m.gastos)}</td>
                      <td className="px-3 py-2 text-right font-bold">{money(m.total_cubrir)}</td>
                      <td className="px-3 py-2 text-right font-black text-emerald-700">{money(m.facturacion_necesaria)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-bold">
                  <tr>
                    <td className="px-3 py-2">Total 6 meses</td>
                    <td className="px-3 py-2 text-right text-rose-700">{money(tot.compromisos)}</td>
                    <td className="px-3 py-2 text-right text-amber-700">{money(tot.suplidores)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{money(tot.gastos)}</td>
                    <td className="px-3 py-2 text-right">{money(tot.total_cubrir)}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{money(tot.facturacion_necesaria)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Historial real de gastos */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Wallet className="w-4 h-4 text-slate-600" />
              <h2 className="font-semibold text-sm">Historial de gastos (últimos 6 meses)</h2>
              <span className="text-[11px] text-muted-foreground">de aquí sale el gasto estimado</span>
            </div>
            {(data.historial_gastos || []).length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">
                Todavía no hay gastos registrados en meses anteriores.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {data.historial_gastos.map((h) => (
                  <div key={h.mes} className="rounded-lg border p-2">
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">{mesLabel(h.mes)}</div>
                    <div className="font-bold text-slate-800">{money0(h.monto)}</div>
                    <div className="text-[10px] text-muted-foreground">{h.cant} gasto{h.cant !== 1 ? 's' : ''}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            Los compromisos y las cuentas por pagar son montos <b>reales ya comprometidos</b>. El gasto
            operativo es una <b>estimación</b> basada en el promedio diario de los últimos 90 días.
          </p>
        </>
      )}
    </div>
  );
};

export default GestionEmpresarialPage;
