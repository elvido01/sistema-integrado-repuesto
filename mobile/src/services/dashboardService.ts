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
  financieraExternaRecibosDia: number;
  financieraExternaNombre: string | null;
  compromisoSemanaCount: number;
  suplidorSemanaCount: number;
  hasPreviousMonthHistory: boolean;
  finanzasEmpresas: CompanyFinanceSummary[];
  vendedor: SellerDashboardData | null;
};

export type CompanyFinanceSummary = {
  tenantId: string | null;
  nombre: string;
  gastosDia: number;
  gastosCount: number;
  compromisosPagar: number;
  compromisosCount: number;
  gastos: CompanyFinanceExpense[];
  compromisos: CompanyFinanceCommitment[];
};

export type CompanyFinanceExpense = {
  id: string;
  fecha: string | null;
  tipoGasto: string;
  descripcion: string;
  monto: number;
};

export type CompanyFinanceCommitment = {
  id: string;
  fecha: string | null;
  nombre: string;
  tipo: string;
  monto: number;
  recurrente: boolean;
  frecuencia: string | null;
};

export type SalesFocusProduct = {
  id: string | null;
  codigo: string;
  descripcion: string;
  precio: number;
  existencia: number | null;
  vendidos30d: number;
  objetivoUnidades: number | null;
  titulo: string;
  mensaje: string;
  source: 'configurado' | 'automatico' | 'pendiente';
};

export type SellerDashboardData = {
  metaPersonal: number;
  metaSource: 'configurada' | 'sugerida';
  ventasDia: number;
  ventasMes: number;
  progresoPersonal: number;
  faltantePersonal: number;
  metaEmpresa: number;
  ventasEmpresaMes: number;
  progresoEmpresa: number;
  aporteEmpresaPct: number;
  proyeccionPersonal: number;
  facturasMes: number;
  ticketPromedio: number;
  rankingPosicion: number | null;
  rankingTotal: number;
  productoSemana: SalesFocusProduct;
  productoRotacion: SalesFocusProduct;
  mensajeMotivacion: string;
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

const monthStartDateOnly = (date = new Date()) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  return localDateOnly(start);
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

const fetchFinancieraExternaRecibosDia = async (today: string) => {
  const { data, error } = await supabase.rpc('get_financiera_externa_recibos_dia', {
    p_fecha: today,
  });

  if (error) {
    console.warn('[Dashboard] No se pudo cargar financiera externa:', error.message);
    return { total: 0, nombre: null as string | null };
  }

  return {
    total: toNumber(data?.total_recibos_dia),
    nombre: data?.nombre ? String(data.nombre) : null,
  };
};

const fetchCamineroFinanceSummary = async (today: string, until: string): Promise<CompanyFinanceSummary[]> => {
  const { data, error } = await supabase.rpc('get_caminero_finanzas_resumen_movil', {
    p_fecha: today,
    p_hasta: until,
  });

  if (error) {
    console.warn('[Dashboard] No se pudo cargar resumen Caminero/MotoPrestamos:', error.message);
    return [];
  }

  const rows = Array.isArray(data?.empresas) ? data.empresas : [];
  return rows.map((row: any) => ({
    tenantId: row?.tenant_id || null,
    nombre: String(row?.nombre || 'Empresa'),
    gastosDia: toNumber(row?.gastos_dia),
    gastosCount: toNumber(row?.gastos_count),
    compromisosPagar: toNumber(row?.compromisos_pagar),
    compromisosCount: toNumber(row?.compromisos_count),
    gastos: (Array.isArray(row?.gastos) ? row.gastos : []).map((g: any) => ({
      id: String(g?.id || ''),
      fecha: g?.fecha ? String(g.fecha) : null,
      tipoGasto: String(g?.tipo_gasto || 'Operativo'),
      descripcion: String(g?.descripcion || ''),
      monto: toNumber(g?.monto),
    })),
    compromisos: (Array.isArray(row?.compromisos) ? row.compromisos : []).map((c: any) => ({
      id: String(c?.id || ''),
      fecha: c?.fecha ? String(c.fecha) : null,
      nombre: String(c?.nombre || 'Compromiso'),
      tipo: String(c?.tipo || ''),
      monto: toNumber(c?.monto),
      recurrente: Boolean(c?.recurrente),
      frecuencia: c?.frecuencia ? String(c.frecuencia) : null,
    })),
  }));
};


const emptyFocusProduct = (tipo: 'semana' | 'rotacion'): SalesFocusProduct => ({
  id: null,
  codigo: tipo === 'semana' ? 'FOCO' : 'ROTACION',
  descripcion: tipo === 'semana' ? 'Producto de la semana pendiente' : 'Producto para rotar pendiente',
  precio: 0,
  existencia: null,
  vendidos30d: 0,
  objetivoUnidades: null,
  titulo: tipo === 'semana' ? 'Producto de la semana' : 'Producto para rotar inventario',
  mensaje: tipo === 'semana'
    ? 'Gerencia puede elegir aqui el producto que quiere empujar esta semana.'
    : 'Gerencia puede marcar aqui inventario lento para convertirlo en efectivo.',
  source: 'pendiente',
});

const normalizeFocusProduct = (
  row: any,
  tipo: 'semana' | 'rotacion',
  source: SalesFocusProduct['source'],
): SalesFocusProduct => {
  const producto = row?.productos || row || {};
  return {
    id: producto?.id || row?.producto_id || null,
    codigo: String(producto?.codigo || row?.codigo || (tipo === 'semana' ? 'FOCO' : 'ROTACION')),
    descripcion: String(producto?.descripcion || row?.descripcion || emptyFocusProduct(tipo).descripcion),
    precio: toNumber(producto?.precio ?? row?.precio),
    existencia: row?.existencia === undefined && producto?.existencia === undefined
      ? null
      : toNumber(row?.existencia ?? producto?.existencia),
    vendidos30d: toNumber(row?.vendidos_30d ?? row?.vendidos30d),
    objetivoUnidades: row?.objetivo_unidades === undefined ? null : toNumber(row.objetivo_unidades),
    titulo: String(row?.titulo || emptyFocusProduct(tipo).titulo),
    mensaje: String(row?.mensaje || (tipo === 'semana'
      ? 'Buen candidato para iniciar conversaciones hoy.'
      : 'Prioridad para liberar capital del inventario.')),
    source,
  };
};

const fetchConfiguredFocusProduct = async (
  tenantId: string,
  tipo: 'semana' | 'rotacion',
  today: string,
): Promise<SalesFocusProduct | null> => {
  try {
    const { data, error } = await supabase
      .from('dashboard_productos_foco')
      .select('id, producto_id, tipo, titulo, mensaje, objetivo_unidades, fecha_inicio, fecha_fin, productos(id, codigo, descripcion, precio)')
      .eq('tenant_id', tenantId)
      .eq('tipo', tipo)
      .eq('activo', true)
      .lte('fecha_inicio', today)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.warn('[Dashboard vendedor] Productos foco no disponibles:', error.message);
      return null;
    }

    const current = (data || []).find((row: any) => !row.fecha_fin || String(row.fecha_fin).slice(0, 10) >= today);
    return current ? normalizeFocusProduct(current, tipo, 'configurado') : null;
  } catch (error: any) {
    console.warn('[Dashboard vendedor] No se pudo leer productos foco:', error?.message || error);
    return null;
  }
};

