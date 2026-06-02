import React from 'react';

const styles = {
  bajo: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  medio: 'bg-amber-100 text-amber-800 border-amber-200',
  alto: 'bg-orange-100 text-orange-800 border-orange-200',
  critico: 'bg-red-100 text-red-800 border-red-200',
  sin_senal: 'bg-slate-100 text-slate-700 border-slate-200',
};

const labels = {
  bajo: 'Bajo',
  medio: 'Medio',
  alto: 'Alto',
  critico: 'Critico',
  sin_senal: 'Sin senal',
};

const RiskBadge = ({ value }) => (
  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold ${styles[value] || styles.bajo}`}>
    {labels[value] || value || 'Bajo'}
  </span>
);

export default RiskBadge;
