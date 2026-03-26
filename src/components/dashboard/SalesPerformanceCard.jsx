import React from 'react';
import { BarChart3, PieChart, CircleDollarSign, NotebookPen, AlertTriangle, Rocket, ShieldCheck, AlertCircle } from 'lucide-react';

const SalesPerformanceCard = ({ 
  ventasContado = 0, 
  ventasCredito = 0, 
  ventasSemana = 0,
  promedioDiario = 0,
  proyeccionTotal = 0,
  meta = 0,
  diasRestantes = 0
}) => {
  const ventasTotales = ventasContado + ventasCredito;
  const pctContado = ventasTotales > 0 ? (ventasContado / ventasTotales) * 100 : 0;
  const pctCredito = ventasTotales > 0 ? (ventasCredito / ventasTotales) * 100 : 0;
  const progressToMeta = meta > 0 ? (ventasSemana / meta) * 100 : 0;
  
  const hitMeta = proyeccionTotal >= meta;
  const riesgoCredito = pctCredito > 40;

  const formatCurrency = (val) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val);

  return (
    <div className="bg-white border rounded-xl shadow-sm p-5 md:p-6 flex flex-col h-full hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <BarChart3 className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Desempeño de Ventas</h3>
        </div>
        <div className="text-right">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Proyección</span>
          <p className="text-lg font-bold text-indigo-600 leading-none">{formatCurrency(proyeccionTotal)}</p>
        </div>
      </div>

      {/* Progress to Meta */}
      <div className="mb-6 space-y-2">
        <div className="flex justify-between items-end">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Progreso Meta</span>
          <span className="text-sm font-black text-slate-700">{progressToMeta.toFixed(1)}%</span>
        </div>
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-1000 ${progressToMeta >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
            style={{ width: `${Math.min(progressToMeta, 100)}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-teal-50/30 border border-teal-100 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-teal-700 font-bold text-[10px] uppercase mb-1">
            <CircleDollarSign className="w-3.5 h-3.5" /> Contado ({pctContado.toFixed(0)}%)
          </div>
          <p className="text-base font-black text-gray-900 leading-tight">{formatCurrency(ventasContado)}</p>
        </div>

        <div className={`border rounded-lg p-3 ${riesgoCredito ? 'bg-red-50/50 border-red-100' : 'bg-orange-50/30 border-orange-100'}`}>
          <div className={`flex items-center gap-1.5 font-bold text-[10px] uppercase mb-1 ${riesgoCredito ? 'text-red-700' : 'text-orange-700'}`}>
            <NotebookPen className="w-3.5 h-3.5" /> Crédito ({pctCredito.toFixed(0)}%)
          </div>
          <p className={`text-base font-black leading-tight ${riesgoCredito ? 'text-red-900' : 'text-gray-900'}`}>{formatCurrency(ventasCredito)}</p>
        </div>
      </div>

      <div className="mt-auto space-y-3">
        <div className="flex items-center justify-between text-xs p-2 bg-slate-50 rounded-lg border border-slate-100">
           <div className="space-y-0.5">
             <span className="text-gray-500 block">Ritmo sugerido:</span>
             <span className="font-bold text-gray-800">{formatCurrency(promedioDiario)} / día</span>
           </div>
           <div className="text-right">
             {hitMeta ? (
               <span className="font-bold text-emerald-600 flex items-center justify-end"><Rocket className="w-3 h-3 mr-1"/> Logra Meta</span>
             ) : (
               <span className="font-bold text-rose-500 flex items-center justify-end"><AlertCircle className="w-3 h-3 mr-1"/> Meta en Riesgo</span>
             )}
              <span className="text-[10px] text-gray-400 block mt-0.5">{diasRestantes} días restantes</span>
           </div>
        </div>

        {riesgoCredito && (
          <div className="flex items-start gap-2 p-2 bg-red-50 text-red-700 rounded-lg border border-red-100">
            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
            <p className="text-[10px] leading-tight font-medium">¡Riesgo! Cartera de crédito alta. Prioriza cobros al contado.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesPerformanceCard;
