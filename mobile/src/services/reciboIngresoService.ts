import { supabase } from '../supabase/client';

export type ClienteRecibo = {
  id: string;
  nombre: string;
  rnc?: string | null;
  telefono?: string | null;
  direccion?: string | null;
};

export type FacturaPendiente = {
  id: string;
  numero?: string | null;
  referencia?: string | null;
  fecha?: string | null;
  total?: number | null;
  monto_pendiente: number;
  abono: number;
  selected: boolean;
};

export type FacturaEmitidaRecibo = {
  id: string;
  numero?: number | string | null;
  fecha?: string | null;
  created_at?: string | null;
  subtotal?: number | null;
  descuento?: number | null;
  recargo?: number | null;
  itbis?: number | null;
  total?: number | null;
  forma_pago?: string | null;
  tipo_pago?: string | null;
  monto_pagado?: number | null;
  monto_pendiente?: number | null;
  manual_cliente_nombre?: string | null;
  clientes?: ClienteRecibo | null;
  facturas_detalle?: {
    id?: string;
    codigo?: string | null;
    descripcion?: string | null;
    cantidad?: number | null;
    precio?: number | null;
    itbis?: number | null;
    importe?: number | null;
  }[];
};

export type ReciboEmitido = {
  id: string;
  numero?: string | null;
  fecha?: string | null;
  monto_pagado?: number | null;
  concepto?: string | null;
  formas_pago?: FormaPagoRecibo[] | null;
  clientes?: ClienteRecibo | null;
  recibos_ingreso_detalle?: {
    id?: string;
    factura_id?: string | null;
    monto_abonado?: number | null;
    facturas?: {
      id?: string;
      numero?: number | string | null;
      total?: number | null;
      monto_pendiente?: number | null;
    } | null;
  }[];
};

export type DatosClienteRecibo = {
  balance_anterior: number;
  ultimo_pago?: unknown;
  facturas_pendientes: FacturaPendiente[];
};

export type FormaPagoRecibo = {
  id: number;
  forma: string;
  monto: number;
  referencia: string;
  banco?: string;
  fecha?: string;
  observaciones?: string;
};

export type EmpresaRecibo = {
  nombre?: string | null;
  razon_social?: string | null;
  rnc?: string | null;
  direccion1?: string | null;
  direccion2?: string | null;
  telefono?: string | null;
};

const toNumber = (value: unknown) => Number(value || 0);

const normalizeFacturaEmitida = (factura: any): FacturaEmitidaRecibo => {
  const total = toNumber(factura?.total);
  const montoPendiente = toNumber(factura?.monto_pendiente ?? factura?.balance);
  return {
    ...factura,
    total,
    monto_pendiente: montoPendiente,
    monto_pagado: Math.max(0, total - montoPendiente),
  } as FacturaEmitidaRecibo;
};

