// ============================================================
// MarketingMetrics.jsx — Métricas y Aprendizaje (tab Marketing IA)
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { RefreshCw, BarChart3, Package } from 'lucide-react';

import SocialAccountsConnector from '@/components/ai-marketing/SocialAccountsConnector';
import MarketingMetricsDashboard from '@/components/ai-marketing/MarketingMetricsDashboard';
import SocialPostRankingTable from '@/components/ai-marketing/SocialPostRankingTable';
import ProductImpactCard from '@/components/ai-marketing/ProductImpactCard';
import AgentLearningPanel from '@/components/ai-marketing/AgentLearningPanel';
import ContentRecommendationPanel from '@/components/ai-marketing/ContentRecommendationPanel';
import {
    getDashboardTotals, getTopPerformingPosts, generateMarketingLearning,
    getRecommendedContentStrategy,
} from '@/services/socialMetricsService';

export default function MarketingMetrics() {
    const { tenantId } = useAuth();
    const { toast } = useToast();
    const [totals, setTotals] = useState(null);
    const [ranking, setRanking] = useState([]);
    const [productos, setProductos] = useState([]);
    const [learning, setLearning] = useState(null);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);

    const cargar = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        try {
            const [t, top, lrn] = await Promise.all([
                getDashboardTotals(tenantId),
                getTopPerformingPosts(tenantId, 20),
                getRecommendedContentStrategy(tenantId),
            ]);
            setTotals(t); setRanking(top); setLearning(lrn);

            // Agregar impacto por producto
            const byProd = {};
            for (const r of top) {
                const im = r.impact || {};
                if (!r.producto_id) continue;
                const key = r.producto_id;
                if (!byProd[key]) byProd[key] = {
                    producto: r.productos?.descripcion || r.productos?.codigo || 'Producto',
                    publicaciones: 0, units_after: 0, units_before: 0, impacto: 0, wa_quotes: 0,
                };
                byProd[key].publicaciones += 1;
                byProd[key].units_after += Number(im.units_after || 0);
                byProd[key].units_before += Number(im.units_before || 0);
                byProd[key].impacto += Number(im.sales_impact_score || 0);
                byProd[key].wa_quotes += Number(im.wa_quotes_after || 0);
            }
            setProductos(Object.values(byProd).sort((a, b) => b.impacto - a.impacto).slice(0, 9));
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [tenantId]);

    useEffect(() => { cargar(); }, [cargar]);

    const generar = async () => {
        setGenerating(true);
        try {
            const res = await generateMarketingLearning();
            if (res?.vacio) { toast({ title: 'Sin datos', description: res.mensaje }); }
            else { setLearning(res.learning); toast({ title: '✓ Análisis generado', description: `Costo: $${Number(res.cost_usd || 0).toFixed(4)}` }); }
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally { setGenerating(false); }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><BarChart3 className="h-5 w-5 text-violet-600" /> Métricas y Aprendizaje</h3>
                <Button size="sm" variant="outline" onClick={cargar} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Actualizar
                </Button>
            </div>

            {/* Dashboard */}
            <MarketingMetricsDashboard totals={totals} />

            {/* Aprendizaje + Recomendaciones */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <AgentLearningPanel learning={learning} onGenerate={generar} generating={generating} />
                <ContentRecommendationPanel learning={learning} />
            </div>

            {/* Ranking */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="font-bold text-slate-800 mb-3">Ranking de publicaciones</h3>
                <SocialPostRankingTable rows={ranking} />
            </div>

            {/* Impacto por producto */}
            {productos.length > 0 && (
                <div>
                    <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Package className="h-5 w-5 text-violet-600" /> Impacto estimado por producto</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {productos.map((p, i) => <ProductImpactCard key={i} item={p} />)}
                    </div>
                </div>
            )}

            {/* Cuentas */}
            <SocialAccountsConnector />

            <p className="text-[10px] text-center text-slate-400 italic">
                ⚠️ Los números de ventas son "impacto estimado" (comparación antes/después), no causa directa garantizada.
            </p>
        </div>
    );
}
