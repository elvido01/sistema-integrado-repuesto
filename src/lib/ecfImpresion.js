// ============================================================
// Representación impresa del e-CF en los recibos de venta
// ------------------------------------------------------------
// (10/10/2026) La DGII exige que el papel de un comprobante electrónico
// lleve: el e-NCF, el título del tipo ("FACTURA DE CRÉDITO FISCAL
// ELECTRÓNICA"…), la fecha de vencimiento de la secuencia (menos E32/E34),
// el CÓDIGO DE SEGURIDAD, la FECHA DE FIRMA DIGITAL y el QR que abre la
// consulta en la DGII. Los recibos de MotoFlow solo imprimían "NCF: …".
//
// emitir-fiscal guarda esos datos en documentos_fiscales.request_payload.
// impresion (y los devuelve al emitir). prepararEcfImpresion() los junta en
// factura.ecf para que CUALQUIER formato (ticket 80mm/4", hoja, PDF,
// ESC/POS) los imprima — también al reimprimir desde el historial.
// ============================================================
import QRCode from 'qrcode';
import { supabase } from '@/lib/customSupabaseClient';
import { buildDgiiQrUrl } from '@/lib/dgiiRepresentacionImpresa';

export const TITULOS_ECF = {
  '31': 'FACTURA DE CRÉDITO FISCAL ELECTRÓNICA',
  '32': 'FACTURA DE CONSUMO ELECTRÓNICA',
  '33': 'NOTA DE DÉBITO ELECTRÓNICA',
  '34': 'NOTA DE CRÉDITO ELECTRÓNICA',
  '41': 'COMPRAS ELECTRÓNICO',
  '43': 'GASTOS MENORES ELECTRÓNICO',
  '44': 'REGÍMENES ESPECIALES ELECTRÓNICA',
  '45': 'GUBERNAMENTAL ELECTRÓNICO',
  '46': 'EXPORTACIONES ELECTRÓNICA',
  '47': 'PAGOS AL EXTERIOR ELECTRÓNICO',
};

export const esEncf = (n) => /^E\d{12}$/.test(String(n || '').trim());

/**
 * Devuelve la factura con `ecf` = { encf, tipo, titulo, codigo_seguridad,
 * fecha_firma, fecha_vencimiento, qr_url, qr_data_url } si su comprobante es
 * un e-NCF. Si no lo es (NCF de papel o sin NCF), la devuelve tal cual.
 * `factura.impresion_ecf` (lo que devuelve emitir-fiscal) evita la consulta.
 */
// ── (27/10/2026) Retenciones e inmuebles en la factura impresa ──────────
// Las retenciones las calcula la base al guardar las líneas (cliente agente
// de retención + líneas de servicio), así que aquí se LEEN de la factura.
// Y si alguna línea es un inmueble, la factura lleva la nota del traspaso.
// Ver sql/tipos_empresa_servicios_inmobiliaria.sql
async function completarExtras(factura) {
  if (!factura?.id || factura._extras) return factura;
  const out = { ...factura, _extras: true };
  try {
    const [{ data: f, error: e1 }, { data: dets, error: e2 }] = await Promise.all([
      supabase.from('facturas').select('itbis_retenido, isr_retenido').eq('id', factura.id).maybeSingle(),
      supabase.from('facturas_detalle').select('naturaleza').eq('factura_id', factura.id),
    ]);
    if (!e1 && f) { out.itbis_retenido = Number(f.itbis_retenido) || 0; out.isr_retenido = Number(f.isr_retenido) || 0; }
    if (!e2) out._tiene_inmueble = (dets || []).some((d) => d.naturaleza === 'inmueble');
  } catch (_) { /* sin las columnas nuevas: se imprime como siempre */ }
  return out;
}

