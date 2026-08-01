import React from 'react';
import { Plus, ReceiptText, WalletCards, HandCoins } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DailyExpensesCard = ({ gastos = [], caja = 0, onAdd, onEdit }) => {
  // El GPS, el seguro, la placa... no son gastos de la empresa: se cobraron al
  // cliente y se le entregan a un tercero. Salen de la caja igual, pero
  // sumarlos aquí hacía que la empresa pareciera gastar lo que solo pasaba de
  // mano. Van en su propia línea. Ver sql/pagos_a_terceros.sql
  const esTercero = (g) => g?.es_tercero === true;
  const suma = (arr) => arr.reduce((s, g) => s + (Number(g.monto) || 0), 0);
  const totalGastos = suma(gastos.filter((g) => !esTercero(g)));
  const totalTerceros = suma(gastos.filter(esTercero));
  const balanceDia = caja;
  const isNegative = balanceDia < 0;

  const formatCurrency = (val) => new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
  }).format(val || 0);

  return (
    <div className="bg-white border rounded-xl shadow-sm p-4 flex flex-col h-[374px] hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-2 bg-rose-50 text-rose-600 rounded-lg shrink-0">
            <ReceiptText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider leading-tight">Gastos Diarios</h3>
            <p className="text-xl font-bold text-gray-900 leading-tight">{formatCurrency(totalGastos)}</p>
          </div>
        </div>
        {onAdd && (
          <Button variant="outline" size="sm" onClick={onAdd} className="h-8 bg-white border-rose-100 text-rose-700 hover:bg-rose-50 shrink-0 px-3">
            <Plus className="w-4 h-4 mr-1" /> Nuevo
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto pr-2 mb-4 space-y-3">
        {gastos.length > 0 ? (
          gastos.map((g) => (
            <div
              key={g.id}
              onDoubleClick={() => onEdit?.(g)}
              title={onEdit ? 'Doble clic: editar o eliminar este gasto' : undefined}
              className={`flex justify-between items-center pb-2 border-b border-gray-50 last:border-0 last:pb-0 ${onEdit ? 'cursor-pointer hover:bg-rose-50/50 rounded px-1 -mx-1' : ''}`}
            >
              <div className="flex items-center gap-2 min-w-0 pr-2">
                <WalletCards className="w-4 h-4 text-rose-400 shrink-0" />
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-700 truncate uppercase block" title={g.descripcion}>
                    {g.descripcion}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded font-bold uppercase">
                      Hoy
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase truncate max-w-[96px] ${
                        esTercero(g) ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                      }`}
                      title={esTercero(g)
                        ? 'Pago a terceros: salió de la caja pero no es gasto de la empresa'
                        : (g.tipo_gasto || 'Operativo')}
                    >
                      {esTercero(g) ? 'Terceros' : (g.tipo_gasto || 'Operativo')}
                    </span>
                    {(g.cuenta_bancaria_id || g.afecta_caja === false) && (
                      <span
                        className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold uppercase"
                        title="No salió de la caja: no afecta el efectivo del día"
                      >
                        {g.cuenta_bancaria_id ? 'Banco' : 'No afecta caja'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <span className="text-sm font-bold text-rose-600 shrink-0">{formatCurrency(g.monto)}</span>
            </div>
          ))
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-400 italic">
            No hay gastos registrados hoy.
          </div>
        )}
      </div>

      {/* Sale de la caja pero no es gasto: se dice, no se esconde. Sin esta
          línea el "Gastado hoy" no explicaría por qué bajó la caja. */}
      {totalTerceros > 0 && (
        <div className="shrink-0 flex items-center justify-between gap-2 rounded-lg bg-indigo-50 border border-indigo-100 px-2.5 py-1.5 mb-2">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-indigo-700 min-w-0">
            <HandCoins className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Entregado a terceros</span>
          </span>
          <span className="text-xs font-black text-indigo-700 shrink-0">{formatCurrency(totalTerceros)}</span>
        </div>
      )}

      <div className="mt-auto grid grid-cols-2 gap-3 pt-3 border-t border-gray-100 shrink-0">
        <div className="bg-gray-50 rounded-lg p-2 border border-gray-100">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Gastado Hoy</p>
          <p className="text-sm font-bold text-gray-800">{formatCurrency(totalGastos)}</p>
        </div>
        <div className={`rounded-lg p-2 border ${isNegative ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
          <p className={`text-[10px] font-medium uppercase tracking-wide ${isNegative ? 'text-red-600' : 'text-green-600'}`}>
            Caja del Dia
          </p>
          <p className={`text-sm font-bold ${isNegative ? 'text-red-700' : 'text-green-700'}`}>
            {formatCurrency(Math.abs(balanceDia))}
          </p>
        </div>
      </div>
    </div>
  );
};

export default DailyExpensesCard;
