import React from 'react';
import { PieChart, CircleDollarSign, NotebookPen, AlertTriangle } from 'lucide-react';

const SalesQualityCard = ({ ventasContado = 0, ventasCredito = 0 }) => {
  const ventasTotales = ventasContado + ventasCredito;
  const pctContado = ventasTotales > 0 ? (ventasContado / ventasTotales) * 100 : 0;
  const pctCredito = ventasTotales > 0 ? (ventasCredito / ventasTotales) * 100 : 0;

  // Lógica: Si el crédito supera el 40%, advertencia.
  const riesgoCredito = pctCredito > 40;

  const formatCurrency = (val) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val);

  return (
    <div className="bg-white border rounded-xl shadow-sm p-5 md:p-6 flex flex-col h-full hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 mb-5">
        <div className="p-2 bg-teal-50 text-teal-600 rounded-lg">
          <PieChart className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Calidad de Ventas</h3>
        </div>
      </div>

      <div className="flex w-full h-4 rounded-full overflow-hidden mb-6 bg-gray-100">
        <div className="bg-teal-500 transition-all duration-500" style={{ width: `${pctContado}%` }}></div>
        <div className="bg-orange-400 transition-all duration-500" style={{ width: `${pctCredito}%` }}></div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="border border-gray-100 rounded-lg p-3 bg-teal-50/30">
          <div className="flex items-center gap-1.5 text-teal-700 font-semibold text-xs uppercase mb-1">
            <CircleDollarSign className="w-3.5 h-3.5" /> Contado ({pctContado.toFixed(0)}%)
          </div>
          <p className="text-lg font-bold text-gray-900">{formatCurrency(ventasContado)}</p>
        </div>

        <div className={`border rounded-lg p-3 ${riesgoCredito ? 'bg-red-50/50 border-red-100' : 'bg-orange-50/30 border-gray-100'}`}>
          <div className={`flex items-center gap-1.5 font-semibold text-xs uppercase mb-1 ${riesgoCredito ? 'text-red-700' : 'text-orange-700'}`}>
            <NotebookPen className="w-3.5 h-3.5" /> Crédito ({pctCredito.toFixed(0)}%)
          </div>
          <p className={`text-lg font-bold ${riesgoCredito ? 'text-red-900' : 'text-gray-900'}`}>
            {formatCurrency(ventasCredito)}
          </p>
        </div>
      </div>

      {riesgoCredito && (
        <div className="mt-auto bg-red-50 text-red-700 text-xs font-medium p-3 rounded-lg flex items-start gap-2 border border-red-100">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
          <p>¡Atención! Tu cartera de cuentas por cobrar está creciendo muy rápido. Reduce el fiado prolongado para asegurar liquidez.</p>
        </div>
      )}
    </div>
  );
};

export default SalesQualityCard;
