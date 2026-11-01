import { describe, expect, it } from 'vitest';
import { lineasCatalogo, precioCatalogo } from '../scripts/arteCatalogo.mjs';

describe('Arte catálogo: la franja', () => {
  it('acepta la propuesta de la IA si solo usa palabras de la descripción', () => {
    expect(lineasCatalogo('PISTON KIT STD C110 DAWN 125', { tipo: 'PISTON KIT STD', moto: 'C 110/DAWN 125' }))
      .toEqual({ tipo: 'PISTON KIT STD', moto: 'C 110/DAWN 125' });
  });

  it('rechaza una propuesta con palabras inventadas y parte la descripción', () => {
    const r = lineasCatalogo('MOTOR DE ARRANQUE CG200 GRIS RHYNO', { tipo: 'MOTOR DE ARRANQUE ORIGINAL', moto: 'CG 200' });
    expect(r).toEqual({ tipo: 'MOTOR DE ARRANQUE', moto: 'CG200 GRIS RHYNO' });
  });

  it('sin modelo de moto, todo es el tipo', () => {
    expect(lineasCatalogo('ACEITE 20W50 MINERAL DTS-11L BAJAJ')).toEqual({ tipo: 'ACEITE 20W50 MINERAL DTS-11L BAJAJ', moto: '' });
  });

  it('el precio redondeado del catálogo', () => {
    expect(precioCatalogo(2350.03)).toBe('RD$ 2,350');
    expect(precioCatalogo(0)).toBe('');
  });
});
