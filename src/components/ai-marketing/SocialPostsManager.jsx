// ============================================================
// SocialPostsManager.jsx — Registro de publicaciones + métricas
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Loader2, BarChart3, Trash2, ExternalLink, Save, X, ChevronDown } from 'lucide-react';
import {
    saveSocialPost, listSocialPosts, deleteSocialPost, saveManualMetrics,
    getLatestMetrics, getImpacts, calculateSalesImpact,
} from '@/services/socialMetricsService';

const PLATAFORMAS = ['youtube', 'instagram', 'tiktok', 'facebook', 'whatsapp'];
const TIPOS = ['reel', 'short', 'video', 'post', 'story', 'wa_status', 'carousel'];
const ESTILOS = ['problema_solucion', 'producto_hablando', 'mecanico_explica', 'antes_despues', 'consejo', 'oferta', 'educativo', 'testimonio'];
const RANGOS = [3, 7, 15, 30];
const CLASIF_BADGE = {
    excelente: 'bg-emerald-100 text-emerald-700', bueno: 'bg-blue-100 text-blue-700',
    regular: 'bg-amber-100 text-amber-700', bajo: 'bg-orange-100 text-orange-700',
    no_funciono: 'bg-red-100 text-red-700',
};

export default function SocialPostsManager() {
    const { tenantId } = useAuth();
    const { toast } = useToast();
    const [posts, setPosts] = useState([]);
    const [metrics, setMetrics] = useState({});
    const [impacts, setImpacts] = useState({});
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [expanded, setExpanded] = useState(null);
    const [busy, setBusy] = useState(false);

    const [form, setForm] = useState({ platform: 'youtube', post_type: 'reel', estilo_guion: 'producto_hablando', external_url: '', title: '', codigo: '', published_at: new Date().toISOString().slice(0, 10) });
    const [met, setMet] = useState({ views: '', likes: '', comments: '', shares: '', saves: '', clicks: '' });
    const [rango, setRango] = useState(7);

    const cargar = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        try {
            const ps = await listSocialPosts(tenantId);
            setPosts(ps);
            const ids = ps.map((p) => p.id);
            const [m, im] = await Promise.all([getLatestMetrics(tenantId, ids), getImpacts(tenantId, ids)]);
            setMetrics(m); setImpacts(im);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }, [tenantId]);
    useEffect(() => { cargar(); }, [cargar]);

    const registrar = async () => {
        if (!form.external_url && !form.title) { toast({ variant: 'destructive', title: 'Falta', description: 'Pon al menos el link o el título.' }); return; }
        setBusy(true);
        try {
            let producto_id = null;
            if (form.codigo.trim()) {
                const { data: prod } = await supabase.from('productos')
                    .select('id').eq('tenant_id', tenantId).eq('codigo', form.codigo.trim()).maybeSingle();
                producto_id = prod?.id || null;
                if (!producto_id) toast({ title: 'Producto no encontrado', description: 'Se guardará como contenido general.' });
            }
            await saveSocialPost(tenantId, { ...form, producto_id, published_at: new Date(form.published_at).toISOString() });
            toast({ title: '✓ Publicación registrada' });
            setShowForm(false);
            setForm((f) => ({ ...f, external_url: '', title: '', codigo: '' }));
            cargar();
        } catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }); }
        finally { setBusy(false); }
    };

    const guardarMetricas = async (postId) => {
        setBusy(true);
        try {
            await saveManualMetrics(tenantId, postId, {
                views: Number(met.views || 0), likes: Number(met.likes || 0), comments: Number(met.comments || 0),
                shares: Number(met.shares || 0), saves: Number(met.saves || 0), clicks: Number(met.clicks || 0),
            });
            await calculateSalesImpact(postId, rango); // calcula performance + impacto
            toast({ title: '✓ Métricas e impacto guardados' });
            setExpanded(null); setMet({ views: '', likes: '', comments: '', shares: '', saves: '', clicks: '' });
            cargar();
        } catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }); }
        finally { setBusy(false); }
    };

    const analizar = async (postId) => {
        setBusy(true);
        try { await calculateSalesImpact(postId, rango); toast({ title: '✓ Impacto recalculado' }); cargar(); }
        catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }); }
        finally { setBusy(false); }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="font-bold text-slate-800">Publicaciones</h3>
                    <p className="text-xs text-slate-500">Registra lo que publicaste y mide su impacto en ventas.</p>
                </div>
                <Button onClick={() => setShowForm((s) => !s)} className="bg-violet-600 hover:bg-violet-700 text-white">
                    <Plus className="h-4 w-4 mr-1" /> Registrar publicación
                </Button>
            </div>

            {showForm && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><Label className="text-xs">Plataforma</Label>
                        <select className="w-full h-9 border rounded px-2 text-sm" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
                            {PLATAFORMAS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select></div>
                    <div><Label className="text-xs">Tipo</Label>
                        <select className="w-full h-9 border rounded px-2 text-sm" value={form.post_type} onChange={(e) => setForm({ ...form, post_type: e.target.value })}>
                            {TIPOS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select></div>
                    <div><Label className="text-xs">Estilo de guion</Label>
                        <select className="w-full h-9 border rounded px-2 text-sm" value={form.estilo_guion} onChange={(e) => setForm({ ...form, estilo_guion: e.target.value })}>
                            {ESTILOS.map((p) => <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>)}
                        </select></div>
                    <div className="md:col-span-2"><Label className="text-xs">Link de la publicación</Label>
                        <Input value={form.external_url} onChange={(e) => setForm({ ...form, external_url: e.target.value })} placeholder="https://..." className="h-9" /></div>
                    <div><Label className="text-xs">Fecha publicación</Label>
                        <Input type="date" value={form.published_at} onChange={(e) => setForm({ ...form, published_at: e.target.value })} className="h-9" /></div>
                    <div className="md:col-span-2"><Label className="text-xs">Título</Label>
                        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-9" /></div>
                    <div><Label className="text-xs">Código producto (opcional)</Label>
                        <Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="general si vacío" className="h-9" /></div>
                    <div className="md:col-span-3 flex gap-2">
                        <Button onClick={registrar} disabled={busy} className="bg-violet-600 text-white">
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Guardar
                        </Button>
                        <Button variant="ghost" onClick={() => setShowForm(false)}><X className="h-4 w-4 mr-1" /> Cancelar</Button>
                    </div>
                </div>
            )}

            {/* Rango global para análisis */}
            <div className="flex items-center gap-2 mb-3 text-sm">
                <span className="text-slate-500">Rango de comparación:</span>
                {RANGOS.map((r) => (
                    <button key={r} onClick={() => setRango(r)}
                        className={`px-2 py-1 rounded text-xs font-medium ${rango === r ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{r} días</button>
                ))}
            </div>

            {loading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-violet-500" /></div> : (
                <div className="space-y-2">
                    {posts.length === 0 && <p className="text-center text-slate-400 py-8 text-sm">Aún no hay publicaciones registradas.</p>}
                    {posts.map((p) => {
                        const m = metrics[p.id] || {}; const im = impacts[p.id] || {};
                        return (
                            <div key={p.id} className="border border-slate-200 rounded-lg bg-white">
                                <div className="flex items-center gap-3 p-3">
                                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600">{p.platform}</span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-slate-800 truncate">{p.title || p.external_url || '(sin título)'}</p>
                                        <p className="text-xs text-slate-400">{p.productos?.descripcion || 'General'} · {p.post_type} · {p.published_at?.slice(0, 10)}</p>
                                    </div>
                                    <div className="text-right text-xs text-slate-500 hidden sm:block">
                                        <div>{(m.views || 0)} views · {(m.likes || 0)} likes</div>
                                        <div>score {m.performance_score || 0}</div>
                                    </div>
                                    {im.clasificacion && <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${CLASIF_BADGE[im.clasificacion] || 'bg-slate-100'}`}>{im.clasificacion.replace('_', ' ')}</span>}
                                    {p.external_url && <a href={p.external_url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-violet-600"><ExternalLink className="h-4 w-4" /></a>}
                                    <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="text-violet-600"><ChevronDown className={`h-4 w-4 transition ${expanded === p.id ? 'rotate-180' : ''}`} /></button>
                                    <button onClick={() => deleteSocialPost(p.id).then(cargar)} className="text-red-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                                </div>

                                {expanded === p.id && (
                                    <div className="border-t border-slate-100 p-3 bg-slate-50">
                                        <p className="text-xs font-bold text-slate-600 mb-2">Ingresar métricas (manual)</p>
                                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-2">
                                            {['views', 'likes', 'comments', 'shares', 'saves', 'clicks'].map((k) => (
                                                <div key={k}>
                                                    <Label className="text-[10px] capitalize">{k}</Label>
                                                    <Input type="number" min="0" value={met[k]} onChange={(e) => setMet({ ...met, [k]: e.target.value })} className="h-8 text-xs" />
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex gap-2">
                                            <Button size="sm" onClick={() => guardarMetricas(p.id)} disabled={busy} className="bg-violet-600 text-white">
                                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Guardar + analizar ({rango}d)
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => analizar(p.id)} disabled={busy}>
                                                <BarChart3 className="h-4 w-4 mr-1" /> Solo recalcular impacto
                                            </Button>
                                        </div>
                                        {im.sales_impact_score != null && (
                                            <p className="text-xs text-slate-500 mt-2">
                                                Impacto estimado ({im.rango_dias}d): unidades {im.units_before}→{im.units_after} · cotizaciones {im.wa_quotes_after} · score {im.sales_impact_score}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
