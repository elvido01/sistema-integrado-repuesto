import { describe, expect, it } from 'vitest';
import { vozConPrecio, partirNombre, rangoTexto, precioPantalla } from '../scripts/armarSemanal.mjs';

describe('Piezas de la semana', () => {
  it('la voz termina con el precio del catálogo, redondeado', () => {
    expect(vozConPrecio('Aquí tenemos el amortiguador de la Platina 125', 2350.03, 0))
      .toBe('Aquí tenemos el amortiguador de la Platina 125. Tiene un costo de 2,350 pesos.');
  });

  it('si el texto ya traía un precio, se quita y queda solo el del catálogo', () => {
    const v = vozConPrecio('Aquí tenemos la banda. Cuesta 999 pesos.', 300, 1);
    expect(v).toBe('Aquí tenemos la banda. Su precio es de 300 pesos.');
    expect(v).not.toMatch(/999/);
  });

  it('sin texto, solo el precio', () => {
    expect(vozConPrecio('', 400, 3)).toBe('Está en 400 pesos.');
  });

  it('el nombre se parte sin perder palabras, en 3 renglones como mucho', () => {
    const nombre = 'TAPA LATERAL IZQUIERDA AZUL PLATINA 125 BAJAJ ORIGINAL DE FABRICA CON SOPORTE';
    const l = partirNombre(nombre, 21);
    expect(l.length).toBeLessThanOrEqual(3);
    expect(l.join(' ')).toBe(nombre);
  });

  it('el rango de fechas en español', () => {
    expect(rangoTexto('2026-10-26', '2026-11-01')).toBe('Del 26 de octubre al 1 de noviembre');
    expect(rangoTexto('2026-11-02', '2026-11-08')).toBe('Del 2 al 8 de noviembre');
  });

  it('el precio en pantalla', () => {
    expect(precioPantalla(1100)).toBe('RD$ 1,100');
  });
});
