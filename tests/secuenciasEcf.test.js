// Carga de rangos e-NCF (31/10/2026): número pelado o e-NCF pegado, sin
// inventar números y sin juntar una autorización nueva con la vieja.
import { describe, it, expect } from 'vitest';
import { leerSecuencia, validarRango, sugerirDesde } from '../src/lib/ecfSecuencias.js';

describe('leerSecuencia', () => {
  it('acepta el número pelado y el e-NCF completo', () => {
    expect(leerSecuencia('600')).toEqual({ n: 600 });
    expect(leerSecuencia(' E320000000600 ')).toEqual({ n: 600, tipo: '32' });
    expect(leerSecuencia('e310000000015')).toEqual({ n: 15, tipo: '31' });
  });
  it('separadores solo como miles', () => {
    expect(leerSecuencia('1,000')).toEqual({ n: 1000 });
    expect(leerSecuencia('7.500').error).toBeTruthy();
    expect(leerSecuencia('600.500').error).toBeTruthy();
    expect(leerSecuencia('1,000.00').error).toBeTruthy();
    expect(leerSecuencia('600.5').error).toBeTruthy();
  });
  it('rechaza 12 dígitos sin la E y tipos que no existen', () => {
    expect(leerSecuencia('320000000600').error).toBe('formato');
    expect(leerSecuencia('E990000000001').error).toBe('tipo');
  });
});

describe('validarRango', () => {
  const e32 = { tipo_ecf: '32', desde: 1, hasta: 600, ultimo: 550, quedan: 50 };
  it('rango nuevo sin nada cargado', () => {
    expect(validarRango('32', '1', '600', null)).toEqual({ d: 1, h: 600, caso: 'nuevo' });
  });
  it('e-NCF de otro tipo que el elegido', () => {
    expect(validarRango('32', 'E310000000001', 'E310000000015', null).error).toMatch(/E31/);
  });
  it('no deja empezar dentro del rango ya autorizado', () => {
    expect(validarRango('32', '551', '1200', e32).error).toMatch(/E320000000601/);
  });
  it('el rango que sigue y el que salta', () => {
    expect(validarRango('32', '601', '1200', e32).caso).toBe('siguiente');
    expect(validarRango('32', '6001', '7000', e32).caso).toBe('salto');
  });
  it('corrige el rango cargado (mismo Desde) sin bajar de lo ya usado', () => {
    expect(validarRango('32', '1', '7500', e32).caso).toBe('correccion');
    expect(validarRango('32', '1', '560', e32).caso).toBe('correccion');
    expect(validarRango('32', '1', '550', e32).error).toBeTruthy();
  });
  it('desde 0 o hasta menor', () => {
    expect(validarRango('32', '0', '5', null).error).toBeTruthy();
    expect(validarRango('32', '10', '5', null).error).toBeTruthy();
  });
  it('sugiere el siguiente al autorizado', () => {
    expect(sugerirDesde(e32)).toBe('601');
    expect(sugerirDesde(null)).toBe('1');
  });
});
