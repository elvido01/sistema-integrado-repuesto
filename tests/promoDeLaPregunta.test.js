import { describe, it, expect } from 'vitest';
import { promoDeLaPregunta, familia } from '../supabase/functions/_shared/promoDeLaPregunta.mjs';

const PROMOS = [
  { producto_id: 'P1', codigo: 'JK122021', descripcion: 'AMORTIGUADOR TRASERO PLATINA 125 BAJAJ' },
  { producto_id: 'P2', codigo: 'BD1', descripcion: 'BANDA DELANTERA PLATINA 125 BAJAJ ORG' },
  { producto_id: 'P3', codigo: 'MT7', descripcion: 'ACEITE MOTUL 7100 4T 10W-40' },
];

describe('promoDeLaPregunta', () => {
  it('la familia es la primera palabra con sentido', () => {
    expect(familia('BANDA DELANTERA PLATINA')).toBe('banda');
    expect(familia('4T ACEITE')).toBe('aceite');
  });

  it('empareja por el tipo de pieza que nombra el cliente, con o sin plural', () => {
    expect(promoDeLaPregunta({ promos: PROMOS, texto: 'precio de la banda?' })?.producto_id).toBe('P2');
    expect(promoDeLaPregunta({ promos: PROMOS, texto: 'tienen amortiguadores' })?.producto_id).toBe('P1');
  });

  it('"platina" o "bajaj" solos no emparejan: están en casi todas', () => {
    expect(promoDeLaPregunta({ promos: PROMOS, texto: 'tienes piezas de platina 125 bajaj?' })).toBeNull();
  });

  it('manda lo que Hermes consultó de verdad, por id o por código', () => {
    expect(promoDeLaPregunta({ promos: PROMOS, texto: 'y el lubricante?', piezas: [{ codigo: 'mt7' }] })?.producto_id).toBe('P3');
    expect(promoDeLaPregunta({ promos: PROMOS, texto: 'x', piezas: [{ id: 'P1' }] })?.producto_id).toBe('P1');
  });

  it('sin promociones o sin coincidencia, null', () => {
    expect(promoDeLaPregunta({ promos: [], texto: 'banda' })).toBeNull();
    expect(promoDeLaPregunta({ promos: PROMOS, texto: 'tienen goma 90/90?' })).toBeNull();
  });
});
