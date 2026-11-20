// =====================================================================
// 606 en la plantilla oficial de la DGII (20/11/2026)
// ---------------------------------------------------------------------
// El Excel del 606 sale en la "Herramienta Formato 606" de la DGII (Versión
// 2025), la misma que bajan los contadores: con sus macros y botones
// (Validar, Generar Archivo), su protección y sus listas. La plantilla en
// blanco vive en src/assets/plantillas/dgii-606.xlsm (convertida del .xls de
// la DGII con Excel, sin tocar nada más). Va en src/assets para que Vite le
// ponga huella al nombre: si se reemplaza por una versión nueva de la DGII,
// el navegador no se queda con la vieja.
//
// No se reescribe el libro con una librería de Excel (perdería las macros):
// se abre el .xlsm como zip y solo se ponen los VALORES en las celdas que ya
// existen en la hoja, conservando su formato.
//
// Un archivo por mes: la DGII recibe el 606 mes por mes.
//
// Celdas (hoja "Herramienta Formato 606" = xl/worksheets/sheet2.xml):
//   C4 RNC o cédula (texto) · C5 período AAAAMM · C6 cantidad de registros
//   Detalle desde la fila 12 (hasta la 10011 = 10,000 registros):
//   B RNC · C Tipo Id · D Tipo bienes y servicios (texto de la lista) · E NCF
//   F NCF modificado · G/H fecha comprobante (AAAAMM / DD) · I/J fecha pago
//   K servicios · L bienes · M total · N ITBIS facturado · O ITBIS retenido
//   P ITBIS proporcionalidad · Q ITBIS al costo · R ITBIS por adelantar
//   S ITBIS percibido · T tipo retención ISR (texto) · U retención renta
//   V ISR percibido · W ISC · X otros impuestos · Y propina · Z forma de pago
// =====================================================================

import PLANTILLA_606_URL from '@/assets/plantillas/dgii-606.xlsm?url';

export { PLANTILLA_606_URL };
export const HOJA_606 = 'xl/worksheets/sheet2.xml';
export const FILA_INICIAL_606 = 12;
export const MAX_FILAS_PLANTILLA_606 = 10000;

// Textos EXACTOS de las listas de la plantilla (columnas AD, AE y AF).
export const TIPOS_BS_PLANTILLA = {
  '01': '01-GASTOS DE PERSONAL ',
  '02': '02-GASTOS POR TRABAJOS, SUMINISTROS Y SERVICIOS ',
  '03': '03-ARRENDAMIENTOS ',
  '04': '04-GASTOS DE ACTIVOS FIJO ',
  '05': '05 -GASTOS DE REPRESENTACIÓN ',
  '06': '06 -OTRAS DEDUCCIONES ADMITIDAS ',
  '07': '07 -GASTOS FINANCIEROS ',
  '08': '08 -GASTOS EXTRAORDINARIOS ',
  '09': '09 -COMPRAS Y GASTOS QUE FORMARAN PARTE DEL COSTO DE VENTA ',
  '10': '10 -ADQUISICIONES DE ACTIVOS ',
  '11': '11- GASTOS DE SEGUROS',
};
export const RETENCION_ISR_PLANTILLA = {
  '01': '01 - ALQUILERES',
  '02': '02 - HONORARIOS POR SERVICIOS',
  '03': '03 - OTRAS RENTAS',
  '04': '04 - OTRAS RENTAS (Rentas Presuntas)',
  '05': '05 - INTERESES PAGADOS A PERSONAS JURIDICAS RESIDENTES',
  '06': '06 - INTERESES PAGADOS A PERSONAS FISICAS RESIDENTES',
  '07': '07 - RETENCION POR PROVEEDORES DEL ESTADO',
  '08': '08 - JUEGOS TELEFONICOS',
  '09': '09 - RETENCIONES SUBSECTOR DE GANADERÍA DE CARNE BOVINA',
};
export const FORMA_PAGO_PLANTILLA = {
  '01': '01 - EFECTIVO',
  '02': '02 - CHEQUES/TRANSFERENCIAS/DEPÓSITO',
  '03': '03 - TARJETA CRÉDITO/DÉBITO',
  '04': '04 - COMPRA A CREDITO',
  '05': '05 -  PERMUTA',
  '06': '06 - NOTA DE CREDITO',
  '07': '07 - MIXTO',
};

const codigo2 = (v) => {
  const s = String(v ?? '').trim();
  return s ? s.padStart(2, '0') : '';
};
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

/**
 * Las celdas de una fila del 606 a partir de las 23 columnas del TXT
 * (fila606). Devuelve { B: {t:'s'|'n', v}, ... }; lo vacío no se escribe
 * (como la herramienta de la DGII deja en blanco los campos sin monto).
 */
export function celdasFila606(f) {
  const c = {};
  const texto = (col, v) => { const s = String(v ?? '').trim(); if (s) c[col] = { t: 's', v: s }; };
  // Los textos de las listas van EXACTOS (algunos terminan en espacio).
  const deLista = (col, lista, cod, crudo) => { if (lista[cod]) c[col] = { t: 's', v: lista[cod] }; else texto(col, crudo); };
  const numero = (col, v, siempre = false) => { const n = num(v); if (siempre || n !== 0) c[col] = { t: 'n', v: n }; };
  const fecha = (colMes, colDia, v) => {
    const s = String(v ?? '').replace(/\D/g, '');
    if (s.length === 8) { c[colMes] = { t: 'n', v: Number(s.slice(0, 6)) }; c[colDia] = { t: 'n', v: Number(s.slice(6, 8)) }; }
  };
  texto('B', f[0]);
  if (String(f[1] ?? '').trim()) c.C = { t: 'n', v: Number(f[1]) };
  const tbs = codigo2(f[2]);
  deLista('D', TIPOS_BS_PLANTILLA, tbs, f[2]);
  texto('E', f[3]);
  texto('F', f[4]);
  fecha('G', 'H', f[5]);
  fecha('I', 'J', f[6]);
  numero('K', f[7]);
  numero('L', f[8]);
  numero('M', f[9], true);
  numero('N', f[10], true);
  numero('O', f[11]);
  numero('P', f[12]);
  numero('Q', f[13]);
  numero('R', f[14], true);
  numero('S', f[15]);
  const ret = codigo2(f[16]);
  if (ret) deLista('T', RETENCION_ISR_PLANTILLA, ret, f[16]);
  numero('U', f[17]);
  numero('V', f[18]);
  numero('W', f[19]);
  numero('X', f[20]);
  numero('Y', f[21]);
  const fp = codigo2(f[22]);
  deLista('Z', FORMA_PAGO_PLANTILLA, fp, f[22]);
  return c;
}

