// ══════════════════════════════════════════════════════════════════
// Exportadores DGII (República Dominicana) — 606 / 607 / 608
// Formatos oficiales DGII: campos separados por pipe (|),
// un registro por línea, fechas YYYYMMDD, montos con 2 decimales.
// ══════════════════════════════════════════════════════════════════

const pad = (n, len = 2) => String(n).padStart(len, '0');

// Fecha YYYYMMDD a partir de Date o string ISO
export const fmtFecha = (d) => {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}`;
};

// Monto con 2 decimales, sin separadores de miles
export const fmtMonto = (v) => {
  const n = parseFloat(v || 0);
  return (isNaN(n) ? 0 : n).toFixed(2);
};

// Limpia cédula/RNC: solo dígitos
export const cleanRncCedula = (v) => String(v || '').replace(/\D/g, '');

// Detecta tipo identificación: 1=RNC (9 díg), 2=Cédula (11 díg), 3=Pasaporte/otro
export const tipoIdentificacion = (rncCedula) => {
  const c = cleanRncCedula(rncCedula);
  if (c.length === 9) return '1';
  if (c.length === 11) return '2';
  return '3';
};

// ─────────────────────────────────────────────────────────
// 607 — VENTAS (Ingresos)
// ─────────────────────────────────────────────────────────
// Columnas oficiales:
// 1. RNC/Cédula  2. Tipo ID  3. NCF  4. NCF modificado  5. Tipo ingreso
// 6. Fecha comprobante  7. Fecha retención  8. Monto facturado
// 9. ITBIS facturado  10. ITBIS retenido por terceros  11. ITBIS percibido
// 12. Retención renta  13. ISR percibido  14. ISC  15. Otros impuestos
// 16. Monto propina legal  17. Efectivo  18. Cheque/Transf  19. Tarjeta
// 20. Crédito  21. Bonos  22. Permuta  23. Otras formas
export const generar607 = (ventas) => {
  return ventas.map(v => {
    const rnc = cleanRncCedula(v.cliente_rnc);
    const tipoId = rnc ? tipoIdentificacion(rnc) : '';
    const formaPago = (v.forma_pago || 'EFECTIVO').toUpperCase();
    const tipoPago = (v.tipo_pago || 'contado').toLowerCase();

    // Distribución por forma de pago (monto total en una sola columna)
    const monto = parseFloat(v.total || 0);
    const esCredito = tipoPago === 'credito' || tipoPago === 'crédito';
    const efectivo = !esCredito && formaPago.includes('EFECTIVO') ? monto : 0;
    const cheque = !esCredito && (formaPago.includes('CHEQUE') || formaPago.includes('TRANSFER') || formaPago.includes('DEPOSIT')) ? monto : 0;
    const tarjeta = !esCredito && (formaPago.includes('TARJETA') || formaPago.includes('VISA') || formaPago.includes('MASTER')) ? monto : 0;
    const credito = esCredito ? monto : 0;
    const otros = (efectivo + cheque + tarjeta + credito === 0) ? monto : 0;

    const fila = [
      rnc,                             // 1
      tipoId,                          // 2
      v.ncf || '',                     // 3
      v.ncf_modificado || '',          // 4
      '01',                            // 5 Tipo ingreso: operaciones (default)
      fmtFecha(v.fecha),               // 6
      '',                              // 7 fecha retención
      fmtMonto(v.subtotal),            // 8 monto facturado (sin ITBIS)
      fmtMonto(v.itbis),               // 9
      '0.00',                          // 10
      '0.00',                          // 11
      '0.00',                          // 12
      '0.00',                          // 13
      '0.00',                          // 14
      '0.00',                          // 15
      '0.00',                          // 16
      fmtMonto(efectivo),              // 17
      fmtMonto(cheque),                // 18
      fmtMonto(tarjeta),               // 19
      fmtMonto(credito),               // 20
      '0.00',                          // 21
      '0.00',                          // 22
      fmtMonto(otros),                 // 23
    ];
    return fila.join('|');
  }).join('\n');
};

// ─────────────────────────────────────────────────────────
// 606 — COMPRAS (Gastos)
// ─────────────────────────────────────────────────────────
// 1. RNC/Cédula Suplidor  2. Tipo ID  3. Tipo bienes/servicios
// 4. NCF  5. NCF modificado  6. Fecha comprobante  7. Fecha pago
// 8. Monto servicios  9. Monto bienes  10. Total facturado
// 11. ITBIS facturado  12. ITBIS retenido  13. ITBIS proporcionalidad
// 14. ITBIS al costo  15. ITBIS adelantar  16. ITBIS percibido compras
// 17. Tipo retención ISR  18. Monto retención renta  19. ISR percibido
// 20. ISC  21. Otros impuestos  22. Propina legal  23. Forma de pago
export const generar606 = (compras) => {
  return compras.map(c => {
    const rnc = cleanRncCedula(c.suplidor_rnc);
    const tipoId = rnc ? tipoIdentificacion(rnc) : '';
    const tipoBienes = c.tipo_bienes_servicios || '09'; // default: gastos generales

    const formaPago = (c.forma_pago || 'EFECTIVO').toUpperCase();
    const tipoPagoDgii = formaPago.includes('EFECTIVO') ? '01'
      : (formaPago.includes('CHEQUE') || formaPago.includes('TRANSFER') || formaPago.includes('DEPOSIT')) ? '02'
      : formaPago.includes('TARJETA') ? '03'
      : formaPago.includes('CREDITO') || formaPago.includes('CRÉDITO') ? '04'
      : '07';

    const itbisRetenido = parseFloat(c.itbis_total || 0) * parseFloat(c.itbis_retenido_pct || 0) / 100;
    const isrRetenido = parseFloat(c.total_compra || 0) * parseFloat(c.isr_retenido_pct || 0) / 100;

    const fila = [
      rnc,                             // 1
      tipoId,                          // 2
      tipoBienes,                      // 3
      c.ncf || '',                     // 4
      c.ncf_modificado || '',          // 5
      fmtFecha(c.fecha),               // 6
      fmtFecha(c.fecha_pago || c.fecha), // 7
      '0.00',                          // 8 monto servicios
      fmtMonto(c.total_gravado),       // 9 monto bienes
      fmtMonto(c.total_compra),        // 10
      fmtMonto(c.itbis_total),         // 11
      fmtMonto(itbisRetenido),         // 12
      '0.00',                          // 13
      '0.00',                          // 14
      fmtMonto(c.itbis_total),         // 15 ITBIS por adelantar (default = facturado)
      '0.00',                          // 16
      '',                              // 17 tipo retención ISR
      fmtMonto(isrRetenido),           // 18
      '0.00',                          // 19
      '0.00',                          // 20
      '0.00',                          // 21
      '0.00',                          // 22
      tipoPagoDgii,                    // 23
    ];
    return fila.join('|');
  }).join('\n');
};

// ─────────────────────────────────────────────────────────
// 608 — NCF ANULADOS
// ─────────────────────────────────────────────────────────
// 1. NCF  2. Fecha comprobante (YYYYMMDD)  3. Tipo anulación (01-07)
// Tipos: 01 Deterioro imprenta, 02 Errores impresión, 03 Impresión defectuosa,
// 04 Duplicidad, 05 Corrección info, 06 Cese operaciones, 07 Pérdida.
export const generar608 = (anulados) => {
  return anulados.map(a => {
    const fila = [
      a.ncf || '',
      fmtFecha(a.fecha),
      a.tipo_anulacion || '02',
    ];
    return fila.join('|');
  }).join('\n');
};

// ─────────────────────────────────────────────────────────
// Descargar como archivo TXT
// ─────────────────────────────────────────────────────────
export const downloadTxt = (contenido, filename) => {
  const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Nombre de archivo estándar DGII: DGII_F_<REPORTE>_<RNC>_<YYYYMM>.TXT
export const nombreArchivoDgii = (reporte, rnc, year, month) => {
  const rncLimpio = cleanRncCedula(rnc) || 'RNC';
  const yyyymm = `${year}${pad(month)}`;
  return `DGII_F_${reporte}_${rncLimpio}_${yyyymm}.TXT`;
};