const nextISODate = (date: string) => {
  const d = new Date(`${String(date || '').slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

export async function fetchClientesRecibo(search = '') {
  let query = supabase
    .from('clientes')
    .select('id, nombre, rnc, telefono, direccion')
    .eq('activo', true)
    .order('nombre', { ascending: true })
    .limit(30);

  const term = search.trim();
  if (term) {
    query = query.or(`nombre.ilike.%${term}%,rnc.ilike.%${term}%,telefono.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as ClienteRecibo[];
}

export async function getNextReciboNumero() {
  const { data, error } = await supabase.rpc('get_next_recibo_ingreso_numero');
  if (error) throw error;
  return String(data || '');
}

export async function fetchEmpresaRecibo(empresaId?: string | null): Promise<EmpresaRecibo | null> {
  let query = supabase
    .from('config_empresa')
    .select('nombre, razon_social, rnc, direccion1, direccion2, telefono')
    .limit(1);

  if (empresaId) {
    query = query.eq('id', empresaId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as EmpresaRecibo | null;
}

export async function fetchDatosClienteRecibo(clienteId: string): Promise<DatosClienteRecibo> {
  const { data, error } = await supabase.rpc('get_datos_cliente_para_recibo', {
    p_cliente_id: clienteId,
  });
  if (error) throw error;

  const facturas = ((data?.facturas_pendientes || []) as any[])
    .map((f) => ({
      ...f,
      total: toNumber(f.total),
      monto_pendiente: Math.max(0, toNumber(f.monto_pendiente)),
      abono: 0,
      selected: true,
    }))
    .sort((a, b) => {
      const da = a.fecha ? new Date(a.fecha).getTime() : Number.MAX_SAFE_INTEGER;
      const db = b.fecha ? new Date(b.fecha).getTime() : Number.MAX_SAFE_INTEGER;
      return da - db;
    });

  return {
    balance_anterior: toNumber(data?.balance_anterior),
    ultimo_pago: data?.ultimo_pago,
    facturas_pendientes: facturas,
  };
}

export async function crearReciboIngreso(params: {
  tenantId?: string | null;
  clienteId: string;
  fecha: string;
  totalAbonos: number;
  formasPago: FormaPagoRecibo[];
  facturas: FacturaPendiente[];
}) {
  const reciboData = {
    tenant_id: params.tenantId,
    cliente_id: params.clienteId,
    fecha: params.fecha,
    monto_pagado: params.totalAbonos,
    concepto: 'Pago/Abono a facturas',
    formas_pago: params.formasPago,
  };

  const abonosData = params.facturas
    .filter((f) => Number(f.abono) > 0)
    .map((f) => ({
      tenant_id: params.tenantId,
      factura_id: f.id,
      monto_abono: Number(f.abono),
    }));

  const { data, error } = await supabase.rpc('crear_recibo_ingreso_y_actualizar_facturas', {
    p_recibo_data: reciboData,
    p_abonos_data: abonosData,
  });
  if (error) throw error;
  return String(data || '');
}

export async function fetchFacturasEmitidasCliente(
  clienteId: string,
  fechaInicial: string,
  fechaFinal: string
): Promise<FacturaEmitidaRecibo[]> {
  const startDay = String(fechaInicial || '').slice(0, 10);
  const nextEndDay = nextISODate(String(fechaFinal || fechaInicial || '').slice(0, 10));
  const { data, error } = await supabase
    .from('facturas')
    .select(`
      id, numero, fecha, created_at, subtotal, descuento, recargo, itbis, total, forma_pago, tipo_pago,
      monto_pendiente, manual_cliente_nombre,
      clientes(id, nombre, rnc, telefono, direccion),
      facturas_detalle(id, codigo, descripcion, cantidad, precio, itbis, importe)
    `)
    .eq('cliente_id', clienteId)
    .or(`and(fecha.gte.${startDay},fecha.lt.${nextEndDay}),and(created_at.gte.${startDay},created_at.lt.${nextEndDay})`)
    .order('fecha', { ascending: false });

  if (error) throw error;
  return (data || []).map(normalizeFacturaEmitida);
}

export async function fetchFacturasEmitidasPorIds(ids: string[]): Promise<FacturaEmitidaRecibo[]> {
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('facturas')
    .select(`
      id, numero, fecha, created_at, subtotal, descuento, recargo, itbis, total, forma_pago, tipo_pago,
      monto_pendiente, manual_cliente_nombre,
      clientes(id, nombre, rnc, telefono, direccion),
      facturas_detalle(id, codigo, descripcion, cantidad, precio, itbis, importe)
    `)
    .in('id', ids);

  if (error) throw error;
  return (data || []).map(normalizeFacturaEmitida);
}

export async function fetchRecibosEmitidosCliente(
  clienteId: string,
  fechaInicial: string,
  fechaFinal: string
): Promise<ReciboEmitido[]> {
  const startDay = String(fechaInicial || '').slice(0, 10);
  const nextEndDay = nextISODate(String(fechaFinal || fechaInicial || '').slice(0, 10));
  const { data, error } = await supabase
    .from('recibos_ingreso')
    .select(`
      id, numero, fecha, monto_pagado, concepto, formas_pago,
      clientes(id, nombre, rnc, telefono, direccion),
      recibos_ingreso_detalle(id, factura_id, monto_abonado, facturas(id, numero, total, monto_pendiente))
    `)
    .eq('cliente_id', clienteId)
    .gte('fecha', startDay)
    .lt('fecha', nextEndDay)
    .order('fecha', { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as ReciboEmitido[];
}
