// ============================================================
// InsightsBanner.jsx
// ============================================================
// Banner que aparece en HomePage cuando el agente diario
// (motoflow-daily-insights) detectó anomalías hoy.
//
// Lee de ai_reports el último registro no descartado.
// Click para expandir y ver las alertas detalladas.
// Acciones: Marcar como visto / Descartar.
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ChevronDown, ChevronUp, X, Sparkles, TrendingDown, TrendingUp, Eye } from 'lucide-react';

const PRIORIDAD_STYLE = {
    alta: {
        bg: 'bg-gradient-to-r from-red-50 to-rose-50',
        border: 'border-red-300',
        icon: 'text-red-600',
        badge: 'bg-red-100 text-red-800',
        label: 'ALTA',
    },
    media: {
        bg: 'bg-gradient-to-r from-amber-50 to-yellow-50',
        border: 'border-amber-300',
        icon: 'text-amber-600',
        badge: 'bg-amber-100 text-amber-800',
        label: 'MEDIA',
    },
    baja: {
        bg: 'bg-gradient-to-r from-emerald-50 to-teal-50',
        border: 'border-emerald-300',
        icon: 'text-emerald-600',
        badge: 'bg-emerald-100 text-emerald-800',
        label: 'BAJA',
    },
};

const TIPO_ALERTA_LABEL = {
    margen_negativo: { label: 'Margen negativo', icon: TrendingDown, color: 'text-red-600' },
    margen_bajo: { label: 'Margen bajo', icon: TrendingDown, color: 'text-amber-600' },
    costo_subio: { label: 'Costo subió', icon: TrendingUp, color: 'text-orange-600' },
};

export default function InsightsBanner() {
    const { tenantId, user } = useAuth();
    const { toast } = useToast();
    const [insight, setInsight] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);
    const [updating, setUpdating] = useState(false);

    const cargar = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('ai_reports')
                .select('id, titulo, resumen, prioridad, total_alertas, detalles, fecha, estado, created_at, agent_key')
                .eq('tenant_id', tenantId)
                .eq('agent_key', 'ai_ceo_principal')
                .neq('estado', 'descartado')
                .order('fecha', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (error) throw error;
            setInsight(data);
        } catch (err) {
            console.error('[InsightsBanner] error:', err);
        } finally {
            setLoading(false);
        }
    }, [tenantId]);

    useEffect(() => { cargar(); }, [cargar]);

    const cambiarEstado = async (nuevoEstado) => {
        if (!insight) return;
        setUpdating(true);
        try {
            const patch = { estado: nuevoEstado, updated_at: new Date().toISOString() };
            if (nuevoEstado === 'descartado') {
                patch.dismissed_at = new Date().toISOString();
                patch.dismissed_by = user?.id || null;
            }
            const { error } = await supabase
                .from('ai_reports')
                .update(patch)
                .eq('id', insight.id);
            if (error) throw error;
            if (nuevoEstado === 'descartado') {
                setInsight(null);
                toast({ title: 'Insight descartado', description: 'Volverá a aparecer si el agente detecta más mañana.' });
            } else {
                setInsight({ ...insight, estado: nuevoEstado });
            }
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: err.message });
        } finally {
            setUpdating(false);
        }
    };

    if (loading || !insight) return null;

    const style = PRIORIDAD_STYLE[insight.prioridad] || PRIORIDAD_STYLE.media;
    const parsed = insight.detalles?.parsed || {};
    const topAcciones = parsed.top_acciones || [];
    const alertasLegacy = insight.detalles?.alertas || [];   // formato viejo (Fase 1)
    const tieneContenidoExpandible = topAcciones.length > 0 || alertasLegacy.length > 0;
    const fechaStr = new Date(insight.fecha + 'T00:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' });

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`max-w-7xl mx-auto px-4 ${expanded ? '' : 'cursor-pointer'}`}
            onClick={() => { if (!expanded) setExpanded(true); }}
        >
            <div className={`border-2 rounded-lg shadow-md ${style.bg} ${style.border} overflow-hidden`}>
                {/* Header */}
                <div className="flex items-start gap-3 p-4">
                    <div className={`flex-shrink-0 mt-0.5 ${style.icon}`}>
                        <AlertTriangle className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${style.badge}`}>
                                PRIORIDAD {style.label}
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide flex items-center gap-1">
                                <Sparkles className="h-3 w-3" />
                                Insight IA · {fechaStr}
                            </span>
                            {insight.total_alertas > 0 && (
                                <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-semibold">
                                    {insight.total_alertas} producto{insight.total_alertas !== 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                        <h3 className="text-base font-bold text-slate-800 leading-tight">{insight.titulo}</h3>
                        {insight.resumen && (
                            <p className="text-sm text-slate-600 mt-1 leading-snug">{insight.resumen}</p>
                        )}
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-1">
                        {tieneContenidoExpandible && (
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2"
                                onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                            >
                                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                        )}
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-slate-500 hover:text-red-600"
                            onClick={(e) => { e.stopPropagation(); cambiarEstado('descartado'); }}
                            disabled={updating}
                            title="Descartar"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Cuerpo expandible */}
                <AnimatePresence>
                    {expanded && tieneContenidoExpandible && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="border-t border-slate-200 bg-white/60"
                        >
                            <div className="p-4 space-y-2">
                                {/* Top acciones (formato CEO Principal Fase 2) */}
                                {topAcciones.map((a, i) => (
                                    <div key={`ta-${i}`} className="bg-white border border-slate-200 rounded p-3 flex gap-3">
                                        <span className="text-2xl">
                                            {a.area === 'finanzas' ? '💰' : a.area === 'inventario' ? '📦' : a.area === 'credito' ? '💳' : a.area === 'ventas' ? '📈' : '⚡'}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">{a.area}</span>
                                            </div>
                                            <p className="text-sm font-bold text-slate-800">{a.accion}</p>
                                            <p className="text-[11px] text-slate-600 mt-0.5"><strong>Por qué:</strong> {a.porque}</p>
                                        </div>
                                    </div>
                                ))}
                                {/* Formato viejo (Fase 1) por compatibilidad */}
                                {topAcciones.length === 0 && alertasLegacy.map((a, i) => {
                                    const tipoInfo = TIPO_ALERTA_LABEL[a.tipo] || { label: a.tipo, icon: AlertTriangle, color: 'text-slate-600' };
                                    const Icon = tipoInfo.icon;
                                    return (
                                        <div key={i} className="bg-white border border-slate-200 rounded p-3 flex gap-3">
                                            <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${tipoInfo.color}`} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                                    <span className="font-mono font-bold text-slate-800 text-sm">{a.codigo}</span>
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${tipoInfo.color} bg-slate-100`}>
                                                        {tipoInfo.label}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-700 font-medium uppercase truncate">{a.descripcion}</p>
                                                <p className="text-[11px] text-slate-600 mt-1"><strong>Diagnóstico:</strong> {a.diagnostico}</p>
                                                <p className="text-[11px] text-emerald-700 mt-0.5"><strong>Acción:</strong> {a.accion_sugerida}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div className="flex justify-end gap-2 pt-2">
                                    {insight.estado === 'nuevo' && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-8 text-xs"
                                            onClick={() => cambiarEstado('visto')}
                                            disabled={updating}
                                        >
                                            <Eye className="h-3 w-3 mr-1" /> Marcar como visto
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
