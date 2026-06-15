import { describe, it, expect } from 'vitest';
import {
  normalizeTaxRate,
  calculateTaxAmount,
  extractTaxableBase,
  calculateLineAmount,
  sumLineTotals,
} from '../src/lib/taxUtils.js';

describe('normalizeTaxRate', () => {
  it('decimal ya normalizado se respeta', () => {
    expect(normalizeTaxRate(0.18)).toBe(0.18);
    expect(normalizeTaxRate(0.16)).toBe(0.16);
    expect(normalizeTaxRate(0.08)).toBe(0.08);
  });

  it('porcentaje entero se convierte a decimal', () => {
    expect(normalizeTaxRate(18)).toBe(0.18);
    expect(normalizeTaxRate(16)).toBe(0.16);
    expect(normalizeTaxRate(8)).toBe(0.08);
  });

  it('strings numéricas se aceptan en ambos formatos', () => {
    expect(normalizeTaxRate('18')).toBe(0.18);
    expect(normalizeTaxRate('0.18')).toBe(0.18);
  });

  it('valores vacíos o no numéricos retornan 0', () => {
    expect(normalizeTaxRate(null)).toBe(0);
    expect(normalizeTaxRate(undefined)).toBe(0);
    expect(normalizeTaxRate('')).toBe(0);
    expect(normalizeTaxRate('abc')).toBe(0);
    expect(normalizeTaxRate(0)).toBe(0);
    expect(normalizeTaxRate(-5)).toBe(0);
  });

  it('1 exacto se trata como decimal (100%) — caso límite documentado', () => {
    expect(normalizeTaxRate(1)).toBe(1);
  });
});

describe('calculateTaxAmount', () => {
  it('precio sin ITBIS incluido suma', () => {
    expect(calculateTaxAmount(100, 0.18, false)).toBe(18);
    expect(calculateTaxAmount(50, 0.18, false)).toBe(9);
  });

  it('precio CON ITBIS incluido extrae', () => {
    expect(calculateTaxAmount(118, 0.18, true)).toBe(18);
    expect(calculateTaxAmount(11.80, 0.18, true)).toBe(1.80);
  });

  it('exento retorna 0', () => {
    expect(calculateTaxAmount(100, 0, false)).toBe(0);
    expect(calculateTaxAmount(100, null, false)).toBe(0);
  });

  it('tasa como porcentaje (18) se normaliza', () => {
    expect(calculateTaxAmount(100, 18, false)).toBe(18);
  });

  it('base 0 retorna 0', () => {
    expect(calculateTaxAmount(0, 0.18)).toBe(0);
  });

  it('redondea a 2 decimales sin drift IEEE-754', () => {
    // 0.1 + 0.2 escenario tipico
    expect(calculateTaxAmount(0.30, 0.18, false)).toBe(0.05); // 0.054 -> 0.05
  });
});

describe('extractTaxableBase', () => {
  it('extrae base correctamente cuando precio incluye 18%', () => {
    expect(extractTaxableBase(118, 0.18)).toBe(100);
    expect(extractTaxableBase(11.80, 0.18)).toBe(10);
  });

  it('precio exento retorna mismo precio', () => {
    expect(extractTaxableBase(100, 0)).toBe(100);
  });

  it('precio 0 retorna 0', () => {
    expect(extractTaxableBase(0, 0.18)).toBe(0);
  });
});

