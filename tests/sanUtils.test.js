import { describe, it, expect } from 'vitest';
import {
  planPagos,
  aplicarPagoEnCascada,
  estadoDia,
  estadisticasSan,
} from '../src/lib/sanUtils.js';

const HOY = '2026-07-18';

describe('planPagos', () => {
  it('reparte exacto cuando divide parejo', () => {
    const p = planPagos(150000, 30);
    expect(p.pagoDiario).toBe(5000);
    expect(p.ultimoDia).toBe(5000);
    expect(p.pagoDiario * 29 + p.ultimoDia).toBe(150000);
  });
  it('el último día absorbe el redondeo (el total SIEMPRE cuadra)', () => {
    const p = planPagos(100000, 30);
    expect(p.pagoDiario).toBe(3333.33);
    expect(p.ultimoDia).toBe(3333.43);
    expect(Math.round((p.pagoDiario * 29 + p.ultimoDia) * 100) / 100).toBe(100000);
  });
});

describe('aplicarPagoEnCascada', () => {
  const dia = (n, falta) => ({ numero_dia: n, falta });

  it('pago exacto llena el día', () => {
    const r = aplicarPagoEnCascada([dia(18, 5000)], 5000);
    expect(r.aplicaciones).toEqual([{ numero_dia: 18, monto: 5000 }]);
    expect(r.sobrante).toBe(0);
  });
  it('pago superior llena los días siguientes en cascada (RD$15,000 = días 18, 19 y 20)', () => {
    const r = aplicarPagoEnCascada([dia(18, 5000), dia(19, 5000), dia(20, 5000)], 15000);
    expect(r.aplicaciones).toEqual([
      { numero_dia: 18, monto: 5000 },
      { numero_dia: 19, monto: 5000 },
      { numero_dia: 20, monto: 5000 },
    ]);
    expect(r.sobrante).toBe(0);
  });
  it('pago menor deja el día en parcial', () => {
    const r = aplicarPagoEnCascada([dia(18, 5000), dia(19, 5000)], 3000);
    expect(r.aplicaciones).toEqual([{ numero_dia: 18, monto: 3000 }]);
  });
  it('completa un parcial y sigue con el siguiente', () => {
    const r = aplicarPagoEnCascada([dia(18, 2000), dia(19, 5000)], 6000);
    expect(r.aplicaciones).toEqual([
      { numero_dia: 18, monto: 2000 },
      { numero_dia: 19, monto: 4000 },
    ]);
  });
  it('si sobra después del último día, lo reporta sin inventar días', () => {
    const r = aplicarPagoEnCascada([dia(30, 3333.43)], 10000);
    expect(r.aplicaciones).toEqual([{ numero_dia: 30, monto: 3333.43 }]);
    expect(r.sobrante).toBe(6666.57);
  });
});

describe('estadoDia', () => {
  it('pagado / parcial / atrasado / pendiente / hoy', () => {
    expect(estadoDia({ estado: 'Pagado', fecha_programada: '2026-07-10' }, HOY)).toBe('pagado');
    expect(estadoDia({ estado: 'Parcial', fecha_programada: '2026-07-25' }, HOY)).toBe('parcial');
    expect(estadoDia({ estado: 'Pendiente', fecha_programada: '2026-07-10' }, HOY)).toBe('atrasado');
    expect(estadoDia({ estado: 'Parcial', fecha_programada: '2026-07-10' }, HOY)).toBe('atrasado');
    expect(estadoDia({ estado: 'Pendiente', fecha_programada: '2026-07-25' }, HOY)).toBe('pendiente');
    expect(estadoDia({ estado: 'Pendiente', fecha_programada: HOY }, HOY)).toBe('pendiente');
  });
});

describe('estadisticasSan', () => {
  it('cuenta días, montos, porcentaje y promedio', () => {
    const pagos = [
      { numero_dia: 1, fecha_programada: '2026-07-15', monto_programado: 5000, monto_pagado: 5000, estado: 'Pagado' },
      { numero_dia: 2, fecha_programada: '2026-07-16', monto_programado: 5000, monto_pagado: 3000, estado: 'Parcial' },
      { numero_dia: 3, fecha_programada: '2026-07-17', monto_programado: 5000, monto_pagado: 0, estado: 'Pendiente' },
      { numero_dia: 4, fecha_programada: HOY, monto_programado: 5000, monto_pagado: 0, estado: 'Pendiente' },
      { numero_dia: 5, fecha_programada: '2026-07-19', monto_programado: 5000, monto_pagado: 0, estado: 'Pendiente' },
    ];
    const s = estadisticasSan(pagos, HOY);
    expect(s.completados).toBe(1);
    expect(s.parciales).toBe(1);
    expect(s.atrasados).toBe(2);       // día 2 (parcial vencido) y día 3
    expect(s.pendientes).toBe(4);      // todo lo no pagado (incluye hoy y futuro)
    expect(s.ahorrado).toBe(8000);
    expect(s.restante).toBe(17000);
    expect(s.porcentaje).toBe(32);     // 8,000 / 25,000
    expect(s.deudaAtrasada).toBe(7000); // 2,000 del día 2 + 5,000 del día 3
    expect(s.promedioDiario).toBe(2000); // 8,000 en 4 días transcurridos (15-18)
  });
});
