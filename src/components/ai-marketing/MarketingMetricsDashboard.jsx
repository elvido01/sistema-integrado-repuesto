// ============================================================
// MarketingMetricsDashboard.jsx — KPIs de rendimiento de contenido
// ============================================================
import React from 'react';
import { Eye, ThumbsUp, MessageSquare, Share2, MousePointerClick, Film } from 'lucide-react';

const fmt = (n) => Number(n || 0).toLocaleString('es-DO');

function Kpi({ icon: Icon, label, value, color }) {
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className={`inline-flex p-2 rounded-lg ${color} mb-2`}><Icon className="h-4 w-4" /></div>
            <p className="text-xl font-bold text-slate-800">{fmt(value)}</p>
            <p className="text-xs text-slate-500">{label}</p>
        </div>
    );
}

export default function MarketingMetricsDashboard({ totals }) {
    const t = totals || { posts: 0, views: 0, likes: 0, comments: 0, shares: 0, clicks: 0, porPlataforma: {} };
    return (
        <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <Kpi icon={Film} label="Publicaciones" value={t.posts} color="bg-violet-100 text-violet-700" />
                <Kpi icon={Eye} label="Vistas" value={t.views} color="bg-blue-100 text-blue-700" />
                <Kpi icon={ThumbsUp} label="Likes" value={t.likes} color="bg-pink-100 text-pink-700" />
                <Kpi icon={MessageSquare} label="Comentarios" value={t.comments} color="bg-amber-100 text-amber-700" />
                <Kpi icon={Share2} label="Compartidos" value={t.shares} color="bg-emerald-100 text-emerald-700" />
                <Kpi icon={MousePointerClick} label="Clics" value={t.clicks} color="bg-indigo-100 text-indigo-700" />
            </div>
            {Object.keys(t.porPlataforma || {}).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                    {Object.entries(t.porPlataforma).map(([plat, n]) => (
                        <span key={plat} className="text-xs bg-slate-100 text-slate-600 rounded px-2 py-1">{plat}: <b>{n}</b></span>
                    ))}
                </div>
            )}
        </div>
    );
}