describe('calculateLineAmount', () => {
  it('cantidad x precio sin descuento ni ITBIS', () => {
    const detalle = { cantidad: 2, precio: 50, descuento_pct: 0, itbis_pct: 0 };
    expect(calculateLineAmount(detalle, true)).toBe(100);
  });

  it('con ITBIS pero aplicarItbis=false retorna solo base', () => {
    const detalle = { cantidad: 3, precio: 25, itbis_pct: 0.18 };
    expect(calculateLineAmount(detalle, false)).toBe(75);
  });

  it('con descuento y ITBIS', () => {
    // 2 * 50 = 100, desc 10% = 90, ITBIS 18% = 16.20, total = 106.20
    const detalle = { cantidad: 2, precio: 50, descuento_pct: 10, itbis_pct: 0.18 };
    expect(calculateLineAmount(detalle, true)).toBe(106.20);
  });

  it('exento ignora flag aplicarItbis', () => {
    const detalle = { cantidad: 1, precio: 100, itbis_pct: 0 };
    expect(calculateLineAmount(detalle, true)).toBe(100);
  });

  it('cantidades decimales (ej. kg)', () => {
    const detalle = { cantidad: 2.5, precio: 40, itbis_pct: 0.18 };
    // 2.5 * 40 = 100, ITBIS 18 = 18, total 118
    expect(calculateLineAmount(detalle, true)).toBe(118);
  });

  it('detalle null o vacío retorna 0', () => {
    expect(calculateLineAmount(null)).toBe(0);
    expect(calculateLineAmount({})).toBe(0);
  });

  it('tasa que viene como 18 (porcentaje) se normaliza', () => {
    const detalle = { cantidad: 1, precio: 100, itbis_pct: 18 };
    expect(calculateLineAmount(detalle, true)).toBe(118);
  });
});

describe('sumLineTotals', () => {
  it('suma lineas gravadas y exentas', () => {
    const detalles = [
      { cantidad: 2, precio: 50, itbis_pct: 0.18 },    // gravado 100, itbis 18
      { cantidad: 1, precio: 100, itbis_pct: 0 },      // exento 100
    ];
    expect(sumLineTotals(detalles, true)).toEqual({
      gravado: 100,
      exento: 100,
      descuento: 0,
      itbis: 18,
      total: 218,
    });
  });

  it('aplicarItbis=false mueve todo a exento', () => {
    const detalles = [
      { cantidad: 1, precio: 100, itbis_pct: 0.18 },
    ];
    expect(sumLineTotals(detalles, false)).toEqual({
      gravado: 0,
      exento: 100,
      descuento: 0,
      itbis: 0,
      total: 100,
    });
  });

  it('agrega descuento sumado', () => {
    const detalles = [
      { cantidad: 2, precio: 50, descuento_pct: 10, itbis_pct: 0.18 },
    ];
    const res = sumLineTotals(detalles, true);
    expect(res.descuento).toBe(10);
    expect(res.gravado).toBe(90);
    expect(res.itbis).toBe(16.2);
    expect(res.total).toBe(106.2);
  });

  it('array vacío retorna ceros', () => {
    expect(sumLineTotals([], true)).toEqual({
      gravado: 0, exento: 0, descuento: 0, itbis: 0, total: 0,
    });
  });

  it('soporta tasas mixtas (8%, 16%, 18%)', () => {
    const detalles = [
      { cantidad: 1, precio: 100, itbis_pct: 0.18 },
      { cantidad: 1, precio: 100, itbis_pct: 0.16 },
      { cantidad: 1, precio: 100, itbis_pct: 0.08 },
    ];
    const res = sumLineTotals(detalles, true);
    expect(res.gravado).toBe(300);
    expect(res.itbis).toBe(42); // 18 + 16 + 8
    expect(res.total).toBe(342);
  });
});

describe('regresion: bugs previos a Fase 0', () => {
  it('orderPDF.js dividia /100 incorrectamente (R-03) — taxUtils retorna correcto', () => {
    // Antes del fix 0.2, orderPDF calculaba: (itbis_pct / 100) * precio
    // Con itbis_pct=0.18 daba 0.18/100 = 0.0018 (100x menor)
    // Ahora con calculateTaxAmount es correcto:
    expect(calculateTaxAmount(100, 0.18, false)).toBe(18); // no 0.18
  });

  it('itbis_total NO se setea sin sufijo en el XML — separamos por tasa', () => {
    // sumLineTotals con tasas mixtas devuelve UN total `itbis`, pero el
    // builder de DGII debe agruparlo por rate para TotalITBIS1/2/3.
    // Este test documenta que sumLineTotals NO hace esa agrupacion
    // y el builder DGII debe iterar por tasa.
    const detalles = [
      { cantidad: 1, precio: 100, itbis_pct: 0.18 },
      { cantidad: 1, precio: 100, itbis_pct: 0.16 },
    ];
    const res = sumLineTotals(detalles, true);
    expect(res.itbis).toBe(34); // 18 + 16, agregado
  });
});
