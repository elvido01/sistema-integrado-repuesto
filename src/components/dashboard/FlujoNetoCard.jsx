import React, { useState } from 'react';
import { Waves, TrendingUp, TrendingDown, Info, ChevronRight, Target } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import {
  formatCurrencyDOP, computeComparacion, computeMetaEstado, tonoClasses, metaEstadoClasses,
} from '@/lib/flujoNeto';
import FlujoNetoDesgloseModal from './FlujoNetoDesgloseModal';
import FlujoNetoMiniChart from './FlujoNetoMiniChart';

const INFO_TEXT =
  'Este indicador muestra los ingresos efectivamente cobrados menos los gastos, ' +
  'compromisos fijos y pagos a suplidores realizados durante el mes. ' +
  'No incluye obligaciones pendientes ni ventas a crédito todavía no cobradas.';

// Etiqueta compacta reutilizable (Mes anterior / Hoy / Promedio diario).
const MiniStat = ({ label, value, valueClass = 'text-slate-800' }) => (
  <div className="flex flex-col min-w-0">
    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 truncate">{label}</span>
    <span className={`text-[13px] font-black leading-tight truncate ${valueClass}`}>{value}</span>
  </div>
);

const SkeletonCard = () => (
  <div className="bg-white border rounded-xl shadow-sm p-4 flex flex-col h-[374px] animate-pulse">
    <div className="h-8 w-2/3 bg-slate-100 rounded mb-4" />
    <div className="h-10 w-1/2 bg-slate-100 rounded mb-4" />
    <div className="h-[84px] w-full bg-slate-100 rounded mb-4" />
    <div className="grid grid-cols-3 gap-2 mb-4">
      <div className="h-10 bg-slate-100 rounded" />
      <div className="h-10 bg-slate-100 rounded" />
      <div className="h-10 bg-slate-100 rounded" />
    </div>
    <div className="mt-auto h-9 bg-slate-100 rounded" />
  </div>
);

