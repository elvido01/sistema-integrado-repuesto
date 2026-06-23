import { supabase } from '../supabase/client';

export type MobileDashboardData = {
  meta: number;
  ventasDia: number;
  ventasMes: number;
  progresoMeta: number;
  proyeccionCierre: number;
  cajaActual: number;
  excedente: number;
  gastosDia: number;
  compromisosPagar: number;
  compromisosSuplidores: number;
  compromisoSemanaCount: number;
  suplidorSemanaCount: number;
  hasPreviousMonthHistory: boolean;
};

const DEFAULT_META = 150000;

const toNumber = (value: unknown) => Number(value || 0);
const sumField = (rows: any[] | null | undefined, field: string) =>
  (rows || []).reduce((sum, row) => sum + toNumber(row?.[field]), 0);

const localDateOnly = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const startOfLocalDayISO = (date = new Date()) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  return d.toISOString();
};

const nextLocalDayISO = (date = new Date()) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
  return d.toISOString();
};

const monthRangeISO = (date = new Date()) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start: start.toISOString(), next: next.toISOString() };
};

const previousMonthRangeISO = (date = new Date()) => {
  const start = new Date(date.getFullYear(), date.getMonth() - 1, 1, 0, 0, 0, 0);
  const next = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  return { start: start.toISOString(), next: next.toISOString() };
};

const weekRangeDateOnly = (date = new Date()) => {
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() + diffToMonday);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { start: localDateOnly(start), end: localDateOnly(end) };
};

const cashHistoryAnchorISO = (value?: string | null) => {
  if (!value) return '1970-01-01T00:00:00.000Z';
  const [year, month, day] = String(value).split('T')[0].split('-').map(Number);
  if (!year || !month || !day) return '1970-01-01T00:00:00.000Z';
  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
};

const calculateCurrentMeta = (config: any) => {
  const base = toNumber(config?.meta_ventas);
  if (!base) return DEFAULT_META;
  const incremento = toNumber(config?.incremento_meta_pct);
  if (!incremento || config?.intervalo_meta === 'Ninguno') return base;

  const today = new Date();
  const start = config?.fecha_inicio_meta ? new Date(`${String(config.fecha_inicio_meta).slice(0, 10)}T12:00:00`) : today;
  if (Number.isNaN(start.getTime()) || today < start) return base;

  const months = (today.getFullYear() - start.getFullYear()) * 12 + today.getMonth() - start.getMonth();
  const years = today.getFullYear() - start.getFullYear();
  let periods = 0;

  switch (config?.intervalo_meta) {
    case 'Mensual':
      periods = months;
      break;
    case 'Trimestral':
      periods = Math.floor(months / 3);
      break;
    case 'Semestral':
      periods = Math.floor(months / 6);
      break;
    case 'Anual':
      periods = years;
      break;
    default:
      periods = 0;
  }

  return periods > 0 ? base * Math.pow(1 + incremento / 100, periods) : base;
};

