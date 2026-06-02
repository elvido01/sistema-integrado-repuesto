import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import RiskBadge from './RiskBadge';

const GpsAlertTable = ({ alerts = [], onResolve }) => (
  <div className="overflow-hidden rounded-lg border bg-white">
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Cliente</th>
            <th className="px-4 py-3">Moto</th>
            <th className="px-4 py-3">Alerta</th>
            <th className="px-4 py-3">Nivel</th>
            <th className="px-4 py-3">Fecha</th>
            <th className="px-4 py-3">Accion recomendada</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {alerts.map(alert => (
            <tr key={alert.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-semibold text-slate-900">{alert.cliente}</td>
              <td className="px-4 py-3 text-slate-600">{alert.moto}</td>
              <td className="px-4 py-3"><p className="font-bold">{alert.titulo}</p><p className="text-xs text-slate-500">{alert.descripcion}</p></td>
              <td className="px-4 py-3"><RiskBadge value={alert.nivel} /></td>
              <td className="px-4 py-3 text-slate-500">{new Date(alert.created_at).toLocaleString('es-DO')}</td>
              <td className="px-4 py-3 text-slate-600">{alert.accion_recomendada}</td>
              <td className="px-4 py-3 text-right">
                <button onClick={() => onResolve?.(alert.id)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Resolver
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export default GpsAlertTable;
