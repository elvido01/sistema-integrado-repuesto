// ══════════════════════════════════════════════════════════════════
// Exportadores DGII (República Dominicana) — 606 / 607 / 608
// Formatos oficiales DGII: campos separados por pipe (|),
// un registro por línea, fechas YYYYMMDD, montos con 2 decimales.
// ══════════════════════════════════════════════════════════════════

const pad = (n, len = 2) => String(n).padStart(len, '0');

// Fecha YYYYMMDD a partir de Date o string ISO
export const fmtFecha = (d) => {
  if (!d) return '';
  // (07/11/2026) Una fecha sola ("2026-10-15") se toma tal cual: new Date()
  // la lee como medianoche UTC y en RD (UTC-4) salía el día anterior.
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d.replace(/-/g, '');
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
/**
 * (13/11/2026) Forma de pago de una venta para el 607 y el IT-1.
 * En facturas, forma_pago dice CONTADO / CREDITO y tipo_pago el medio
 * (EFECTIVO, TRANSFERENCIA, TARJETA...). Antes se miraban al revés y toda
 * venta de contado caía en "otras formas" (col. 23) en vez de efectivo.
 * La misma regla está en SQL: _contab_ventas_607 (ayudante_contable_fase3.sql).
 */
export const formaPago607 = (v) => {
  const forma = String(v.forma_pago || '').toUpperCase();
  const tipo = String(v.tipo_pago || '').toUpperCase();
  if (/CR[EÉ]DITO/.test(forma) || /^CR[EÉ]DITO$/.test(tipo)) return 'credito';
  // Varios medios en una venta (EFECTIVO/TARJETA): el reparto no se guarda,
  // así que no se le atribuye todo a uno: va a "otras formas".
  const medios = [/TARJETA|VISA|MASTER/, /CHEQUE|TRANSFER|DEP[OÓ]SIT/, /EFECTIVO/].filter((r) => r.test(tipo)).length;
  if (medios > 1) return 'otros';
  const t = `${forma} ${tipo}`;
  if (/TARJETA|VISA|MASTER/.test(t)) return 'tarjeta';
  if (/CHEQUE|TRANSFER|DEP[OÓ]SIT/.test(t)) return 'cheque';
  if (/EFECTIVO|CONTADO/.test(t)) return 'efectivo';
  return 'otros';
};

/**
 * Monto facturado sin impuestos: total − ITBIS − propina (ya con descuentos y
 * recargos). La propina va en su columna (16) y no es operación del IT-1
 * (DGII, consulta 22 de oct. 2023).
 */
export const montoFacturado607 = (v) => (parseFloat(v.total) || 0) - (parseFloat(v.itbis) || 0) - (parseFloat(v.propina) || 0);

export const generar607 = (ventas) => {
  return ventas.map(v => {
    const rnc = cleanRncCedula(v.cliente_rnc);
    const tipoId = rnc ? tipoIdentificacion(rnc) : '';

    // Distribución por forma de pago (monto total en una sola columna)
    const monto = parseFloat(v.total || 0);
    const fp = formaPago607(v);
    const efectivo = fp === 'efectivo' ? monto : 0;
    const cheque = fp === 'cheque' ? monto : 0;
    const tarjeta = fp === 'tarjeta' ? monto : 0;
    const credito = fp === 'credito' ? monto : 0;
    const otros = fp === 'otros' ? monto : 0;

    const fila = [
      rnc,                             // 1
      tipoId,                          // 2
      v.ncf || '',                     // 3
      v.ncf_modificado || '',          // 4
      // 5 Tipo ingreso: 1 = operaciones (no financieros). UN dígito, como lo
      //   escribe la herramienta Excel oficial del 607 y lo lista el instructivo
      //   de la DGII (dic. 2025: valores 1 a 6). Antes iba '01'.
      '1',
      fmtFecha(v.fecha),               // 6
      // (27/10/2026) Retenciones del cliente agente de retención (servicios).
      // La fecha de retención real es la del pago; se usa la del comprobante.
      (Number(v.itbis_retenido) || 0) + (Number(v.isr_retenido) || 0) > 0 ? fmtFecha(v.fecha) : '', // 7 fecha retención
      fmtMonto(montoFacturado607(v)),  // 8 monto facturado sin ITBIS (total − ITBIS: el subtotal no trae el descuento)
      fmtMonto(v.itbis),               // 9
      fmtMonto(v.itbis_retenido || 0), // 10 ITBIS retenido por terceros
      '0.00',                          // 11
      fmtMonto(v.isr_retenido || 0),   // 12 retención renta por terceros
      '0.00',                          // 13
      '0.00',                          // 14
      '0.00',                          // 15
      fmtMonto(v.propina || 0),        // 16 monto propina legal
      fmtMonto(efectivo),              // 17
      fmtMonto(cheque),                // 18
      fmtMonto(tarjeta),               // 19
      fmtMonto(credito),               // 20
      '0.00',                          // 21
      '0.00',                          // 22
      fmtMonto(otros),                 // 23
    ];
    return fila.join('|');
  }).join('\r\n');
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
// (07/11/2026) Qué entra al 606 (instructivo DGII feb. 2026, Norma 07-2018):
// comprobantes que sustentan costo, gasto o crédito fiscal. La factura de
// CONSUMO (B02 / E32, consumidor final) no va: no da crédito fiscal. Las e-CF
// recibidas SÍ se reportan. Lo que no entra se enseña aparte con el motivo y
// qué hacer, para que el contador no lo descubra cuando la DGII lo rechace.
export const TIPOS_606 = {
  B01: 'Crédito fiscal', B03: 'Nota de débito', B04: 'Nota de crédito', B11: 'Comprobante de compras',
  B13: 'Gastos menores', B14: 'Régimen especial', B15: 'Gubernamental', B17: 'Pagos al exterior',
  E31: 'Crédito fiscal electrónico', E33: 'Nota de débito electrónica', E34: 'Nota de crédito electrónica',
  E41: 'Compras electrónico', E43: 'Gastos menores electrónico', E44: 'Régimen especial electrónico',
  E45: 'Gubernamental electrónico', E47: 'Pagos al exterior electrónico',
};
const CONSUMO = { B02: true, E32: true };
// Los que el negocio emite a su nombre (no hay RNC de suplidor): va el propio.
const CON_RNC_PROPIO = { B13: true, B17: true, E43: true, E47: true };
const NOTAS_CREDITO_DEBITO = { B03: true, B04: true, E33: true, E34: true };

/** "e310000000123 " → "E310000000123" (sin espacios ni guiones). */
export const normalizarNcf = (ncf) => String(ncf || '').toUpperCase().replace(/[\s-]/g, '');

/** Estructura válida: B + 10 dígitos (11) o E + 12 dígitos (13). */
export const ncfBienEscrito = (ncf) => /^B\d{10}$|^E\d{12}$/.test(ncf);

/**
 * Forma de pago del 606 (col. 23). Compras guarda forma_pago 'Contado' /
 * 'Credito' (y a veces el detalle en tipo_pago_detalle): 'Contado' sin más
 * detalle = efectivo. "Tarjeta de crédito" es tarjeta, no compra a crédito.
 */
export const formaPago606 = (c) => {
  const t = `${c.forma_pago || ''} ${c.tipo_pago_detalle || ''}`.toUpperCase();
  if (t.includes('TARJETA')) return '03';
  if (t.includes('CHEQUE') || t.includes('TRANSFER') || t.includes('DEPOSIT')) return '02';
  if (t.includes('PERMUTA')) return '05';
  if (t.includes('NOTA')) return '06';
  if (t.includes('MIXTO')) return '07';
  if (/CR[EÉ]DITO/.test(t)) return '04';
  return '01'; // contado / efectivo
};
const esCredito = (c) => formaPago606(c) === '04';

/** Tipo de bienes y servicios (col. 3): '01'..'11'; lo que no sea, '09' (costo de venta). */
export const tipoBS606 = (c) => {
  const n = parseInt(String(c.tipo_bienes_servicios ?? '').trim(), 10);
  return n >= 1 && n <= 11 ? pad(n) : '09';
};
// Tipos que son servicios: personal, trabajos y servicios, arrendamientos,
// financieros y seguros. Su monto va en la col. 8 (servicios), no en la 9.
const TIPOS_SERVICIO = { '01': true, '02': true, '03': true, '07': true, '11': true };
const retencionIsr = (c) => (parseFloat(c.total_gravado || 0) + parseFloat(c.total_exento || 0)) * parseFloat(c.isr_retenido_pct || 0) / 100;
const retencionItbis = (c) => parseFloat(c.itbis_total || 0) * parseFloat(c.itbis_retenido_pct || 0) / 100;

/**
 * Separa las compras del mes: las que van en el 606 (con avisos) y las que
 * no van, cada una con el motivo y qué hacer.
 * compras: filas con ncf, suplidor_rnc, total_gravado, total_exento, ...
 */
export const revisar606 = (compras, rncEmpresa = '') => {
  const incluidas = [];
  const excluidas = [];
  const vistos = new Set();
  const propio = cleanRncCedula(rncEmpresa);
  for (const c of compras || []) {
    const ncf = normalizarNcf(c.ncf);
    const tipo = ncf.slice(0, 3);
    const fuera = (motivo, accion) => excluidas.push({ ...c, ncf, tipo, motivo, accion });
    if (!ncfBienEscrito(ncf)) {
      fuera(`NCF mal escrito (${ncf.length} caracteres)`, 'Corrija el NCF en la compra: B + 10 números u E + 12 números.');
      continue;
    }
    if (CONSUMO[tipo]) {
      fuera('Factura de consumo (consumidor final): no da crédito fiscal y no va en el 606',
        'Pida al suplidor que la cambie por una de crédito fiscal (B01 o E31) a nombre de su RNC.');
      continue;
    }
    if (!TIPOS_606[tipo]) {
      fuera(`El comprobante ${tipo} no se reporta en el 606`, 'Revise que el NCF sea el de la factura del suplidor.');
      continue;
    }
    let rnc = cleanRncCedula(c.suplidor_rnc);
    if (CON_RNC_PROPIO[tipo]) {
      // Gastos menores / pagos al exterior: va el RNC de la empresa, nunca el del suplidor.
      if (propio.length !== 9 && propio.length !== 11) {
        fuera(`${TIPOS_606[tipo]}: va con el RNC de su empresa y no está configurado`, 'Ponga el RNC en Perfil Empresa.');
        continue;
      }
      rnc = propio;
    }
    if (rnc.length !== 9 && rnc.length !== 11) {
      fuera('El suplidor no tiene RNC o cédula válido', 'Complete el RNC (9 dígitos) o la cédula (11) en la ficha del suplidor.');
      continue;
    }
    const clave = `${rnc}|${ncf}`;
    if (vistos.has(clave)) {
      fuera('Repetida: la misma factura del mismo suplidor ya está en el reporte', 'Revise si la compra se registró dos veces.');
      continue;
    }
    // Lo que la DGII rechaza por un dato que el sistema no guarda: fuera,
    // para completarlo a mano en la herramienta (sale en la hoja aparte).
    if (NOTAS_CREDITO_DEBITO[tipo] && !c.ncf_modificado) {
      fuera('Nota de crédito/débito: falta el NCF de la factura que modifica', 'Agréguela en la herramienta de la DGII con el NCF modificado (columna 5).');
      continue;
    }
    if (retencionIsr(c) > 0 && !c.tipo_retencion_isr) {
      fuera('Tiene retención de ISR pero no el tipo de retención', 'Agréguela en la herramienta de la DGII escogiendo el tipo de retención (columna 17).');
      continue;
    }
    vistos.add(clave);
    const avisos = [];
    if (c.tipo_bienes_servicios && tipoBS606(c) !== String(c.tipo_bienes_servicios).trim().padStart(2, '0')) {
      avisos.push(`Tipo de bienes y servicios "${c.tipo_bienes_servicios}" no existe: se reporta como 09`);
    }
    incluidas.push({ ...c, ncf, tipo, rnc_606: rnc, avisos });
  }
  return { incluidas, excluidas };
};

/** Las 23 columnas del 606 de una compra ya revisada (revisar606). */
export const fila606 = (c) => {
  const rnc = c.rnc_606 || cleanRncCedula(c.suplidor_rnc);
  const tipoBS = tipoBS606(c);
  const monto = parseFloat(c.total_gravado || 0) + parseFloat(c.total_exento || 0); // sin impuestos
  const servicios = TIPOS_SERVICIO[tipoBS] ? monto : 0;
  const bienes = monto - servicios;
  const itbisRet = retencionItbis(c);
  const isrRet = retencionIsr(c);
  // Fecha de pago: obligatoria si hay retenciones; vacía si es a crédito y no se ha pagado.
  const fechaPago = c.fecha_pago ? fmtFecha(c.fecha_pago)
    : (itbisRet > 0 || isrRet > 0 || !esCredito(c)) ? fmtFecha(c.fecha) : '';
  return [
    rnc,                                         // 1 RNC/Cédula
    tipoIdentificacion(rnc),                     // 2 Tipo Id (1 RNC, 2 cédula)
    tipoBS,                                      // 3 Tipo bienes y servicios (01-11)
    normalizarNcf(c.ncf),                        // 4 NCF
    normalizarNcf(c.ncf_modificado),             // 5 NCF modificado
    fmtFecha(c.fecha),                           // 6 Fecha comprobante
    fechaPago,                                   // 7 Fecha pago
    fmtMonto(servicios),                         // 8 Monto servicios
    fmtMonto(bienes),                            // 9 Monto bienes
    fmtMonto(monto),                             // 10 Total monto facturado (servicios + bienes)
    fmtMonto(c.itbis_total),                     // 11 ITBIS facturado
    fmtMonto(itbisRet),                          // 12 ITBIS retenido
    '0.00',                                      // 13 ITBIS sujeto a proporcionalidad
    '0.00',                                      // 14 ITBIS llevado al costo
    fmtMonto(c.itbis_total),                     // 15 ITBIS por adelantar (facturado − al costo)
    '0.00',                                      // 16 ITBIS percibido (inhabilitado por la DGII)
    isrRet > 0 ? (c.tipo_retencion_isr || '') : '', // 17 Tipo retención ISR
    fmtMonto(isrRet),                            // 18 Monto retención renta
    '0.00',                                      // 19 ISR percibido (inhabilitado)
    '0.00',                                      // 20 ISC
    '0.00',                                      // 21 Otros impuestos/tasas
    fmtMonto(c.propina || 0),                    // 22 Propina legal (comprobantes de gastos)
    formaPago606(c),                             // 23 Forma de pago
  ];
};

/** TXT del 606: solo lo que revisar606 deja entrar. */
export const generar606 = (compras, rncEmpresa = '') =>
  revisar606(compras, rncEmpresa).incluidas.map((c) => fila606(c).join('|')).join('\r\n');

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
  }).join('\r\n');
};

// ─────────────────────────────────────────────────────────
// Archivo TXT como lo genera la herramienta oficial
// ─────────────────────────────────────────────────────────
// (13/11/2026) Cotejado con las macros de las herramientas Excel de la DGII
// (606 de oct. 2025, 607 de may. 2023 y 608): la PRIMERA línea es el
// encabezado  <formato>|<RNC>|<AAAAMM>|<cantidad de registros>  y después va
// un registro por línea, separados por CRLF, sin salto al final. Sin el
// encabezado la Oficina Virtual no reconoce el archivo.
export const MAX_REGISTROS_DGII = { 606: 10000, 607: 65000 };

/**
 * detalle: las líneas ya armadas (generar607/608 o fila606.join('|')),
 * separadas por salto de línea. Devuelve '' si no hay registros.
 */
export const armarTxtDgii = (reporte, rnc, year, month, detalle) => {
  const lineas = String(detalle || '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lineas.length) return '';
  const encabezado = [reporte, cleanRncCedula(rnc), `${year}${pad(month)}`, lineas.length].join('|');
  return [encabezado, ...lineas].join('\r\n');
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
