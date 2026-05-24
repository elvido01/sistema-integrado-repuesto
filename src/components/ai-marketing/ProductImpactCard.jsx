// ============================================================
// ProductImpactCard.jsx — Impacto estimado por producto
// ============================================================
import React from 'react';
import { Package, TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function ProductImpactCard({ item }) {
    // item: { producto, publicaciones, units_after, units_before, impacto, wa_quotes }
    const delta = (item.units_after || 0) - (item.units_before || 0);
    const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
    const color = delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-500' : 'text-slate-400';
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2 mb-2">
                <div className="bg-violet-100 text-violet-700 p-1.5 rounded-lg"><Package className="h-4 w-4" /></div>
                <p className="font-bold text-slate-800 text-sm truncate flex-1">{item.producto}</p>
            </div>
            <div className="flex items-center justify-between text-sm">
                <div>
                    <p className="text-xs text-slate-400">Impacto estimado</p>
                    <p className="font-bold text-violet-700">{item.impacto ?? 0}</p>
                </div>
                <div className={`flex items-center gap-1 ${color} font-bold`}>
                    <Icon className="h-4 w-4" /> {delta > 0 ? '+' : ''}{delta} und
                </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">
                {item.publicaciones} publicación(es) · {item.wa_quotes || 0} cotizaciones · ventas {item.units_before}→{item.units_after}
            </p>
        </div>
    );
}
