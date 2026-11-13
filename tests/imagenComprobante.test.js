import { describe, it, expect } from 'vitest';
import { medidasAchicadas, rutaComprobante, LADO_MAXIMO } from '../src/lib/imagenComprobante.js';

describe('fotos de comprobantes', () => {
  it('achica el lado mayor a 1600 conservando la proporción', () => {
    expect(medidasAchicadas(4000, 3000)).toEqual({ ancho: 1600, alto: 1200 });
    expect(medidasAchicadas(3000, 4000)).toEqual({ ancho: 1200, alto: 1600 });
  });
  it('nunca agranda una foto pequeña', () => {
    expect(medidasAchicadas(800, 600)).toEqual({ ancho: 800, alto: 600 });
    expect(LADO_MAXIMO).toBe(1600);
  });
  it('medidas raras no revientan', () => {
    expect(medidasAchicadas(0, 0)).toEqual({ ancho: 1, alto: 1 });
  });
  it('la ruta lleva la empresa primero (las políticas del bucket miran esa carpeta)', () => {
    const r = rutaComprobante('abc-123', new Date(2026, 10, 12), 'id1');
    expect(r).toBe('abc-123/2026/11/id1.jpg');
  });
});

import { fechaValida } from '../src/lib/imagenComprobante.js';
describe('fecha del comprobante', () => {
  it('acepta fechas reales', () => { expect(fechaValida('2026-11-05')).toBe(true); expect(fechaValida('2024-02-29')).toBe(true); });
  it('rechaza las que no existen o vienen mal', () => {
    for (const f of ['2026-02-30', '2026-00-00', '2026-13-01', '05/11/2026', '', null]) expect(fechaValida(f)).toBe(false);
  });
});
