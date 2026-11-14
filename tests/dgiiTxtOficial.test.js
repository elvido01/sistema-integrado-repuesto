import { describe, it, expect } from 'vitest';
import { generar607, generar608, formaPago607, montoFacturado607, armarTxtDgii, fila606, revisar606 } from '../src/lib/dgiiExport.js';

// Cotejado con las macros de las herramientas Excel oficiales de la DGII
// (606 oct. 2025, 607 may. 2023, 608): encabezado + un registro por línea.
describe('TXT como la herramienta oficial de la DGII', () => {
  it('lleva el encabezado formato|RNC|AAAAMM|registros y CRLF, sin salto final', () => {
    const txt = armarTxtDgii('606', '1-31-12345-6', 2026, 3, 'a|b\nc|d');
    expect(txt).toBe('606|131123456|202603|2\r\na|b\r\nc|d');
    expect(armarTxtDgii('607', '131123456', 2026, 11, 'x\r\ny\r\nz').split('\r\n')[0]).toBe('607|131123456|202611|3');
  });

  it('sin registros no arma archivo (se presenta en cero en la Oficina Virtual)', () => {
    expect(armarTxtDgii('608', '131123456', 2026, 3, '')).toBe('');
    expect(armarTxtDgii('608', '131123456', 2026, 3, '\n')).toBe('');
  });

  it('el 606 completo: encabezado + 23 columnas por registro', () => {
    const { incluidas } = revisar606([
      { id: 1, fecha: '2026-10-15', ncf: 'B0100000001', total_gravado: 1000, total_exento: 0, itbis_total: 180, total_compra: 1180, forma_pago: 'Contado', suplidor_rnc: '131123456' },
    ], '101010101');
    const txt = armarTxtDgii('606', '101010101', 2026, 10, incluidas.map((c) => fila606(c).join('|')).join('\r\n'));
    const [cab, reg] = txt.split('\r\n');
    expect(cab).toBe('606|101010101|202610|1');
    expect(reg.split('|')).toHaveLength(23);
  });
});

describe('607: forma de pago y monto facturado', () => {
  it('contado en efectivo va a efectivo, no a "otras formas"', () => {
    expect(formaPago607({ forma_pago: 'CONTADO', tipo_pago: 'EFECTIVO' })).toBe('efectivo');
    expect(formaPago607({ forma_pago: 'CONTADO', tipo_pago: 'EFECTIVO/EFECTIVO' })).toBe('efectivo');
    expect(formaPago607({ forma_pago: 'CONTADO', tipo_pago: null })).toBe('efectivo');
  });
  it('crédito, transferencia y tarjeta', () => {
    expect(formaPago607({ forma_pago: 'CREDITO', tipo_pago: 'CREDITO/ABONO' })).toBe('credito');
    expect(formaPago607({ forma_pago: 'CREDITO', tipo_pago: 'TARJETA' })).toBe('credito');
    expect(formaPago607({ forma_pago: 'EFECTIVO', tipo_pago: 'credito' })).toBe('credito');
    expect(formaPago607({ forma_pago: 'CONTADO', tipo_pago: 'TRANSFERENCIA' })).toBe('cheque');
    expect(formaPago607({ forma_pago: 'CONTADO', tipo_pago: 'TARJETA DE CREDITO' })).toBe('tarjeta');
    expect(formaPago607({})).toBe('otros');
    // dos medios distintos: no se sabe cuánto fue con cada uno
    expect(formaPago607({ forma_pago: 'CONTADO', tipo_pago: 'EFECTIVO/TARJETA' })).toBe('otros');
  });
  it('el monto facturado es total − ITBIS (con el descuento ya restado)', () => {
    // subtotal 1000, descuento 100, ITBIS 162, total 1062
    expect(montoFacturado607({ subtotal: 1000, itbis: 162, total: 1062 })).toBe(900);
  });
  it('la fila sale con 23 columnas y el total en la columna de su forma de pago', () => {
    const cols = generar607([{ ncf: 'E320000000001', fecha: '2026-11-03', subtotal: 1000, itbis: 162, total: 1062, forma_pago: 'CONTADO', tipo_pago: 'EFECTIVO' }]).split('|');
    expect(cols).toHaveLength(23);
    expect(cols[7]).toBe('900.00');   // 8 monto facturado
    expect(cols[8]).toBe('162.00');   // 9 ITBIS
    expect(cols[16]).toBe('1062.00'); // 17 efectivo
    expect(cols[22]).toBe('0.00');    // 23 otras formas
  });
});

describe('607 con propina y retenciones (factura de AMSTAR a Oscar Aristy)', () => {
  it('la propina va en la col. 16 y no en el monto facturado', () => {
    const cols = generar607([{ ncf: 'B0100000385', fecha: '2026-11-11', cliente_rnc: '101894229', subtotal: 515.47, itbis: 92.78,
      propina: 100, total: 708.25, itbis_retenido: 92.78, isr_retenido: 15.46, forma_pago: 'CREDITO', tipo_pago: 'CREDITO' }]).split('|');
    expect(cols[7]).toBe('515.47');   // 8 monto facturado
    expect(cols[8]).toBe('92.78');    // 9 ITBIS
    expect(cols[9]).toBe('92.78');    // 10 ITBIS retenido por terceros
    expect(cols[11]).toBe('15.46');   // 12 retención de renta
    expect(cols[15]).toBe('100.00');  // 16 propina legal
    expect(cols[19]).toBe('708.25');  // 20 a crédito
  });
});

describe('607: tipo de ingreso', () => {
  it('va con un dígito (1 = operaciones), como la herramienta oficial', () => {
    const cols = generar607([{ ncf: 'B0200000001', fecha: '2026-11-03', itbis: 18, total: 118, forma_pago: 'CONTADO', tipo_pago: 'EFECTIVO' }]).split('|');
    expect(cols[4]).toBe('1');
  });
});

describe('606: nota de crédito y retención de ISR (datos guardados en Compras)', () => {
  const base = { fecha: '2026-10-20', total_gravado: 1000, total_exento: 0, itbis_total: 180, total_compra: 1180, forma_pago: 'Contado', suplidor_rnc: '131123456' };
  it('la nota de crédito con su NCF modificado entra; sin él, queda fuera para ponerla a mano', () => {
    const { incluidas, excluidas } = revisar606([
      { ...base, id: 1, ncf: 'B0400000099', ncf_modificado: 'B0100000123' },
      { ...base, id: 2, ncf: 'B0400000098' },
    ]);
    expect(incluidas.map((c) => c.id)).toEqual([1]);
    expect(excluidas.map((c) => c.id)).toEqual([2]);
    expect(fila606(incluidas[0])[4]).toBe('B0100000123');
  });
  it('la retención de ISR con su tipo entra con el código en la col. 17', () => {
    const { incluidas } = revisar606([{ ...base, id: 3, ncf: 'B0100000097', isr_retenido_pct: 10, tipo_retencion_isr: 2 }]);
    const f = fila606(incluidas[0]);
    expect(String(f[16])).toBe('2');
    expect(Number(f[17])).toBeGreaterThan(0);
  });
});

describe('608', () => {
  it('NCF, fecha y tipo de anulación', () => {
    expect(generar608([{ ncf: 'B0100000009', fecha: '2026-10-02', tipo_anulacion: '05' }])).toBe('B0100000009|20261002|05');
  });
});
