import React from 'react';
import { BatteryCharging, MapPin, RadioTower } from 'lucide-react';
import GpsStatusBadge from './GpsStatusBadge';
import RiskBadge from './RiskBadge';

const GpsDeviceCard = ({ device, onOpen }) => (
  <button onClick={() => onOpen?.(device)} className="w-full rounded-lg border bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase text-slate-500">IMEI {device.imei}</p>
        <h3 className="mt-1 font-black text-slate-900">{device.modelo}</h3>
        <p className="text-sm text-slate-500">{device.sim_number}</p>
      </div>
      <GpsStatusBadge status={device.estado} />
    </div>
    <div className="mt-4 space-y-2 text-sm">
      <div className="flex items-center gap-2 text-slate-700"><MapPin className="h-4 w-4 text-blue-600" /> {device.moto}</div>
      <div className="flex items-center gap-2 text-slate-700"><RadioTower className="h-4 w-4 text-emerald-600" /> {device.cliente}</div>
      <div className="flex items-center gap-2 text-slate-700"><BatteryCharging className="h-4 w-4 text-amber-600" /> Bateria {device.latest_position?.battery_level ?? 0}%</div>
    </div>
    <div className="mt-4 flex items-center justify-between">
      <RiskBadge value={device.riesgo} />
      <span className="text-xs font-semibold text-slate-500">{device.last_connection_at ? new Date(device.last_connection_at).toLocaleString('es-DO') : 'Sin conexion'}</span>
    </div>
  </button>
);

export default GpsDeviceCard;