const fetchAutomaticFocusProducts = async (
  tenantId: string,
): Promise<{ semana: SalesFocusProduct | null; rotacion: SalesFocusProduct | null }> => {
  try {
    const { data, error } = await supabase.rpc('get_marketing_candidates', {
      p_tenant_id: tenantId,
      p_permitir_sin_imagen: true,
      p_limit: 4,
    });

    if (error) {
      console.warn('[Dashboard vendedor] Candidatos automaticos no disponibles:', error.message);
      return { semana: null, rotacion: null };
    }

    const payload = typeof data === 'string' ? JSON.parse(data) : data || {};
    const semana = payload.mas_vendidos?.[0] || payload.buen_margen?.[0] || null;
    const rotacion = payload.baja_rotacion?.[0] || payload.alta_existencia?.[0] || null;

    return {
      semana: semana ? normalizeFocusProduct(semana, 'semana', 'automatico') : null,
      rotacion: rotacion ? normalizeFocusProduct(rotacion, 'rotacion', 'automatico') : null,
    };
  } catch (error: any) {
    console.warn('[Dashboard vendedor] No se pudo calcular productos automaticos:', error?.message || error);
    return { semana: null, rotacion: null };
  }
};

const fetchSellerMeta = async (tenantId: string, userId: string, periodo: string, companyMeta: number) => {
  try {
    const { data, error } = await supabase
      .from('vendedor_metas_mensuales')
      .select('meta')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .eq('periodo', periodo)
      .maybeSingle();

    if (error) {
      console.warn('[Dashboard vendedor] Meta personal no disponible:', error.message);
      return { value: Math.max(companyMeta * 0.2, 0), source: 'sugerida' as const };
    }

    const configured = toNumber(data?.meta);
    return configured > 0
      ? { value: configured, source: 'configurada' as const }
      : { value: Math.max(companyMeta * 0.2, 0), source: 'sugerida' as const };
  } catch (error: any) {
    console.warn('[Dashboard vendedor] No se pudo leer meta personal:', error?.message || error);
    return { value: Math.max(companyMeta * 0.2, 0), source: 'sugerida' as const };
  }
};

