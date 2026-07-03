import { supabase } from '../supabase/client';

export type ClienteFinanciera = {
  id: string;
  nombre: string;
  codigo?: string | null;
  rnc?: string | null;
  telefono?: string | null;
  direccion?: string | null;
};

export type CuotaFinanciera = {
  cuota_id: string;
  prestamo_id: string;
  prestamo_numero?: string | null;
  referencia?: string | null;
  fecha?: string | null;
  fecha_vencimiento?: string | null;
  monto_cuota: number;
  capital_pend: number;
  interes_pend: number;
  mora_pend: number;
  pendiente: number;
  vencida: boolean;
};

export type EstadoPrestamosFinanciera = {
  capital_pendiente: number;
  intereses_pendientes: number;
  mora_pendiente: number;
  balance_total: number;
  cuotas: CuotaFinanciera[];
};

export type PagoPrestamoFinancieraResult = {
  pago_id: string;
  numero: string;
  numero_interno?: string;
  total_pagado: number;
  sobrante: number;
  balance_anterior: number;
  balance_actual: number;
};

export type FinancieraDebugResumen = {
  tenant_actual?: string | null;
  financiera_tenant_id?: string | null;
  financiera_nombre?: string | null;
  clientes_total: number;
  clientes_activos: number;
  prestamos_activos: number;
};

const toNumber = (value: unknown) => Number(value || 0);
const DIAS_GRACIA_PAGO = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const today = () => new Date().toISOString().slice(0, 10);
const diasDesde = (fecha?: string | null, hasta = today()) => {
  if (!fecha) return 0;
  const inicio = new Date(`${fecha}T00:00:00`);
  const fin = new Date(`${hasta}T00:00:00`);
  return Math.max(0, Math.floor((fin.getTime() - inicio.getTime()) / DAY_MS));
};

const normalizeEstado = (data: any): EstadoPrestamosFinanciera => ({
  capital_pendiente: toNumber(data?.capital_pendiente),
  intereses_pendientes: toNumber(data?.intereses_pendientes),
  mora_pendiente: toNumber(data?.mora_pendiente),
  balance_total: toNumber(data?.balance_total),
  cuotas: ((data?.cuotas || []) as any[]).map((cuota) => ({
    ...cuota,
    monto_cuota: toNumber(cuota?.monto_cuota),
    capital_pend: toNumber(cuota?.capital_pend),
    interes_pend: toNumber(cuota?.interes_pend),
    mora_pend: toNumber(cuota?.mora_pend),
    pendiente: toNumber(cuota?.pendiente),
    vencida: Boolean(cuota?.vencida) && diasDesde(cuota?.fecha_vencimiento) > DIAS_GRACIA_PAGO,
  })),
});

export async function buscarClientesFinanciera(search = ''): Promise<ClienteFinanciera[]> {
  const { data, error } = await supabase.rpc('buscar_clientes_financiera_externa', {
    p_search: search.trim() || null,
  });
  if (error) throw error;
  return (data || []) as ClienteFinanciera[];
}

export async function debugFinancieraExterna(): Promise<FinancieraDebugResumen | null> {
  const { data, error } = await supabase.rpc('debug_financiera_externa_resumen');
  if (error) {
    console.warn('[ReciboPagoFinanciera] Debug no disponible:', error.message);
    return null;
  }
  return {
    tenant_actual: data?.tenant_actual || null,
    financiera_tenant_id: data?.financiera_tenant_id || null,
    financiera_nombre: data?.financiera_nombre || null,
    clientes_total: toNumber(data?.clientes_total),
    clientes_activos: toNumber(data?.clientes_activos),
    prestamos_activos: toNumber(data?.prestamos_activos),
  };
}

export async function getPrestamosClienteFinanciera(clienteId: string): Promise<EstadoPrestamosFinanciera> {
  const { data, error } = await supabase.rpc('get_prestamos_cliente_financiera_externa', {
    p_cliente_id: clienteId,
  });
  if (error) throw error;
  return normalizeEstado(data);
}

export async function registrarPagoPrestamoFinanciera(params: {
  clienteId: string;
  monto: number;
  fecha?: string;
  cobrador?: string | null;
  formaPago?: string;
  cuenta?: string | null;
  banco?: string | null;
  comentarios?: string | null;
  prestamoId?: string | null;
  cuotaIds?: string[] | null;
}): Promise<PagoPrestamoFinancieraResult> {
  const rpcParams: Record<string, unknown> = {
    p_cliente_id: params.clienteId,
    p_monto: params.monto,
    p_fecha: params.fecha || null,
    p_cobrador: params.cobrador || null,
    p_forma_pago: params.formaPago || 'Efectivo',
    p_cuenta: params.cuenta || null,
    p_banco: params.banco || null,
    p_comentarios: params.comentarios || null,
    p_prestamo_id: params.prestamoId || null,
  };
  if (params.cuotaIds?.length) {
    rpcParams.p_cuota_ids = params.cuotaIds;
  }

  const { data, error } = await supabase.rpc('registrar_pago_prestamo_financiera_externa', rpcParams);
  if (error) throw error;
  return {
    pago_id: data?.pago_id,
    numero: String(data?.numero || ''),
    numero_interno: data?.numero_interno ? String(data.numero_interno) : undefined,
    total_pagado: toNumber(data?.total_pagado),
    sobrante: toNumber(data?.sobrante),
    balance_anterior: toNumber(data?.balance_anterior),
    balance_actual: toNumber(data?.balance_actual),
  };
}
