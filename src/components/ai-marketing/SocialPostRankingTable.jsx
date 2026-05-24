// ============================================================
// SocialPostRankingTable.jsx — Ranking de publicaciones por score
// ============================================================
import React from 'react';
import { Trophy, ExternalLink } from 'lucide-react';

const CLASIF_BADGE = {
    excelente: 'bg-emerald-100 text-emerald-700', bueno: 'bg-blue-100 text-blue-700',
    regular: 'bg-amber-100 text-amber-700', bajo: 'bg-orange-100 text-orange-700',
    no_funciono: 'bg-red-100 text-red-700',
};

export default function SocialPostRankingTable({ rows }) {
    if (!rows || rows.length === 0) {
        return <p className="text-center text-slate-400 py-8 text-sm">Sin datos de rendimiento todavía. Registra publicaciones y métricas.</p>;
    }
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                        <th className="py-2 px-2">#</th>
                        <th className="py-2 px-2">Publicación</th>
                        <th className="py-2 px-2">Canal</th>
                        <th className="py-2 px-2 text-right">Vistas</th>
                        <th className="py-2 px-2 text-right">Score</th>
                        <th className="py-2 px-2 text-right">Impacto</th>
                        <th className="py-2 px-2">Clasif.</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-2 px-2 text-slate-400">{i < 3 ? <Trophy className={`h-4 w-4 ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : 'text-orange-400'}`} /> : i + 1}</td>
                            <td className="py-2 px-2">
                                <div className="font-medium text-slate-800 truncate max-w-[200px]">{r.title || '(sin título)'}</div>
                                <div className="text-xs text-slate-400 truncate max-w-[200px]">{r.productos?.descripcion || 'General'}</div>
                            </td>
                            <td className="py-2 px-2"><span className="text-xs bg-slate-100 px-2 py-0.5 rounded">{r.platform}</span></td>
                            <td className="py-2 px-2 text-right">{Number(r.metric?.views || 0).toLocaleString('es-DO')}</td>
                            <td className="py-2 px-2 text-right font-bold text-violet-700">{r.metric?.performance_score || 0}</td>
                            <td className="py-2 px-2 text-right">{r.impact?.sales_impact_score ?? '—'}</td>
                            <td className="py-2 px-2">{r.impact?.clasificacion && <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${CLASIF_BADGE[r.impact.clasificacion] || 'bg-slate-100'}`}>{r.impact.clasificacion.replace('_', ' ')}</span>}</td>
                            <td className="py-2 px-2">{r.external_url && <a href={r.external_url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-violet-600"><ExternalLink className="h-4 w-4" /></a>}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
