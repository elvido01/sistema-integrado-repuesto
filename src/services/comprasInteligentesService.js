// ============================================================
// comprasInteligentesService.js — Compras con conciencia de caja
// ============================================================
// Capa 1 (determinística, $0): presupuesto + scoring + asignación.
// Capa 2 (IA, barata): asesor que explica y advierte sobre la caja.
// Reutiliza el RPC de orden automática existente.
// ============================================================

import { supabase } from '@/lib/customSupabaseClient';

// ── Presupuesto de caja ──
export async function getPresupuestoCompras(tenantId, dias = 15, colchon = 0) {
    const { data, error } = await supabase.rpc('get_presupuesto_compras', {
        p_tenant_id: tenantId, p_dias: dias, p_colchon: colchon,
    });
    if (error) throw error;
    return data;
}

// ── Scoring de eficiencia de caja ──
// Prioriza: rotación (ventas 90d) × margen × urgencia (quiebre de stock).
function scoreProducto(p) {
    const costo = Number(p.costo || 0);
    const precio = Number(p.precio || 0);
    const margen_pct = (precio > 0 && costo > 0 && precio > costo)
        ? Math.round(((precio - costo) / precio) * 1000) / 10 : 0;
    const rotacion = Number(p.ventas_90d || 0);
    const existencia = Number(p.existencia || 0);
    const minStock = Number(p.min_stock || 0);
    const urgencia = existencia <= 0 ? 2 : (existencia < minStock ? 1.5 : 1);
    const score = Math.round((rotacion + 1) * (margen_pct / 100 + 0.15) * urgencia * 100) / 100;
    return { margen_pct, rotacion, existencia, urgencia, score, costo, precio };
}

// ── Planificador: ¿cuánto comprar de cada uno dentro del presupuesto? ──
// Devuelve cantidad_ideal (por demanda) y cantidad_recomendada (cabe en caja).
export async function planificarOrden(suplidorId, presupuesto = 0) {
    const { data, error } = await supabase.rpc('get_productos_para_orden_automatica', {
        p_suplidor_id: suplidorId,
    });
    if (error) throw error;

    // dedupe + enriquecer + ordenar por score
    const unique = (data || []).filter((p, i, self) => i === self.findIndex((x) => x.id === p.id));
    const enriched = unique.map((p) => {
        const s = scoreProducto(p);
        const cantidad_ideal = Number(p.cantidad_sugerida || 0);
        return {
            ...p, ...s, cantidad_ideal,
            costo_ideal: Math.round(cantidad_ideal * s.costo * 100) / 100,
        };
    }).sort((a, b) => b.score - a.score);

    return reallocate(enriched, presupuesto);
}

// ── Reasignar cantidades a un presupuesto (instantáneo, sin BD) ──
export function reallocate(enriched, presupuesto = 0) {
    let restante = Number(presupuesto) || 0;
    const sinLimite = !presupuesto || presupuesto <= 0;
    const items = enriched.map((p) => {
        let rec = p.cantidad_ideal;
        if (!sinLimite && p.costo > 0) {
            const alcanza = Math.floor(restante / p.costo);
            rec = Math.max(0, Math.min(p.cantidad_ideal, alcanza));
        }
        const costo_recomendado = Math.round(rec * p.costo * 100) / 100;
        if (!sinLimite) restante -= costo_recomendado;
        return { ...p, cantidad_recomendada: rec, costo_recomendado, dentro: rec > 0 };
    });
    const totalIdeal = Math.round(items.reduce((s, i) => s + i.costo_ideal, 0) * 100) / 100;
    const totalRecomendado = Math.round(items.reduce((s, i) => s + i.costo_recomendado, 0) * 100) / 100;
    return { items, totalIdeal, totalRecomendado };
}

// ── Asesor IA (Edge Function) ──
export async function asesorCompras(presupuesto, financials, items) {
    const compact = items.slice(0, 40).map((it) => ({
        codigo: it.codigo, descripcion: it.descripcion,
        cantidad_ideal: it.cantidad_ideal, cantidad_recomendada: it.cantidad_recomendada,
        costo: it.costo, margen_pct: it.margen_pct, ventas_90d: it.ventas_90d,
        existencia: it.existencia, costo_ideal: it.costo_ideal, costo_recomendado: it.costo_recomendado,
    }));
    const { data, error } = await supabase.functions.invoke('motoflow-compras-advisor', {
        body: { presupuesto, financials, items: compact },
    });
    if (error) throw new Error(error.message);
    if (data?.ok === false) throw new Error(data.mensaje || data.error);
    return data;
}
