import React from 'react';
import { Target, TrendingUp, TrendingDown, CheckCircle, XCircle, ShieldCheck, AlertOctagon } from 'lucide-react';

const formatCurrency = (val) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val || 0);

const HybridFinancialOverviewCard = ({
    meta = 150000,
    ventasSemana = 0,
    salesMetrics,
    growthData,
    cajaRestante = 0,
    totalCompromisosSemana = 0,
    totalCompromisosMensual = 0
}) => {
  // 1. Proyección Híbrida
  const totalHistorico = salesMetrics?.total_ventas || 0;
  const diasHistoricosRaw = salesMetrics?.total_dias || 1;
  const ventasActuales = salesMetrics?.ventas_mes_actual || ventasSemana;
  const diasActuales = salesMetrics?.dias_transcurridos_mes || (Math.max(new Date().getDate(), 1));
  const PromedioActual = diasActuales > 0 ? (ventasActuales / diasActuales) : 0;

  // Proteger contra promedios históricos inflados: usar al menos los días calendario del mes actual
  const diasHistoricos = Math.max(diasHistoricosRaw, diasActuales);
  const PromedioHistorico = diasHistoricos > 0 ? (totalHistorico / diasHistoricos) : 0;

  // Si hay menos de 30 días de historia, dar más peso al promedio actual (más realista)
  const pesoHistorico = diasHistoricosRaw >= 30 ? 0.3 : 0.1;
  const pesoActual = 1 - pesoHistorico;
  const proyeccionHibridaDiaria = (PromedioHistorico * pesoHistorico) + (PromedioActual * pesoActual);

  // Proyección mensual usando los días reales del mes actual
  const diasEnMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const proyeccionFinalMesVentas = proyeccionHibridaDiaria * diasEnMes;
  const resultadoProyectado = proyeccionFinalMesVentas - totalCompromisosMensual;

  // 2. Mes Anterior (Desempeño)
  const ventasMesAnterior = growthData?.ventas_mes_anterior || 0;
  const resultadoMesAnterior = ventasMesAnterior - totalCompromisosMensual;
  
  const diferenciaPasado = resultadoProyectado - resultadoMesAnterior;
  const hasMesAnterior = ventasMesAnterior > 0;
  const porcentajeCrecimiento = resultadoMesAnterior !== 0 ? (diferenciaPasado / Math.abs(resultadoMesAnterior)) * 100 : 0;
  
  const progressoMeta = Math.min((ventasActuales / meta) * 100, 100);
  const lograMeta = proyeccionFinalMesVentas >= meta;

  // Utilidades
  const isPositivo = resultadoProyectado >= 0;
  const resultadoColor = isPositivo ? 'text-blue-600' : 'text-red-600';
  const labelResultado = totalCompromisosMensual > 0
    ? (isPositivo ? 'SUPERÁVIT' : 'DÉFICIT')
    : 'PROYECCIÓN';
  const signoResultado = totalCompromisosMensual > 0 ? (isPositivo ? '+' : '-') : '';

  const getGrowthColor = (val) => {
    if (val > 0) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (val < 0) return 'text-rose-600 bg-rose-50 border-rose-200';
    return 'text-slate-600 bg-slate-50 border-slate-200';
  };

  const getGrowthIcon = (val) => {
    if (val >= 0) return <TrendingUp className="w-3 h-3 mr-1 shrink-0" />;
    return <TrendingDown className="w-3 h-3 mr-1 shrink-0" />;
  };

  return (
    <div className="bg-white border rounded-xl shadow-sm p-4 flex flex-col h-[374px] hover:shadow-md transition-shadow relative">
      
      <div className="flex items-start justify-between gap-2 mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider leading-tight">Metas y Proyecciones</p>
            <p className="text-xl font-black text-slate-900 leading-tight">{formatCurrency(meta)}</p>
          </div>
        </div>
        {/* El texto de la meta ocupa el otro extremo visual. El badge general lo movimos abajo según instrucciones. */}
      </div>

      <div className="flex flex-col flex-1 justify-between">
        {/* Progreso */}
        <div className="space-y-1.5">
           <div className="flex justify-between text-sm font-bold">
              <span className="text-slate-600">Progreso</span>
              <span className="text-blue-600">{progressoMeta.toFixed(1)}%</span>
           </div>
           
           <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
             <div 
               className="h-full bg-blue-600 rounded-full transition-all duration-500" 
               style={{ width: `${progressoMeta}%` }}
             />
           </div>

           <div className="flex justify-between gap-2 text-[11px] text-slate-500 font-medium">
             <span>{formatCurrency(ventasActuales)} vendido</span>
             <span className="text-right">Faltan {formatCurrency(Math.max(meta - ventasActuales, 0))}</span>
           </div>
        </div>

        {/* Proyección y Preguntas del Usuario */}
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex flex-col justify-center">
           <div className="flex flex-col items-center text-center space-y-1 mb-2">
             <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">RESULTADO ESTIMADO AL CIERRE</span>
             <span className={`text-xl font-black leading-tight ${resultadoColor}`}>
               {labelResultado}: {signoResultado}{formatCurrency(Math.abs(resultadoProyectado))}
             </span>
             {hasMesAnterior ? (
               <div className={`flex items-center px-2 py-0.5 mt-1 rounded text-[10px] font-bold ${getGrowthColor(porcentajeCrecimiento)}`}>
                 {getGrowthIcon(porcentajeCrecimiento)} vs. mes pasado: ({porcentajeCrecimiento > 0 ? '+' : ''}{porcentajeCrecimiento.toFixed(1)}%)
               </div>
             ) : (
               <div className="flex items-center px-2 py-0.5 mt-1 rounded text-[10px] font-bold text-slate-500 bg-slate-50 border-slate-200">
                 Sin historial del mes anterior
               </div>
             )}
           </div>

           <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
             <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">¿Cumpliré la meta?</span>
                <div className={`flex items-center text-xs font-black leading-tight ${lograMeta ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {lograMeta ? <CheckCircle className="w-4 h-4 mr-1.5 shrink-0" /> : <XCircle className="w-4 h-4 mr-1.5 shrink-0" />}
                  {lograMeta ? 'Sí, lo lograrás' : 'Te quedarás corto'}
                </div>
             </div>

             <div className="flex flex-col border-l border-slate-200 pl-3 justify-center">
                {totalCompromisosSemana === 0 ? (
                   <div className="flex items-center text-emerald-600">
                     <ShieldCheck className="w-4 h-4 mr-1.5 shrink-0" />
                     <span className="text-xs font-bold leading-tight">Estable. No tienes compromisos esta semana.</span>
                   </div>
                ) : (
                   <>
                     <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Debo pagar esta sem.</span>
                     <span className="text-xs font-black text-amber-600">{formatCurrency(totalCompromisosSemana)}</span>
                     {cajaRestante < 0 && (
                        <div className="flex items-center text-[10px] font-bold text-rose-600 mt-1">
                          <AlertOctagon className="w-3 h-3 mr-1 shrink-0" />
                          ¡Faltan {formatCurrency(Math.abs(cajaRestante))}!
                        </div>
                     )}
                     {cajaRestante >= 0 && (
                        <div className="flex items-center text-[10px] font-bold text-emerald-600 mt-1">
                          <CheckCircle className="w-3 h-3 mr-1 shrink-0" />
                          Caja cubre deudas
                        </div>
                     )}
                   </>
                )}
             </div>
           </div>
        </div>
      </div>

    </div>
  );
};

export default HybridFinancialOverviewCard;
