import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
import { elegirProducto, palabrasEnComun } from '../src/lib/emparejarLineaCompra.js';

const PEDRO = 'pedro', GG = 'gg';
const varilla = { id: 1, codigo: '004264', descripcion: 'VARILLA FRENO STRYKER 125 TVS', referencia: 'N8112740', suplidor_id: GG };
const motor = { id: 2, codigo: 'V004264', descripcion: 'MOTOR ARRANQUE CG200 GRIS OSCURO VINI', referencia: '31200-CG200-VI', suplidor_id: PEDRO };
const linea = { code: '004264', reference: '31200-CG200-VI', description: 'MOTOR ARRANQUE GRIS/OSC. CG-200' };

describe('emparejar línea de compra', () => {
  it('Pedro Racing 004264: va al motor (misma referencia), no a la varilla de G&G', () => {
    expect(elegirProducto(linea, PEDRO, [varilla, motor]).producto.id).toBe(2);
  });
  it('sin referencia: el código con letra delante del mismo suplidor gana', () => {
    expect(elegirProducto({ ...linea, reference: '' }, PEDRO, [varilla, motor]).producto.id).toBe(2);
  });
  it('si solo existe la otra pieza con ese código: sin producto y con aviso', () => {
    const r = elegirProducto({ ...linea, reference: '' }, PEDRO, [varilla]);
    expect(r.producto).toBeNull();
    expect(r.aviso).toContain('VARILLA FRENO');
  });
  it('mismo código y mismo artículo: se empareja como siempre', () => {
    const r = elegirProducto({ code: '004264', reference: '', description: 'VARILLA FRENO STRYKER' }, GG, [varilla]);
    expect(r.producto.id).toBe(1);
  });
  it('la foto sin descripción: se confía en el código', () => {
    expect(elegirProducto({ code: '004264' }, PEDRO, [varilla]).producto.id).toBe(1);
  });
  it('mismo código del mismo suplidor: misma pieza aunque la describa distinto', () => {
    const espejo = { id: 9, codigo: '1234', descripcion: 'RETROVISOR IZQUIERDO', suplidor_id: PEDRO };
    expect(elegirProducto({ code: '1234', description: 'ESPEJO RETROV. IZQ' }, PEDRO, [espejo]).producto.id).toBe(9);
  });
  it('otra ficha del suplidor: basta una palabra en común (abreviada vale)', () => {
    const espejo = { id: 9, codigo: '1234', descripcion: 'RETROVISOR IZQUIERDO', suplidor_id: GG };
    expect(elegirProducto({ code: '1234', description: 'ESPEJO RETROV. IZQ' }, PEDRO, [espejo]).producto.id).toBe(9);
  });
  it('CG-200 y CG200 cuentan como la misma palabra', () => {
    expect(palabrasEnComun('MOTOR CG-200', 'MOTOR ARRANQUE CG200')).toBe(2);
  });
});