const FlujoNetoCard = ({ data, loading = false, onRetry, ventasMesTotal = null, cobradoMes = null }) => {
  const [showDesglose, setShowDesglose] = useState(false);

  if (loading && !data) return <SkeletonCard />;

  // Estado de error: no se pudo calcular.
  if (!data || !data.periodo_actual) {
    return (
      <div className="bg-white border rounded-xl shadow-sm p-4 flex flex-col h-[374px] items-center justify-center text-center">
        <Waves className="w-8 h-8 text-slate-300 mb-3" />
        <p className="text-sm font-semibold text-slate-500">No se pudo calcular el flujo neto.</p>
        {onRetry && (
          <button onClick={onRetry} className="mt-3 text-xs font-bold text-blue-600 hover:underline">
            Reintentar
          </button>
        )}
      </div>
    );
  }

  const pa = data.periodo_actual;
  const flujo = Number(pa.flujo_neto) || 0;
  const ingresos = Number(pa.ingresos_cobrados) || 0;
  const egresos = Number(pa.total_egresos) || 0;
  const flujoHoy = Number(pa.flujo_hoy) || 0;
  const promedio = Number(pa.promedio_diario) || 0;
  const sinMovimientos = ingresos === 0 && egresos === 0;

  const cmp = computeComparacion(
    flujo,
    Number(data.periodo_anterior?.flujo_neto) || 0,
    !!data.periodo_anterior?.tiene_datos
  );

  const metas = data.metas || {};
  const proyeccion = Number(metas.proyeccion) || 0; // proyección del flujo (respaldo)
  // Meta de VENTAS: la franja compara meta de ventas vs ventas/proyección de
  // VENTAS (nunca contra el flujo neto — magnitudes distintas, daba ~0%).
  // ventas_mes solo existe en el RPC nuevo; si falta, cae al respaldo.
  const tieneMetaVentas = metas.ventas_mes !== undefined && metas.ventas_mes !== null;
  const metaVentas = Number(metas.meta_ventas) || 0;
  const ventasMes = Number(metas.ventas_mes) || 0;
  const proyVentas = Number(metas.proyeccion_ventas) || 0;
  const metaEstado = computeMetaEstado(proyVentas, metaVentas);
  const pctVentas = metaVentas > 0 ? Math.max(0, Math.min((ventasMes / metaVentas) * 100, 100)) : 0;

  // Color del valor principal.
  const flujoTono = sinMovimientos ? 'neutral' : flujo >= 0 ? 'positivo' : 'negativo';
  const flujoColor = { positivo: 'text-emerald-600', negativo: 'text-rose-600', neutral: 'text-slate-500' }[flujoTono];
  const ArrowIcon = cmp.direccion === 'down' ? TrendingDown : TrendingUp;

  return (
    <div className="bg-white border rounded-xl shadow-sm p-4 flex flex-col h-[374px] hover:shadow-md transition-shadow relative">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
            <Waves className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider leading-tight">Flujo neto del mes</p>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label="Información" className="text-slate-400 hover:text-slate-600">
                      <Info className="w-3 h-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[240px] text-left leading-snug">{INFO_TEXT}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className={`text-xl font-black leading-tight ${flujoColor}`}>
              {flujo < 0 ? '-' : ''}{formatCurrencyDOP(Math.abs(flujo), { decimals: 0 })}
            </p>
          </div>
        </div>
      </div>

      {/* Comparación vs mismo período del mes anterior */}
      <div className="mt-1.5 shrink-0">
        {sinMovimientos ? (
          <span className="text-[11px] font-semibold text-slate-400">Sin movimientos registrados en este período</span>
        ) : (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${tonoClasses[cmp.tono].badge}`}>
            <ArrowIcon className="w-3 h-3 mr-1 shrink-0" />
            {cmp.mensaje}
          </span>
        )}
      </div>

      {/* Gráfico comparativo */}
      <div className="mt-2 shrink-0">
        <FlujoNetoMiniChart
          seriesActual={data.series?.mes_actual || []}
          seriesAnterior={data.series?.mes_anterior || []}
          diasEnMes={pa.dias_en_mes}
        />
        <div className="flex items-center justify-center gap-3 mt-0.5">
          <span className="flex items-center gap-1 text-[9px] font-semibold text-slate-500">
            <span className="inline-block h-1.5 w-2 rounded-full bg-emerald-600" /> Mes actual
          </span>
          <span className="flex items-center gap-1 text-[9px] font-semibold text-slate-500">
            <span className="inline-block h-1.5 w-2 rounded-full bg-blue-600" /> Mes anterior
          </span>
        </div>
      </div>

      {/* Indicadores compactos */}
      <div className="mt-2 grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 shrink-0">
        <MiniStat label="Mes anterior" value={formatCurrencyDOP(Number(data.periodo_anterior?.flujo_neto) || 0, { decimals: 0 })} />
        <MiniStat
          label="Hoy"
          value={`${flujoHoy >= 0 ? '+' : '-'}${formatCurrencyDOP(Math.abs(flujoHoy), { decimals: 0 })}`}
          valueClass={flujoHoy >= 0 ? 'text-emerald-600' : 'text-rose-600'}
        />
        <MiniStat label="Prom. diario" value={formatCurrencyDOP(promedio, { decimals: 0 })} />
      </div>

      {/* Metas y proyecciones DE VENTAS (mismo display que la app móvil) */}
      {tieneMetaVentas ? (
        <div className="mt-2 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 shrink-0">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <Target className="w-3 h-3" /> Metas y proyecciones
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black border ${metaEstadoClasses[metaEstado.estado]}`}>
              {metaVentas > 0 ? `${pctVentas.toFixed(1)}%` : 'Sin meta'}
            </span>
          </div>
          <div className="flex justify-between gap-2 mt-1 text-[11px]">
            <span className="text-slate-500">Meta <b className="text-slate-700">{formatCurrencyDOP(metaVentas, { decimals: 0 })}</b></span>
            <span className="text-slate-500">Proy. ventas <b className="text-slate-700">{formatCurrencyDOP(proyVentas, { decimals: 0 })}</b></span>
          </div>
          {metaVentas > 0 && (
            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden mt-1.5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  metaEstado.estado === 'verde' ? 'bg-emerald-500' : metaEstado.estado === 'amarillo' ? 'bg-amber-500' : 'bg-rose-500'
                }`}
                style={{ width: `${pctVentas}%` }}
              />
            </div>
          )}
        </div>
      ) : (
        // Respaldo mientras el RPC no traiga ventas_mes: proyección del flujo.
        <div className="mt-2 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 shrink-0">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <Target className="w-3 h-3" /> Proyección al cierre
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black border ${
              proyeccion >= 0
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}>
              {proyeccion < 0 ? '-' : ''}{formatCurrencyDOP(Math.abs(proyeccion), { decimals: 0 })}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 leading-snug">
            A ritmo de {formatCurrencyDOP(promedio, { decimals: 0 })}/día, el mes cerraría con ese flujo neto.
          </p>
        </div>
      )}

      {/* Ver desglose */}
      <button
        onClick={() => setShowDesglose(true)}
        className="mt-auto flex items-center justify-center gap-1 w-full h-8 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
      >
        Ver desglose <ChevronRight className="w-3.5 h-3.5" />
      </button>

      <FlujoNetoDesgloseModal open={showDesglose} onOpenChange={setShowDesglose} data={data} ventasMesTotal={ventasMesTotal} cobradoMes={cobradoMes} />
    </div>
  );
};

export default FlujoNetoCard;
