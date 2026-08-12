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
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { formatFechaDMY } from '@/lib/dateUtils';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Loader2, RefreshCw, TrendingUp, Receipt, Truck, Wallet, Target, Info, AlertTriangle, Activity, Bike,
  Scale, Landmark, ArrowLeftRight, Banknote,
} from 'lucide-react';

const money = (v) => `RD$ ${(Number(v) || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usd0 = (v) => `US$ ${(Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const usdMonto = (v) => `US$ ${(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (v) => `RD$ ${(Number(v) || 0).toLocaleString('es-DO', { maximumFractionDigits: 0 })}`;
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const mesLabel = (ym) => {
  const [a, m] = String(ym || '').split('-');
  return m ? `${MESES[Number(m) - 1]} ${a}` : ym;
};

// Una linea de la posicion: concepto, su aclaracion, y el monto.
const FilaPos = ({ icon: Icon, etiqueta, nota, monto, tachado }) => (
  <div className="flex items-start gap-2 py-1.5">
    <Icon className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
    <div className="min-w-0 flex-1">
      <div className="text-sm text-slate-800 leading-tight">{etiqueta}</div>
      {nota && <div className="text-[10px] text-slate-500">{nota}</div>}
    </div>
    <div className={`text-sm font-semibold whitespace-nowrap ${
      tachado ? 'line-through text-slate-400' : 'text-slate-800'}`}>
      {money0(monto)}
    </div>
  </div>
);

// Semaforo del cumplimiento. Los cortes no son caprichosos: por debajo de
// 50% el mes ya no se recupera solo, y sobre 90% se considera cumplido.
const tonoPct = (pct) => {
  if (pct == null) return 'text-slate-400';
  if (pct >= 90) return 'text-emerald-600';
  if (pct >= 50) return 'text-amber-600';
  return 'text-rose-600';
};
const barraPct = (pct) => (pct >= 90 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500');

// Una barra de INGRESOS. Todas se miden contra el MISMO total —lo que el mes
// pide— para que se vea de un vistazo qué parte cubre cada empresa; si cada
// una se escalara a su propio máximo, dos montos muy distintos se verían
// iguales. `partes` son los segmentos que suman el monto de la barra.
const BarraIngreso = ({ etiqueta, monto, meta, partes = [], nota, fuerte }) => {
  const pct = meta > 0 ? Math.min(100, (Number(monto) || 0) * 100 / meta) : 0;
  const conValor = partes.filter((p) => Number(p.monto) > 0);
  return (
    <div className="py-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className={`${fuerte ? 'text-sm font-bold' : 'text-[12px] font-semibold'} text-slate-700`}>
          {etiqueta}
        </span>
        <span className="flex-1" />
        <span className={`${fuerte ? 'text-lg' : 'text-sm'} font-black text-emerald-700 whitespace-nowrap`}>
          {money0(monto)}
        </span>
        {meta > 0 && (
          <span className="text-[11px] font-bold text-slate-400 w-12 text-right">{pct.toFixed(1)}%</span>
        )}
      </div>
      <div className="h-2.5 rounded-full bg-slate-200 mt-1 overflow-hidden flex">
        {/* los segmentos van dentro de la misma barra: el largo total es lo
            que entró, y cada tono dice de dónde vino */}
        {conValor.length > 0 ? conValor.map((p) => (
          <motion.div key={p.etiqueta} className={`h-full ${p.color}`}
            initial={{ width: 0 }}
            animate={{ width: `${meta > 0 ? Math.min(100, (Number(p.monto) || 0) * 100 / meta) : 0}%` }}
            transition={{ duration: 0.6 }} />
        )) : (
          <motion.div className="h-full bg-emerald-500"
            initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} />
        )}
      </div>
      {(nota || partes.length > 0) && (
        <div className="flex items-center gap-3 flex-wrap mt-1 text-[10px] text-slate-500">
          {partes.map((p) => (
            <span key={p.etiqueta} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-sm ${Number(p.monto) > 0 ? p.color : 'bg-slate-300'}`} />
              {p.etiqueta} <b className="text-slate-600">{money0(p.monto)}</b>
              {p.cant > 0 && <span className="text-slate-400">({p.cant})</span>}
            </span>
          ))}
          {nota && <span>{nota}</span>}
        </div>
      )}
    </div>
  );
};

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

