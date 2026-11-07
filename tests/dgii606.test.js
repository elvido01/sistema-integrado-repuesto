import { describe, it, expect } from 'vitest';
import { revisar606, fila606, generar606, normalizarNcf, ncfBienEscrito } from '../src/lib/dgiiExport.js';

const base = { fecha: '2026-10-15', total_gravado: 1000, total_exento: 200, itbis_total: 180, total_compra: 1380, forma_pago: 'EFECTIVO', suplidor_rnc: '131-12345-6' };

describe('606: qué entra y qué no', () => {
  it('normaliza y valida la estructura del NCF', () => {
    expect(normalizarNcf(' e31-0000000123 ')).toBe('E310000000123');
    expect(ncfBienEscrito('B0100000001')).toBe(true);
    expect(ncfBienEscrito('E310000000123')).toBe(true);
    expect(ncfBienEscrito('E31000000012')).toBe(false);
    expect(ncfBienEscrito('901')).toBe(false);
  });

  it('la factura de consumo (B02/E32) no va, con motivo y qué hacer', () => {
    const { incluidas, excluidas } = revisar606([
      { ...base, id: 1, ncf: 'B0200000001' },
      { ...base, id: 2, ncf: 'E320000000099' },
      { ...base, id: 3, ncf: 'E310000000123' },
    ]);
    expect(incluidas.map((c) => c.id)).toEqual([3]);
    expect(excluidas).toHaveLength(2);
    expect(excluidas[0].motivo).toMatch(/consumo/);
    expect(excluidas[0].accion).toMatch(/B01 o E31/);
  });

  it('NCF mal escrito, sin RNC y repetidas quedan fuera', () => {
    const { incluidas, excluidas } = revisar606([
      { ...base, id: 1, ncf: '580' },
      { ...base, id: 2, ncf: 'B0100000005', suplidor_rnc: '' },
      { ...base, id: 3, ncf: 'B0100000006' },
      { ...base, id: 4, ncf: 'b01-00000006' },
    ]);
    expect(incluidas.map((c) => c.id)).toEqual([3]);
    expect(excluidas.map((c) => c.motivo)).toEqual([
      expect.stringMatching(/mal escrito/), expect.stringMatching(/RNC/), expect.stringMatching(/Repetida/),
    ]);
  });

  it('gastos menores y pagos al exterior van con el RNC propio', () => {
    const { incluidas } = revisar606([{ ...base, ncf: 'B1300000001', suplidor_rnc: '' }], '101-00000-1');
    expect(incluidas[0].rnc_606).toBe('101000001');
  });

  it('nota de crédito sin el NCF que modifica y retención ISR sin tipo: fuera (la DGII las rechaza)', () => {
    const { incluidas, excluidas } = revisar606([
      { ...base, ncf: 'E340000000001' },
      { ...base, ncf: 'B0100000009', isr_retenido_pct: 10 },
    ]);
    expect(incluidas).toHaveLength(0);
    expect(excluidas[0].motivo).toMatch(/modifica/);
    expect(excluidas[1].motivo).toMatch(/tipo de retención/);
  });

  it('gastos menores sin RNC de la empresa: fuera, culpando a la empresa (no al suplidor)', () => {
    const { excluidas } = revisar606([{ ...base, ncf: 'B1300000001' }], '');
    expect(excluidas[0].accion).toMatch(/Perfil Empresa/);
  });
});

describe('606: las 23 columnas', () => {
  it('montos sin impuestos (gravado + exento) y forma de pago', () => {
    const [c] = revisar606([{ ...base, ncf: 'B0100000001' }]).incluidas;
    const f = fila606(c);
    expect(f).toHaveLength(23);
    expect(f[0]).toBe('131123456');
    expect(f[1]).toBe('1');
    expect(f[2]).toBe('09');
    expect(f[5]).toBe('20261015');
    expect(f[8]).toBe('1200.00');
    expect(f[9]).toBe('1200.00');
    expect(f[10]).toBe('180.00');
    expect(f[22]).toBe('01');
  });

  it('a crédito sin retenciones: sin fecha de pago', () => {
    const [c] = revisar606([{ ...base, ncf: 'B0100000001', forma_pago: 'CRÉDITO' }]).incluidas;
    expect(fila606(c)[6]).toBe('');
    expect(fila606(c)[22]).toBe('04');
  });

  it('el TXT solo trae lo que entra', () => {
    const txt = generar606([{ ...base, ncf: 'B0200000001' }, { ...base, ncf: 'E310000000123' }]);
    expect(txt.split('\n')).toHaveLength(1);
    expect(txt).toMatch(/^131123456\|1\|09\|E310000000123\|/);
  });
});

import { formaPago606, tipoBS606 } from '../src/lib/dgiiExport.js';

describe('606: forma de pago y tipo', () => {
  it('lo que guarda Compras: Contado → efectivo, Credito → crédito; tarjeta de crédito es tarjeta', () => {
    expect(formaPago606({ forma_pago: 'Contado' })).toBe('01');
    expect(formaPago606({ forma_pago: 'CREDITO' })).toBe('04');
    expect(formaPago606({ forma_pago: 'Credito' })).toBe('04');
    expect(formaPago606({ forma_pago: 'Tarjeta de Crédito' })).toBe('03');
    expect(formaPago606({ forma_pago: 'Contado', tipo_pago_detalle: 'Transferencia' })).toBe('02');
  });
  it('tipo fuera de 01-11 → 09; servicios van en la columna 8', () => {
    expect(tipoBS606({ tipo_bienes_servicios: '12' })).toBe('09');
    expect(tipoBS606({ tipo_bienes_servicios: null })).toBe('09');
    expect(tipoBS606({ tipo_bienes_servicios: '2' })).toBe('02');
    const [c] = revisar606([{ ...base, ncf: 'B0100000001', tipo_bienes_servicios: '02' }]).incluidas;
    const f = fila606(c);
    expect([f[7], f[8], f[9]]).toEqual(['1200.00', '0.00', '1200.00']);
  });
  it('tarjeta de crédito sin retenciones lleva fecha de pago', () => {
    const [c] = revisar606([{ ...base, ncf: 'B0100000001', forma_pago: 'Tarjeta de Crédito' }]).incluidas;
    expect(fila606(c)[6]).toBe('20261015');
  });
});