const mon = (v) => `RD$ ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Bloque HTML: retenciones + neto a cobrar, y la nota del inmueble. '' si no aplica. */
export function extrasFacturaHtml(factura, { fuente = '12px' } = {}) {
  if (!factura) return '';
  const ri = Number(factura.itbis_retenido) || 0;
  const rs = Number(factura.isr_retenido) || 0;
  const partes = [];
  if (ri + rs > 0) {
    const fila = (k, v, b = false) => `<div style="display:flex;justify-content:space-between;${b ? 'font-weight:900;border-top:1px solid #000;padding-top:2px;' : ''}"><span>${k}</span><span>${v}</span></div>`;
    partes.push(`<div style="margin:6px 0 4px auto;max-width:300px;font-size:${fuente};line-height:1.35;">
      ${ri > 0 ? fila('ITBIS retenido por el cliente', `- ${mon(ri)}`) : ''}
      ${rs > 0 ? fila('ISR retenido por el cliente', `- ${mon(rs)}`) : ''}
      ${fila('NETO A COBRAR', mon((Number(factura.total) || 0) - ri - rs), true)}
    </div>`);
  }
  if (factura._tiene_inmueble) {
    partes.push(`<div style="margin:6px 0;font-size:${fuente};line-height:1.3;border:1px dashed #000;padding:4px 6px;">
      Inmueble: transferencia no gravada con ITBIS. El impuesto de transferencia inmobiliaria (3% sobre el mayor entre el valor del acto y la tabla de la DGII) lo paga el comprador en la DGII dentro de los 6 meses del acto de venta.
    </div>`);
  }
  return partes.join('');
}

export async function prepararEcfImpresion(facturaIn) {
  const factura = await completarExtras(facturaIn);
  if (!factura || factura.ecf) return factura;
  const encf = [factura.encf, factura.ncf].map((x) => String(x || '').trim()).find(esEncf);
  if (!encf) return factura;

  let imp = factura.impresion_ecf || null;
  if (!imp && factura.id) {
    try {
      const { data } = await supabase
        .from('documentos_fiscales')
        .select('request_payload')
        .eq('factura_id', factura.id)
        .eq('estado', 'emitido')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      imp = data?.request_payload?.impresion || null;
    } catch (_) { /* sin datos: se imprime el título y el e-NCF */ }
  }

  const tipo = encf.substring(1, 3);
  const ecf = {
    encf,
    tipo,
    titulo: TITULOS_ECF[tipo] || 'COMPROBANTE FISCAL ELECTRÓNICO',
    codigo_seguridad: imp?.codigo_seguridad || null,
    fecha_firma: imp?.fecha_firma || null,
    // La DGII pidió (Paso 6 de D Mario) que E32 y E34 NO lleven vencimiento.
    fecha_vencimiento: tipo === '32' || tipo === '34' ? null : (imp?.fecha_vencimiento || null),
    qr_url: null,
    qr_data_url: null,
  };
  if (imp?.codigo_seguridad && imp?.fecha_firma) {
    ecf.qr_url = buildDgiiQrUrl({
      tipo,
      encf,
      rncEmisor: imp.rnc_emisor,
      rncComprador: imp.rnc_comprador,
      fechaEmision: imp.fecha_emision,
      montoTotal: imp.monto_total,
      fechaFirma: imp.fecha_firma,
      codigoSeguridad: imp.codigo_seguridad,
      ambiente: imp.ambiente,
    });
    try {
      ecf.qr_data_url = await QRCode.toDataURL(ecf.qr_url, { errorCorrectionLevel: 'M', margin: 1, width: 320 });
    } catch (_) { /* sin imagen: quedan el código y la fecha */ }
  }
  return { ...factura, ecf };
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Línea de vencimiento para poner junto al e-NCF (vacía en E32/E34). */
export function ecfVenceHtml(ecf) {
  return ecf?.fecha_vencimiento ? `Válida hasta: <strong>${esc(ecf.fecha_vencimiento)}</strong>` : '';
}

/**
 * Bloque del QR para el final del recibo/factura (HTML).
 * `qr` = lado del QR (la DGII pide que sea legible: 2.5 cm o más).
 */
export function ecfBloqueHtml(ecf, { qr = '30mm', fuente = '11px' } = {}) {
  if (!ecf) return '';
  return `
    <div class="ecf-ri" style="text-align:center;margin-top:8px;font-size:${fuente};line-height:1.35;">
      ${ecf.qr_data_url ? `<img src="${ecf.qr_data_url}" alt="QR DGII" style="width:${qr};height:${qr};image-rendering:pixelated;" />` : ''}
      ${ecf.codigo_seguridad ? `<div>Código de seguridad: <strong>${esc(ecf.codigo_seguridad)}</strong></div>` : ''}
      ${ecf.fecha_firma ? `<div>Fecha de firma digital: ${esc(ecf.fecha_firma)}</div>` : ''}
    </div>`;
}
