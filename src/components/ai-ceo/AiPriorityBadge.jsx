import React from 'react';

const STYLES = {
    alta: 'bg-red-100 text-red-800 border-red-300',
    media: 'bg-amber-100 text-amber-800 border-amber-300',
    baja: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

export default function AiPriorityBadge({ prioridad = 'media', size = 'sm' }) {
    const style = STYLES[prioridad] || STYLES.media;
    const sizeCls = size === 'lg' ? 'text-sm px-3 py-1' : 'text-[10px] px-2 py-0.5';
    return (
        <span className={`inline-block rounded font-bold border uppercase tracking-wide ${style} ${sizeCls}`}>
            {prioridad}
        </span>
    );
}
