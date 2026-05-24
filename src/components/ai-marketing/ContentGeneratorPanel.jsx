// ============================================================
// ContentGeneratorPanel.jsx — Panel izquierdo: sugerencias del día
// ============================================================
import React from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, Lightbulb, FlaskConical } from 'lucide-react';
import ProductContentCard from './ProductContentCard';

export default function ContentGeneratorPanel({
    onSuggest, suggesting, sugerencias, mensaje,
    onSelectProduct, selectedProductId, generating,
}) {
    return (
        <div className="flex flex-col h-full">
            <div className="bg-gradient-to-br from-violet-600 to-blue-600 rounded-xl p-4 text-white mb-4">
                <div className="flex items-center gap-2 mb-1">
                    <Lightbulb className="h-5 w-5" />
                    <h3 className="font-bold">Sugerencias del día</h3>
                </div>
                <p className="text-xs text-violet-100 mb-3">
                    El agente analiza tu catálogo (existencia, margen, rotación, ventas) y propone 3 productos para publicar hoy.
                </p>
                <Button
                    onClick={onSuggest}
                    disabled={suggesting}
                    className="w-full bg-white text-violet-700 hover:bg-violet-50 font-bold"
                >
                    {suggesting
                        ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analizando catálogo...</>
                        : <><FlaskConical className="h-4 w-4 mr-2" /> Generar sugerencias (modo prueba)</>}
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-3">
                {mensaje && (
                    <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">{mensaje}</div>
                )}

                {!suggesting && sugerencias.length === 0 && !mensaje && (
                    <div className="text-center text-slate-400 py-10">
                        <Sparkles className="h-8 w-8 mx-auto mb-2 text-violet-300" />
                        <p className="text-sm">Presiona el botón para que el agente te recomiende productos.</p>
                    </div>
                )}

                {sugerencias.map((p) => (
                    <ProductContentCard
                        key={p.id}
                        producto={p}
                        onSelect={onSelectProduct}
                        selected={selectedProductId === p.id}
                        generating={generating}
                    />
                ))}
            </div>
        </div>
    );
}
