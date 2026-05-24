// ============================================================
// AgentLearningPanel.jsx — Aprendizaje del agente de Marketing
// ============================================================
import React from 'react';
import { Button } from '@/components/ui/button';
import { Brain, Loader2, Sparkles, TrendingUp, AlertTriangle } from 'lucide-react';

const CONFIANZA = { alta: 'bg-emerald-100 text-emerald-700', media: 'bg-amber-100 text-amber-700', baja: 'bg-slate-100 text-slate-600' };

export default function AgentLearningPanel({ learning, onGenerate, generating }) {
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><Brain className="h-5 w-5 text-violet-600" /> Aprendizaje del agente</h3>
                <Button size="sm" onClick={onGenerate} disabled={generating} className="bg-violet-600 hover:bg-violet-700 text-white">
                    {generating ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analizando...</> : <><Sparkles className="h-4 w-4 mr-1" /> Generar recomendación IA</>}
                </Button>
            </div>

            {!learning ? (
                <p className="text-sm text-slate-400 py-6 text-center">Aún no hay análisis. Registra publicaciones con métricas y presiona "Generar recomendación IA".</p>
            ) : (
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${CONFIANZA[learning.confianza] || CONFIANZA.baja}`}>confianza {learning.confianza}</span>
                        <span className="text-xs text-slate-400">{learning.created_at?.slice(0, 10)}</span>
                    </div>
                    <p className="text-sm text-slate-700 bg-violet-50 border-l-4 border-violet-400 p-3 rounded-r">{learning.resumen}</p>

                    {learning.top_contenidos?.length > 0 && (
                        <div>
                            <p className="text-xs font-bold text-emerald-700 flex items-center gap-1 mb-1"><TrendingUp className="h-3.5 w-3.5" /> Mejor rendimiento</p>
                            <ul className="text-sm text-slate-600 space-y-1">
                                {learning.top_contenidos.slice(0, 5).map((c, i) => <li key={i}>• {c.detalle} <span className="text-slate-400">— {c.por_que}</span></li>)}
                            </ul>
                        </div>
                    )}
                    {learning.no_funcionaron?.length > 0 && (
                        <div>
                            <p className="text-xs font-bold text-red-600 flex items-center gap-1 mb-1"><AlertTriangle className="h-3.5 w-3.5" /> No funcionaron</p>
                            <ul className="text-sm text-slate-600 space-y-1">
                                {learning.no_funcionaron.slice(0, 5).map((c, i) => <li key={i}>• {c.detalle} <span className="text-slate-400">— {c.sugerencia}</span></li>)}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
