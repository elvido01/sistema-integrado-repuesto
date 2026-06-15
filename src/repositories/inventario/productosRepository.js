/**
 * productosRepository — Acceso centralizado a productos + stock + grupos.
 *
 * Fase 2.5. Reemplaza llamadas dispersas a:
 *   - supabase.rpc('get_productos_paginados', {...})
 *   - supabase.rpc('get_stock_actual', { producto_uuid })
 *   - supabase.from('productos').select(...).eq('id', id)
 *   - supabase.rpc('sugerir_equivalentes_disponibles', { p_producto_id })
 */

import { supabase } from '@/lib/customSupabaseClient';
import { runRepo, runRpc } from '../shared/errorHandler';

const TABLE = 'productos';

const SELECT_LIGHT = 'id, codigo, descripcion, costo, precio, itbis_pct, suplidor_id, min_stock, max_stock, activo';

/**
 * Obtiene un producto por id (todas las columnas + presentaciones).
 * @param {string} id - UUID
 */
export const getById = (id) =>
  runRepo(
    supabase
      .from(TABLE)
      .select('*, presentaciones(*)')
      .eq('id', id)
      .maybeSingle(),
    `No se pudo cargar el producto ${id}`,
  );

/**
 * Busca por código exacto.
 */
export const getByCodigo = (codigo) =>
  runRepo(
    supabase
      .from(TABLE)
      .select('*, presentaciones(*)')
      .ilike('codigo', codigo.trim())
      .maybeSingle(),
    `No se encontro producto con codigo ${codigo}`,
  );

/**
 * Stock actual de un producto (multi-almacén — RPC suma todos).
 * @param {string} productoId
 */
export const getStockActual = (productoId) =>
  runRpc(
    supabase.rpc('get_stock_actual', { producto_uuid: productoId }),
    `No se pudo obtener stock del producto ${productoId}`,
  );

/**
 * Búsqueda paginada con filtros (marca, modelo, search, stock).
 *
 * Wrappea get_productos_paginados (Fix 0.6: ahora filtra por tenant).
 *
 * @param {object} opts
 * @param {number} [opts.limit]
 * @param {number} [opts.offset]
 * @param {string} [opts.searchTerm]
 * @param {string} [opts.marcaFilter]
 * @param {string} [opts.modeloFilter]
 * @param {boolean} [opts.includeZeroStock]
 */
export const getPaginados = ({
  limit = 25,
  offset = 0,
  searchTerm = '',
  marcaFilter = '',
  modeloFilter = '',
  includeZeroStock = true,
} = {}) =>
  runRpc(
    supabase.rpc('get_productos_paginados', {
      p_limit: limit,
      p_offset: offset,
      p_search_term: searchTerm,
      p_marca_filter: marcaFilter,
      p_modelo_filter: modeloFilter,
      p_include_zero_stock: includeZeroStock,
    }),
    'No se pudieron cargar los productos',
  );

/**
 * Productos para Orden de Compra Automática (v2 con conciencia de grupos).
 * Fallback a v1 si v2 no existe (mantenido por compatibilidad).
 *
 * @param {string} suplidorId
 */
export const getParaOrdenAutomatica = async (suplidorId) => {
  // Intentamos v2 (con grupos). Si falla, caemos a v1.
  const v2 = await runRpc(
    supabase.rpc('get_productos_para_orden_automatica_v2', {
      p_suplidor_id: suplidorId,
    }),
    'No se pudieron obtener productos para orden automatica',
  );
  if (!v2.error) return { ...v2, _version: 'v2' };

  const v1 = await runRpc(
    supabase.rpc('get_productos_para_orden_automatica', {
      p_suplidor_id: suplidorId,
    }),
    'No se pudieron obtener productos para orden automatica',
  );
  return { ...v1, _version: 'v1' };
};

/**
 * Sugiere productos equivalentes con stock cuando el original está agotado.
 * Wrappea sugerir_equivalentes_disponibles (Fase 4).
 *
 * @param {string} productoId - id del producto agotado
 */
export const getEquivalentesDisponibles = (productoId) =>
  runRpc(
    supabase.rpc('sugerir_equivalentes_disponibles', { p_producto_id: productoId }),
    'No se pudieron obtener equivalentes',
  );

/**
 * Inserta un producto nuevo.
 */
export const create = (payload) =>
  runRepo(
    supabase.from(TABLE).insert(payload).select().single(),
    'No se pudo crear el producto',
  );

/**
 * Actualiza un producto por id.
 */
export const update = (id, updates) =>
  runRepo(
    supabase.from(TABLE).update(updates).eq('id', id).select().single(),
    `No se pudo actualizar el producto ${id}`,
  );

export default {
  getById,
  getByCodigo,
  getStockActual,
  getPaginados,
  getParaOrdenAutomatica,
  getEquivalentesDisponibles,
  create,
  update,
};
