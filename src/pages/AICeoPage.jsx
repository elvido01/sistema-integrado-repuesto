// ============================================================
// AICeoPage.jsx — MORLA AI CEO Dashboard (Fase 1)
// ============================================================
// Centro de mando inteligente. Tres pestañas internas:
//   1. Dashboard   → Health score + alertas críticas + reporte
//   2. Alertas     → listado completo de alertas con filtros
//   3. Reportes    → historial de reportes diarios
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useSuscripcion } from '@/contexts/SuscripcionContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Brain, RefreshCw, Loader2, Zap, AlertCircle, FileText, LayoutDashboard, Settings, Gavel, MessageSquare, TrendingUp, Megaphone, Palette, Film } from 'lucide-react';

import BusinessHealthCard from '@/components/ai-ceo/BusinessHealthCard';
import AiAlertsList from '@/components/ai-ceo/AiAlertsList';
import AiReportViewer from '@/components/ai-ceo/AiReportViewer';
import AiDecisionsList from '@/components/ai-ceo/AiDecisionsList';
import AiReportsTimeline from '@/components/ai-ceo/AiReportsTimeline';
import AiCeoChat from '@/components/ai-ceo/AiCeoChat';
import AiForecastCard from '@/components/ai-ceo/AiForecastCard';
import AiSettingsPanel from '@/components/ai-ceo/AiSettingsPanel';
import AiTrendsChart from '@/components/ai-ceo/AiTrendsChart';
import MarketingAI from '@/pages/MorlaAICEO/MarketingAI';
import DesignProPage from '@/pages/MorlaAICEO/DesignProPage';
import CaptutPro from '@/pages/MorlaAICEO/CaptutPro';

const TABS = [
    { key: 'dashboard',   label: 'Dashboard',    icon: LayoutDashboard },
    { key: 'chat',        label: 'Chat IA',      icon: MessageSquare },
    { key: 'alertas',     label: 'Alertas',      icon: AlertCircle },
    { key: 'decisiones',  label: 'Decisiones',   icon: Gavel },
    { key: 'forecast',    label: 'Predicciones', icon: TrendingUp },
    { key: 'marketing',   label: 'Marketing IA', icon: Megaphone },
    { key: 'diseno',      label: 'Diseño Pro',   icon: Palette },
    { key: 'captut-pro',  label: 'Captut Pro',   icon: Film },
    { key: 'reportes',    label: 'Reportes',     icon: FileText },
    { key: 'config',      label: 'Configuración', icon: Settings },
];

