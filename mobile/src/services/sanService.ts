import { supabase } from '../supabase/client';
import { construirResumenSan, totalesSan, SanResumen } from './sanResumen';

const hoyRD = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });

export type SanDashboard = {
  sanes: SanResumen[];
  totales: ReturnType<typeof totalesSan>;
};

export const SAN_VACIO: SanDashboard = {
  sanes: [],
  totales: { activos: 0, comprometido: 0, ahorrado: 0, porcentaje: 0, faltaAlDia: 0 },
};

type SanOpts = {
  // Caminero y MotoPréstamos son de los mismos dueños; MotoPréstamos no
  // tiene app. Un ADMIN de Caminero puede ver los SAN de la financiera
  // aunque vivan en otro tenant, vía RPC SECURITY DEFINER (el RLS no lo
  // deja leer esas filas directo). Igual que la tarjeta Recibos Financiera.
  comoAdminFinanciera?: boolean;
};

// Trae los SAN activos + SOLO los días no pagados hasta hoy (lo que hace
// falta para estar al día). No baja el calendario completo: un SAN de 365
// días traería 365 filas al teléfono para nada.
export async function fetchSanDashboard(
  tenantId: string,
  opts: SanOpts = {},
): Promise<SanDashboard> {
  if (!tenantId) return SAN_VACIO;
  const hoy = hoyRD();

  const { data: sanes, error } = await supabase
    .from('san')
    .select('id, nombre, monto_objetivo, monto_ahorrado, pago_diario, fecha_fin, dias')
    .eq('tenant_id', tenantId)
    .eq('estado', 'Activo')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const ids = (sanes || []).map((s: any) => s.id);

  // La empresa activa no tiene SAN propios. Si el usuario es admin,
  // buscamos los de la financiera (MotoPréstamos) por RPC.
  if (!ids.length && opts.comoAdminFinanciera) {
    return fetchSanFinancieraExterna(hoy);
  }

  let pendientes: any[] = [];
  if (ids.length) {
    const { data, error: errPagos } = await supabase
      .from('san_pagos')
      .select('san_id, fecha_programada, saldo_pendiente')
      .in('san_id', ids)
      .neq('estado', 'Pagado')
      .lte('fecha_programada', hoy);
    if (errPagos) throw errPagos;
    pendientes = data || [];
  }

  const resumenes = construirResumenSan(sanes as any, pendientes as any, hoy);
  return { sanes: resumenes, totales: totalesSan(resumenes) };
}

// SAN de la financiera para un admin de Caminero (cross-tenant vía RPC).
async function fetchSanFinancieraExterna(hoy: string): Promise<SanDashboard> {
  const { data, error } = await supabase.rpc('get_san_financiera_externa');
  if (error) throw error;
  const payload = (data || {}) as { sanes?: any[]; pendientes?: any[] };
  const resumenes = construirResumenSan(payload.sanes || [], payload.pendientes || [], hoy);
  return { sanes: resumenes, totales: totalesSan(resumenes) };
}

// Tiempo real: cualquier pago o cambio de SAN del tenant dispara onChange.
export function suscribirSan(tenantId: string, onChange: () => void) {
  if (!tenantId) return () => undefined;
  const canal = supabase
    .channel(`san-movil-${tenantId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'san', filter: `tenant_id=eq.${tenantId}` }, onChange)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'san_pagos', filter: `tenant_id=eq.${tenantId}` }, onChange)
    .subscribe();

  return () => { supabase.removeChannel(canal); };
}
