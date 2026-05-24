// ============================================================
// ProductContentCard.jsx — Tarjeta de producto sugerido
// ============================================================
import React from 'react';
import { Button } from '@/components/ui/button';
import { Package, ImageOff, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';

const GRUPO_LABEL = {
    mas_vendidos: 'Más vendido',
    buen_margen: 'Buen margen',
    baja_rotacion: 'Baja rotación',
    alta_existencia: 'Alta existencia',
    recien_llegados: 'Recién llegado',
};

export default function ProductContentCard({ producto, onSelect, selected, generating }) {
    const fmt = (n) => `RD$ ${Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    const encargo = producto.modo === 'encargo';

    return (
        <div className={`rounded-xl border p-3 transition-all ${selected ? 'border-violet-500 ring-2 ring-violet-200 bg-violet-50/50' : 'border-slate-200 bg-white hover:border-violet-300'}`}>
            <div className="flex gap-3">
                <div className="h-16 w-16 flex-shrink-0 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center">
                    {producto.imagen_url
                        ? <img src={producto.imagen_url} alt={producto.descripcion} className="h-full w-full object-cover" />
                        : <ImageOff className="h-6 w-6 text-slate-400" />}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        {producto._grupo && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-violet-700 bg-violet-100 px-2 py-0.5 rounded">
                                {GRUPO_LABEL[producto._grupo] || producto._grupo}
                            </span>
                        )}
                        {encargo
                            ? <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">Por encargo</span>
                            : <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">{producto.existencia} en stock</span>}
                    </div>
                    <p className="font-bold text-slate-800 text-sm leading-tight mt-1 truncate">{producto.descripcion}</p>
                    <p className="text-xs text-slate-500">{producto.codigo} · {fmt(producto.precio)}{producto.margen_pct != null ? ` · margen ${producto.margen_pct}%` : ''}</p>
                </div>
            </div>

            {producto.razon && (
                <p className="text-xs text-slate-600 italic mt-2 flex items-start gap-1">
                    <Sparkles className="h-3.5 w-3.5 text-violet-500 mt-0.5 flex-shrink-0" />
                    {producto.razon}
                </p>
            )}

            <Button
                size="sm"
                className={`w-full mt-3 ${selected ? 'bg-violet-600 hover:bg-violet-700' : 'bg-slate-800 hover:bg-slate-900'} text-white`}
                onClick={() => onSelect(producto)}
                disabled={generating}
            >
                {generating && selected
                    ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generando...</>
                    : selected
                        ? <><CheckCircle2 className="h-4 w-4 mr-1" /> Seleccionado</>
                        : <><Package className="h-4 w-4 mr-1" /> Generar propuesta</>}
            </Button>
        </div>
    );
}
