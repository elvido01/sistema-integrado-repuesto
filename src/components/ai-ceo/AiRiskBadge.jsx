import React from 'react';

const STYLES = {
    low:      { cls: 'bg-slate-100 text-slate-700 border-slate-300', label: 'Bajo' },
    medium:   { cls: 'bg-amber-100 text-amber-800 border-amber-300', label: 'Medio' },
    high:     { cls: 'bg-orange-100 text-orange-800 border-orange-300', label: 'Alto' },
    critical: { cls: 'bg-red-100 text-red-800 border-red-300 animate-pulse', label: 'Crítico' },
};

export default function AiRiskBadge({ severity = 'medium', size = 'sm' }) {
    const s = STYLES[severity] || STYLES.medium;
    const sizeCls = size === 'lg' ? 'text-sm px-3 py-1' : 'text-[10px] px-2 py-0.5';
    return (
        <span className={`inline-block rounded font-bold border uppercase tracking-wide ${s.cls} ${sizeCls}`}>
            {s.label}
        </span>
    );
}
