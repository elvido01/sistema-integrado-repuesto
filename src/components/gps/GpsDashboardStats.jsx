import React from 'react';
import { AlertTriangle, Bike, MapPinned, RadioTower, ShieldCheck, WalletCards } from 'lucide-react';

const cards = [
  { key: 'totalActivos', label: 'GPS activos', icon: RadioTower, color: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
  { key: 'sinSenal', label: 'Sin senal', icon: AlertTriangle, color: 'text-slate-700 bg-slate-50 border-slate-100' },
  { key: 'clientesAlDia', label: 'Clientes al dia', icon: ShieldCheck, color: 'text-green-700 bg-green-50 border-green-100' },
  { key: 'clientesAtrasados', label: 'Atrasados', icon: WalletCards, color: 'text-amber-700 bg-amber-50 border-amber-100' },
  { key: 'clientesCriticos', label: 'Criticos', icon: Bike, color: 'text-red-700 bg-red-50 border-red-100' },
  { key: 'fueraGeocerca', label: 'Fuera de zona', icon: MapPinned, color: 'text-blue-700 bg-blue-50 border-blue-100' },
];

const formatValue = (key, value) => key === 'recuperacionSugerida'
  ? new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(value || 0)
  : Number(value || 0).toLocaleString('es-DO');

const GpsDashboardStats = ({ stats = {} }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
    {cards.map(card => {
      const Icon = card.icon;
      return (
        <div key={card.key} className={`rounded-lg border p-4 ${card.color}`}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide opacity-80">{card.label}</p>
            <Icon className="h-5 w-5" />
          </div>
          <p className="mt-3 text-2xl font-black">{formatValue(card.key, stats[card.key])}</p>
        </div>
      );
    })}
  </div>
);

export default GpsDashboardStats;
