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
    expect(pulgadasTexto(0.125)).toBe('1/8');
  });
  it('medida razonable', () => {
    expect(medidaRazonable(40)).toBe(true);
    expect(medidaRazonable(2)).toBe(false);
    expect(medidaRazonable(900)).toBe(false);
    expect(medidaRazonable(null)).toBe(false);
  });
});

import { desgloseVentana, planBarras, materialesProyecto } from '@/lib/ventanas';

const piezas = [
  { codigo: 'CABEZAL', nombre: 'Cabezal', tipo: 'perfil', base: 'ancho', por_hoja: false, descuento: 0.5, cant_fija: 1, cant_por_hoja: 0, orden: 1 },
  { codigo: 'LATERAL', nombre: 'Laterales', tipo: 'perfil', base: 'alto', por_hoja: false, descuento: 0.5, cant_fija: 2, cant_por_hoja: 0, orden: 2 },
  { codigo: 'CAB_HOJA', nombre: 'Cabezal de hoja', tipo: 'perfil', base: 'ancho', por_hoja: true, descuento: -0.5, cant_fija: 0, cant_por_hoja: 1, orden: 3 },
  { codigo: 'ENGANCHE', nombre: 'Enganche', tipo: 'perfil', base: 'alto', por_hoja: false, descuento: 0.875, cant_fija: -2, cant_por_hoja: 2, orden: 4 },
  { codigo: 'CRISTAL_AN', nombre: 'Cristal (ancho)', tipo: 'cristal', base: 'ancho', por_hoja: true, descuento: 2.25, cant_fija: 0, cant_por_hoja: 1, orden: 5 },
  { codigo: 'CRISTAL_AL', nombre: 'Cristal (alto)', tipo: 'cristal', base: 'alto', por_hoja: false, descuento: 3.5, cant_fija: 0, cant_por_hoja: 1, orden: 6 },
];

describe('desglose', () => {
  it('medidas y cantidades de una ventana de 2 hojas', () => {
    const d = desgloseVentana({ ancho: 40.5, alto: 40.125, hojas: 2, cantidad: 1 }, piezas);
    const p = Object.fromEntries(d.map((c) => [c.pieza.codigo, c]));
    expect(p.CABEZAL.largo).toBe(40);            // 40 1/2 − 1/2
    expect(p.LATERAL).toMatchObject({ largo: 39.625, cantidad: 2 });
    expect(p.CAB_HOJA).toMatchObject({ largo: 20.75, cantidad: 2 });   // 40.5/2 + 1/2 (20.75)
    expect(p.ENGANCHE.cantidad).toBe(2);          // 2×2 − 2
    expect(p.CRISTAL_AN.largo).toBe(18);          // 20.25 − 2.25
  });
  it('3 hojas y 2 ventanas iguales', () => {
    const d = desgloseVentana({ ancho: 120.125, alto: 40.25, hojas: 3, cantidad: 2 }, piezas);
    const p = Object.fromEntries(d.map((c) => [c.pieza.codigo, c]));
    expect(p.ENGANCHE.cantidad).toBe(8);          // (3×2 − 2) × 2
    expect(p.CAB_HOJA.cantidad).toBe(6);
    expect(p.CAB_HOJA.largo).toBe(40.5625);       // 120.125/3 + 0.5 = 40.54 → 40 9/16
  });
  it('plan de barras de 240" con merma', () => {
    const r = planBarras([120, 120, 100, 60], 240, 0.125);
    expect(r.barras.length).toBe(2);
    expect(r.barras[0].cortes).toEqual([120, 100]);
    expect(planBarras([250], 240).sinCaber).toEqual([250]);
  });
  it('materiales del proyecto por perfil y color', () => {
    const m = materialesProyecto([{ sistema_id: 's', ancho: 40.5, alto: 40.125, hojas: 2, cantidad: 1, color: 'Blanco' }], { s: piezas }, { largo_barra: 240 });
    const lat = m.perfiles.find((x) => x.perfil === 'Laterales');
    expect(lat.cortes).toEqual([39.625, 39.625]);
    expect(lat.barras).toBe(1);
    expect(m.cristales[0]).toMatchObject({ ancho: 18, alto: 36.625, cantidad: 2 });
  });
});