const buildMotivation = (progress: number, remaining: number) => {
  if (progress >= 100) return 'Meta cumplida. Ahora cada venta suma ventaja para el cierre.';
  if (progress >= 75) return 'Estas cerca. Enfocate en tickets completos y productos foco.';
  if (progress >= 40) return 'Buen ritmo. Una venta fuerte hoy puede cambiar el mes.';
  if (remaining > 0) return 'Empieza por el producto de la semana y da seguimiento a clientes recientes.';
  return 'Hoy es buen dia para abrir oportunidades.';
};

const fetchSellerDashboard = async (
  tenantId: string,
  userId: string,
  companyMeta: number,
  companySalesMonth: number,
  companyProjection: number,
): Promise<SellerDashboardData> => {
  const now = new Date();
  const today = localDateOnly(now);
  const todayStart = startOfLocalDayISO(now);
  const tomorrowStart = nextLocalDayISO(now);
  const month = monthRangeISO(now);
  const periodo = monthStartDateOnly(now);

  const [metaPersonal, ventasDiaRes, ventasMesRes, rankingRes, configuredSemana, configuredRotacion, automaticFocus] = await Promise.all([
    fetchSellerMeta(tenantId, userId, periodo, companyMeta),
    supabase.from('facturas').select('total').eq('tenant_id', tenantId).eq('usuario_id', userId).gte('created_at', todayStart).lt('created_at', tomorrowStart).neq('estado', 'ANULADA'),
    supabase.from('facturas').select('total').eq('tenant_id', tenantId).eq('usuario_id', userId).gte('created_at', month.start).lt('created_at', month.next).neq('estado', 'ANULADA'),
    supabase.from('facturas').select('usuario_id, total').eq('tenant_id', tenantId).gte('created_at', month.start).lt('created_at', month.next).neq('estado', 'ANULADA').not('usuario_id', 'is', null),
    fetchConfiguredFocusProduct(tenantId, 'semana', today),
    fetchConfiguredFocusProduct(tenantId, 'rotacion', today),
    fetchAutomaticFocusProducts(tenantId),
  ]);

  const firstError = [ventasDiaRes.error, ventasMesRes.error, rankingRes.error].find(Boolean);
  if (firstError) throw firstError;

  const ventasDia = sumField(ventasDiaRes.data, 'total');
  const ventasMes = sumField(ventasMesRes.data, 'total');
  const meta = metaPersonal.value;
  const progresoPersonal = meta > 0 ? Math.min((ventasMes / meta) * 100, 100) : 0;
  const rankingMap = new Map<string, number>();
  (rankingRes.data || []).forEach((row: any) => {
    const key = String(row.usuario_id || '');
    if (!key) return;
    rankingMap.set(key, (rankingMap.get(key) || 0) + toNumber(row.total));
  });
  const ranking = Array.from(rankingMap.entries()).sort((a, b) => b[1] - a[1]);
  const rankingPosicion = ranking.findIndex(([id]) => id === userId);
  const dayOfMonth = Math.max(1, now.getDate());
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const proyeccionPersonal = (ventasMes / dayOfMonth) * daysInMonth;
  const facturasMes = (ventasMesRes.data || []).length;
  const faltantePersonal = Math.max(0, meta - ventasMes);

  return {
    metaPersonal: meta,
    metaSource: metaPersonal.source,
    ventasDia,
    ventasMes,
    progresoPersonal,
    faltantePersonal,
    metaEmpresa: companyMeta,
    ventasEmpresaMes: companySalesMonth,
    progresoEmpresa: companyMeta > 0 ? Math.min((companySalesMonth / companyMeta) * 100, 100) : 0,
    aporteEmpresaPct: companySalesMonth > 0 ? (ventasMes / companySalesMonth) * 100 : 0,
    proyeccionPersonal,
    facturasMes,
    ticketPromedio: facturasMes > 0 ? ventasMes / facturasMes : 0,
    rankingPosicion: rankingPosicion >= 0 ? rankingPosicion + 1 : null,
    rankingTotal: ranking.length,
    productoSemana: configuredSemana || automaticFocus.semana || emptyFocusProduct('semana'),
    productoRotacion: configuredRotacion || automaticFocus.rotacion || emptyFocusProduct('rotacion'),
    mensajeMotivacion: buildMotivation(progresoPersonal, faltantePersonal || companyProjection),
  };
};

