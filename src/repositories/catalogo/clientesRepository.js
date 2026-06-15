/**
 * clientesRepository — Acceso centralizado a la tabla `clientes`.
 *
 * Fase 2.4. Reemplaza llamadas directas dispersas:
 *   - ClienteSearchModal hace `supabase.from('clientes').select(...)`
 *   - PedidosPage, SolicitudesComprasPage, VentasPage idem
 *
 * Convenciones:
 *   - Todos los métodos retornan `{ data, error }` normalizado (ver errorHandler)
 *   - El filtro por tenant_id viene de RLS — no se replica aquí
 *   - Para queries paginadas o complejas, agregar opts como tercer parámetro
 */

import { supabase } from '@/lib/customSupabaseClient';
import { runRepo } from '../shared/errorHandler';

const TABLE = 'clientes';

const SELECT_LIGHT = 'id, codigo, nombre, telefono, cedula_rnc, activo';
const SELECT_FULL = '*';

/**
 * Lista clientes activos del tenant actual.
 * @param {object} [opts]
 * @param {number} [opts.limit] - Máximo de filas (default 100)
 * @param {string} [opts.orderBy] - Columna para ordenar (default 'nombre')
 * @returns {Promise<{ data: array|null, error: object|null }>}
 */
export const getActivos = ({ limit = 100, orderBy = 'nombre' } = {}) =>
  runRepo(
    supabase
      .from(TABLE)
      .select(SELECT_LIGHT)
      .eq('activo', true)
      .order(orderBy, { ascending: true })
      .limit(limit),
    'No se pudieron cargar los clientes',
  );

/**
 * Obtiene un cliente por id.
 * @param {string} id - UUID
 * @returns {Promise<{ data: object|null, error: object|null }>}
 */
export const getById = (id) =>
  runRepo(
    supabase.from(TABLE).select(SELECT_FULL).eq('id', id).maybeSingle(),
    `No se pudo cargar el cliente ${id}`,
  );

/**
 * Busca cliente por código exacto.
 * @param {string} codigo
 */
export const getByCodigo = (codigo) =>
  runRepo(
    supabase.from(TABLE).select(SELECT_FULL).ilike('codigo', codigo).maybeSingle(),
    `No se encontro cliente con codigo ${codigo}`,
  );

/**
 * Búsqueda paginada por nombre/codigo/cedula.
 * @param {string} term - Texto a buscar
 * @param {object} [opts]
 * @param {number} [opts.limit]
 * @param {number} [opts.offset]
 */
export const search = (term, { limit = 25, offset = 0 } = {}) => {
  const pattern = `%${term}%`;
  return runRepo(
    supabase
      .from(TABLE)
      .select(SELECT_LIGHT)
      .or(`codigo.ilike.${pattern},nombre.ilike.${pattern},cedula_rnc.ilike.${pattern}`)
      .eq('activo', true)
      .order('nombre', { ascending: true })
      .range(offset, offset + limit - 1),
    'No se pudo buscar clientes',
  );
};

/**
 * Crea un cliente nuevo.
 * @param {object} payload - Datos del cliente (sin id; tenant_id lo pone RLS)
 */
export const create = (payload) =>
  runRepo(
    supabase.from(TABLE).insert(payload).select().single(),
    'No se pudo crear el cliente',
  );

/**
 * Actualiza un cliente por id.
 * @param {string} id
 * @param {object} updates
 */
export const update = (id, updates) =>
  runRepo(
    supabase.from(TABLE).update(updates).eq('id', id).select().single(),
    `No se pudo actualizar el cliente ${id}`,
  );

/**
 * Soft delete: marca activo=false. Para hard delete usar el dashboard.
 * @param {string} id
 */
export const deactivate = (id) =>
  runRepo(
    supabase.from(TABLE).update({ activo: false }).eq('id', id).select().single(),
    `No se pudo desactivar el cliente ${id}`,
  );

export default {
  getActivos,
  getById,
  getByCodigo,
  search,
  create,
  update,
  deactivate,
};
