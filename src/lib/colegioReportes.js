// Datos para el estado de cuenta de la familia y la cabecera de los reportes
// del colegio (parte 4, 06/11/2026).
import { supabase } from '@/lib/customSupabaseClient';
import { printHtmlSmart } from '@/lib/printHtmlSmart';
import { estadoCuentaFamiliaHTML, facturaFiscalColegioHTML } from '@/lib/printColegio';
import { diasAtraso, tramoAntiguedad, hoyRD, pendienteDe, fechaLocalRD, TANDAS_NOMBRE as TANDAS } from '@/lib/colegio';

const ORDEN_TIPO = { reservacion: 1, inscripcion: 1, utileria: 2, bilingue: 3, mensualidad: 4, sala_tareas: 5, recargo: 6, otro: 7 };

export { diasAtraso, tramoAntiguedad, hoyRD, pendienteDe, TANDAS };

// Se guarda 5 minutos y solo si se leyó bien (un fallo no deja la cabecera vacía toda la sesión).
let cacheColegio = null;
export async function datosColegio(tenantId) {
  if (cacheColegio?.tenantId === tenantId && Date.now() - cacheColegio.t < 300000) return cacheColegio.datos;
  const { data, error } = await supabase.from('config_empresa').select('nombre, rnc, direccion1, direccion2, telefono, logo_url, slogan')
    .eq('tenant_id', tenantId).maybeSingle();
  if (error) throw error;
  const e = data || {};
  const datos = { nombre: e.nombre, rnc: e.rnc, direccion: [e.direccion1, e.direccion2].filter(Boolean).join(', '), telefono: e.telefono, logo_url: e.logo_url, slogan: e.slogan };
  if (data) cacheColegio = { tenantId, datos, t: Date.now() };
  return datos;
}

/**
 * Estado de cuenta de la familia: cada hijo con sus cargos del año actual
 * más cualquier deuda de años anteriores; la reservación del año próximo
 * también sale (ya pagada o por pagar).
 */
