// ============================================================
// MarketingAI.jsx — Marketing IA / YouTube (tab de MORLA AI CEO)
// ============================================================
// Flujo guiado: generar sugerencias -> elegir producto -> propuesta
// -> aceptar / regenerar -> generar imagen (opt-in). No publica solo.
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Megaphone, Sparkles, CalendarDays, Settings, DollarSign, Share2, BarChart3 } from 'lucide-react';

import ContentGeneratorPanel from '@/components/ai-marketing/ContentGeneratorPanel';
import GeneratedContentPreview from '@/components/ai-marketing/GeneratedContentPreview';
import MarketingCalendar from '@/components/ai-marketing/MarketingCalendar';
import MarketingSettingsPanel from '@/components/ai-marketing/MarketingSettingsPanel';
import SocialPostsManager from '@/components/ai-marketing/SocialPostsManager';
import MarketingMetrics from '@/pages/MorlaAICEO/MarketingMetrics';
import {
    getRecommendedProductsForMarketing, generateProductProposal, regenerateProposal,
    generateContentImage, markContentState, markContentAsPublished, scheduleContent,
    getDailyConsumption,
} from '@/services/aiMarketingService';

const SUBTABS = [
    { key: 'generador', label: 'Generador', icon: Sparkles },
    { key: 'calendario', label: 'Calendario', icon: CalendarDays },
    { key: 'publicaciones', label: 'Publicaciones', icon: Share2 },
    { key: 'metricas', label: 'Métricas y Aprendizaje', icon: BarChart3 },
    { key: 'config', label: 'Configuración', icon: Settings },
];

export default function MarketingAI() {
    const { tenantId } = useAuth();
    const { toast } = useToast();
    const [subtab, setSubtab] = useState('generador');

    const [campaignId, setCampaignId] = useState(null);
    const [sugerencias, setSugerencias] = useState([]);
    const [mensaje, setMensaje] = useState('');
    const [selectedId, setSelectedId] = useState(null);
    const [content, setContent] = useState(null);

    const [suggesting, setSuggesting] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [busy, setBusy] = useState({ regen: false, image: false, state: false });
    const [consumo, setConsumo] = useState({ total: 0, llamados: 0, imagenes: 0 });

    const cargarConsumo = useCallback(async () => {
        if (!tenantId) return;
        setConsumo(await getDailyConsumption(tenantId));
    }, [tenantId]);

    useEffect(() => { cargarConsumo(); }, [cargarConsumo]);

    const handleSuggest = async () => {
        setSuggesting(true); setMensaje(''); setSugerencias([]); setContent(null); setSelectedId(null);
        try {
            const res = await getRecommendedProductsForMarketing({ modo_prueba: true });
            setCampaignId(res.campaign_id);
            setSugerencias(res.sugerencias || []);
            if (!res.sugerencias?.length) setMensaje(res.mensaje || 'No se encontraron productos.');
            cargarConsumo();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally { setSuggesting(false); }
    };

    const handleSelectProduct = async (prod) => {
        setSelectedId(prod.id); setGenerating(true); setContent(null);
        try {
            const res = await generateProductProposal(prod.id, { campaign_id: campaignId });
            setContent(res.content);
            if (res.incompleto) toast({ title: 'Contenido incompleto', description: 'Falta precio o imagen — revísalo antes de publicar.' });
            cargarConsumo();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally { setGenerating(false); }
    };

    const handleRegenerate = async (feedback) => {
        if (!content) return;
        setBusy((b) => ({ ...b, regen: true }));
        try {
            const res = await regenerateProposal(content.producto_id, { campaign_id: campaignId, content_id: content.id, feedback });
            setContent(res.content);
            cargarConsumo();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally { setBusy((b) => ({ ...b, regen: false })); }
    };

    const handleGenerateImage = async () => {
        if (!content) return;
        setBusy((b) => ({ ...b, image: true }));
        try {
            const res = await generateContentImage(content.id);
            setContent((c) => ({ ...c, imagenes: res.imagenes }));
            toast({ title: '✓ Imagen generada', description: `Costo: $${Number(res.cost_usd || 0).toFixed(3)}` });
            cargarConsumo();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally { setBusy((b) => ({ ...b, image: false })); }
    };

    const cambiarEstado = async (fn, label) => {
        if (!content) return;
        setBusy((b) => ({ ...b, state: true }));
        try {
            const updated = await fn(content.id);
            setContent(updated);
            toast({ title: `✓ ${label}` });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally { setBusy((b) => ({ ...b, state: false })); }
    };

    const handleSchedule = async () => {
        if (!content) return;
        const fecha = window.prompt('Programar para qué fecha (YYYY-MM-DD)?', new Date().toISOString().slice(0, 10));
        if (!fecha) return;
        try {
            const updated = await scheduleContent(content.id, fecha);
            setContent(updated);
            toast({ title: '✓ Programado', description: `Para el ${fecha}` });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        }
    };

    return (
        <div>
            {/* Header + medidor de consumo */}
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <div className="flex items-center gap-3">
                    <div className="bg-gradient-to-br from-violet-500 to-blue-600 text-white p-2.5 rounded-lg shadow-md">
                        <Megaphone className="h-6 w-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 leading-tight">Marketing IA / YouTube</h2>
                        <p className="text-xs text-slate-500">Contenido para Reels, YouTube, TikTok, Instagram y WhatsApp</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm">
                    <DollarSign className="h-4 w-4 text-emerald-600" />
                    <span className="text-slate-600">Consumo hoy:</span>
                    <span className="font-bold text-slate-800">${consumo.total.toFixed(4)}</span>
                    <span className="text-xs text-slate-400">· {consumo.llamados} análisis · {consumo.imagenes} imág.</span>
                </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-1 mb-4 border-b border-slate-200">
                {SUBTABS.map((t) => {
                    const Icon = t.icon;
                    const active = subtab === t.key;
                    return (
                        <button key={t.key} onClick={() => setSubtab(t.key)}
                            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${active ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                            <Icon className="h-4 w-4" /> {t.label}
                        </button>
                    );
                })}
            </div>

            {subtab === 'generador' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 h-[600px]">
                        <ContentGeneratorPanel
                            onSuggest={handleSuggest}
                            suggesting={suggesting}
                            sugerencias={sugerencias}
                            mensaje={mensaje}
                            onSelectProduct={handleSelectProduct}
                            selectedProductId={selectedId}
                            generating={generating}
                        />
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-4 h-[600px]">
                        <GeneratedContentPreview
                            content={content}
                            busy={busy}
                            onRegenerate={handleRegenerate}
                            onGenerateImage={handleGenerateImage}
                            onAccept={() => cambiarEstado((id) => markContentState(id, 'aprobado'), 'Aprobado')}
                            onPublish={() => cambiarEstado(markContentAsPublished, 'Marcado como publicado')}
                            onDiscard={() => cambiarEstado((id) => markContentState(id, 'descartado'), 'Descartado')}
                            onSchedule={handleSchedule}
                        />
                    </div>
                </div>
            )}

            {subtab === 'calendario' && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <MarketingCalendar />
                </div>
            )}

            {subtab === 'publicaciones' && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <SocialPostsManager />
                </div>
            )}

            {subtab === 'metricas' && (
                <MarketingMetrics />
            )}

            {subtab === 'config' && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <MarketingSettingsPanel />
                </div>
            )}
        </div>
    );
}
