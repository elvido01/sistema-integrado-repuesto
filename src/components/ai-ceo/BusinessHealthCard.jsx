import React from 'react';
import { motion } from 'framer-motion';
import { Activity, TrendingUp, AlertTriangle, CreditCard, Boxes, Sparkles } from 'lucide-react';

const STATUS_CONFIG = {
    excelente: { color: 'from-emerald-500 to-green-500', text: 'text-emerald-600', label: 'EXCELENTE', icon: '🟢' },
    bueno:     { color: 'from-green-500 to-lime-500',    text: 'text-green-600',   label: 'BUENO',     icon: '🟢' },
    atencion:  { color: 'from-amber-500 to-yellow-500',  text: 'text-amber-600',   label: 'ATENCIÓN',  icon: '🟡' },
    riesgo:    { color: 'from-orange-500 to-red-500',    text: 'text-orange-600',  label: 'RIESGO',    icon: '🟠' },
    critico:   { color: 'from-red-600 to-rose-700',      text: 'text-red-700',     label: 'CRÍTICO',   icon: '🔴' },
};

const BREAKDOWN_ICONS = {
    ventas:     { icon: TrendingUp,    label: 'Ventas',     max: 25 },
    margenes:   { icon: Activity,      label: 'Márgenes',   max: 25 },
    credito:    { icon: CreditCard,    label: 'Crédito',    max: 20 },
    alertas:    { icon: AlertTriangle, label: 'Alertas',    max: 20 },
    inventario: { icon: Boxes,         label: 'Inventario', max: 10 },
};

const fmtMoney = (n) => n != null ? Number(n).toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '0';

export default function BusinessHealthCard({ data, loading }) {
    if (loading) {
        return (
            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
                <div className="animate-pulse space-y-3">
                    <div className="h-6 bg-slate-200 rounded w-1/3" />
                    <div className="h-20 bg-slate-200 rounded" />
                    <div className="h-12 bg-slate-200 rounded" />
                </div>
            </div>
        );
    }
    if (!data) return null;

    const status = STATUS_CONFIG[data.status] || STATUS_CONFIG.atencion;
    const score = data.score || 0;
    const breakdown = data.breakdown || {};
    const metricas = data.metricas || {};

    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
            <div className={`bg-gradient-to-r ${status.color} p-4 text-white`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5" />
                        <span className="text-xs font-bold uppercase tracking-widest opacity-90">Business Health Score</span>
                    </div>
                    <span className="text-2xl">{status.icon}</span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                    <motion.div
                        initial={{ scale: 0.7, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', duration: 0.8 }}
                        className="text-5xl font-bold tracking-tight"
                    >
                        {score}
                    </motion.div>
                    <span className="text-lg opacity-80 font-semibold">/100</span>
                    <span className="ml-auto text-sm font-bold tracking-wide bg-white/20 px-2 py-1 rounded">{status.label}</span>
                </div>
            </div>

            {/* Breakdown */}
            <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3 border-b border-slate-100">
                {Object.entries(BREAKDOWN_ICONS).map(([key, cfg]) => {
                    const value = breakdown[key] ?? 0;
                    const pct = (value / cfg.max) * 100;
                    const Icon = cfg.icon;
                    const color = pct >= 80 ? 'text-emerald-600 bg-emerald-50'
                                : pct >= 50 ? 'text-amber-600 bg-amber-50'
                                : 'text-red-600 bg-red-50';
                    return (
                        <div key={key} className="flex flex-col items-center text-center">
                            <div className={`p-2 rounded-full mb-1 ${color}`}>
                                <Icon className="h-4 w-4" />
                            </div>
                            <div className="text-[10px] uppercase font-bold text-slate-500">{cfg.label}</div>
                            <div className="font-bold text-slate-800">
                                {Math.round(value)} <span className="text-[10px] text-slate-400">/{cfg.max}</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-1 mt-1 overflow-hidden">
                                <div className={`h-full ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Métricas clave */}
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <Metric label="Ventas 30d" value={`RD$ ${fmtMoney(metricas.ventas_30d)}`} sub={metricas.crecimiento_ventas_pct != null ? `${metricas.crecimiento_ventas_pct >= 0 ? '+' : ''}${metricas.crecimiento_ventas_pct}% vs mes prev.` : null} subColor={metricas.crecimiento_ventas_pct >= 0 ? 'text-emerald-600' : 'text-red-600'} />
                <Metric label="Facturas vencidas" value={metricas.facturas_vencidas ?? 0} sub={`RD$ ${fmtMoney(metricas.monto_pendiente_cobrar)} por cobrar`} />
                <Metric label="Alertas críticas" value={metricas.alertas_criticas ?? 0} sub={`${metricas.alertas_high ?? 0} altas`} />
                <Metric label="Margen negativo" value={metricas.productos_margen_negativo ?? 0} sub="productos" />
            </div>

            {data.calculado_at && (
                <div className="px-4 pb-3 text-[10px] text-slate-400 text-right">
                    Calculado: {new Date(data.calculado_at).toLocaleString('es-DO')}
                </div>
            )}
        </div>
    );
}

function Metric({ label, value, sub, subColor }) {
    return (
        <div className="bg-slate-50 rounded p-2">
            <div className="text-[10px] uppercase font-bold text-slate-500">{label}</div>
            <div className="text-lg font-bold text-slate-800 leading-tight">{value}</div>
            {sub && <div className={`text-[10px] font-medium ${subColor || 'text-slate-500'}`}>{sub}</div>}
        </div>
    );
}
