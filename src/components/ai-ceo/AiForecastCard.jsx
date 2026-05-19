// ============================================================
// AiForecastCard.jsx — Predicciones de ventas y stockouts
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Minus, AlertCircle, Loader2, RefreshCw, Calendar, Package } from 'lucide-react';

const fmtMoney = (n) => Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (s) => s ? new Date(s).toLocaleDateString('es-DO', { day: '2-digit', month: 'short' }) : '—';

export default function AiForecastCard() {
    const { tenantId } = useAuth();
    const [forecast, setForecast] = useState(null);
    const [stockouts, setStockouts] = useState([]);
    const [loading, setLoading] = useState(true);

    const cargar = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        try {
            const [fcRes, soRes] = await Promise.all([
                supabase.rpc('ai_forecast_ventas', { p_tenant_id: tenantId }),
                supabase.rpc('ai_predict_stockouts', { p_tenant_id: tenantId, p_dias_alerta: 14 }),
            ]);
            setForecast(fcRes.data);
            setStockouts(soRes.data || []);
        } catch (err) {
            console.error('[AiForecastCard]', err);
        } finally {
            setLoading(false);
        }
    }, [tenantId]);

    useEffect(() => { cargar(); }, [cargar]);

    const dirInfo = forecast?.tendencia_direccion === 'subiendo'
        ? { icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50', label: 'Subiendo' }
        : forecast?.tendencia_direccion === 'bajando'
        ? { icon: TrendingDown, color: 'text-red-600 bg-red-50', label: 'Bajando' }
        : { icon: Minus, color: 'text-slate-600 bg-slate-50', label: 'Estable' };
    const DirIcon = dirInfo.icon;

    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
            <div className="p-3 border-b border-slate-200 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-indigo-500" />
                <h3 className="text-base font-bold text-slate-800">Predicciones (Forecast)</h3>
                <Button variant="outline" size="sm" className="h-8 ml-auto" onClick={cargar} disabled={loading}>
                    <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                    Refrescar
                </Button>
            </div>

            {loading ? (
                <div className="p-8 text-center">
                    <Loader2 className="h-6 w-6 animate-spin inline text-slate-400" />
                </div>
            ) : (
                <div className="p-4 space-y-4">
                    {/* Forecast ventas */}
                    {forecast && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="bg-indigo-50 border border-indigo-200 rounded p-3">
                                <div className="text-[10px] uppercase font-bold text-indigo-700">Promedio Diario Actual</div>
                                <div className="text-xl font-bold text-slate-800 mt-1">RD$ {fmtMoney(forecast.avg_diario_actual)}</div>
                                <div className="text-[10px] text-slate-500">Últimos 90 días</div>
                            </div>
                            <div className={`rounded p-3 border ${dirInfo.color.replace('bg-', 'border-').replace('-50', '-200')} ${dirInfo.color}`}>
                                <div className="flex items-center gap-2">
                                    <DirIcon className="h-4 w-4" />
                                    <span className="text-[10px] uppercase font-bold tracking-wider">Tendencia</span>
                                </div>
                                <div className="text-xl font-bold mt-1">{dirInfo.label}</div>
                                <div className="text-[10px] mt-0.5">
                                    {forecast.tendencia_diaria > 0 ? '+' : ''}{forecast.tendencia_diaria}/día
                                </div>
                            </div>
                            <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
                                <div className="text-[10px] uppercase font-bold text-emerald-700 flex items-center gap-1">
                                    <Calendar className="h-3 w-3" /> Próximos 30 días
                                </div>
                                <div className="text-xl font-bold text-slate-800 mt-1">RD$ {fmtMoney(forecast.ventas_pred_30d)}</div>
                                <div className="text-[10px] text-slate-500">
                                    Confianza: <span className={`font-bold ${forecast.confianza === 'alta' ? 'text-emerald-700' : forecast.confianza === 'media' ? 'text-amber-700' : 'text-slate-500'}`}>{forecast.confianza}</span>
                                    {' '}· {forecast.dias_data} días de datos
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Stockouts predicted */}
                    <div className="pt-3 border-t border-slate-100">
                        <div className="flex items-center gap-2 mb-2">
                            <Package className="h-4 w-4 text-amber-600" />
                            <h4 className="text-sm font-bold text-slate-800">Productos por agotarse en ≤14 días</h4>
                            <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">
                                {stockouts.length}
                            </span>
                        </div>
                        {stockouts.length === 0 ? (
                            <div className="text-center py-4 text-slate-400 italic text-xs">
                                Ningún producto en riesgo inmediato de agotarse.
                            </div>
                        ) : (
                            <div className="space-y-1.5 max-h-72 overflow-y-auto">
                                {stockouts.slice(0, 15).map((s) => {
                                    const dias = Number(s.dias_para_agotarse) || 0;
                                    const urgencia = dias <= 3 ? 'critical' : dias <= 7 ? 'high' : 'medium';
                                    const colors = {
                                        critical: 'bg-red-50 border-red-200 text-red-700',
                                        high: 'bg-orange-50 border-orange-200 text-orange-700',
                                        medium: 'bg-amber-50 border-amber-200 text-amber-700',
                                    };
                                    return (
                                        <div key={s.producto_id} className={`flex items-center gap-2 border rounded p-2 ${colors[urgencia]}`}>
                                            <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-mono font-bold text-xs">{s.codigo}</span>
                                                    <span className="text-[11px] text-slate-700 truncate">{s.descripcion}</span>
                                                </div>
                                                <div className="text-[10px] text-slate-500">
                                                    Existencia: <strong>{s.existencia}</strong> · Vel: {s.velocidad_diaria}/día · Stockout {fmtDate(s.fecha_estimada_stockout)}
                                                </div>
                                            </div>
                                            <span className="text-[10px] font-bold whitespace-nowrap">
                                                {dias < 1 ? 'HOY' : `${dias}d`}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
