// ============================================================
// CompraInteligentePanel.jsx — Compra con conciencia de caja
// ============================================================
// Modo principal: ANALIZA la orden actual y pone urgencia por
// movimiento (URGENTE / PRÓXIMA / PUEDE ESPERAR) + presupuesto.
// Modo fallback (orden vacía): sugiere productos a reordenar.
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Wallet, Brain, AlertTriangle, CheckCircle2, TrendingUp, ShoppingCart } from 'lucide-react';
import {
    getPresupuestoCompras, planificarOrden, reallocate, asesorCompras, analizarOrdenActual,
} from '@/services/comprasInteligentesService';

const fmt = (n) => `RD$ ${Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const SALUD = {
    sana: { txt: 'Caja sana', cls: 'bg-emerald-100 text-emerald-700' },
    ajustada: { txt: 'Caja ajustada', cls: 'bg-amber-100 text-amber-700' },
    tension: { txt: 'Caja en tensión', cls: 'bg-red-100 text-red-700' },
};
const URG_BADGE = {
    URGENTE: 'bg-red-100 text-red-700',
    'PRÓXIMA': 'bg-amber-100 text-amber-700',
    'PUEDE ESPERAR': 'bg-slate-200 text-slate-600',
};

export default function CompraInteligentePanel({ open, onClose, suplidor, onApply, orderLines = [] }) {
    const { tenantId } = useAuth();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [pres, setPres] = useState(null);
    const [presupuesto, setPresupuesto] = useState(0);
    const [mode, setMode] = useState('orden'); // 'orden' | 'sugerir'
    // modo orden
    const [analisis, setAnalisis] = useState({ items: [], totalOrden: 0, totalUrgente: 0 });
    // modo sugerir
    const [enriched, setEnriched] = useState([]);
    const [plan, setPlan] = useState({ items: [], totalIdeal: 0, totalRecomendado: 0 });
    const [advisor, setAdvisor] = useState(null);
    const [advLoading, setAdvLoading] = useState(false);

    const lineasConProducto = (orderLines || []).filter((l) => l.producto_id);

    const cargar = useCallback(async () => {
        if (!open || !suplidor?.id || !tenantId) return;
        setLoading(true); setAdvisor(null);
        try {
            const p = await getPresupuestoCompras(tenantId, 15, 0);
            setPres(p);
            setPresupuesto(Number(p?.presupuesto_sugerido || 0));

            if (lineasConProducto.length > 0) {
                setMode('orden');
                setAnalisis(await analizarOrdenActual(lineasConProducto));
            } else {
                setMode('sugerir');
                const result = await planificarOrden(suplidor.id, Number(p?.presupuesto_sugerido || 0));
                setEnriched(result.items); setPlan(result);
            }
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally { setLoading(false); }
    }, [open, suplidor, tenantId, toast, orderLines]);

    useEffect(() => { cargar(); }, [cargar]);

    const onPresupuestoChange = (val) => {
        const num = Number(val) || 0;
        setPresupuesto(num);
        if (mode === 'sugerir') setPlan(reallocate(enriched, num));
    };

    const pedirAsesor = async () => {
        setAdvLoading(true);
        try {
            let itemsParaIA;
            if (mode === 'orden') {
                itemsParaIA = analisis.items.map((it) => ({
                    codigo: it.codigo, descripcion: it.descripcion,
                    cantidad_ideal: it.cantidad,
                    cantidad_recomendada: it.urgencia === 'urgente' ? it.cantidad : 0,
                    costo: it.costo, margen_pct: it.margen_pct, ventas_90d: it.ventas_90d,
                    existencia: it.existencia, costo_ideal: it.subtotal,
                    costo_recomendado: it.urgencia === 'urgente' ? it.subtotal : 0,
                }));
            } else {
                itemsParaIA = plan.items;
            }
            const res = await asesorCompras(presupuesto, pres, itemsParaIA);
            setAdvisor(res.analisis);
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally { setAdvLoading(false); }
    };

    const aplicarSugeridos = () => {
        const aComprar = plan.items.filter((i) => i.cantidad_recomendada > 0);
        if (aComprar.length === 0) { toast({ title: 'Nada que aplicar', description: 'Ajusta el presupuesto.' }); return; }
        onApply(aComprar);
        onClose();
    };

    const salud = SALUD[pres?.salud_caja] || SALUD.ajustada;
    const urgenteCabe = presupuesto <= 0 || analisis.totalUrgente <= presupuesto + 0.5;

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShoppingCart className="h-5 w-5 text-violet-600" /> Compra Inteligente — {suplidor?.nombre || 'Suplidor'}
                    </DialogTitle>
                </DialogHeader>

                {loading ? (
                    <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-violet-500" /></div>
                ) : (
                    <div className="space-y-4">
                        {/* Presupuesto / caja */}
                        <div className="bg-gradient-to-br from-violet-50 to-blue-50 border border-violet-100 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-3">
                                <span className="font-bold text-slate-800 flex items-center gap-2"><Wallet className="h-5 w-5 text-violet-600" /> Presupuesto para esta compra</span>
                                {pres?.salud_caja && <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${salud.cls}`}>{salud.txt}</span>}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
                                <div><p className="text-slate-400">Ventas 15d</p><p className="font-bold text-slate-700">{fmt(pres?.ventas_recientes)}</p></div>
                                <div><p className="text-slate-400">Por cobrar</p><p className="font-bold text-emerald-600">{fmt(pres?.cxc_pendiente)}</p></div>
                                <div><p className="text-slate-400">Por pagar (CxP)</p><p className="font-bold text-red-500">{fmt(pres?.cxp_pendiente)}</p></div>
                                <div><p className="text-slate-400">Sugerido</p><p className="font-bold text-violet-700">{fmt(pres?.presupuesto_sugerido)}</p></div>
                            </div>
                            <div className="flex items-end gap-2">
                                <div className="flex-1">
                                    <label className="text-xs text-slate-500">Presupuesto a usar (ajústalo)</label>
                                    <Input type="number" min="0" value={presupuesto} onChange={(e) => onPresupuestoChange(e.target.value)} className="h-9 font-bold" />
                                </div>
                                <Button variant="outline" size="sm" className="h-9" onClick={() => onPresupuestoChange(0)}>Sin límite</Button>
                            </div>
                        </div>

                        {mode === 'orden' ? (
                            <>
                                {/* Resumen orden actual */}
                                <div className="grid grid-cols-3 gap-3 text-center">
                                    <div className="bg-slate-50 rounded-lg p-2"><p className="text-xs text-slate-400">Total orden</p><p className="font-bold text-slate-700">{fmt(analisis.totalOrden)}</p></div>
                                    <div className={`rounded-lg p-2 ${urgenteCabe ? 'bg-red-50' : 'bg-red-50'}`}><p className="text-xs text-slate-400">Solo lo URGENTE</p><p className="font-bold text-red-600">{fmt(analisis.totalUrgente)}</p></div>
                                    <div className="bg-slate-50 rounded-lg p-2"><p className="text-xs text-slate-400">Presupuesto</p><p className="font-bold text-slate-700">{presupuesto > 0 ? fmt(presupuesto) : 'Sin límite'}</p></div>
                                </div>
                                <div className={`text-sm rounded-lg p-2 ${urgenteCabe ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                    {urgenteCabe
                                        ? `✅ Comprar ahora solo lo URGENTE (${fmt(analisis.totalUrgente)}) cabe en tu presupuesto.`
                                        : `⚠️ Hasta lo URGENTE (${fmt(analisis.totalUrgente)}) supera tu presupuesto — compra primero lo de mayor rotación.`}
                                </div>
                            </>
                        ) : (
                            <div className="grid grid-cols-3 gap-3 text-center">
                                <div className="bg-slate-50 rounded-lg p-2"><p className="text-xs text-slate-400">Ideal (demanda)</p><p className="font-bold text-slate-700">{fmt(plan.totalIdeal)}</p></div>
                                <div className="bg-violet-50 rounded-lg p-2"><p className="text-xs text-slate-400">Recomendado (caja)</p><p className="font-bold text-violet-700">{fmt(plan.totalRecomendado)}</p></div>
                                <div className="bg-slate-50 rounded-lg p-2"><p className="text-xs text-slate-400">Presupuesto</p><p className="font-bold text-slate-700">{presupuesto > 0 ? fmt(presupuesto) : 'Sin límite'}</p></div>
                            </div>
                        )}

                        {/* Asesor IA */}
                        <div>
                            <Button size="sm" onClick={pedirAsesor} disabled={advLoading} className="bg-violet-600 hover:bg-violet-700 text-white">
                                {advLoading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analizando...</> : <><Brain className="h-4 w-4 mr-1" /> Asesor IA de caja</>}
                            </Button>
                            {advisor && (
                                <div className="mt-2 bg-white border border-violet-100 rounded-xl p-3 space-y-2">
                                    <p className="text-sm text-slate-700">{advisor.resumen}</p>
                                    {advisor.riesgos?.length > 0 && (
                                        <div><p className="text-xs font-bold text-red-600 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Riesgos</p>
                                            <ul className="text-xs text-slate-600 list-disc ml-5">{advisor.riesgos.map((r, i) => <li key={i}>{r}</li>)}</ul></div>
                                    )}
                                    {advisor.recomendaciones?.length > 0 && (
                                        <div><p className="text-xs font-bold text-emerald-700 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Recomendaciones</p>
                                            <ul className="text-xs text-slate-600 list-disc ml-5">{advisor.recomendaciones.map((r, i) => <li key={i}>{r}</li>)}</ul></div>
                                    )}
                                    {advisor.prioridad_pago && <p className="text-xs text-slate-500 italic">💸 {advisor.prioridad_pago}</p>}
                                </div>
                            )}
                        </div>

                        {/* Tabla */}
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                            <div className="overflow-x-auto max-h-72 overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50 sticky top-0">
                                        {mode === 'orden' ? (
                                            <tr className="text-left text-slate-500">
                                                <th className="py-2 px-2">Producto</th>
                                                <th className="py-2 px-2 text-right">Exist.</th>
                                                <th className="py-2 px-2 text-right">Rot. 30/90d</th>
                                                <th className="py-2 px-2 text-right">Cant.</th>
                                                <th className="py-2 px-2 text-right">Subtotal</th>
                                                <th className="py-2 px-2 text-center">Prioridad</th>
                                            </tr>
                                        ) : (
                                            <tr className="text-left text-slate-500">
                                                <th className="py-2 px-2">Producto</th>
                                                <th className="py-2 px-2 text-right">Exist.</th>
                                                <th className="py-2 px-2 text-right">Costo</th>
                                                <th className="py-2 px-2 text-right">Margen</th>
                                                <th className="py-2 px-2 text-right">Ideal</th>
                                                <th className="py-2 px-2 text-right">Recom.</th>
                                            </tr>
                                        )}
                                    </thead>
                                    <tbody>
                                        {mode === 'orden' && analisis.items.map((it) => (
                                            <tr key={it.producto_id} className="border-t border-slate-100">
                                                <td className="py-1.5 px-2">
                                                    <div className="font-medium text-slate-800 truncate max-w-[220px]">{it.descripcion}</div>
                                                    <div className="text-slate-400">{it.codigo}</div>
                                                </td>
                                                <td className="py-1.5 px-2 text-right">{it.existencia <= 0 ? <span className="text-red-500 font-bold">{it.existencia}</span> : it.existencia}</td>
                                                <td className="py-1.5 px-2 text-right">{it.ventas_30d}/{it.ventas_90d}</td>
                                                <td className="py-1.5 px-2 text-right">{it.cantidad}</td>
                                                <td className="py-1.5 px-2 text-right">{fmt(it.subtotal)}</td>
                                                <td className="py-1.5 px-2 text-center"><span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${URG_BADGE[it.urgencia_label]}`}>{it.urgencia_label}</span></td>
                                            </tr>
                                        ))}
                                        {mode === 'sugerir' && plan.items.map((it) => (
                                            <tr key={it.id} className={`border-t border-slate-100 ${it.cantidad_recomendada === 0 ? 'opacity-50' : ''}`}>
                                                <td className="py-1.5 px-2">
                                                    <div className="font-medium text-slate-800 truncate max-w-[220px]">{it.descripcion}</div>
                                                    <div className="text-slate-400">{it.codigo} · rot.90d {it.ventas_90d}</div>
                                                </td>
                                                <td className="py-1.5 px-2 text-right">{it.existencia <= 0 ? <span className="text-red-500 font-bold">{it.existencia}</span> : it.existencia}</td>
                                                <td className="py-1.5 px-2 text-right">{fmt(it.costo)}</td>
                                                <td className="py-1.5 px-2 text-right">{it.margen_pct}%</td>
                                                <td className="py-1.5 px-2 text-right text-slate-400">{it.cantidad_ideal}</td>
                                                <td className="py-1.5 px-2 text-right font-bold text-violet-700">{it.cantidad_recomendada}</td>
                                            </tr>
                                        ))}
                                        {((mode === 'orden' && analisis.items.length === 0) || (mode === 'sugerir' && plan.items.length === 0)) && (
                                            <tr><td colSpan={6} className="text-center text-slate-400 py-6">
                                                {mode === 'orden' ? 'La orden no tiene productos con ID para analizar.' : 'No hay productos bajo reorden para este suplidor.'}
                                            </td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {mode === 'orden' && (
                            <p className="text-[11px] text-slate-400 italic">
                                💡 Esto NO borra tu orden. Usa las prioridades para decidir: compra ya lo 🔴 URGENTE; lo ⚪ "PUEDE ESPERAR" puedes quitarlo a mano (🗑️) para cuidar la caja.
                            </p>
                        )}

                        {/* Acciones */}
                        <div className="flex justify-end gap-2 pt-1">
                            <Button variant="ghost" onClick={onClose}>Cerrar</Button>
                            {mode === 'sugerir' && (
                                <Button onClick={aplicarSugeridos} className="bg-violet-600 hover:bg-violet-700 text-white" disabled={plan.items.every((i) => i.cantidad_recomendada === 0)}>
                                    <TrendingUp className="h-4 w-4 mr-1" /> Aplicar a la orden
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
