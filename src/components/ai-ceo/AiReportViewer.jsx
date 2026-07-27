import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, Sparkles, RefreshCw, TrendingDown, TrendingUp, AlertTriangle, Share2, Printer } from 'lucide-react';
import AiPriorityBadge from './AiPriorityBadge';
import { buildAiCeoWhatsAppUrl } from '@/lib/aiCeoShare';

const TIPO_ALERTA_ICON = {
    margen_negativo: { icon: TrendingDown, color: 'text-red-600' },
    margen_bajo:     { icon: TrendingDown, color: 'text-amber-600' },
    costo_subio:     { icon: TrendingUp,   color: 'text-orange-600' },
    default:         { icon: AlertTriangle, color: 'text-slate-600' },
};

export default function AiReportViewer({ reportType = 'daily', maxItems = 1 }) {
    const { tenantId } = useAuth();
    const { toast } = useToast();
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [activeIdx, setActiveIdx] = useState(0);

    const cargar = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('ai_reports')
                .select('id, titulo, resumen, prioridad, total_alertas, detalles, fecha, report_type, estado, created_at, cost_usd, model, agent_key')
                .eq('tenant_id', tenantId)
                .eq('report_type', reportType)
                .eq('agent_key', 'ai_ceo_principal')
                .neq('estado', 'descartado')
                .order('fecha', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(maxItems);
            if (error) throw error;
            setReports(data || []);
            setActiveIdx(0);
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error cargando reportes', description: err.message });
        } finally {
            setLoading(false);
        }
    }, [tenantId, reportType, maxItems, toast]);

    useEffect(() => { cargar(); }, [cargar]);

    const generarAhora = async () => {
        setGenerating(true);
        try {
            const { data, error } = await supabase.functions.invoke('motoflow-daily-insights', {
                body: { tenant_id: tenantId, force: true },
            });
            if (error) throw error;
            if (!data?.ok) throw new Error(data?.error || 'falla agente');
            toast({ title: '✓ Análisis generado', description: `${data.resultados?.[0]?.total_alertas ?? 0} alertas. Costo: $${data.resultados?.[0]?.cost_usd?.toFixed(4) || '0'}` });
            await cargar();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error generando reporte', description: err.message });
        } finally {
            setGenerating(false);
        }
    };

    const compartirWhatsApp = () => {
        const url = buildAiCeoWhatsAppUrl(r);
        if (!url) return;
        window.open(url, '_blank');
    };

    const imprimir = () => {
        if (!r) return;
        const w = window.open('', '_blank');
        const acciones = r.detalles?.parsed?.top_acciones || [];
        const fecha = new Date(r.fecha + 'T00:00:00').toLocaleDateString('es-DO', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
        w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Reporte IA ${r.fecha}</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; color: #1e293b; }
                h1 { color: #6d28d9; font-size: 20px; margin-bottom: 4px; }
                .meta { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px; }
                .resumen { font-size: 13px; color: #475569; border-left: 3px solid #7c3aed; padding-left: 12px; margin: 16px 0; }
                .priority { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; text-transform: uppercase; margin-left: 8px; }
                .priority-alta { background: #fee2e2; color: #b91c1c; }
                .priority-media { background: #fef3c7; color: #b45309; }
                .priority-baja { background: #d1fae5; color: #047857; }
                .accion { padding: 10px 12px; background: #f8fafc; border-left: 4px solid #7c3aed; margin: 8px 0; border-radius: 0 4px 4px 0; }
                .accion-titulo { font-weight: bold; font-size: 13px; }
                .accion-area { font-size: 10px; text-transform: uppercase; color: #7c3aed; font-weight: bold; letter-spacing: 0.05em; }
                .accion-porque { font-size: 11px; color: #64748b; margin-top: 4px; }
                footer { margin-top: 30px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px; }
                @media print { body { margin: 0; } }
            </style></head><body>
            <h1>${r.titulo} <span class="priority priority-${r.prioridad}">${r.prioridad}</span></h1>
            <div class="meta">${fecha}</div>
            ${r.resumen ? `<p class="resumen">${r.resumen}</p>` : ''}
            ${acciones.length > 0 ? '<h3 style="font-size: 14px; color: #475569; margin-top: 24px;">Top acciones recomendadas</h3>' : ''}
            ${acciones.map((a) => `
                <div class="accion">
                    <div class="accion-area">${a.area}</div>
                    <div class="accion-titulo">${a.accion}</div>
                    <div class="accion-porque"><strong>Por qué:</strong> ${a.porque}</div>
                </div>
            `).join('')}
            <footer>Generado por MOTOFLOW IA CEO · Modelo: ${r.model || 'gpt-4o-mini'} · Costo análisis: $${Number(r.cost_usd || 0).toFixed(4)}</footer>
            <script>setTimeout(() => window.print(), 300);</script>
        </body></html>`);
        w.document.close();
    };

    if (loading && reports.length === 0) {
        return (
            <div className="bg-white border border-slate-200 rounded-lg p-6 text-center">
                <Loader2 className="h-6 w-6 animate-spin inline text-slate-400" />
            </div>
        );
    }

    const r = reports[activeIdx];

    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
            <div className="p-3 border-b border-slate-200 flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-500" />
                <h3 className="text-base font-bold text-slate-800">Último reporte diario IA</h3>
                {r && <AiPriorityBadge prioridad={r.prioridad} />}
                <div className="ml-auto flex gap-2">
                    {r && (
                        <>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                                onClick={compartirWhatsApp}
                                title="Compartir resumen por WhatsApp"
                            >
                                <Share2 className="h-3 w-3 mr-1" /> WhatsApp
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8"
                                onClick={imprimir}
                                title="Imprimir / exportar PDF"
                            >
                                <Printer className="h-3 w-3" />
                            </Button>
                        </>
                    )}
                    <Button variant="outline" size="sm" className="h-8" onClick={cargar} disabled={loading}>
                        <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                        Refrescar
                    </Button>
                    <Button
                        size="sm"
                        className="h-8 bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={generarAhora}
                        disabled={generating}
                    >
                        {generating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                        Generar análisis ahora
                    </Button>
                </div>
            </div>

            {!r ? (
                <div className="p-8 text-center text-slate-400 italic text-sm">
                    Aún no hay reportes. Haz clic en "Generar análisis ahora".
                </div>
            ) : (
                <div className="p-4 space-y-3">
                    <div>
                        <div className="text-[10px] uppercase font-bold text-slate-500">
                            {new Date(r.fecha + 'T00:00:00').toLocaleDateString('es-DO', { weekday: 'long', day: '2-digit', month: 'long' })}
                            {r.model && <span className="ml-2 text-slate-400">· {r.model}</span>}
                            {r.cost_usd != null && <span className="ml-2 text-slate-400">· ${Number(r.cost_usd).toFixed(4)}</span>}
                        </div>
                        <h4 className="text-lg font-bold text-slate-800 mt-1">{r.titulo}</h4>
                        {r.resumen && <p className="text-sm text-slate-600 mt-1">{r.resumen}</p>}
                    </div>

                    {/* Top Acciones del CEO Principal (Fase 2) */}
                    {r.detalles?.parsed?.top_acciones?.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-slate-100">
                            <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">
                                Top acciones recomendadas para hoy
                            </div>
                            {r.detalles.parsed.top_acciones.map((a, i) => (
                                <div key={`ta-${i}`} className="bg-violet-50 border border-violet-200 rounded p-3 flex gap-3">
                                    <span className="text-2xl">
                                        {a.area === 'finanzas' ? '💰' : a.area === 'inventario' ? '📦' : a.area === 'credito' ? '💳' : a.area === 'ventas' ? '📈' : '⚡'}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-[10px] uppercase font-bold text-violet-700 tracking-wider">{a.area}</span>
                                        <p className="text-sm font-bold text-slate-800 leading-tight mt-0.5">{a.accion}</p>
                                        <p className="text-[11px] text-slate-600 mt-1"><strong>Por qué:</strong> {a.porque}</p>
                                    </div>
                                </div>
                            ))}
                            {r.detalles.parsed.decisiones_recomendadas?.length > 0 && (
                                <div className="text-[11px] text-violet-700 italic pt-2">
                                    💡 {r.detalles.parsed.decisiones_recomendadas.length} decisión(es) creada(s) automáticamente en el tab "Decisiones" para tu aprobación.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Formato legacy (Fase 1 - margenes_diarios) */}
                    {r.detalles?.alertas?.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-slate-100">
                            <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">
                                Productos críticos identificados ({r.detalles.alertas.length})
                            </div>
                            {r.detalles.alertas.map((a, i) => {
                                const ti = TIPO_ALERTA_ICON[a.tipo] || TIPO_ALERTA_ICON.default;
                                const Icon = ti.icon;
                                return (
                                    <div key={i} className="bg-slate-50 rounded p-3 flex gap-3">
                                        <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${ti.color}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                                <span className="font-mono font-bold text-slate-800 text-sm">{a.codigo}</span>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold bg-white ${ti.color}`}>
                                                    {a.tipo?.replace(/_/g, ' ')}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-700 font-semibold uppercase truncate">{a.descripcion}</p>
                                            <p className="text-[11px] text-slate-600 mt-0.5">
                                                <strong>Diagnóstico:</strong> {a.diagnostico}
                                            </p>
                                            <p className="text-[11px] text-emerald-700">
                                                <strong>Acción sugerida:</strong> {a.accion_sugerida}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {r.total_alertas != null && (
                        <div className="text-[11px] text-slate-500 italic pt-2 border-t border-slate-100">
                            💡 El agente analizó <strong>{r.total_alertas}</strong> productos con anomalías y priorizó los más urgentes.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