const GestionEmpresarialPage = () => {
  const { toast } = useToast();
  const { empresa } = useAuth();
  // Una tienda de repuestos NO tiene cartera de préstamos. Lo que vende
  // fiado es una cuenta por cobrar de toda la vida, no una venta a la que
  // se le olvidó el préstamo. Ver la nota junto a la línea.
  const financia = empresa?.tipo_negocio === 'dealer' || empresa?.tipo_negocio === 'financiera';
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
  const grupo = Number(data?.empresas_grupo) || 1;
  const pos = data?.posicion || {};
  const ing = data?.ingresos_mes || {};
  const ventasMes = Number(data?.ventas_mes) || 0;
  // Cuántas veces habría que multiplicar las ventas del mes para llegar a
  // lo que exige la deuda. Es el número que pone el objetivo en escala.
  const vecesVentas = ventasMes > 0
    ? (Number(tot.facturacion_necesaria) || 0) / 6 / ventasMes
    : null;

  // Escala de las barras: el mes más pesado marca el 100%
  const maxMes = useMemo(
    () => Math.max(1, ...meses.map((m) => Number(m.total_cubrir) || 0)),
    [meses]
  );

  // Detalle de las cuotas a suplidores de un mes: doble clic en su celda.
  // No se trae junto con el panel porque son 60+ facturas en los 6 meses y
  // casi nunca se miran; se pide solo la del mes que se abre.
  const [detalle, setDetalle] = useState(null);   // { mes, filas } | null
  const [cargandoDet, setCargandoDet] = useState(false);

  // Un solo cargador para los dos detalles: por mes y el de las vencidas.
  // Las filas tienen la misma forma, así que la tabla del modal es la misma.
  const abrirDetalle = useCallback(async ({ mes = null, vencidas = false }) => {
    setDetalle({ mes, vencidas, filas: [] });
    setCargandoDet(true);
    const rpc = vencidas ? 'get_gestion_suplidores_vencidas' : 'get_gestion_suplidores_mes';
    const { data: filas, error } = await supabase.rpc(rpc, vencidas ? {} : { p_mes: mes });
    setCargandoDet(false);
    if (error) {
      setDetalle(null);
      toast({
        title: 'No se pudo abrir el detalle',
        description: error.message.includes(rpc)
          ? `Falta correr sql/gestion_detalle_suplidores_${vencidas ? 'vencidas' : 'mes'}.sql`
          : error.message,
        variant: 'destructive',
      });
      return;
    }
    setDetalle({ mes, vencidas, filas: filas || [] });
  }, [toast]);

  const detTotal = (detalle?.filas || []).reduce((a, f) => a + (Number(f.total) || 0), 0);
  const detPendiente = (detalle?.filas || []).reduce((a, f) => a + (Number(f.pendiente) || 0), 0);
  // Casi todas estas facturas se pactaron en DÓLARES, cada una con la tasa
  // del día en que se compró. Sumar los RD$ mezcla tasas distintas, así que
  // el subtotal en US$ va aparte — es la deuda real con el suplidor.
  const detUsd = (detalle?.filas || []).reduce((a, f) => a + (Number(f.total_usd) || 0), 0);
  const detUsdPend = (detalle?.filas || []).reduce((a, f) => a + (Number(f.pendiente_usd) || 0), 0);

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
          {/* POSICIÓN DEL GRUPO — lo único de esta pantalla que NO se puede
              deducir de la tabla de abajo. Las 4 tarjetas que había aquí eran
              exactamente la suma de sus 4 columnas: no aportaban un dato. */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-4 py-2 border-b bg-slate-50 flex items-center gap-2 flex-wrap">
              <Scale className="w-4 h-4 text-slate-600" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                Posición {grupo > 1 ? `del grupo · ${grupo} empresas` : 'de la empresa'}
              </span>
              <span className="flex-1" />
              <span className="text-[11px] text-slate-500">al {data.generado}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
              {/* TENEMOS */}
              <div className="p-4">
                <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 mb-2">
                  Lo que tenemos
                </div>
                {/* De donde sale el total: cuanto hay en pesos y cuantos
                    dolares. Sin esto, si la tasa se mueve el numero cambia
                    y no se sabe por que. */}
                <FilaPos icon={Wallet} etiqueta="Caja y bancos" monto={pos.caja_bancos}
                  nota={Number(pos.caja_usd) > 0
                    ? `${money0(pos.caja_dop)} en pesos + ${usd0(pos.caja_usd)} a ${data.tasa_usd}`
                    : (Number(pos.caja_dop) > 0 ? `${money0(pos.caja_dop)} en pesos` : null)} />
                <FilaPos icon={Bike} etiqueta="Motos en inventario" monto={pos.motos_valor}
                  nota={`${pos.motos_unidades || 0} unidades al costo`} />
                {/* La cartera con sus tres partes, tal como la muestra su
                    propio modulo: capital afuera + interes + mora. Si la
                    financiera no esta activa no hay cartera, y se omite en
                    vez de mostrar un cero que parezca un dato. */}
                {Number(pos.cartera_total) > 0 && (
                  <FilaPos icon={Landmark} etiqueta="Cartera de préstamos" monto={pos.cartera_total}
                    nota={`${pos.cartera_cantidad || 0} activos · ${money0(pos.cartera_capital)} capital + ${money0(pos.cartera_interes)} interés${
                      Number(pos.cartera_mora) > 0 ? ` + ${money0(pos.cartera_mora)} mora` : ''}`} />
                )}
                {/* La misma cifra significa dos cosas distintas segun quien
                    la mire, y por eso se pinta de dos formas.

                    En un DEALER o una FINANCIERA todo lo que se vende a
                    credito pasa a la cartera. Si algo queda aqui es una venta
                    que NO genero su prestamo — ya paso con las facturas 12 y
                    17 — y entonces es una alerta, no un activo.

                    En una tienda de REPUESTOS no hay cartera ninguna: Morla
                    tiene cero prestamos. Lo que se vende fiado en el mostrador
                    es una cuenta por cobrar normal, y llamarla "deberia estar
                    en la cartera" mandaba a buscar un error que no existe. */}
                {Number(pos.por_cobrar) > 0 && (
                  financia ? (
                    <div className="flex items-start gap-2 py-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-slate-800 leading-tight">
                          Ventas a crédito sin préstamo
                          {pos.por_cobrar_cant ? <span className="text-slate-400 font-normal"> · {pos.por_cobrar_cant}</span> : null}
                        </div>
                        <div className="text-[10px] text-amber-600">
                          deberían estar en la cartera — revisar
                        </div>
                      </div>
                      <div className="text-sm font-semibold whitespace-nowrap text-amber-600">
                        {money0(pos.por_cobrar)}
                      </div>
                    </div>
                  ) : (
                    <FilaPos icon={Receipt} etiqueta="Por cobrar a clientes" monto={pos.por_cobrar}
                      nota={`${pos.por_cobrar_cant || 0} facturas fiadas sin saldar`} />
                  )
                )}
                <div className="flex items-center justify-between pt-2 mt-1 border-t font-bold">
                  <span className="text-sm">Total</span>
                  <span className="text-lg text-emerald-700">{money0(pos.activos)}</span>
                </div>
              </div>

              {/* DEBEMOS */}
              <div className="p-4">
                <div className="text-[11px] font-bold uppercase tracking-wide text-rose-700 mb-2">
                  Lo que debemos
                </div>
                <FilaPos icon={Truck} etiqueta="Suplidores" monto={pos.suplidores}
                  nota={`${pos.suplidores_cuotas || 0} cuotas pendientes`} />
                {vencidasCant > 0 && (
                  /* La parte vencida de esa misma deuda: no es otro monto, es
                     el pedazo que ya se pasó de fecha y hay que resolver. */
                  <div className="flex items-center gap-1.5 -mt-1 mb-1 ml-6 text-[11px] text-rose-600 font-semibold
                      cursor-pointer select-none rounded hover:bg-rose-50 px-1 -mx-1"
                    onDoubleClick={() => abrirDetalle({ vencidas: true })}
                    title="Doble clic para ver cuáles son">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                    <span>de eso, <b>{vencidasCant}</b> cuotas ya vencidas</span>
                    <span className="text-[9px] font-normal text-rose-400">doble clic</span>
                    <span className="flex-1" />
                    <span>{money0(vencidasMonto)}</span>
                  </div>
                )}
                <FilaPos icon={Receipt} etiqueta="Compromisos" monto={pos.compromisos}
                  nota={`${pos.compromisos_cant || 0} vivos · nómina, alquiler, préstamos`} />
                {/* DEUDAS PERSONALES (modulo SAN). Es plata que hay que
                    devolver, asi que pesa igual que un suplidor. Ocupa el
                    lugar de la linea "entre empresas", que ya no aportaba:
                    se sabe que se elimina y en cuanto. */}
                {Number(pos.deudas_personales) > 0 && (
                  <FilaPos icon={Landmark} etiqueta="Deudas personales" monto={pos.deudas_personales}
                    nota={`${pos.deudas_personales_cant || 0} · del módulo SAN Ahorro`} />
                )}
                <div className="flex items-center justify-between pt-2 mt-1 border-t font-bold">
                  <span className="text-sm">Total</span>
                  <span className="text-lg text-rose-700">{money0(pos.pasivos)}</span>
                </div>
              </div>
            </div>

            <div className={`px-4 py-3 flex items-center gap-2 flex-wrap border-t ${
              Number(pos.neta) >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                Posición neta
              </span>
              <span className="flex-1" />
              <span className={`text-2xl font-black ${
                Number(pos.neta) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {Number(pos.neta) >= 0 ? '+' : ''}{money0(pos.neta)}
              </span>
            </div>
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
                    <td className="px-3 py-2">
                      Total del mes
                      {/* SE DEBIA PAGAR es exactamente la fila de este mes en la
                          tabla de abajo: el mismo numero mirado dos veces. En
                          compromisos el dato firme es FALTA (los pendientes del
                          modulo); "pagado" es el resto, se pague con fecha o lo
                          empuje la recurrencia al mes siguiente. */}
                      <span className="block text-[10px] font-normal text-slate-500">
                        «Se debía pagar» es la fila de {mesLabel(estado.mes)} en «Mes por mes».
                        En compromisos, «falta» son los que siguen pendientes; el resto ya está cubierto
                      </span>
                    </td>
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

          {/* INGRESOS DEL MES — la otra cara de Estado actual. Arriba se ve
              cuánto pide el mes; aquí, con qué se está pagando. Va pegado
              debajo a propósito: el mismo mes y la misma cifra de referencia
              (el «se debía pagar»), para poder mirarlos juntos. */}
          <div className="rounded-xl border-2 border-sky-200 bg-sky-50/60 p-4">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Banknote className="w-5 h-5 text-sky-700" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-sky-800">
                Ingresos del mes — {mesLabel(ing.mes || estado.mes)}
              </span>
              <span className="flex-1" />
              {ing.pct != null && (
                <span className={`text-2xl font-black ${tonoPct(ing.pct)}`}>{ing.pct}%</span>
              )}
            </div>

            <div className="rounded-lg bg-white/80 border border-sky-200 px-4 py-2">
              <BarraIngreso
                etiqueta={ing.dealer_nombre || 'Ventas'}
                monto={ing.dealer_total}
                meta={Number(ing.meta) || 0}
                partes={[
                  { etiqueta: 'Contado', monto: ing.contado, cant: ing.contado_cant, color: 'bg-emerald-600' },
                  { etiqueta: 'Iniciales', monto: ing.iniciales, cant: ing.iniciales_cant, color: 'bg-emerald-400' },
                  { etiqueta: 'Abonos', monto: ing.abonos, cant: ing.abonos_cant, color: 'bg-emerald-300' },
                ]}
              />
              <div className="border-t" />
              <BarraIngreso
                etiqueta={ing.fin_nombre || 'Cobros'}
                monto={ing.recibos}
                meta={Number(ing.meta) || 0}
                partes={[
                  { etiqueta: 'Recibos de ingreso', monto: ing.recibos, cant: ing.recibos_cant, color: 'bg-sky-500' },
                ]}
              />
            </div>

            {/* La linea que cierra la idea: todo lo que entro contra todo lo
                que el mes pide. Es el mismo "se debia pagar" del panel de
                arriba, para que los dos se puedan comparar sin cuentas. */}
            <div className="mt-2 rounded-lg bg-white border border-sky-300 px-4 py-2">
              <BarraIngreso
                fuerte
                etiqueta="Total de ingresos"
                monto={ing.total}
                meta={Number(ing.meta) || 0}
              />
              <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-600 -mt-1">
                <span>contra el «se debía pagar» de <b>{money0(ing.meta)}</b></span>
                {Number(ing.falta) > 0 ? (
                  <>
                    <span className="text-slate-400">·</span>
                    <span className="text-rose-600 font-semibold">
                      faltan {money0(ing.falta)} por entrar
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-slate-400">·</span>
                    <span className="text-emerald-700 font-semibold">el mes está cubierto</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Que lee la tabla, dicho antes de la tabla: cada fila es lo que
              VENCE en el mes, completo. Sin esta linea el mes en curso parece
              contradecir a Estado actual, que ya descuenta lo pagado. Y sin lo
              de la ventana, el total parece ser toda la deuda a suplidores. */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2 text-[11px] text-amber-800">
            Cada fila es <b>lo que hay que pagar en ese mes</b>, completo: los compromisos fijos más la
            nómina, y las cuotas que vencen. La de {mesLabel(estado.mes)} es el «se debía pagar» de arriba,
            donde se ve cuánto ya está cubierto.
            {Number(data.suplidores_fuera_ventana) > 0 && (
              <> Fuera de esta ventana de {meses.length} meses —vencido de antes y cuotas de años
                siguientes— quedan <b>{money0(data.suplidores_fuera_ventana)}</b> pendientes con suplidores.</>
            )}
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
                      <div className="font-normal normal-case text-[10px] text-slate-400">doble clic: ver facturas</div>
                    </th>
                    <th className="text-right px-3 py-2">Gastos est.</th>
                    <th className="text-right px-3 py-2">Total a cubrir</th>
                    {/* La cartera entra completa: sin esta columna, "hay que
                        facturar" parece un numero sacado de la nada. */}
                    <th className="text-right px-3 py-2">
                      Cobros cartera
                      <div className="font-normal normal-case text-[10px] text-emerald-700">entra completo</div>
                    </th>
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
                      {/* doble clic = el detalle de las facturas del mes */}
                      <td className="px-3 py-2 text-right text-amber-700 cursor-pointer select-none hover:bg-amber-50"
                        onDoubleClick={() => abrirDetalle({ mes: m.mes })}
                        title="Doble clic para ver las facturas que vencen este mes">
                        {money(m.suplidores)}
                        {m.suplidores_cant > 0 && <div className="text-[10px] text-muted-foreground">{m.suplidores_cant} cuota{m.suplidores_cant !== 1 ? 's' : ''}</div>}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">{money(m.gastos)}</td>
                      <td className="px-3 py-2 text-right font-bold">{money(m.total_cubrir)}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">
                        {Number(m.cobros) > 0 ? `− ${money(m.cobros)}` : '—'}
                        {m.cobros_cant > 0 && <div className="text-[10px] text-muted-foreground">{m.cobros_cant} cuota{m.cobros_cant !== 1 ? 's' : ''}</div>}
                      </td>
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
                    <td className="px-3 py-2 text-right text-emerald-700">
                      {Number(tot.cobros) > 0 ? `− ${money(tot.cobros)}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-emerald-700">{money(tot.facturacion_necesaria)}</td>
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
                  cada venta deja solo su margen, así que hay que vender bastante más de lo que se debe.</>
              ) : (
                <>Aún no hay datos de costo suficientes para calcular el margen, así que se muestra el monto
                  a cubrir tal cual. Al registrar costos en las ventas, este número se ajusta solo.</>
              )}
            </p>

            {/* La cuenta completa, porque el numero grande no se explica solo.
                Las cuotas de la cartera entran completas —el margen ya lo dejo
                la venta de la moto— asi que se restan ANTES de dividir entre
                el margen. Sin esto pedia 92 millones en vez de 52. */}
            <div className="mt-2 flex items-center gap-1.5 flex-wrap text-[11px] text-slate-500">
              <span>Hay que cubrir <b className="text-slate-700">{money0(tot.total_cubrir)}</b></span>
              {Number(tot.cobros) > 0 && (
                <>
                  <span className="text-slate-400">−</span>
                  <span>la cartera debe recaudar{' '}
                    <b className="text-emerald-700">{money0(tot.cobros)}</b>
                    <span className="text-slate-400"> (entra completo)</span>
                  </span>
                  <span className="text-slate-400">=</span>
                  <span>quedan <b className="text-slate-700">{money0(tot.falta_cubrir)}</b> que salen de vender</span>
                </>
              )}
            </div>

            {/* El objetivo contra la realidad. Sin esto el número es una cifra
                enorme sin escala: no se sabe si falta poco o es inalcanzable. */}
            {vecesVentas != null && (
              <div className="mt-2 pt-2 border-t flex items-center gap-3 flex-wrap text-[11px]">
                <span className="text-slate-500">
                  Hacen falta <b className="text-slate-700">{money0((Number(tot.facturacion_necesaria) || 0) / 6)}</b> al mes
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">
                  este mes vas por <b className="text-slate-700">{money0(ventasMes)}</b>
                </span>
                <span className="flex-1" />
                <span className={`px-2 py-0.5 rounded-full font-bold ${
                  vecesVentas <= 1 ? 'bg-emerald-100 text-emerald-700'
                    : vecesVentas <= 3 ? 'bg-amber-100 text-amber-700'
                    : 'bg-rose-100 text-rose-700'}`}>
                  {vecesVentas <= 1
                    ? 'la meta está cubierta'
                    : `habría que vender ${vecesVentas.toFixed(1)}× más`}
                </span>
              </div>
            )}
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

      {/* DETALLE DE SUPLIDORES DEL MES. El pie repite el total para que se
          vea que es exactamente la cifra de la fila: si no cuadrara, el
          detalle no serviría. */}
      <Dialog open={!!detalle} onOpenChange={(v) => !v && setDetalle(null)}>
        {/* Ancho casi de pantalla: con 3xl el nombre del suplidor partia en
            cuatro lineas y la columna Pendiente quedaba fuera, obligando a
            desplazarse en horizontal para leer la mitad de la tabla. */}
        <DialogContent className="w-[95vw] max-w-[1400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detalle?.vencidas
                ? <><AlertTriangle className="w-4 h-4 text-rose-600" />Cuotas a suplidores ya vencidas</>
                : <><Truck className="w-4 h-4 text-amber-600" />Facturas que vencen en {mesLabel(detalle?.mes)}</>}
            </DialogTitle>
          </DialogHeader>

          {cargandoDet ? (
            <div className="py-10 text-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
              Buscando las facturas…
            </div>
          ) : (detalle?.filas || []).length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              {detalle?.vencidas
                ? 'No hay cuotas vencidas: todo lo que se pasó de fecha ya está pagado.'
                : 'Ninguna cuota vence en este mes.'}
            </div>
          ) : (
            <div className="max-h-[68vh] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 whitespace-nowrap">Vence</th>
                    {/* Cuánto lleva vencida decide a quién se le paga primero;
                        sin eso la lista es un montón de fechas sin orden. */}
                    {detalle.vencidas && <th className="text-right px-3 py-2 whitespace-nowrap">Atraso</th>}
                    <th className="text-left px-3 py-2 whitespace-nowrap">Factura</th>
                    {/* el suplidor se lleva el espacio sobrante: es lo unico
                        de ancho variable, el resto son fechas y montos */}
                    <th className="text-left px-3 py-2 w-full">Suplidor</th>
                    <th className="text-left px-3 py-2 whitespace-nowrap">Fecha</th>
                    <th className="text-right px-3 py-2 whitespace-nowrap">Monto</th>
                    <th className="text-right px-3 py-2 whitespace-nowrap">Pendiente</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.filas.map((f, i) => (
                    <tr key={`${f.numero}-${i}`} className="border-t">
                      {/* Siempre día/mes/año: el RPC las manda en ISO y así
                          salían crudas, distinto al resto del sistema. */}
                      <td className="px-3 py-2 whitespace-nowrap font-semibold">{formatFechaDMY(f.vence)}</td>
                      {detalle.vencidas && (
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <span className={`font-bold ${
                            f.dias_vencida >= 90 ? 'text-rose-700'
                              : f.dias_vencida >= 30 ? 'text-rose-500' : 'text-amber-600'}`}>
                            {f.dias_vencida} día{f.dias_vencida === 1 ? '' : 's'}
                          </span>
                        </td>
                      )}
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-[12px]">{f.numero}</td>
                      <td className="px-3 py-2 w-full">{f.suplidor}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground text-[12px]">
                        {formatFechaDMY(f.fecha)}
                        {Number(f.dias_credito) > 0 && (
                          <span className="text-slate-400"> +{f.dias_credito}d</span>
                        )}
                      </td>
                      {/* La factura en US$ manda: el RD$ es lo que costó a la
                          tasa de SU día, no a la de hoy. Por eso el dólar va
                          debajo, con la tasa con que se convirtió. */}
                      <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                        {money(f.total)}
                        {f.total_usd != null && (
                          <div className="text-[11px] font-bold text-sky-700">
                            {usdMonto(f.total_usd)}
                            {Number(f.tasa) > 0 && (
                              <span className="font-normal text-slate-400"> · a {f.tasa}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className={`px-3 py-2 text-right whitespace-nowrap ${
                        Number(f.pendiente) > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {Number(f.pendiente) > 0 ? money(f.pendiente) : 'pagada'}
                        {Number(f.pendiente) > 0 && f.pendiente_usd != null && (
                          <div className="text-[11px] font-bold text-sky-700">{usdMonto(f.pendiente_usd)}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-bold sticky bottom-0">
                  <tr className="border-t-2">
                    <td className="px-3 py-2" colSpan={detalle.vencidas ? 5 : 4}>
                      {detalle.filas.length} cuota{detalle.filas.length !== 1 ? 's' : ''}
                      <span className="block text-[10px] font-normal text-slate-500">
                        {detalle.vencidas
                          ? 'es la línea «cuotas ya vencidas» de la posición — lo que cuenta es el pendiente'
                          : `es la columna Suplidores de ${mesLabel(detalle.mes)}`}
                        {detUsd > 0 && ' · cada factura en US$ se convirtió con la tasa de su día'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-amber-700">
                      {money(detTotal)}
                      {detUsd > 0 && <div className="text-[11px] text-sky-700">{usdMonto(detUsd)} en dólares</div>}
                    </td>
                    <td className="px-3 py-2 text-right text-rose-600">
                      {money(detPendiente)}
                      {detUsdPend > 0 && <div className="text-[11px] text-sky-700">{usdMonto(detUsdPend)} en dólares</div>}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GestionEmpresarialPage;