export async function fetchMobileDashboard(
  tenantId: string,
  userId?: string | null,
  options?: { sellerOnly?: boolean },
): Promise<MobileDashboardData> {
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

  if (options?.sellerOnly && userId) {
    const { data: ventasMesEmpresaData, error: ventasMesEmpresaError } = await supabase
      .from('facturas')
      .select('total')
      .eq('tenant_id', tenantId)
      .gte('created_at', month.start)
      .lt('created_at', month.next)
      .neq('estado', 'ANULADA');

    if (ventasMesEmpresaError) throw ventasMesEmpresaError;

    const ventasMesEmpresa = sumField(ventasMesEmpresaData, 'total');
    const dayOfMonth = Math.max(1, now.getDate());
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const proyeccionEmpresa = (ventasMesEmpresa / dayOfMonth) * daysInMonth;
    const vendedor = await fetchSellerDashboard(tenantId, userId, meta, ventasMesEmpresa, proyeccionEmpresa);

    return {
      meta,
      ventasDia: vendedor.ventasDia,
      ventasMes: ventasMesEmpresa,
      progresoMeta: meta > 0 ? Math.min((ventasMesEmpresa / meta) * 100, 100) : 0,
      proyeccionCierre: proyeccionEmpresa,
      cajaActual: 0,
      excedente: 0,
      gastosDia: 0,
      compromisosPagar: 0,
      compromisosSuplidores: 0,
      financieraExternaRecibosDia: 0,
      financieraExternaNombre: null,
      compromisoSemanaCount: 0,
      suplidorSemanaCount: 0,
      hasPreviousMonthHistory: false,
      finanzasEmpresas: [],
      vendedor,
    };
  }

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
    financieraExternaRes,
    camineroFinanceRes,
  ] = await Promise.all([
    supabase.from('facturas').select('total').eq('tenant_id', tenantId).gte('created_at', todayStart).lt('created_at', tomorrowStart).neq('estado', 'ANULADA'),
    supabase.from('facturas').select('total').eq('tenant_id', tenantId).gte('created_at', todayStart).lt('created_at', tomorrowStart).ilike('forma_pago', 'contado').neq('estado', 'ANULADA'),
    supabase.from('recibos_ingreso').select('monto_pagado').eq('tenant_id', tenantId).gte('created_at', todayStart).lt('created_at', tomorrowStart).eq('anulado', false),
    supabase.from('gastos_diarios').select('monto').eq('tenant_id', tenantId).eq('fecha', today).eq('anulado', false),
    supabase.from('compromisos').select('monto, fecha').eq('tenant_id', tenantId).eq('activo', true).lte('fecha', week.end),
    supabase.from('compras').select('monto_pendiente, total_compra, monto_pagado, fecha, dias_credito').eq('tenant_id', tenantId).ilike('forma_pago', 'CREDITO').eq('estado', 'PENDIENTE'),
    supabase.from('facturas').select('total').eq('tenant_id', tenantId).gte('created_at', month.start).lt('created_at', month.next).neq('estado', 'ANULADA'),
    supabase.from('facturas').select('total').eq('tenant_id', tenantId).gte('created_at', previousMonth.start).lt('created_at', previousMonth.next).neq('estado', 'ANULADA'),
    supabase.from('facturas').select('total').eq('tenant_id', tenantId).gte('created_at', historyAnchor).ilike('forma_pago', 'contado').neq('estado', 'ANULADA'),
    supabase.from('recibos_ingreso').select('monto_pagado').eq('tenant_id', tenantId).gte('created_at', historyAnchor).eq('anulado', false),
    supabase.from('compromisos').select('monto').eq('tenant_id', tenantId).gte('fecha_pago', historyAnchorDate).eq('activo', false),
    supabase.from('pagos_suplidores').select('monto_pagado').eq('tenant_id', tenantId).gte('created_at', historyAnchor).eq('anulado', false),
    supabase.from('compras').select('total_compra').eq('tenant_id', tenantId).gte('created_at', historyAnchor).ilike('forma_pago', 'contado').neq('estado', 'ANULADA'),
    supabase.from('gastos_diarios').select('monto').eq('tenant_id', tenantId).gte('fecha', historyAnchorDate).eq('anulado', false),
    fetchFinancieraExternaRecibosDia(today),
    fetchCamineroFinanceSummary(today, week.end),
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

  const vendedor = userId
    ? await fetchSellerDashboard(tenantId, userId, meta, ventasMes, proyeccionCierre)
    : null;

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
    financieraExternaRecibosDia: financieraExternaRes.total,
    financieraExternaNombre: financieraExternaRes.nombre,
    compromisoSemanaCount: (compromisosRes.data || []).length,
    suplidorSemanaCount: comprasSemana.length,
    hasPreviousMonthHistory: ventasMesAnterior > 0,
    finanzasEmpresas: camineroFinanceRes.length > 0
      ? camineroFinanceRes
      : [{
          tenantId,
          nombre: String(configEmpresa?.razon_social || configEmpresa?.nombre || 'Empresa'),
          gastosDia,
          gastosCount: (gastosHoyRes.data || []).length,
          compromisosPagar,
          compromisosCount: (compromisosRes.data || []).length,
          gastos: [],
          compromisos: [],
        }],
    vendedor,
  };
}