export async function fetchMobileDashboard(tenantId: string): Promise<MobileDashboardData> {
  const now = new Date();
  const today = localDateOnly(now);
  const todayStart = startOfLocalDayISO(now);
  const tomorrowStart = nextLocalDayISO(now);
  const month = monthRangeISO(now);
  const previousMonth = previousMonthRangeISO(now);
  const week = weekRangeDateOnly(now);

  const { data: configEmpresa, error: configError } = await supabase
    .from('config_empresa')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (configError) throw configError;

  const meta = calculateCurrentMeta(configEmpresa);
  const historyAnchor = cashHistoryAnchorISO(configEmpresa?.caja_historial_desde);
  const historyAnchorDate = historyAnchor.split('T')[0];
  const saldoInicial = Number.isFinite(toNumber(configEmpresa?.saldo_inicial_caja))
    ? toNumber(configEmpresa?.saldo_inicial_caja)
    : 0;

  const [
    ventasDiaRes,
    ventasContadoHoyRes,
    recibosHoyRes,
    gastosHoyRes,
    compromisosRes,
    comprasCreditoRes,
    ventasMesRes,
    ventasMesAnteriorRes,
    ventasContadoHistRes,
    recibosHistRes,
    compromisosPagadosHistRes,
    pagosSuplidoresHistRes,
    comprasContadoHistRes,
    gastosHistRes,
  ] = await Promise.all([
    supabase.from('facturas').select('total').eq('tenant_id', tenantId).gte('created_at', todayStart).lt('created_at', tomorrowStart).neq('estado', 'ANULADA'),
    supabase.from('facturas').select('total').eq('tenant_id', tenantId).gte('created_at', todayStart).lt('created_at', tomorrowStart).ilike('forma_pago', 'contado').neq('estado', 'ANULADA'),
    supabase.from('recibos_ingreso').select('monto_pagado').eq('tenant_id', tenantId).gte('created_at', todayStart).lt('created_at', tomorrowStart).eq('anulado', false),
    supabase.from('gastos_diarios').select('monto').eq('tenant_id', tenantId).eq('fecha', today).eq('anulado', false),
    supabase.from('compromisos').select('monto, fecha_pago').eq('tenant_id', tenantId).eq('activo', true).lte('fecha_pago', week.end),
    supabase.from('compras').select('monto_pendiente, total_compra, monto_pagado, fecha, dias_credito').eq('tenant_id', tenantId).ilike('forma_pago', 'CREDITO').eq('estado', 'PENDIENTE'),
    supabase.from('facturas').select('total').eq('tenant_id', tenantId).gte('created_at', month.start).lt('created_at', month.next).neq('estado', 'ANULADA'),
    supabase.from('facturas').select('total').eq('tenant_id', tenantId).gte('created_at', previousMonth.start).lt('created_at', previousMonth.next).neq('estado', 'ANULADA'),
    supabase.from('facturas').select('total').eq('tenant_id', tenantId).gte('created_at', historyAnchor).ilike('forma_pago', 'contado').neq('estado', 'ANULADA'),
    supabase.from('recibos_ingreso').select('monto_pagado').eq('tenant_id', tenantId).gte('created_at', historyAnchor).eq('anulado', false),
    supabase.from('compromisos').select('monto').eq('tenant_id', tenantId).gte('fecha_pago', historyAnchorDate).eq('activo', false),
    supabase.from('pagos_suplidores').select('monto_pagado').eq('tenant_id', tenantId).gte('created_at', historyAnchor).eq('anulado', false),
    supabase.from('compras').select('total_compra').eq('tenant_id', tenantId).gte('created_at', historyAnchor).ilike('forma_pago', 'contado').neq('estado', 'ANULADA'),
    supabase.from('gastos_diarios').select('monto').eq('tenant_id', tenantId).gte('fecha', historyAnchorDate).eq('anulado', false),
  ]);

  const firstError = [
    ventasDiaRes.error,
    ventasContadoHoyRes.error,
    recibosHoyRes.error,
    gastosHoyRes.error,
    compromisosRes.error,
    comprasCreditoRes.error,
    ventasMesRes.error,
    ventasMesAnteriorRes.error,
    ventasContadoHistRes.error,
    recibosHistRes.error,
    compromisosPagadosHistRes.error,
    pagosSuplidoresHistRes.error,
    comprasContadoHistRes.error,
    gastosHistRes.error,
  ].find(Boolean);
  if (firstError) throw firstError;

  const comprasSemana = (comprasCreditoRes.data || []).filter((compra: any) => {
    const pendiente = compra.monto_pendiente !== null
      ? toNumber(compra.monto_pendiente)
      : toNumber(compra.total_compra) - toNumber(compra.monto_pagado);
    if (pendiente <= 0) return false;
    const baseDate = compra.fecha ? new Date(`${String(compra.fecha).slice(0, 10)}T12:00:00`) : now;
    baseDate.setDate(baseDate.getDate() + toNumber(compra.dias_credito));
    const due = localDateOnly(baseDate);
    return due <= week.end;
  });

  const ventasDia = sumField(ventasDiaRes.data, 'total');
  const ventasContadoHoy = sumField(ventasContadoHoyRes.data, 'total');
  const recibosHoy = sumField(recibosHoyRes.data, 'monto_pagado');
  const gastosDia = sumField(gastosHoyRes.data, 'monto');
  const ventasMes = sumField(ventasMesRes.data, 'total');
  const ventasMesAnterior = sumField(ventasMesAnteriorRes.data, 'total');
  const compromisosPagar = sumField(compromisosRes.data, 'monto');
  const compromisosSuplidores = comprasSemana.reduce((sum, compra: any) => {
    const pendiente = compra.monto_pendiente !== null
      ? toNumber(compra.monto_pendiente)
      : toNumber(compra.total_compra) - toNumber(compra.monto_pagado);
    return sum + Math.max(0, pendiente);
  }, 0);

  const cajaActual = ventasContadoHoy + recibosHoy - gastosDia;
  const excedente = saldoInicial
    + sumField(ventasContadoHistRes.data, 'total')
    + sumField(recibosHistRes.data, 'monto_pagado')
    - sumField(compromisosPagadosHistRes.data, 'monto')
    - sumField(pagosSuplidoresHistRes.data, 'monto_pagado')
    - sumField(comprasContadoHistRes.data, 'total_compra')
    - sumField(gastosHistRes.data, 'monto');

  const dayOfMonth = Math.max(1, now.getDate());
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const proyeccionCierre = (ventasMes / dayOfMonth) * daysInMonth;

  return {
    meta,
    ventasDia,
    ventasMes,
    progresoMeta: meta > 0 ? Math.min((ventasMes / meta) * 100, 100) : 0,
    proyeccionCierre,
    cajaActual,
    excedente,
    gastosDia,
    compromisosPagar,
    compromisosSuplidores,
    compromisoSemanaCount: (compromisosRes.data || []).length,
    suplidorSemanaCount: comprasSemana.length,
    hasPreviousMonthHistory: ventasMesAnterior > 0,
  };
}
