import React from 'react';
import { BarChart3, Rocket, AlertCircle, ShieldCheck } from 'lucide-react';

const WeeklyProjection = ({ ventas = 0, diasTranscurridos = 0, diasRestantes = 0, meta = 0, compromisosTotales = 0 }) => {
  const promedioDiario = diasTranscurridos > 0 ? ventas / diasTranscurridos : 0;
  const proyeccionTotal = ventas + (promedioDiario * diasRestantes);
  
  const hitMeta = proyeccionTotal >= meta;
  const hitCompromisos = proyeccionTotal >= compromisosTotales;

  const formatCurrency = (val) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val);

  return (
    <div className="bg-white border rounded-xl shadow-sm p-5 md:p-6 flex flex-col h-full hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 mb-6">
        <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
          <BarChart3 className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Proyección Semanal</h3>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(proyeccionTotal)}</p>
        </div>
      </div>

      <div className="flex-1 space-y-5">
        <div>
          <p className="text-sm font-medium text-gray-500 mb-1">Tu ritmo actual (Promedio diario):</p>
          <p className="text-lg font-bold text-slate-700">{formatCurrency(promedioDiario)} / día</p>
        </div>

        <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700 mb-2">Si sigues exactamente así...</p>
          
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 flex items-center gap-1.5">
              ¿Llegas a la Meta?
            </span>
            {hitMeta ? (
              <span className="font-bold text-green-600 flex items-center"><Rocket className="w-4 h-4 mr-1"/> Sí</span>
            ) : (
              <span className="font-bold text-red-500 flex items-center"><AlertCircle className="w-4 h-4 mr-1"/> No</span>
            )}
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 flex items-center gap-1.5">
              ¿Cubres Compromisos?
            </span>
            {hitCompromisos ? (
              <span className="font-bold text-emerald-600 flex items-center"><ShieldCheck className="w-4 h-4 mr-1"/> Sí</span>
            ) : (
              <span className="font-bold text-rose-500 flex items-center"><AlertCircle className="w-4 h-4 mr-1"/> Riesgo</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeeklyProjection;
