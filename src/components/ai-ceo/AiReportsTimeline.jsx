import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, ChevronDown, ChevronUp, Sparkles, RefreshCw } from 'lucide-react';
import AiPriorityBadge from './AiPriorityBadge';

const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('es-DO', {
    weekday: 'short', day: '2-digit', month: 'short', year: '2-digit'
});

export default function AiReportsTimeline({ limit = 30 }) {
    const { tenantId } = useAuth();
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState(null);
    const [showAllAgents, setShowAllAgents] = useState(false);

    const cargar = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        try {
            let q = supabase
                .from('ai_reports')
                .select('id, titulo, resumen, prioridad, total_alertas, detalles, fecha, report_type, estado, created_at, cost_usd, model, agent_key')
                .eq('tenant_id', tenantId)
                .order('fecha', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(limit);
            if (!showAllAgents) q = q.eq('agent_key', 'ai_ceo_principal');
            const { data, error } = await q;
            if (error) throw error;
            setReports(data || []);
        } catch (err) {
            console.error('[AiReportsTimeline]', err);
        } finally {
            setLoading(false);
        }
    }, [tenantId, limit, showAllAgents]);

    useEffect(() => { cargar(); }, [cargar]);

    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
            <div className="p-3 border-b border-slate-200 flex items-center gap-2 flex-wrap">
                <FileText className="h-5 w-5 text-blue-500" />
                <h3 className="text-base font-bold text-slate-800">Historial de Reportes</h3>
                <span className="text-xs text-slate-500">({reports.length})</span>
                <Button
                    variant={showAllAgents ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-[10px] ml-3"
                    onClick={() => setShowAllAgents(!showAllAgents)}
                >
                    {showAllAgents ? 'Solo CEO' : 'Ver sub-agentes'}
                </Button>
                <Button variant="outline" size="sm" className="h-8 ml-auto" onClick={cargar} disabled={loading}>
                    <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                    Refrescar
                </Button>
            </div>

            <div className="p-3">
                {loading ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                    </div>
                ) : reports.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 italic text-sm">
                        Aún no hay reportes generados.
                    </div>
                ) : (
                    <div className="relative">
                        {/* línea vertical */}
                        <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-slate-200" />

                        <div className="space-y-3">
                            {reports.map((r) => {
                                const expanded = expandedId === r.id;
                                const alertas = r.detalles?.alertas || [];
                                return (
                                    <div key={r.id} className="relative pl-10">
                                        <div className={`absolute left-1 top-1 w-4 h-4 rounded-full border-2 border-white shadow ${
                                            r.prioridad === 'alta' ? 'bg-red-500'
                                            : r.prioridad === 'media' ? 'bg-amber-500'
                                            : 'bg-emerald-500'
                                        }`} />
                                        <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">{fmtDate(r.fecha)}</span>
                                                <AiPriorityBadge prioridad={r.prioridad} />
                                                {r.report_type !== 'daily' && (
                                                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">{r.report_type}</span>
                                                )}
                                                {showAllAgents && r.agent_key && (
                                                    <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-bold uppercase">{r.agent_key.replace('ai_', '')}</span>
                                                )}
                                                {r.total_alertas != null && (
                                                    <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                                                        {r.total_alertas} productos analizados
                                                    </span>
                                                )}
                                                {r.cost_usd != null && (
                                                    <span className="text-[10px] text-slate-400 ml-auto">${Number(r.cost_usd).toFixed(4)}</span>
                                                )}
                                            </div>
                                            <h4 className="text-sm font-bold text-slate-800">{r.titulo}</h4>
                                            {r.resumen && (
                                                <p className="text-xs text-slate-600 mt-1">{r.resumen}</p>
                                            )}
                                            {alertas.length > 0 && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 px-2 text-[11px] text-slate-600 mt-1"
                                                    onClick={() => setExpandedId(expanded ? null : r.id)}
                                                >
                                                    {expanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                                                    {alertas.length} producto{alertas.length !== 1 ? 's' : ''} crítico{alertas.length !== 1 ? 's' : ''}
                                                </Button>
                                            )}
                                            {expanded && alertas.length > 0 && (
                                                <div className="mt-2 space-y-1 pl-2 border-l-2 border-slate-300">
                                                    {alertas.map((a, i) => (
                                                        <div key={i} className="text-[11px]">
                                                            <span className="font-mono font-bold">{a.codigo}</span>
                                                            <span className="text-slate-500"> · {a.descripcion}</span>
                                                            <div className="text-emerald-700"><strong>→</strong> {a.accion_sugerida}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {r.detalles?.snapshot?.score != null && (
                                                <div className="mt-1 text-[10px] text-slate-500 flex items-center gap-1">
                                                    <Sparkles className="h-3 w-3" /> Score ese día: <strong>{r.detalles.snapshot.score}/100</strong>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
