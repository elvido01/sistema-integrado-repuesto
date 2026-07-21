import { supabase } from '../supabase/client';

export type CuentaBanco = {
  id: string;
  nombre: string;
  saldo: number;
  moneda: string;
  empresa?: string | null;
};

// Cuentas bancarias con su saldo para el dashboard móvil.
//
// Caminero Motors y MotoPréstamos Los Naranjos son los mismos dueños y
// comparten la cuenta del móvil, pero son tenants distintos: las cuentas
// del banco están del lado de la financiera. Por eso un gerencial ve las
// dos: las propias (RLS normal) + las de la financiera vía RPC
// SECURITY DEFINER. Un vendedor solo vería las propias, y ni eso si no
// tiene permiso.
export async function fetchCuentasBanco(
  tenantId: string,
  opts: { comoGerencial?: boolean } = {},
): Promise<CuentaBanco[]> {
  if (!tenantId) return [];

  const propias = await cuentasPropias(tenantId);
  if (!opts.comoGerencial) return propias;

  let externas: CuentaBanco[] = [];
  try {
    const { data, error } = await supabase.rpc('get_cuentas_financiera_externa');
    if (error) throw error;
    const nombreEmpresa = (data as any)?.nombre || null;
    externas = (((data as any)?.cuentas || []) as any[]).map((c) => ({
      id: c.id,
      nombre: c.nombre,
      saldo: Number(c.saldo) || 0,
      moneda: c.moneda,
      empresa: nombreEmpresa,
    }));
  } catch {
    /* sin financiera vinculada: se queda con las propias */
  }

  const vistas = new Set(propias.map((c) => c.id));
  return [...propias, ...externas.filter((c) => !vistas.has(c.id))];
}

async function cuentasPropias(tenantId: string): Promise<CuentaBanco[]> {
  const { data, error } = await supabase
    .from('cuentas_bancarias_saldos')
    .select('id, banco, alias, saldo, moneda')
    .eq('tenant_id', tenantId)
    .eq('activo', true)
    .order('orden')
    .order('banco');
  if (error) return [];
  return (data || []).map((c: any) => ({
    id: c.id,
    nombre: `${c.banco}${c.alias ? ` — ${c.alias}` : ''}`,
    saldo: Number(c.saldo) || 0,
    moneda: c.moneda,
    empresa: null,
  }));
}

export const totalCuentas = (cuentas: CuentaBanco[]) =>
  Math.round(cuentas.reduce((s, c) => s + (Number(c.saldo) || 0), 0) * 100) / 100;
