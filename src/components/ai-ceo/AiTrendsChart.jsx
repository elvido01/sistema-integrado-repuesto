// ============================================================
// AiTrendsChart.jsx — Gráficos de tendencia sobre snapshots
// ============================================================
// SVG nativo (sin libs externas). Renderiza:
//   - Health Score (línea)
//   - Ventas históricas (área)
//   - Mora y Stock bajo (líneas)
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Loader2, TrendingUp, Activity, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const fmtMoney = (n) => Number(n || 0).toLocaleString('es-DO', { maximumFractionDigits: 0 });
const fmtDate = (s) => new Date(s).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit' });

export default function AiTrendsChart({ days = 14 }) {
    const { tenantId } = useAuth();
    const [snapshots, setSnapshots] = useState([]);
    const [loading, setLoading] = useState(true);

    const cargar = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('ai_metrics_snapshots')
                .select('fecha, health_score, sales_total, overdue_amount, low_stock_count, dead_stock_count')
                .eq('tenant_id', tenantId)
                .eq('snapshot_type', 'daily')
                .order('fecha', { ascending: true })
                .limit(days);
            if (error) throw error;
            setSnapshots(data || []);
        } catch (err) {
            console.error('[AiTrendsChart]', err);
        } finally {
            setLoading(false);
        }
    }, [tenantId, days]);

    useEffect(() => { cargar(); }, [cargar]);

    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
            <div className="p-3 border-b border-slate-200 flex items-center gap-2">
                <Activity className="h-5 w-5 text-indigo-500" />
                <h3 className="text-base font-bold text-slate-800">Tendencias últimos {days} días</h3>
                <span className="text-xs text-slate-500">({snapshots.length} snapshots)</span>
                <Button variant="outline" size="sm" className="h-8 ml-auto" onClick={cargar} disabled={loading}>
                    <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                    Refrescar
                </Button>
            </div>

            {loading ? (
                <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin inline text-slate-400" /></div>
            ) : snapshots.length < 2 ? (
                <div className="p-8 text-center text-slate-400 italic text-sm">
                    Se necesitan al menos 2 snapshots para mostrar tendencia. El sistema captura uno cada vez que corre el agente diario.
                </div>
            ) : (
                <div className="p-4 space-y-4">
                    <MiniChart
                        title="Business Health Score"
                        data={snapshots.map((s) => ({ x: s.fecha, y: s.health_score || 0 }))}
                        color="#7c3aed"
                        valueFormatter={(v) => `${v}/100`}
                        yMin={0}
                        yMax={100}
                    />
                    <MiniChart
                        title="Ventas (foto del día)"
                        data={snapshots.map((s) => ({ x: s.fecha, y: Number(s.sales_total) || 0 }))}
                        color="#059669"
                        valueFormatter={(v) => `RD$ ${fmtMoney(v)}`}
                        filled
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <MiniChart
                            title="Mora acumulada"
                            data={snapshots.map((s) => ({ x: s.fecha, y: Number(s.overdue_amount) || 0 }))}
                            color="#dc2626"
                            valueFormatter={(v) => `RD$ ${fmtMoney(v)}`}
                            height={110}
                        />
                        <MiniChart
                            title="Productos con stock bajo"
                            data={snapshots.map((s) => ({ x: s.fecha, y: Number(s.low_stock_count) || 0 }))}
                            color="#d97706"
                            valueFormatter={(v) => `${v} prod`}
                            height={110}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

function MiniChart({ title, data, color, filled = false, valueFormatter = (v) => v, yMin, yMax, height = 140 }) {
    if (data.length === 0) return null;

    const w = 600;
    const h = height;
    const pad = { top: 10, right: 10, bottom: 24, left: 50 };
    const innerW = w - pad.left - pad.right;
    const innerH = h - pad.top - pad.bottom;

    const ys = data.map((d) => d.y);
    const minY = yMin !== undefined ? yMin : Math.min(...ys, 0);
    const maxY = yMax !== undefined ? yMax : Math.max(...ys);
    const rangeY = maxY - minY || 1;

    const xStep = data.length > 1 ? innerW / (data.length - 1) : 0;
    const pts = data.map((d, i) => {
        const x = pad.left + i * xStep;
        const y = pad.top + innerH - ((d.y - minY) / rangeY) * innerH;
        return { x, y, d };
    });

    const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const areaD = filled
        ? `${pathD} L${pts[pts.length - 1].x.toFixed(1)},${(pad.top + innerH).toFixed(1)} L${pts[0].x.toFixed(1)},${(pad.top + innerH).toFixed(1)} Z`
        : '';

    // Ejes Y: 3 valores
    const yTicks = [minY, (minY + maxY) / 2, maxY];

    const lastValue = data[data.length - 1].y;
    const firstValue = data[0].y;
    const change = lastValue - firstValue;
    const changePct = firstValue !== 0 ? (change / firstValue) * 100 : 0;

    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">{title}</h4>
                <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold text-slate-800">{valueFormatter(lastValue)}</span>
                    {firstValue !== 0 && (
                        <span className={`${change >= 0 ? 'text-emerald-600' : 'text-red-600'} text-[10px] font-semibold`}>
                            {change >= 0 ? '↑' : '↓'} {Math.abs(changePct).toFixed(1)}%
                        </span>
                    )}
                </div>
            </div>
            <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="overflow-visible">
                {/* Grid lines */}
                {yTicks.map((v, i) => {
                    const y = pad.top + innerH - ((v - minY) / rangeY) * innerH;
                    return (
                        <g key={i}>
                            <line x1={pad.left} y1={y} x2={pad.left + innerW} y2={y} stroke="#e2e8f0" strokeDasharray="2 2" />
                            <text x={pad.left - 6} y={y + 3} fontSize="9" fill="#94a3b8" textAnchor="end">
                                {typeof v === 'number' && v >= 1000 ? `${Math.round(v / 1000)}k` : Math.round(v)}
                            </text>
                        </g>
                    );
                })}

                {/* Area */}
                {filled && <path d={areaD} fill={color} opacity="0.15" />}
                {/* Line */}
                <path d={pathD} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />

                {/* Dots */}
                {pts.map((p, i) => (
                    <g key={i}>
                        <circle cx={p.x} cy={p.y} r="2.5" fill="white" stroke={color} strokeWidth="1.5" />
                        <title>{`${fmtDate(p.d.x)}: ${valueFormatter(p.d.y)}`}</title>
                    </g>
                ))}

                {/* Eje X: primero + medio + último */}
                {[0, Math.floor(pts.length / 2), pts.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((idx) => (
                    <text
                        key={idx}
                        x={pts[idx].x}
                        y={pad.top + innerH + 14}
                        fontSize="9"
                        fill="#64748b"
                        textAnchor="middle"
                    >
                        {fmtDate(data[idx].x)}
                    </text>
                ))}
            </svg>
        </div>
    );
}
