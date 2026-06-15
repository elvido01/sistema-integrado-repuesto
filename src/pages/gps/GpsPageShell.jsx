import React from 'react';
import { Activity, BellRing, Bike, LayoutDashboard, MapPinned, RadioTower, WalletCards } from 'lucide-react';
import { usePanels } from '@/contexts/panelCore';

const tabs = [
  { id: 'gps-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'gps-dispositivos', label: 'Dispositivos', icon: RadioTower },
  { id: 'gps-mapa', label: 'Mapa', icon: MapPinned },
  { id: 'gps-alertas', label: 'Alertas', icon: BellRing },
  { id: 'gps-financiamiento', label: 'Financiamiento', icon: WalletCards },
];

const GpsPageShell = ({ title, subtitle, active, children, actions }) => {
  const { openPanel } = usePanels();
  return (
    <div className="min-h-full bg-slate-50 p-4 md:p-6">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-blue-700">
            <Activity className="h-5 w-5" />
            <span className="text-xs font-black uppercase tracking-wide">GPS / Financiamiento / Recuperacion</span>
          </div>
          <h1 className="mt-1 text-2xl font-black text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">{actions}</div>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto rounded-lg border bg-white p-2">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => openPanel(tab.id)}
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-bold transition ${
                active === tab.id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div>{children}</div>
      <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
        <Bike className="mr-1 inline h-4 w-4" />
        Demo preparado para Caminero Motors. Proveedor actual: MockGps. Corte remoto reservado para permisos futuros; no esta habilitado en UI.
      </div>
    </div>
  );
};

export default GpsPageShell;