export default function AICeoPage() {
    const { tenantId, isSuperAdmin } = useAuth();
    const { planActual } = useSuscripcion();
    // Marketing IA = función Plus: solo planes PRO y ENTERPRISE (y super admin).
    const puedeMarketing = isSuperAdmin || ['PRO', 'ENTERPRISE'].includes((planActual || '').toUpperCase());
    // Diseño Pro (Canva-like) = solo ENTERPRISE (upsell premium).
    const puedeDiseno = isSuperAdmin || (planActual || '').toUpperCase() === 'ENTERPRISE';
    const puedeCaptut = isSuperAdmin || (planActual || '').toUpperCase() === 'ENTERPRISE';
    const { toast } = useToast();
    const [tab, setTab] = useState('dashboard');
    const [health, setHealth] = useState(null);
    const [healthLoading, setHealthLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [alertCount, setAlertCount] = useState({ critical: 0, high: 0, pending: 0 });
    const [decisionCount, setDecisionCount] = useState(0);

    const cargarHealth = useCallback(async () => {
        if (!tenantId) return;
        setHealthLoading(true);
        try {
            const { data, error } = await supabase.rpc('ai_business_health_score', { p_tenant_id: tenantId });
            if (error) throw error;
            setHealth(data);
        } catch (err) {
            console.error('[AICeoPage] health:', err);
            toast({ variant: 'destructive', title: 'Error', description: err.message });
        } finally {
            setHealthLoading(false);
        }
    }, [tenantId, toast]);

    const cargarConteoAlertas = useCallback(async () => {
        if (!tenantId) return;
        try {
            const { data } = await supabase
                .from('ai_alerts')
                .select('severity, status')
                .eq('tenant_id', tenantId)
                .eq('status', 'pending');
            const counts = { critical: 0, high: 0, pending: data?.length || 0 };
            for (const a of data || []) {
                if (a.severity === 'critical') counts.critical += 1;
                if (a.severity === 'high') counts.high += 1;
            }
            setAlertCount(counts);
        } catch (err) {
            console.error('[AICeoPage] conteo alertas:', err);
        }
    }, [tenantId]);

    const cargarConteoDecisiones = useCallback(async () => {
        if (!tenantId) return;
        try {
            const { count } = await supabase
                .from('ai_decisions')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .eq('status', 'pending');
            setDecisionCount(count || 0);
        } catch (err) {
            console.error('[AICeoPage] conteo decisiones:', err);
        }
    }, [tenantId]);

    useEffect(() => {
        cargarHealth();
        cargarConteoAlertas();
        cargarConteoDecisiones();
    }, [cargarHealth, cargarConteoAlertas, cargarConteoDecisiones]);

    const correrAnalisisCompleto = async () => {
        setRunning(true);
        try {
            // Edge function ejecuta: alertas SQL + snapshot + reporte LLM
            const { data, error } = await supabase.functions.invoke('motoflow-daily-insights', {
                body: { tenant_id: tenantId, force: true },
            });
            if (error) throw error;
            if (!data?.ok) throw new Error(data?.error || 'falla agente');

            const r = data.resultados?.[0];
            const alertasNuevas = r?.alertas_sql ?? 0;
            const score = r?.snapshot_score;
            const costo = r?.cost_usd ?? 0;

            toast({
                title: '✓ Análisis ejecutado',
                description: `${alertasNuevas} alertas SQL · score ${score ?? '?'}/100 · costo IA $${costo.toFixed(4)}`,
                duration: 5000,
            });

            await cargarHealth();
            await cargarConteoAlertas();
            await cargarConteoDecisiones();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: err.message });
        } finally {
            setRunning(false);
        }
    };

    return (
        <>
            <Helmet><title>MORLA AI CEO — Motoflow</title></Helmet>
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-slate-50 min-h-screen"
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <div className="bg-gradient-to-br from-violet-500 to-blue-600 text-white p-2.5 rounded-lg shadow-md">
                            <Brain className="h-7 w-7" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800 leading-tight">MORLA AI CEO</h1>
                            <p className="text-xs text-slate-500">
                                Equipo digital de inteligencia para el CEO humano · Fase 1
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => { cargarHealth(); cargarConteoAlertas(); cargarConteoDecisiones(); }}>
                            <RefreshCw className={`h-4 w-4 mr-1 ${healthLoading ? 'animate-spin' : ''}`} />
                            Refrescar
                        </Button>
                        <Button
                            className="bg-violet-600 hover:bg-violet-700 text-white shadow-md"
                            onClick={correrAnalisisCompleto}
                            disabled={running}
                        >
                            {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
                            Correr análisis ahora
                        </Button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mb-3 border-b border-slate-200">
                    {TABS
                        .filter((t) => t.key !== 'marketing' || puedeMarketing)
                        .filter((t) => t.key !== 'diseno' || puedeDiseno)
                        .filter((t) => t.key !== 'captut-pro' || puedeCaptut)
                        .map((t) => {
                        const Icon = t.icon;
                        const active = tab === t.key;
                        let badgeCount = 0;
                        let badgeCls = 'bg-amber-100 text-amber-700';
                        if (t.key === 'alertas') {
                            badgeCount = alertCount.pending;
                            badgeCls = alertCount.critical > 0 ? 'bg-red-100 text-red-700'
                                : alertCount.high > 0 ? 'bg-orange-100 text-orange-700'
                                : 'bg-amber-100 text-amber-700';
                        } else if (t.key === 'decisiones') {
                            badgeCount = decisionCount;
                            badgeCls = 'bg-violet-100 text-violet-700';
                        }
                        return (
                            <button
                                key={t.key}
                                onClick={() => setTab(t.key)}
                                className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors flex items-center gap-2 ${
                                    active
                                        ? 'border-violet-600 text-violet-700'
                                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                                }`}
                            >
                                <Icon className="h-4 w-4" />
                                {t.label}
                                {badgeCount > 0 && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeCls}`}>
                                        {badgeCount}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Content */}
                {tab === 'dashboard' && (
                    <div className="space-y-3">
                        <BusinessHealthCard data={health} loading={healthLoading} />
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            <AiAlertsList
                                defaultFilter={{ status: 'pending', severity: 'all', area: 'all' }}
                                height={500}
                            />
                            <AiReportViewer reportType="daily" maxItems={1} />
                        </div>
                    </div>
                )}

                {tab === 'chat' && (
                    <AiCeoChat />
                )}

                {tab === 'alertas' && (
                    <AiAlertsList
                        defaultFilter={{ status: 'pending', severity: 'all', area: 'all' }}
                    />
                )}

                {tab === 'decisiones' && (
                    <AiDecisionsList onCountChange={setDecisionCount} />
                )}

                {tab === 'forecast' && (
                    <div className="space-y-3">
                        <AiForecastCard />
                        <AiTrendsChart days={14} />
                    </div>
                )}

                {tab === 'marketing' && puedeMarketing && (
                    <MarketingAI />
                )}

                {tab === 'diseno' && puedeDiseno && (
                    <DesignProPage />
                )}

                {tab === 'captut-pro' && puedeCaptut && (
                    <CaptutPro />
                )}

                {tab === 'reportes' && (
                    <div className="space-y-3">
                        <AiReportViewer reportType="daily" maxItems={1} />
                        <AiReportsTimeline limit={30} />
                    </div>
                )}

                {tab === 'config' && (
                    <AiSettingsPanel />
                )}

                {/* Footer */}
                <div className="mt-6 text-center text-[10px] text-slate-400 italic">
                    💡 El agente NO ejecuta acciones críticas sin tu aprobación. Solo recomienda. Tú decides.
                </div>
            </motion.div>
        </>
    );
}
