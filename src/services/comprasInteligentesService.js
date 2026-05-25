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

// ── Análisis de la orden ACTUAL: urgencia por movimiento ──
const URGENCIA = {
    urgente: { label: 'URGENTE', orden: 0 },
    proxima: { label: 'PRÓXIMA', orden: 1 },
    puede_esperar: { label: 'PUEDE ESPERAR', orden: 2 },
};

function clasificarUrgencia(rot30, rot90, existencia) {
    if (rot90 <= 0) return 'puede_esperar';                 // sin rotación en 90d
    if (existencia <= 0 && (rot30 >= 1 || rot90 >= 3)) return 'urgente'; // agotado y se vende
    return 'proxima';                                       // se vende pero no es urgente
}

// Analiza las líneas de la orden actual y les pone urgencia + ajuste a presupuesto.
export async function analizarOrdenActual(orderLines) {
    const conProd = (orderLines || []).filter((l) => l.producto_id);
    if (conProd.length === 0) return { items: [], totalOrden: 0, totalUrgente: 0 };

    const ids = [...new Set(conProd.map((l) => l.producto_id))];
    const { data, error } = await supabase.rpc('get_productos_movimiento', { p_ids: ids });
    if (error) throw error;
    const mov = {};
    for (const m of data || []) mov[m.producto_id] = m;

    const items = conProd.map((l) => {
        const m = mov[l.producto_id] || {};
        const rot30 = Number(m.ventas_30d || 0);
        const rot90 = Number(m.ventas_90d || 0);
        const existencia = Number(m.existencia ?? l.existencia ?? 0);
        const costo = Number(m.costo || l.precio || 0);
        const cantidad = Number(l.cantidad || 0);
        const urgencia = clasificarUrgencia(rot30, rot90, existencia);
        return {
            producto_id: l.producto_id,
            codigo: l.codigo,
            descripcion: l.descripcion,
            cantidad, costo,
            subtotal: Math.round(cantidad * costo * 100) / 100,
            existencia, ventas_30d: rot30, ventas_90d: rot90,
            margen_pct: Number(m.margen_pct || 0),
            urgencia, urgencia_label: URGENCIA[urgencia].label,
        };
    }).sort((a, b) => URGENCIA[a.urgencia].orden - URGENCIA[b.urgencia].orden || b.ventas_30d - a.ventas_30d);

    const sum = (u) => Math.round(items.filter((i) => i.urgencia === u).reduce((s, i) => s + i.subtotal, 0) * 100) / 100;
    const count = (u) => items.filter((i) => i.urgencia === u).length;
    const totalOrden = Math.round(items.reduce((s, i) => s + i.subtotal, 0) * 100) / 100;
    return {
        items, totalOrden,
        totalUrgente: sum('urgente'),
        totalProxima: sum('proxima'),
        totalEsperar: sum('puede_esperar'),
        countUrgente: count('urgente'),
        countProxima: count('proxima'),
        countEsperar: count('puede_esperar'),
    };
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
