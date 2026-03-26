import React from 'react';
import { Plus, Edit2, Wallet, CreditCard, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isBefore, startOfToday, isAfter, endOfWeek, isSameWeek } from 'date-fns';

const CommitmentsCard = ({ compromisos = [], caja = 0, onAdd, onEdit, onPay, customTotal = null }) => {
  const totalCompromisos = compromisos.reduce((sum, c) => sum + (c.monto || 0), 0);
  const effectiveDebt = customTotal !== null ? customTotal : totalCompromisos;
  
  let faltante = 0;
  let excedente = caja;
  
  if (effectiveDebt > 0) {
    faltante = Math.max(effectiveDebt - caja, 0);
    excedente = Math.max(caja - effectiveDebt, 0);
  }


  const formatCurrency = (val) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val);

  return (
    <div className="bg-white border rounded-xl shadow-sm p-4 md:p-5 flex flex-col h-[340px] hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Compromisos a Pagar</h3>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalCompromisos)}</p>
          </div>
        </div>
        {onAdd && (
          <Button variant="outline" size="sm" onClick={onAdd} className="h-8 bg-white border-indigo-100 text-indigo-700 hover:bg-indigo-50">
            <Plus className="w-4 h-4 mr-1" /> Nuevo
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto pr-2 mb-4 space-y-3">
        {compromisos.length > 0 ? (
          compromisos.map((c, i) => {
            const dateStr = c.fecha ? c.fecha.split('T')[0] : '';
            const [year, month, day] = dateStr ? dateStr.split('-') : [];
            const date = dateStr ? new Date(year, month - 1, day, 12, 0, 0) : new Date();
            const isOverdue = dateStr ? isBefore(date, startOfToday()) : false;
            const thisWeek = isSameWeek(date, new Date(), { weekStartsOn: 1 });
            const future = isAfter(date, endOfWeek(new Date(), { weekStartsOn: 1 }));

            return (
            <div key={i} className="flex justify-between items-center pb-2 border-b border-gray-50 last:border-0 last:pb-0 group">
              <div className="flex items-center gap-2 overflow-hidden pr-2">
                <CreditCard className={`w-4 h-4 shrink-0 ${isOverdue ? 'text-red-400' : 'text-gray-400'} group-hover:${isOverdue ? 'text-red-500' : 'text-indigo-500'} transition-colors`} />
                <div className="flex flex-col min-w-0">
                  <span className={`text-sm font-medium ${isOverdue ? 'text-red-600' : 'text-gray-700'} truncate uppercase`} title={c.nombre}>{c.nombre}</span>
                  <div className="flex gap-2 items-center">
                    {isOverdue && <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold uppercase">Atrasado</span>}
                    {thisWeek && !isOverdue && <span className="text-[9px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded font-bold uppercase">Esta semana</span>}
                    {future && <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold uppercase">Futuro</span>}
                    {onPay && (
                      <button 
                        onClick={() => onPay(c)}
                        className="text-[9px] bg-emerald-100 hover:bg-emerald-200 text-emerald-700 px-2 py-0.5 rounded font-bold uppercase transition-colors cursor-pointer"
                      >
                        Pagar
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-sm font-bold ${isOverdue ? 'text-red-600' : 'text-gray-900'}`}>{formatCurrency(c.monto)}</span>
                {onEdit && (
                  <button onClick={() => onEdit(c)} className="p-1 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all focus:opacity-100">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )})
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-400 italic">
            No hay compromisos pautados.
          </div>
        )}
      </div>

      <div className="mt-auto grid grid-cols-2 gap-3 pt-3 border-t border-gray-100 shrink-0">
        <div className="bg-gray-50 rounded-lg p-2 border border-gray-100">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Caja Actual</p>
          <p className="text-sm font-bold text-gray-800">{formatCurrency(caja)}</p>
        </div>
        <div className={`rounded-lg p-2 border ${faltante > 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
          <p className="text-[10px] font-medium uppercase tracking-wide flex items-center justify-between">
            <span className={faltante > 0 ? 'text-red-600' : 'text-green-600'}>
              {faltante > 0 ? 'Faltante Caja' : 'Excedente'}
            </span>
            <ArrowRight className={`w-3.5 h-3.5 ${faltante > 0 ? 'text-red-400' : 'text-green-400'}`} />
          </p>
          <p className={`text-sm font-bold ${faltante > 0 ? 'text-red-700' : 'text-green-700'}`}>
            {formatCurrency(faltante > 0 ? faltante : excedente)}
          </p>
        </div>
      </div>
    </div>
  );
};

export default CommitmentsCard;
