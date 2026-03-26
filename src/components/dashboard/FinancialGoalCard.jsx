import React from 'react';
import { Target, TrendingUp, AlertCircle } from 'lucide-react';

const FinancialGoalCard = ({ meta = 0, ventas = 0, diasRestantes = 0 }) => {
  const porcentaje = meta > 0 ? Math.min((ventas / meta) * 100, 100) : 0;
  const faltante = Math.max(meta - ventas, 0);
  const ventaDiariaNecesaria = diasRestantes > 0 ? faltante / diasRestantes : 0;

  // Determinar color de barra según progreso
  let progressColor = "bg-red-500";
  let statusText = "En riesgo";
  let statusColor = "text-red-500";
  
  if (porcentaje >= 80) {
    progressColor = "bg-green-500";
    statusText = "Excelente ritmo";
    statusColor = "text-green-500";
  } else if (porcentaje >= 50) {
    progressColor = "bg-amber-500";
    statusText = "Ritmo estable";
    statusColor = "text-amber-500";
  }

  const formatCurrency = (val) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val);

  return (
    <div className="bg-white border rounded-xl shadow-sm p-5 md:p-6 flex flex-col justify-between h-full hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Meta Semanal</h3>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(meta)}</p>
          </div>
        </div>
        <div className={`flex items-center gap-1 text-sm font-medium px-2.5 py-1 rounded-full bg-gray-50 border ${statusColor}`}>
          {porcentaje >= 80 ? <TrendingUp className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
          {statusText}
        </div>
      </div>

      <div className="space-y-2 mb-6">
        <div className="flex justify-between text-sm">
          <span className="font-medium text-gray-700">Progreso de Ventas</span>
          <span className="font-bold text-gray-900">{porcentaje.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
          <div 
            className={`h-2.5 rounded-full ${progressColor} transition-all duration-500`} 
            style={{ width: `${porcentaje}%` }}
          ></div>
        </div>
        <div className="flex justify-between text-xs text-gray-500 font-medium">
          <span>{formatCurrency(ventas)} vendido</span>
          <span>{formatCurrency(faltante)} faltan</span>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex justify-between items-center">
        <div>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Ritmo Diario Sugerido</p>
          <p className="text-sm font-bold text-slate-700">{formatCurrency(ventaDiariaNecesaria)} / día</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Días Restantes</p>
          <p className="text-sm font-bold text-slate-700">{diasRestantes}</p>
        </div>
      </div>
    </div>
  );
};

export default FinancialGoalCard;
