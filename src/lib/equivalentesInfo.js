// ============================================================
// equivalentesInfo.js
// ============================================================
// Helpers compartidos para mostrar información de grupos de
// productos equivalentes (Maestro, Buscar Producto, etc.):
//
//   - loadGruposMap(ids)          → { producto_id: { grupo_id, grupo_nombre,
//                                     prioridad, total_miembros } } en batch
//   - getEquivalentesDetalle(id)  → miembros del grupo (RPC
//                                     get_equivalentes_producto) con caché
//                                     corto para tooltips al vuelo.
// ============================================================

import { supabase } from '@/lib/customSupabaseClient';

/**
 * Carga en batch las membresías de grupo de una lista de productos.
 * Misma lógica que usa el Maestro para pintar el badge 🔗.
 */
export async function loadGruposMap(productIds) {
  if (!productIds || productIds.length === 0) return {};
  const { data: memberships, error } = await supabase
    .from('producto_grupo_miembros')
    .select('producto_id, grupo_id, prioridad')
    .in('producto_id', productIds);
  if (error || !memberships || memberships.length === 0) return {};

  const grupoIds = Array.from(new Set(memberships.map((m) => m.grupo_id)));
  const [{ data: grupos }, { data: counts }] = await Promise.all([
    supabase.from('producto_grupos').select('id, nombre').in('id', grupoIds),
    supabase.from('producto_grupo_miembros').select('grupo_id').in('grupo_id', grupoIds),
  ]);

  const totalPorGrupo = {};
  (counts || []).forEach((r) => { totalPorGrupo[r.grupo_id] = (totalPorGrupo[r.grupo_id] || 0) + 1; });
  const nombrePorGrupo = {};
  (grupos || []).forEach((g) => { nombrePorGrupo[g.id] = g.nombre; });

  const map = {};
  memberships.forEach((m) => {
    map[m.producto_id] = {
      grupo_id: m.grupo_id,
      grupo_nombre: nombrePorGrupo[m.grupo_id] || 'Grupo',
      prioridad: m.prioridad,
      total_miembros: totalPorGrupo[m.grupo_id] || 1,
    };
  });
  return map;
}

// Caché corto (60s): el detalle incluye existencias en vivo, no debe quedarse
// pegado toda la sesión, pero tampoco re-consultar en cada pasada del mouse.
const CACHE_TTL_MS = 60_000;
const detalleCache = new Map(); // producto_id -> { rows, ts }

/**
 * Devuelve los OTROS miembros del grupo del producto, con existencia,
 * precio, margen y si son el ⭐ preferido (prioridad 1).
 */
export async function getEquivalentesDetalle(productoId) {
  const hit = detalleCache.get(productoId);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.rows;

  const { data, error } = await supabase.rpc('get_equivalentes_producto', {
    p_producto_id: productoId,
  });
  if (error) throw error;
  const rows = data || [];
  detalleCache.set(productoId, { rows, ts: Date.now() });
  return rows;
}
