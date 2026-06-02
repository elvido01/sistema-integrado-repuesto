import React, { useMemo, useState } from 'react';
import { ExternalLink, Navigation, Route } from 'lucide-react';
import RiskBadge from './RiskBadge';

const bounds = {
  latMin: 17.45,
  latMax: 19.95,
  lngMin: -71.8,
  lngMax: -68.2,
};

const colors = {
  bajo: 'bg-emerald-500 border-emerald-700',
  medio: 'bg-amber-400 border-amber-600',
  alto: 'bg-orange-500 border-orange-700',
  critico: 'bg-red-600 border-red-800',
  sin_senal: 'bg-slate-400 border-slate-600',
};

const toPoint = (lat, lng) => ({
  left: `${Math.min(96, Math.max(4, ((lng - bounds.lngMin) / (bounds.lngMax - bounds.lngMin)) * 100))}%`,
  top: `${Math.min(92, Math.max(8, (1 - ((lat - bounds.latMin) / (bounds.latMax - bounds.latMin))) * 100))}%`,
});

const GpsMap = ({ positions = [], height = 420, compact = false }) => {
  const [selected, setSelected] = useState(positions[0] || null);
  const items = useMemo(() => positions.filter(p => p?.device), [positions]);

  return (
    <div className="relative overflow-hidden rounded-lg border bg-[#edf5f3]" style={{ minHeight: height }}>
      <div
        className="absolute inset-0 opacity-80"
        style={{
          backgroundImage: 'linear-gradient(90deg, rgba(15,23,42,0.06) 1px, transparent 1px), linear-gradient(0deg, rgba(15,23,42,0.06) 1px, transparent 1px)',
          backgroundSize: '38px 38px',
        }}
      />
      <div className="absolute inset-0">
        <div className="absolute left-[14%] top-[18%] h-[52%] w-[58%] rounded-[48%] border-2 border-emerald-200 bg-emerald-100/60 rotate-[-18deg]" />
        <div className="absolute left-[43%] top-[39%] h-[28%] w-[32%] rounded-[40%] border-2 border-blue-200 bg-blue-100/50 rotate-[14deg]" />
        <div className="absolute left-[22%] top-[30%] h-1 w-[58%] bg-slate-300/70 rotate-[18deg]" />
        <div className="absolute left-[36%] top-[15%] h-1 w-[36%] bg-slate-300/60 rotate-[62deg]" />
      </div>

      <div className="absolute left-4 top-4 rounded-md border bg-white/90 px-3 py-2 shadow-sm">
        <p className="text-xs font-black text-slate-900">Mapa GPS demo</p>
        <p className="text-[11px] text-slate-500">Proveedor actual: MockGps</p>
      </div>

      {items.map(pos => {
        const point = toPoint(Number(pos.lat), Number(pos.lng));
        const risk = pos.device.riesgo || 'bajo';
        return (
          <button
            key={pos.id}
            type="button"
            onClick={() => setSelected(pos)}
            className={`absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-lg ring-4 ring-white/70 ${colors[risk] || colors.bajo}`}
            style={point}
            title={`${pos.device.cliente} - ${pos.device.moto}`}
          />
        );
      })}

      {selected?.device && !compact && (
        <div className="absolute bottom-4 left-4 right-4 md:left-auto md:w-96 rounded-lg border bg-white shadow-xl">
          <div className="p-4 border-b">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-slate-900">{selected.device.cliente}</h3>
                <p className="text-sm text-slate-500">{selected.device.moto}</p>
              </div>
              <RiskBadge value={selected.device.riesgo} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 p-4 text-sm">
            <div><span className="text-slate-500">Placa/chasis</span><p className="font-bold">{selected.device.placa} / {selected.device.chasis}</p></div>
            <div><span className="text-slate-500">Telefono</span><p className="font-bold">{selected.device.telefono}</p></div>
            <div><span className="text-slate-500">Balance</span><p className="font-bold">RD${Number(selected.device.balance_pendiente || 0).toLocaleString('es-DO')}</p></div>
            <div><span className="text-slate-500">Atraso</span><p className="font-bold">{selected.device.dias_atraso} dia(s)</p></div>
            <div><span className="text-slate-500">Velocidad</span><p className="font-bold">{selected.speed || 0} km/h</p></div>
            <div><span className="text-slate-500">Bateria</span><p className="font-bold">{selected.battery_level ?? 0}%</p></div>
          </div>
          <div className="flex gap-2 p-4 pt-0">
            <button className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <ExternalLink className="h-4 w-4" /> Ver expediente
            </button>
            <button className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Route className="h-4 w-4" /> Ver ruta
            </button>
          </div>
        </div>
      )}

      {compact && (
        <div className="absolute bottom-3 right-3 rounded-md bg-white/90 px-3 py-2 text-xs font-bold text-slate-700 shadow-sm">
          <Navigation className="mr-1 inline h-3 w-3" />
          {items.length} unidades
        </div>
      )}
    </div>
  );
};

export default GpsMap;
