import { describe, it, expect } from 'vitest';
import { leerPulgadas, pulgadasTexto, medidaRazonable } from '@/lib/ventanas';

describe('medidas en pulgadas', () => {
  it('lee entero, decimal y fracciones', () => {
    expect(leerPulgadas('40')).toBe(40);
    expect(leerPulgadas('40.25')).toBe(40.25);
    expect(leerPulgadas('40 1/4')).toBe(40.25);
    expect(leerPulgadas('40-1/4')).toBe(40.25);
    expect(leerPulgadas('40 1 4')).toBe(40.25);      // como en el teclado numérico
    expect(leerPulgadas('120 1 8')).toBe(120.125);
    expect(leerPulgadas('3/4')).toBe(0.75);
    expect(leerPulgadas('40,5')).toBe(40.5);
  });
  it('rechaza lo que no es medida', () => {
    expect(leerPulgadas('')).toBeNull();
    expect(leerPulgadas('abc')).toBeNull();
    expect(leerPulgadas('40 5 4')).toBeNull();        // 5/4 no es fracción propia
    expect(leerPulgadas('40 1 0')).toBeNull();
  });
  it('muestra a 1/16', () => {
    expect(pulgadasTexto(40.25)).toBe('40 1/4');
    expect(pulgadasTexto(40.125)).toBe('40 1/8');
    expect(pulgadasTexto(40.5)).toBe('40 1/2');
    expect(pulgadasTexto(40)).toBe('40');
    expect(pulgadasTexto(40.9999)).toBe('41');
    expect(pulgadasTexto(40.0625)).toBe('40 1/16');
  });
  it('medida razonable', () => {
    expect(medidaRazonable(40)).toBe(true);
    expect(medidaRazonable(2)).toBe(false);
    expect(medidaRazonable(900)).toBe(false);
    expect(medidaRazonable(null)).toBe(false);
  });
});
