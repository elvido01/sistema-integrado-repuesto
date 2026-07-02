import { describe, it, expect } from 'vitest';
import {
  formatCurrencyDOP,
  computeComparacion,
  computeMetaEstado,
} from '@/lib/flujoNeto';

describe('formatCurrencyDOP', () => {
  it('formatea con 2 decimales por defecto', () => {
    expect(formatCurrencyDOP(85000)).toMatch(/85,000\.00/);
  });

  it('permite ocultar decimales', () => {
    const s = formatCurrencyDOP(85000, { decimals: 0 });
    expect(s).toMatch(/85,000/);
    expect(s).not.toMatch(/\.00/);
  });

  it('mantiene el signo negativo', () => {
    expect(formatCurrencyDOP(-55000, { decimals: 0 })).toMatch(/-.*55,000/);
  });

  it('trata valores no numéricos como 0', () => {
    expect(formatCurrencyDOP(null, { decimals: 0 })).toMatch(/0/);
    expect(formatCurrencyDOP(undefined, { decimals: 0 })).toMatch(/0/);
    expect(formatCurrencyDOP(NaN, { decimals: 0 })).toMatch(/0/);
  });
});

describe('computeComparacion', () => {
  it('ambos positivos: mejora con % correcto (85k vs 60k = +41.67%)', () => {
    const r = computeComparacion(85000, 60000, true);
    expect(r.tipo).toBe('mejora');
    expect(r.tono).toBe('positivo');
    expect(r.direccion).toBe('up');
    expect(r.diferencia).toBe(25000);
    expect(r.variacionPorcentual).toBeCloseTo(41.67, 1);
    expect(r.mensaje).toBe('+41.67% vs mismo período del mes anterior');
  });

  it('ambos positivos: deterioro cuando baja', () => {
    const r = computeComparacion(40000, 60000, true);
    expect(r.tipo).toBe('deterioro');
    expect(r.tono).toBe('negativo');
    expect(r.direccion).toBe('down');
    expect(r.variacionPorcentual).toBeCloseTo(-33.33, 1);
  });

  it('actual positivo y anterior negativo: recuperación (sin % engañoso)', () => {
    const r = computeComparacion(15000, -20000, true);
    expect(r.tipo).toBe('recuperacion');
    expect(r.variacionPorcentual).toBeNull();
    expect(r.tono).toBe('positivo');
    expect(r.mensaje).toMatch(/Recuperación de/);
    expect(r.mensaje).toMatch(/35,000/); // 15000 - (-20000)
  });

  it('actual negativo y anterior positivo: caída de positivo a negativo', () => {
    const r = computeComparacion(-10000, 40000, true);
    expect(r.tipo).toBe('caida');
    expect(r.variacionPorcentual).toBeNull();
    expect(r.tono).toBe('negativo');
    expect(r.mensaje).toBe('El flujo pasó de positivo a negativo');
  });

  it('ambos negativos: el déficit mejora => mejora (-20k vs -50k = +60%)', () => {
    const r = computeComparacion(-20000, -50000, true);
    expect(r.tipo).toBe('mejora');
    expect(r.tono).toBe('positivo');
    expect(r.diferencia).toBe(30000);
    expect(r.variacionPorcentual).toBeCloseTo(60, 1);
  });

  it('ambos negativos: el déficit empeora => deterioro', () => {
    const r = computeComparacion(-50000, -20000, true);
    expect(r.tipo).toBe('deterioro');
    expect(r.tono).toBe('negativo');
    expect(r.diferencia).toBe(-30000);
  });

  it('mes anterior en cero: sin base comparable', () => {
    const r = computeComparacion(85000, 0, true);
    expect(r.tipo).toBe('sin_base');
    expect(r.variacionPorcentual).toBeNull();
    expect(r.mensaje).toBe('Sin base comparable');
  });

  it('mes anterior sin datos: sin base comparable aunque el número sea 0', () => {
    const r = computeComparacion(85000, 0, false);
    expect(r.tipo).toBe('sin_base');
    expect(r.mensaje).toBe('Sin base comparable');
  });
});

describe('computeMetaEstado', () => {
  it('verde cuando la proyección alcanza o supera la meta', () => {
    expect(computeMetaEstado(120000, 120000).estado).toBe('verde');
    expect(computeMetaEstado(150000, 120000).estado).toBe('verde');
  });

  it('amarillo entre 80% y 99% de la meta', () => {
    expect(computeMetaEstado(98000, 120000).estado).toBe('amarillo'); // 81.67%
    expect(computeMetaEstado(119000, 120000).estado).toBe('amarillo'); // 99.17%
  });

  it('rojo por debajo del 80%', () => {
    expect(computeMetaEstado(60000, 120000).estado).toBe('rojo'); // 50%
  });

  it('gris cuando no hay meta configurada', () => {
    expect(computeMetaEstado(50000, 0).estado).toBe('gris');
    expect(computeMetaEstado(50000, 0).porcentaje).toBeNull();
  });

  it('calcula el porcentaje de la meta', () => {
    expect(computeMetaEstado(98000, 120000).porcentaje).toBeCloseTo(81.67, 1);
  });
});
