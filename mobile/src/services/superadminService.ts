import { supabase } from '../supabase/client';

// (23/11/2026) Panel de super administrador en la app: las mismas RPC que usa
// la web (AdminDashboard / AdminPagosReview), todas validan is_superadmin en
// el servidor. admin_registrar_pago es nueva: pago en efectivo o transferencia
// que el cliente no subió (sql/admin_registrar_pago_membresia.sql).

export type SuscripcionResumen = {
  id: string;
  estado: 'activo' | 'trial' | 'vencido' | string;
  plan_nombre: string | null;
  plan_precio: number | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  dias_restantes: number | null;
  metodo_pago: string | null;
  monto_pagado: number | null;
};

export type EmpresaAdmin = {
  id: string;
  nombre: string;
  email: string | null;
  rnc: string | null;
  telefono: string | null;
  activo: boolean;
  plan: string | null;
  created_at: string;
  suscripcion: SuscripcionResumen | null;
  total_usuarios: number;
  total_productos: number;
  total_ventas_mes: number;
};

export type Plan = { id: string; nombre: string; precio: number; duracion_dias: number };

export type PagoPendiente = {
  id: string;
  tenant_id: string;
  empresa_nombre: string;
  empresa_email: string | null;
  plan_nombre: string;
  plan_precio: number;
  monto: number;
  ciclo: string | null;
  duracion_dias: number | null;
  referencia: string | null;
  banco_origen: string | null;
  titular_cuenta: string | null;
  comprobante_url: string | null;
  created_at: string;
};

const sinError = <T,>(r: { data: T; error: any }): T => {
  if (r.error) throw new Error(r.error.message || 'Error del servidor');
  return r.data;
};

export async function fetchEmpresasAdmin(): Promise<EmpresaAdmin[]> {
  const data = sinError(await supabase.rpc('admin_get_tenants_detalle'));
  return (Array.isArray(data) ? data : []) as EmpresaAdmin[];
}

export async function fetchPlanes(): Promise<Plan[]> {
  const data = sinError(await supabase.from('planes').select('id, nombre, precio, duracion_dias')
    .eq('activo', true).order('precio', { ascending: true }));
  return (data || []) as Plan[];
}

export async function fetchPagosPendientes(): Promise<PagoPendiente[]> {
  const data = sinError(await supabase.rpc('admin_get_pagos_pendientes'));
  return (Array.isArray(data) ? data : []) as PagoPendiente[];
}

export async function aprobarPago(pagoId: string) {
  sinError(await supabase.rpc('admin_aprobar_pago', { p_pago_id: pagoId, p_notas: 'Comprobante verificado (app)' }));
}

export async function rechazarPago(pagoId: string, motivo: string) {
  sinError(await supabase.rpc('admin_rechazar_pago', { p_pago_id: pagoId, p_motivo: motivo || 'Comprobante no válido' }));
}

export type RegistrarPagoInput = {
  tenantId: string;
  plan: string;
  meses: number;
  monto: number;
  metodo: 'efectivo' | 'transferencia' | 'deposito' | 'tarjeta';
  referencia?: string;
  notas?: string;
};

export async function registrarPago(i: RegistrarPagoInput): Promise<{ fecha_fin: string; plan: string; dias: number }> {
  return sinError(await supabase.rpc('admin_registrar_pago', {
    p_tenant_id: i.tenantId, p_plan_nombre: i.plan, p_meses: i.meses, p_monto: i.monto,
    p_metodo: i.metodo, p_referencia: i.referencia || null, p_notas: i.notas || null,
  })) as any;
}

export async function cambiarPlan(tenantId: string, plan: string) {
  sinError(await supabase.rpc('admin_cambiar_plan', { p_tenant_id: tenantId, p_plan_nombre: plan }));
}

export async function extenderSuscripcion(tenantId: string, dias: number) {
  sinError(await supabase.rpc('admin_extender_suscripcion', { p_tenant_id: tenantId, p_dias: dias }));
}

export async function activarEmpresa(tenantId: string) {
  sinError(await supabase.rpc('admin_activar_empresa', { p_tenant_id: tenantId }));
}

export async function suspenderEmpresa(tenantId: string) {
  sinError(await supabase.rpc('admin_suspender_empresa', { p_tenant_id: tenantId }));
}

// El bucket 'pagos' es privado: la URL guardada se cambia por un enlace
// firmado de 10 minutos (igual que la web).
const MARCA_PAGOS = '/storage/v1/object/public/pagos/';
export async function enlaceComprobante(url: string | null): Promise<string | null> {
  if (!url) return null;
  const i = url.indexOf(MARCA_PAGOS);
  if (i < 0) return url;
  const ruta = decodeURIComponent(url.slice(i + MARCA_PAGOS.length).split('?')[0]);
  const { data, error } = await supabase.storage.from('pagos').createSignedUrl(ruta, 600);
  return error || !data?.signedUrl ? url : data.signedUrl;
}
