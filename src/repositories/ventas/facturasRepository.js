/**
 * facturasRepository — Acceso centralizado a facturas + facturas_detalle.
 *
 * Por el tamaño de useVentas (1156 LOC), Fase 3 NO refactoriza el hook
 * completo. Este repository expone los métodos más comunes para que
 * componentes/hooks nuevos los usen, y se migra useVentas en Fase 3b.
 *
 * Cubre:
 *   - Listado paginado con filtros
 *   - Carga por id (cabecera + detalle)
 *   - Búsqueda por número o NCF
 *   - Update parcial (ej. estado, observaciones)
 *   - Anulación lógica (estado = 'Anulada')
 *
 * NO incluye creación — la creación de una factura es transaccional y
 * requiere coordinación con secuencias, NCF, emisión DGII, salida de
 * inventario. Eso se mantiene en useVentas hasta que se migre con tests.
 */

import { supabase } from '@/lib/customSupabaseClient';
import { runRepo } from '../shared/errorHandler';

const TABLE = 'facturas';
const TABLE_DET = 'facturas_detalle';

const SELECT_LIGHT = 'id, numero, fecha, total, subtotal, itbis, estado, tipo_pago, ncf, cliente_id, vendedor_id, monto_pendiente, created_at';
const SELECT_WITH_CLIENTE = `${SELECT_LIGHT}, clientes(id, codigo, nombre, telefono, cedula_rnc)`;

// ── Lecturas ──────────────────────────────────────────────────

/**
 * Lista facturas con filtros.
 *
 * @param {object} [opts]
 * @param {string} [opts.clienteId]
 * @param {string} [opts.vendedorId]
 * @param {string} [opts.estado] - 'Activa', 'Anulada', 'Pagada', etc.
 * @param {string} [opts.fechaDesde]
 * @param {string} [opts.fechaHasta]
 * @param {number} [opts.limit]
 * @param {number} [opts.offset]
 */
export const list = ({
  clienteId = null,
  vendedorId = null,
  estado = null,
  fechaDesde = null,
  fechaHasta = null,
  limit = 50,
  offset = 0,
} = {}) => {
  let q = supabase
    .from(TABLE)
    .select(SELECT_WITH_CLIENTE)
    .order('fecha', { ascending: false })
    .range(offset, offset + limit - 1);

  if (clienteId)   q = q.eq('cliente_id', clienteId);
  if (vendedorId)  q = q.eq('vendedor_id', vendedorId);
  if (estado)      q = q.eq('estado', estado);
  if (fechaDesde)  q = q.gte('fecha', fechaDesde);
  if (fechaHasta)  q = q.lte('fecha', fechaHasta);

  return runRepo(q, 'No se pudieron cargar las facturas');
};

/**
 * Obtiene una factura completa (cabecera + detalle + cliente).
 */
export const getById = async (id) => {
  const cab = await runRepo(
    supabase.from(TABLE).select(SELECT_WITH_CLIENTE).eq('id', id).maybeSingle(),
    `No se pudo cargar la factura ${id}`,
  );
  if (cab.error || !cab.data) return cab;

  const det = await runRepo(
    supabase.from(TABLE_DET).select('*').eq('factura_id', id).order('id'),
    `No se pudo cargar el detalle de la factura ${id}`,
  );
  if (det.error) return det;

  return { data: { ...cab.data, detalle: det.data ?? [] }, error: null };
};

/**
 * Busca una factura por su número (B01-..., B02-...).
 * Útil para "Buscar factura" en VentasPage.
 */
export const getByNumero = (numero) =>
  runRepo(
    supabase.from(TABLE).select(SELECT_WITH_CLIENTE).eq('numero', numero).maybeSingle(),
    `No se encontro factura ${numero}`,
  );

/**
 * Busca por NCF (E31..., E32...).
 */
export const getByNCF = (ncf) =>
  runRepo(
    supabase.from(TABLE).select(SELECT_WITH_CLIENTE).eq('ncf', ncf).maybeSingle(),
    `No se encontro factura con NCF ${ncf}`,
  );

/**
 * Cuenta facturas con saldo pendiente (cartera).
 */
export const countConSaldo = (clienteId = null) => {
  let q = supabase
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'Activa')
    .gt('monto_pendiente', 0);
  if (clienteId) q = q.eq('cliente_id', clienteId);
  return runRepo(q, 'No se pudieron contar las facturas con saldo');
};

// ── Escrituras (limitadas) ────────────────────────────────────

/**
 * Actualiza campos no críticos: notas, observaciones, estado.
 *
 * No usar para tocar total/subtotal/itbis directamente. Para eso
 * recalcular líneas y dejar que el hook lo haga.
 */
export const update = (id, updates) =>
  runRepo(
    supabase.from(TABLE).update(updates).eq('id', id).select().single(),
    `No se pudo actualizar la factura ${id}`,
  );

/**
 * Anula una factura (soft delete via estado).
 *
 * Importante: NO se borra. La anulación tiene implicaciones fiscales
 * (DGII e-CF requiere ANECF si la factura ya fue aceptada por DGII).
 * Este método solo cambia el estado local — el caller debe coordinar
 * con `emitir-fiscal` si fiscalActivo.
 */
export const anular = (id, motivo = null) =>
  runRepo(
    supabase
      .from(TABLE)
      .update({
        estado: 'Anulada',
        notas_anulacion: motivo,
        anulada_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single(),
    `No se pudo anular la factura ${id}`,
  );

export default {
  list,
  getById,
  getByNumero,
  getByNCF,
  countConSaldo,
  update,
  anular,
};
