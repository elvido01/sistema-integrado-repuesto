import React from 'react';
import RiskBadge from './RiskBadge';
import GpsStatusBadge from './GpsStatusBadge';

const GpsFinancialRiskTable = ({ rows = [] }) => (
  <div className="overflow-hidden rounded-lg border bg-white">
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Cliente</th>
            <th className="px-4 py-3">Moto</th>
            <th className="px-4 py-3">Cuota vencida</th>
            <th className="px-4 py-3">Atraso</th>
            <th className="px-4 py-3">GPS</th>
            <th className="px-4 py-3">Riesgo</th>
            <th className="px-4 py-3">Accion sugerida</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map(row => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className="px-4 py-3"><p className="font-bold text-slate-900">{row.cliente}</p><p className="text-xs text-slate-500">{row.telefono}</p></td>
              <td className="px-4 py-3"><p className="font-semibold">{row.moto}</p><p className="text-xs text-slate-500">{row.placa}</p></td>
              <td className="px-4 py-3 font-bold">RD${Number(row.cuota_vencida || 0).toLocaleString('es-DO')}</td>
              <td className="px-4 py-3">{row.dias_atraso} dia(s)</td>
              <td className="px-4 py-3"><GpsStatusBadge status={row.estado_gps} /></td>
              <td className="px-4 py-3"><RiskBadge value={row.riesgo} /></td>
              <td className="px-4 py-3 text-slate-600">{row.accion}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export default GpsFinancialRiskTable;
