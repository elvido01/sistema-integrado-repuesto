// La tasa es MENSUAL, no "por cuota".
//
// (2026-08-24) El dueño originó un préstamo diario y salió esto:
//
//   Capital 15,000 · tasa 10 · 60 cuotas diarias
//   -> Interés: 90,000 · Total a pagar: 105,000 · Cuota: 1,750
//
// Lo correcto son 60 cuotas de 300. La fórmula aplicaba la tasa al capital
// completo en CADA cuota sin mirar la frecuencia, así que un 10% mensual se
// volvía 10% DIARIO — 600% en dos meses.
//
// Se prueba con SUS números, no con inventados.

import { describe, it, expect } from 'vitest';
import { calcAmortizacion, mesesPorCuota } from '../src/components/financiera/amortizacion';

const total = (cs, campo) => Math.round(cs.reduce((a, c) => a + c[campo], 0) * 100) / 100;

describe('el préstamo diario del dueño', () => {
  const cuotas = calcAmortizacion({
    monto: 15000, tasa: 10, plazo: 60,
    metodo: 'simple', frecuencia: 'diario', fechaPrimera: '2026-08-25',
  });

  it('son 60 cuotas de 300', () => {
    expect(cuotas).toHaveLength(60);
    for (const c of cuotas) expect(c.monto_cuota).toBeCloseTo(300, 2);
  });

  it('el interés es 3,000 y no 90,000', () => {
    expect(total(cuotas, 'interes')).toBeCloseTo(3000, 2);
    expect(total(cuotas, 'monto_cuota')).toBeCloseTo(18000, 2);
  });

  it('el capital cuadra exacto: ni un peso de más ni de menos', () => {
    expect(total(cuotas, 'capital')).toBeCloseTo(15000, 2);
  });

  it('la primera cuota vence al día siguiente, no al mes', () => {
    expect(cuotas[0].fecha_vencimiento).toBe('2026-08-25');
    expect(cuotas[1].fecha_vencimiento).toBe('2026-08-26');
  });
});

describe('el mensual no se toca', () => {
  // 28,430 préstamos vivos usan esto. Si cambia, cambia la cartera entera.
  const cuotas = calcAmortizacion({
    monto: 15000, tasa: 10, plazo: 12,
    metodo: 'simple', frecuencia: 'mensual', fechaPrimera: '2026-09-24',
  });

  it('sigue dando 2,750 por cuota', () => {
    expect(cuotas[0].monto_cuota).toBeCloseTo(2750, 2);
    expect(cuotas[0].capital).toBeCloseTo(1250, 2);
    expect(cuotas[0].interes).toBeCloseTo(1500, 2);
  });

  it('una cuota mensual ES un mes', () => {
    expect(mesesPorCuota('mensual')).toBe(1);
  });
});

describe('las frecuencias del medio', () => {
  it('quincenal cobra medio mes por cuota', () => {
    const c = calcAmortizacion({
      monto: 15000, tasa: 10, plazo: 24,
      metodo: 'simple', frecuencia: 'quincenal', fechaPrimera: '2026-09-08',
    });
    // capital 625 + interés 750 (la mitad de 1,500)
    expect(c[0].monto_cuota).toBeCloseTo(1375, 2);
    expect(c[0].interes).toBeCloseTo(750, 2);
  });

  it('semanal cobra 7/30 de mes por cuota', () => {
    const c = calcAmortizacion({
      monto: 15000, tasa: 10, plazo: 52,
      metodo: 'simple', frecuencia: 'semanal', fechaPrimera: '2026-08-31',
    });
    expect(c[0].interes).toBeCloseTo(350, 2);   // 1,500 × 7/30
  });
});

describe('lo que costaba el error', () => {
  it('el número viejo era 105,000 sobre un capital de 15,000', () => {
    // Lo que salía antes: interés = P × i en cada una de las 60 cuotas.
    const viejo = 15000 * 0.10 * 60;
    expect(viejo).toBe(90000);
    // Y lo que sale ahora sobre el mismo préstamo.
    const c = calcAmortizacion({
      monto: 15000, tasa: 10, plazo: 60,
      metodo: 'simple', frecuencia: 'diario', fechaPrimera: '2026-08-25',
    });
    expect(total(c, 'interes')).toBeLessThan(viejo / 25);
  });
});
