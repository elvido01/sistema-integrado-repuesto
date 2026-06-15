/**
 * ordenesCompraRepository — Centraliza el acceso a ordenes_compra
 * y ordenes_compra_detalle.
 *
 * Wrappea las RPCs blindadas en Fase 0/0.11:
 *   - get_productos_para_orden_automatica_v2  (v1 fallback)
 *   - reorganizar_ordenes_pendientes_por_suplidor
 *   - reorganizar_orden_pendiente_one  (Fase 0.11: valida tenant)
 *
 * Convención de estados (ver docs/MODULES.md y fix Fase 3.2):
 *   - Pendiente:  recién creada o aprobada, en espera de recepción
 *   - Recibida:   procesada a Compra (mercancía recibida en almacén)
 *   - Anulada:    cancelada, no afecta inventario ni reportes
 *
 * NO toca paneles UI. Sin toast, sin console.log — solo retorna data/error.
 */

import { supabase } from '@/lib/customSupabaseClient';
import { runRepo, runRpc } from '../shared/errorHandler';

const TABLE_OC = 'ordenes_compra';
const TABLE_OCD = 'ordenes_compra_detalle';

const SELECT_LIGHT = 'id, numero, fecha_orden, fecha_vencimiento, estado, suplidor_id, total_orden, notas, created_at, updated_at';
const SELECT_WITH_SUPLIDOR = `${SELECT_LIGHT}, proveedores(id, nombre, rnc, telefono)`;

// ── Lecturas ──────────────────────────────────────────────────

/**
 * Lista órdenes con filtros (paginada).
 *
 * @param {object} [opts]
 * @param {'Pendiente'|'Recibida'|'Anulada'} [opts.estado]
 * @param {string} [opts.suplidorId]
 * @param {string} [opts.fechaDesde] - ISO date
 * @param {string} [opts.fechaHasta] - ISO date
 * @param {number} [opts.limit]
 * @param {number} [opts.offset]
 */
export const list = ({
  estado = null,
  suplidorId = null,
  fechaDesde = null,
  fechaHasta = null,
  limit = 50,
  offset = 0,
} = {}) => {
  let q = supabase
    .from(TABLE_OC)
    .select(SELECT_WITH_SUPLIDOR)
    .order('fecha_orden', { ascending: false })
    .range(offset, offset + limit - 1);

  if (estado)      q = q.eq('estado', estado);
  if (suplidorId)  q = q.eq('suplidor_id', suplidorId);
  if (fechaDesde)  q = q.gte('fecha_orden', fechaDesde);
  if (fechaHasta)  q = q.lte('fecha_orden', fechaHasta);

  return runRepo(q, 'No se pudieron cargar las ordenes de compra');
};

/**
 * Obtiene una orden por id, con su detalle.
 */
export const getById = async (id) => {
  const cab = await runRepo(
    supabase.from(TABLE_OC).select(`${SELECT_WITH_SUPLIDOR}`).eq('id', id).maybeSingle(),
    `No se pudo cargar la orden ${id}`,
  );
  if (cab.error || !cab.data) return cab;

  const det = await runRepo(
    supabase
      .from(TABLE_OCD)
      .select('*')
      .eq('orden_compra_id', id)
      .order('id'),
    `No se pudo cargar el detalle de la orden ${id}`,
  );
  if (det.error) return det;

  return { data: { ...cab.data, detalle: det.data ?? [] }, error: null };
};

/**
 * Cuenta órdenes pendientes (útil para badges).
 */
export const countPendientes = () =>
  runRepo(
    supabase
      .from(TABLE_OC)
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'Pendiente'),
    'No se pudo contar ordenes pendientes',
  );

// ── Escrituras ────────────────────────────────────────────────

/**
 * Crea una orden + sus líneas en una operación atómica via RPC
 * (alternativa: insert cabecera, luego insert detalles — se usa cuando
 * no hay RPC bulk).
 *
 * @param {object} cabecera
 * @param {Array<object>} detalles
 */
export const create = async (cabecera, detalles = []) => {
  const cab = await runRepo(
    supabase.from(TABLE_OC).insert(cabecera).select().single(),
    'No se pudo crear la orden de compra',
  );
  if (cab.error) return cab;

  if (detalles.length > 0) {
    const filas = detalles.map((d) => ({ ...d, orden_compra_id: cab.data.id }));
    const det = await runRepo(
      supabase.from(TABLE_OCD).insert(filas),
      'No se pudo crear el detalle de la orden',
    );
    if (det.error) return det;
  }
  return cab;
};

/**
 * Actualiza la cabecera de una orden.
 * @param {string} id
 * @param {object} updates
 */
export const update = (id, updates) =>
  runRepo(
    supabase.from(TABLE_OC).update(updates).eq('id', id).select().single(),
    `No se pudo actualizar la orden ${id}`,
  );

/**
 * Elimina una orden y su detalle (cascada manual por si la FK no lo hace).
 */
export const remove = async (id) => {
  const det = await runRepo(
    supabase.from(TABLE_OCD).delete().eq('orden_compra_id', id),
    `No se pudo eliminar el detalle de la orden ${id}`,
  );
  if (det.error) return det;

  return runRepo(
    supabase.from(TABLE_OC).delete().eq('id', id),
    `No se pudo eliminar la orden ${id}`,
  );
};

// ── RPCs especializadas (Fase 0/0.11 blindadas) ───────────────

/**
 * Reorganiza TODAS las órdenes pendiente del tenant moviendo cada línea
 * a la orden correcta de su suplidor real (refrescando fecha).
 */
export const reorganizarPendientesPorSuplidor = () =>
  runRpc(
    supabase.rpc('reorganizar_ordenes_pendientes_por_suplidor'),
    'No se pudo reorganizar las ordenes pendientes',
  );

/**
 * Reorganiza una sola orden por suplidor (Fase 0.11: valida tenant).
 */
export const reorganizarOrden = (ordenId) =>
  runRpc(
    supabase.rpc('reorganizar_orden_pendiente_one', { p_orden_id: ordenId }),
    `No se pudo reorganizar la orden ${ordenId}`,
  );

export default {
  list,
  getById,
  countPendientes,
  create,
  update,
  remove,
  reorganizarPendientesPorSuplidor,
  reorganizarOrden,
};