export async function datosEstadoCuenta(familiaId, tenantId) {
  const [fa, es, an, cfg, colegio] = await Promise.all([
    supabase.from('edu_familias').select('*').eq('id', familiaId).eq('tenant_id', tenantId).single(),
    supabase.from('edu_estudiantes').select('*').eq('familia_id', familiaId).eq('tenant_id', tenantId).order('matricula'),
    supabase.from('edu_anios').select('*').eq('tenant_id', tenantId).order('anio_inicio'),
    supabase.from('edu_config').select('*').eq('tenant_id', tenantId).maybeSingle(),
    datosColegio(tenantId),
  ]);
  if (fa.error) throw fa.error;
  if (es.error) throw es.error;
  const anios = new Map((an.data || []).map((a) => [a.id, a]));
  const actual = (an.data || []).find((a) => a.actual);
  const ids = (es.data || []).map((e) => e.id);
  const [ca, cu, pa] = await Promise.all([
    ids.length ? supabase.from('edu_cargos').select('*').in('estudiante_id', ids).eq('tenant_id', tenantId).neq('estado', 'anulado')
      : Promise.resolve({ data: [] }),
    supabase.from('edu_cursos').select('id, nombre').eq('tenant_id', tenantId),
    supabase.from('edu_pagos').select('numero, fecha, total, anulado').eq('familia_id', familiaId).eq('tenant_id', tenantId)
      .order('numero', { ascending: false }).limit(8),
  ]);
  if (ca.error) throw ca.error;
  const cursoN = new Map((cu.data || []).map((c) => [c.id, c.nombre]));
  const hoy = hoyRD();
  const estudiantes = (es.data || []).map((e) => {
    const cargos = (ca.data || [])
      .filter((c) => c.estudiante_id === e.id)
      // año actual completo; de otros años solo lo pendiente y la reservación del próximo
      .filter((c) => c.anio_id === actual?.id || pendienteDe(c) > 0
        || (c.tipo === 'reservacion' && anios.get(c.anio_id)?.anio_inicio > (actual?.anio_inicio ?? 0)))
      .sort((a, b) => (anios.get(a.anio_id)?.anio_inicio ?? 0) - (anios.get(b.anio_id)?.anio_inicio ?? 0)
        || (ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo]) || String(a.periodo || '').localeCompare(String(b.periodo || '')))
      .map((c) => {
        const pend = pendienteDe(c);
        const desde = c.vence || fechaLocalRD(c.created_at);   // hora local, igual que el reporte
        return {
          descripcion: c.descripcion, anio: c.anio_id !== actual?.id ? anios.get(c.anio_id)?.nombre : '',
          moneda: c.moneda, monto: Number(c.monto), descuento: Number(c.descuento), pagado: Number(c.pagado),
          pendiente: pend, estado: c.estado,
          // la reservación del año próximo no vence todavía
          vencido: pend > 0 && diasAtraso(desde, hoy) > 0 && !(anios.get(c.anio_id)?.anio_inicio > (actual?.anio_inicio ?? 0)),
        };
      });
    return {
      nombre: `${e.nombres} ${e.apellidos}`, matricula: e.matricula, curso: cursoN.get(e.curso_id) || '', tanda: TANDAS[e.tanda] || '',
      tarifa: e.tarifa_mensual, beca_pct: e.beca_pct, estado: e.estado, cargos,
    };
  }).filter((e) => e.estado === 'activo' || e.cargos.some((c) => c.pendiente > 0));
  const f = fa.data;
  const dia = cfg.data?.dia_limite_pago || 5;
  return {
    colegio, fecha: hoy, estudiantes, pagos: pa.data || [],
    familia: { ...f, telefono: f.tutor_telefono || f.madre_celular || f.padre_celular || f.telefono_residencial || '' },
    reglaRecargo: cfg.data?.recargo_monto > 0
      ? `Pagos del 1 al ${dia} de cada mes; desde el día 1 del mes siguiente se aplica un recargo de RD$${Number(cfg.data.recargo_monto).toLocaleString('en-US')}.` : '',
  };
}

export async function imprimirEstadoCuenta(familiaId, tenantId) {
  const d = await datosEstadoCuenta(familiaId, tenantId);
  await printHtmlSmart(estadoCuentaFamiliaHTML(d), { tipo: 'carta' });
}


/** Factura con crédito fiscal (para imprimir y reimprimir). */
export async function datosFacturaFiscal(facturaId, tenantId) {
  const [fa, colegio] = await Promise.all([
    supabase.from('facturas')
      .select('numero, ncf, fecha, total, notas, forma_pago, estado, clientes(nombre, rnc), facturas_detalle(descripcion, importe, created_at)')
      .eq('id', facturaId).eq('tenant_id', tenantId).single(),
    datosColegio(tenantId),
  ]);
  if (fa.error) throw fa.error;
  const f = fa.data;
  // Vencimiento de la secuencia que contiene este NCF (serie + tipo + 8 dígitos): va impreso.
  const ncf = String(f.ncf || '');
  const num = Number(ncf.slice(3));
  let vence = null;
  if (num) {
    const { data: sq } = await supabase.from('secuencias_ncf').select('fecha_vencimiento')
      .eq('tenant_id', tenantId).eq('serie', ncf.slice(0, 1)).eq('tipo_ncf', ncf.slice(1, 3))
      .lte('secuencia_desde', num).gte('secuencia_hasta', num)
      .order('created_at', { ascending: false }).limit(1);
    vence = sq?.[0]?.fecha_vencimiento || null;
  }
  const lineas = [...(f.facturas_detalle || [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  return { colegio, factura: { ...f, fecha: fechaLocalRD(f.fecha) }, vence, cliente: f.clientes || {}, lineas };
}

export async function imprimirFacturaFiscal(facturaId, tenantId) {
  const d = await datosFacturaFiscal(facturaId, tenantId);
  await printHtmlSmart(facturaFiscalColegioHTML(d), { tipo: 'carta' });
}
