// ============================================================
// ContentRecommendationPanel.jsx — Recomendaciones del agente
// ============================================================
import React from 'react';
import { Lightbulb, Megaphone, Film, Package } from 'lucide-react';

export default function ContentRecommendationPanel({ learning }) {
    if (!learning) {
        return (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-2"><Lightbulb className="h-5 w-5 text-amber-500" /> Recomendaciones</h3>
                <p className="text-sm text-slate-400">Genera el análisis del agente para ver recomendaciones.</p>
            </div>
        );
    }
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-3"><Lightbulb className="h-5 w-5 text-amber-500" /> Recomendaciones para la próxima semana</h3>

            <div className="flex flex-wrap gap-2 mb-3">
                {learning.canal_recomendado && (
                    <span className="text-xs bg-blue-50 text-blue-700 rounded-lg px-3 py-1.5 flex items-center gap-1"><Megaphone className="h-3.5 w-3.5" /> Canal: <b>{learning.canal_recomendado}</b></span>
                )}
                {learning.estilo_recomendado && (
                    <span className="text-xs bg-violet-50 text-violet-700 rounded-lg px-3 py-1.5 flex items-center gap-1"><Film className="h-3.5 w-3.5" /> Estilo: <b>{learning.estilo_recomendado}</b></span>
                )}
            </div>

            {learning.recomendaciones?.length > 0 && (
                <ul className="space-y-2 mb-3">
                    {learning.recomendaciones.slice(0, 6).map((r, i) => (
                        <li key={i} className="text-sm bg-slate-50 rounded-lg p-2 border border-slate-100">
                            <span className="font-medium text-slate-800">{r.accion}</span>
                            {r.por_que && <span className="text-slate-500"> — {r.por_que}</span>}
                        </li>
                    ))}
                </ul>
            )}

            {learning.productos_recomendados?.length > 0 && (
                <div>
                    <p className="text-xs font-bold text-slate-600 flex items-center gap-1 mb-1"><Package className="h-3.5 w-3.5" /> Productos para publicar</p>
                    <div className="flex flex-wrap gap-2">
                        {learning.productos_recomendados.slice(0, 8).map((p, i) => (
                            <span key={i} className="text-xs bg-emerald-50 text-emerald-700 rounded px-2 py-1" title={p.motivo}>{p.producto}</span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
