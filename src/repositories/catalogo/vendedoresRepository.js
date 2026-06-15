/**
 * vendedoresRepository — Acceso centralizado a la tabla `vendedores`.
 */

import { supabase } from '@/lib/customSupabaseClient';
import { runRepo, runRpc } from '../shared/errorHandler';

const TABLE = 'vendedores';

const SELECT_FULL = '*';

export const getActivos = () =>
  runRepo(
    supabase
      .from(TABLE)
      .select(SELECT_FULL)
      .eq('activo', true)
      .order('nombre', { ascending: true }),
    'No se pudieron cargar los vendedores',
  );

export const getById = (id) =>
  runRepo(
    supabase.from(TABLE).select(SELECT_FULL).eq('id', id).maybeSingle(),
    `No se pudo cargar el vendedor ${id}`,
  );

export const create = (payload) =>
  runRepo(
    supabase.from(TABLE).insert(payload).select().single(),
    'No se pudo crear el vendedor',
  );

export const update = (id, updates) =>
  runRepo(
    supabase.from(TABLE).update(updates).eq('id', id).select().single(),
    `No se pudo actualizar el vendedor ${id}`,
  );

/**
 * Llama el RPC blindado en Fix 0.1 que calcula comisiones del vendedor en
 * un rango de fechas, validando tenant del caller.
 */
export const getComisiones = (vendedorId, fechaDesde, fechaHasta) =>
  runRpc(
    supabase.rpc('calcular_comisiones_vendedor', {
      p_vendedor_id: vendedorId,
      p_fecha_desde: fechaDesde,
      p_fecha_hasta: fechaHasta,
    }),
    'No se pudieron calcular las comisiones',
  );

export default {
  getActivos,
  getById,
  create,
  update,
  getComisiones,
};
