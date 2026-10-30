// ============================================================
// Facturación electrónica desde el POS móvil (30/10/2026)
// ------------------------------------------------------------
// Mismo camino que la web (src/pages/VentasPage.jsx → emitirECF):
//  - la factura se graba igual que siempre;
//  - si la empresa tiene la integración fiscal ACTIVA, se llama a la Edge
//    Function emitir-fiscal (action 'emitir_factura');
//  - en PRODUCCIÓN se espera, porque el e-NCF va impreso en el papel;
//  - en pruebas se manda por detrás y no se hace esperar al cliente.
// El papel de un e-CF lleva: título del tipo, e-NCF, código de seguridad,
// fecha de firma y el QR de consulta de la DGII (src/lib/ecfImpresion.js).
// ============================================================
import { supabase, supabaseUrl as SUPABASE_URL } from '@/src/supabase/client';

export type FiscalConfig = { activo: boolean; modo: string | null };

export async function getFiscalConfig(tenantId?: string | null): Promise<FiscalConfig> {
  if (!tenantId) return { activo: false, modo: null };
  // Si la consulta falla se LANZA: tratar el error como "sin e-CF" hacía
  // que una empresa en producción facturara sin e-NCF sin que nadie lo notara.
  const { data, error } = await supabase
    .from('integraciones_fiscales')
    .select('activo, modo')
    .eq('tenant_id', tenantId)
    .eq('activo', true)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return { activo: !!data, modo: data?.modo || null };
}

export type ResultadoEmision = {
  ok: boolean;
  ncf?: string | null;
  proveedor_number?: string | null;
  impresion?: Record<string, any> | null;
  error?: string;
};

export async function emitirFacturaElectronica(facturaId: string): Promise<ResultadoEmision> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { ok: false, error: 'Sesión vencida: vuelve a entrar.' };
  // Con tiempo límite: el fetch de React Native no tiene, y sin datos móviles
  // el botón Cobrar se quedaba girando para siempre con la venta ya grabada.
  const control = new AbortController();
  // 150 s = el límite de la Edge Function: cortar antes imprimía el ticket
  // sin e-NCF mientras el servidor sí lo terminaba de emitir.
  const reloj = setTimeout(() => control.abort(), 150_000);
  let resp: Response;
  try {
    resp = await fetch(`${SUPABASE_URL}/functions/v1/emitir-fiscal`, {
    signal: control.signal,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action: 'emitir_factura', factura_id: facturaId }),
  });
  } catch (e: any) {
    const tarde = e?.name === 'AbortError';
    return { ok: false, error: tarde ? 'la DGII no respondió en 150 s (puede que sí se haya emitido: míralo en el Monitor DGII)' : `sin conexión (${e?.message || e})` };
  } finally {
    clearTimeout(reloj);
  }
  try {
    return await resp.json();
  } catch {
    return { ok: false, error: `Respuesta inválida del servidor (${resp.status}).` };
  }
}

export const TITULOS_ECF: Record<string, string> = {
  '31': 'FACTURA DE CREDITO FISCAL ELECTRONICA',
  '32': 'FACTURA DE CONSUMO ELECTRONICA',
  '33': 'NOTA DE DEBITO ELECTRONICA',
  '34': 'NOTA DE CREDITO ELECTRONICA',
};

export const esEncf = (n: unknown) => /^E\d{12}$/.test(String(n || '').trim());

export type DatosEcf = {
  encf: string;
  tipo: string;
  titulo: string;
  codigo_seguridad: string | null;
  fecha_firma: string | null;
  fecha_vencimiento: string | null;
  qr_url: string | null;
};

// Copia de buildDgiiQrUrl (src/lib/dgiiRepresentacionImpresa.js).
function qrUrl(d: { tipo: string; encf: string; imp: Record<string, any> }) {
  const monto = (Number(String(d.imp.monto_total || '0').replace(/,/g, '')) || 0).toFixed(2);
  const ambiente = String(d.imp.ambiente || '').trim();
  const env = !ambiente || ambiente === 'Produccion' ? 'ecf' : ambiente.toLowerCase();
  const e = encodeURIComponent;
  if (d.tipo === '32' && Number(monto) < 250000) {
    return `https://fc.dgii.gov.do/${env}/consultatimbrefc?rncemisor=${e(d.imp.rnc_emisor)}`
      + `&encf=${e(d.encf)}&montototal=${e(Number(monto))}&codigoseguridad=${e(d.imp.codigo_seguridad)}`;
  }
  const comprador = d.imp.rnc_comprador ? `RncComprador=${e(d.imp.rnc_comprador)}&` : '';
  return `https://ecf.dgii.gov.do/${env}/consultatimbre?rncemisor=${e(d.imp.rnc_emisor)}`
    + `&${comprador}encf=${e(d.encf)}&fechaemision=${e(d.imp.fecha_emision)}&montototal=${e(monto)}`
    + `&fechafirma=${e(d.imp.fecha_firma)}&codigoseguridad=${e(d.imp.codigo_seguridad)}`;
}

/** Datos para imprimir el e-CF, o null si el comprobante no es un e-NCF. */
export function datosEcf(encf: string | null | undefined, imp: Record<string, any> | null | undefined): DatosEcf | null {
  if (!esEncf(encf)) return null;
  const n = String(encf).trim();
  const tipo = n.substring(1, 3);
  const completo = !!(imp?.codigo_seguridad && imp?.fecha_firma);
  return {
    encf: n,
    tipo,
    titulo: TITULOS_ECF[tipo] || 'COMPROBANTE FISCAL ELECTRONICO',
    codigo_seguridad: imp?.codigo_seguridad || null,
    fecha_firma: imp?.fecha_firma || null,
    // La DGII pidió que E32 y E34 NO lleven vencimiento.
    fecha_vencimiento: tipo === '32' || tipo === '34' ? null : (imp?.fecha_vencimiento || null),
    qr_url: completo ? qrUrl({ tipo, encf: n, imp: imp as Record<string, any> }) : null,
  };
}

/** RNC (9) o cédula (11): lo único con lo que emitir-fiscal saca un E31. */
export function rncValido(rnc: unknown) {
  const dig = String(rnc || '').replace(/\D/g, '');
  return (dig.length === 9 || dig.length === 11) && !/^0+$/.test(dig);
}

/** Cédula/RNC (9 u 11 dígitos) o pasaporte: lo que la DGII acepta como comprador identificado. */
export function documentoValido(rnc: unknown) {
  if (rncValido(rnc)) return true;
  const pas = String(rnc || '').toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z0-9]{5,20}$/.test(pas) && /[A-Z]/.test(pas) && /[1-9]/.test(pas);
}