const escXml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // caracteres de control que XML no admite
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const celdaXml = (ref, estilo, celda) => {
  const s = estilo ? ` s="${estilo}"` : '';
  if (celda.t === 'n') return `<c r="${ref}"${s}><v>${celda.v}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escXml(celda.v)}</t></is></c>`;
};

/** Pone valores en las celdas de una fila (<row>…</row>) conservando su estilo. */
export function llenarFilaXml(filaXml, numFila, celdas) {
  const pendientes = { ...celdas };
  let xml = filaXml.replace(/<c r="([A-Z]+)(\d+)"((?:\s+[a-zA-Z:]+="[^"]*")*)\s*(\/>|>[\s\S]*?<\/c>)/g, (m, col, fila, attrs) => {
    if (Number(fila) !== numFila || !pendientes[col]) return m;
    const estilo = (attrs.match(/\ss="(\d+)"/) || [])[1];
    const out = celdaXml(`${col}${numFila}`, estilo, pendientes[col]);
    delete pendientes[col];
    return out;
  });
  // Celdas que la plantilla no traía en esa fila (no debería pasar): se
  // insertan en su orden de columna.
  const faltan = Object.keys(pendientes);
  if (faltan.length) {
    const colNum = (col) => [...col].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    const abre = xml.indexOf('>') + 1;
    const cierre = xml.lastIndexOf('</row>');
    const existentes = [];
    // Una celda es <c …/> o <c …>…</c> (adentro puede haber un <f …/>).
    xml.slice(abre, cierre).replace(/<c r="([A-Z]+)\d+"(?:[^>]*?\/>|[^>]*>[\s\S]*?<\/c>)/g, (m, col) => { existentes.push({ col, m }); return m; });
    for (const col of faltan) existentes.push({ col, m: celdaXml(`${col}${numFila}`, null, pendientes[col]) });
    existentes.sort((a, b) => colNum(a.col) - colNum(b.col));
    xml = xml.slice(0, abre) + existentes.map((e) => e.m).join('') + xml.slice(cierre);
  }
  return xml;
}

/**
 * Llena la hoja del 606 (el XML de sheet2) con el encabezado y las filas.
 * filas: arreglos de 23 columnas (fila606).
 */
export function llenarHoja606(hojaXml, { rnc, periodo, filas }) {
  if (filas.length > MAX_FILAS_PLANTILLA_606) {
    throw new Error(`La plantilla de la DGII admite ${MAX_FILAS_PLANTILLA_606.toLocaleString('en-US')} registros por mes; este mes tiene ${filas.length}.`);
  }
  const porFila = new Map();
  porFila.set(4, { C: { t: 's', v: String(rnc || '').replace(/\D/g, '') } });
  porFila.set(5, { C: { t: 'n', v: Number(periodo) } });
  porFila.set(6, { C: { t: 'n', v: filas.length } });
  filas.forEach((f, i) => porFila.set(FILA_INICIAL_606 + i, celdasFila606(f)));
  let vistas = 0;
  const xml = hojaXml.replace(/<row r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g, (m, r) => {
    const n = Number(r);
    const celdas = porFila.get(n);
    if (!celdas) return m;
    vistas += 1;
    if (m.endsWith('/>')) {
      // fila vacía sin celdas: se abre
      return llenarFilaXml(`${m.slice(0, -2)}></row>`, n, celdas);
    }
    return llenarFilaXml(m, n, celdas);
  });
  if (vistas !== porFila.size) throw new Error('La plantilla del 606 no tiene la forma esperada (faltan filas).');
  return xml;
}

/** Nombre del archivo de un mes: 606_<RNC>_<AAAAMM>.xlsm */
export const nombreArchivo606 = (rnc, periodo) => `606_${String(rnc || '').replace(/\D/g, '') || 'SINRNC'}_${periodo}.xlsm`;

/**
 * Abre la plantilla UNA vez y devuelve armar({ rnc, periodo, filas }) → Blob
 * del .xlsm de ese mes (cada llamada parte de la hoja en blanco).
 */
export async function prepararPlantilla606(plantilla) {
  const bytes = new Uint8Array(plantilla);
  // Un .xlsm es un zip ("PK"). Si llegó otra cosa (p. ej. la página web en
  // vez del archivo), se dice claro.
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error('No llegó la plantilla de la DGII (llegó otra cosa). Recargue la página e intente de nuevo.');
  }
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(bytes);
  const hoja = zip.file(HOJA_606);
  if (!hoja) throw new Error('La plantilla del 606 no tiene su hoja.');
  const enBlanco = await hoja.async('string');
  return {
    armar: async ({ rnc, periodo, filas }) => {
      zip.file(HOJA_606, llenarHoja606(enBlanco, { rnc, periodo, filas }));
      return zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12',
      });
    },
  };
}
