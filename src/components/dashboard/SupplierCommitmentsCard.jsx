import React from 'react';
import { Truck, Receipt, ArrowRight, ExternalLink } from 'lucide-react';
import { format, isSameWeek, isAfter, endOfWeek } from 'date-fns';

const SupplierCommitmentsCard = ({ commitments = [], caja = 0, customTotal = null, onPay }) => {
  const totalCommitments = commitments.reduce((sum, c) => sum + (c.monto_pendiente || 0), 0);
  const effectiveDebt = customTotal !== null ? customTotal : totalCommitments;
  
  let faltante = 0;
  if (effectiveDebt > 0) {
    faltante = Math.max(effectiveDebt - caja, 0);
  }
  const hasNegativeCash = effectiveDebt === 0 && caja < 0;
  const balanceIsShort = caja < effectiveDebt || hasNegativeCash;
  const balanceAmount = hasNegativeCash ? Math.abs(caja) : Math.abs(caja - effectiveDebt);
  const balanceLabel = hasNegativeCash ? 'Caja negativa' : (caja >= effectiveDebt ? 'Sobrante' : 'Faltante');
  const formatCurrency = (val) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val);

  return (
    <div className="bg-white border rounded-xl shadow-sm p-4 flex flex-col h-[374px] hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-2 bg-amber-50 text-amber-600 rounded-lg shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider leading-tight">Compromisos Suplidores</h3>
            <p className="text-xl font-bold text-gray-900 leading-tight">{formatCurrency(totalCommitments)}</p>
          </div>
        </div>
        <div className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full uppercase shrink-0">
          Semanal
        </div>
      </div>

      <div className="flex-1 overflow-auto pr-2 mb-4 space-y-3 custom-scrollbar">
        {commitments.length > 0 ? (
          commitments.map((c, i) => (
            <div key={i} className="pb-2 border-b border-gray-50 last:border-0 last:pb-0 group">
              {/* Línea 1: descripción (suplidor) a ancho completo */}
              <div className="flex items-center gap-2 min-w-0">
                <Receipt className={`w-4 h-4 ${c.isOverdue ? 'text-red-400' : 'text-gray-400'} shrink-0`} />
                <span className={`text-xs font-bold ${c.isOverdue ? 'text-red-600' : 'text-gray-700'} truncate uppercase flex-1`} title={c.suplidor_nombre}>
                  {c.suplidor_nombre || 'Desconocido'}
                </span>
              </div>
              {/* Línea 2: REFERENCIA de la compra (la factura del suplidor) + vencimiento */}
              <div className="flex items-center gap-2 mt-0.5 pl-6">
                <span className={`text-[10px] ${c.isOverdue ? 'text-red-400' : 'text-gray-400'} truncate`}>
                  Ref: {c.referencia || c.numero || 'N/A'} — {c.fecha_vencimiento ? format(new Date(c.fecha_vencimiento), 'dd/MM/yy') : (c.fecha ? format(new Date(c.fecha), 'dd/MM/yy') : '')}
                </span>
              </div>
              {/* Línea 3: badges a la izquierda + MONTO a la derecha (asi los
                  montos grandes, p.ej. 1,000,000.00, se ven completos) */}
              <div className="flex items-center justify-between gap-2 mt-1 pl-6">
                <div className="flex items-center gap-1.5 min-w-0">
                  {c.isOverdue && <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">Atrasado</span>}
                  {c.fecha_vencimiento && isSameWeek(new Date(c.fecha_vencimiento), new Date(), { weekStartsOn: 1 }) && !c.isOverdue && <span className="text-[9px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">Esta semana</span>}
                  {c.fecha_vencimiento && isAfter(new Date(c.fecha_vencimiento), endOfWeek(new Date(), { weekStartsOn: 1 })) && <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">Futuro</span>}
                  {onPay && (
                    <button
                      onClick={() => onPay(c)}
                      className="text-[9px] bg-emerald-100 hover:bg-emerald-200 text-emerald-700 px-2 py-0.5 rounded font-bold uppercase transition-colors cursor-pointer shrink-0"
                    >
                      Pagar
                    </button>
                  )}
                </div>
                <span className={`text-sm font-black whitespace-nowrap shrink-0 ${c.isOverdue ? 'text-red-600' : 'text-slate-800'}`}>{formatCurrency(c.monto_pendiente)}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-400 italic py-10">
            Sin facturas pendientes esta semana.
          </div>
        )}
      </div>

      <div className="mt-auto pt-3 border-t border-gray-100 flex items-center justify-between shrink-0">
         <div className="flex flex-col">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Caja vs Deuda Suplidor (Semanal)</span>
            {effectiveDebt === 0 && !hasNegativeCash ? (
               <span className="text-sm font-black text-emerald-600">Libre de pagos</span>
            ) : (
               <span className={`text-sm font-black ${balanceIsShort ? 'text-rose-600' : 'text-emerald-600'}`}>
                 {formatCurrency(balanceAmount)} {balanceLabel}
               </span>
            )}
         </div>
         <button className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
            <ArrowRight className="w-4 h-4" />
         </button>
      </div>
    </div>
  );
};

export default SupplierCommitmentsCard;
