import React from 'react';

const styles = {
  activo: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  instalado: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  inactivo: 'bg-slate-100 text-slate-700 border-slate-200',
  en_inventario: 'bg-blue-100 text-blue-800 border-blue-200',
  suspendido: 'bg-red-100 text-red-800 border-red-200',
  sin_senal: 'bg-gray-100 text-gray-700 border-gray-200',
};

const labels = {
  activo: 'Activo',
  instalado: 'Instalado',
  inactivo: 'Inactivo',
  en_inventario: 'Inventario',
  suspendido: 'Suspendido',
  sin_senal: 'Sin senal',
};

const GpsStatusBadge = ({ status }) => (
  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold ${styles[status] || styles.inactivo}`}>
    {labels[status] || status || 'Inactivo'}
  </span>
);

export default GpsStatusBadge;
