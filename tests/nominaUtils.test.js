import { describe, it, expect } from 'vitest';
import {
  sueldoPorPeriodo,
  factorPeriodo,
  tarifaSabado,
  calcularTssEmpleado,
  calcularIsrMensual,
  calcularDetalleNomina,
  pendienteAdelanto,
  proponerDescuentos,
  periodoSugerido,
} from '../src/lib/nominaUtils.js';

describe('sueldoPorPeriodo / factorPeriodo', () => {
  // El semanal NO se deriva del mensual salvo que el empleado no tenga su
  // tarifa puesta. Dividir entre 4 o entre 52/12 se lleva un sueldo mensual
  // entero de diferencia al año, y cuál de los dos es el bueno depende de
  // cómo le paga el dueño a cada persona — no de la aritmética.
  it('mensual y quincenal se derivan; el semanal cae a sueldo/4 sin tarifa propia', () => {
    expect(sueldoPorPeriodo(26000, 'mensual')).toBe(26000);
    expect(sueldoPorPeriodo(26000, 'quincenal')).toBe(13000);
    expect(sueldoPorPeriodo(26000, 'semanal')).toBe(6500); // 26000/4, un sábado
    expect(factorPeriodo('mensual')).toBe(1);
    expect(factorPeriodo('quincenal')).toBe(0.5);
    expect(factorPeriodo('semanal')).toBeCloseTo(0.25, 10); // un sábado = un cuarto de mes
  });
});

describe('tarifa semanal propia del empleado', () => {
  it('si el empleado tiene su tarifa, manda esa y no se calcula nada', () => {
    const emp = { sueldo_mensual: 26000, sueldo_semanal: 6000 };
    expect(tarifaSabado(26000, emp)).toBe(6000);
    expect(sueldoPorPeriodo(26000, 'semanal', undefined, emp)).toBe(6000);
  });
  it('sin tarifa propia cae a sueldo/4', () => {
    expect(tarifaSabado(26000, { sueldo_mensual: 26000 })).toBe(6500);
    expect(tarifaSabado(26000, null)).toBe(6500);
  });
  it('una tarifa en cero o basura no cuenta como puesta', () => {
    expect(tarifaSabado(26000, { sueldo_semanal: 0 })).toBe(6500);
    expect(tarifaSabado(26000, { sueldo_semanal: null })).toBe(6500);
  });
});

describe('calcularTssEmpleado (tasas TSS 2026: AFP 2.87%, SFS 3.04%)', () => {
  it('empleado que cotiza: porcentajes sobre el sueldo mensual', () => {
    expect(calcularTssEmpleado(26000, true)).toEqual({ afp: 746.2, sfs: 790.4 });
  });
  it('empleado que NO cotiza: cero', () => {
    expect(calcularTssEmpleado(26000, false)).toEqual({ afp: 0, sfs: 0 });
  });
  it('respeta topes cotizables 2026 (AFP RD$464,460; SFS RD$232,230)', () => {
    const r = calcularTssEmpleado(500000, true);
    expect(r.afp).toBe(13330.0);   // 464,460 * 2.87%
    expect(r.sfs).toBe(7059.79);   // 232,230 * 3.04%
  });
});

describe('calcularIsrMensual (escala DGII 2026, base = bruto - TSS)', () => {
  it('exento hasta RD$416,220 anual', () => {
    expect(calcularIsrMensual(34685)).toBe(0);
    expect(calcularIsrMensual(20000)).toBe(0);
  });
  it('tramo 15%', () => {
    expect(calcularIsrMensual(40000)).toBe(797.25); // (480,000-416,220)*15% /12
  });
  it('tramo 20% (fijo 31,216)', () => {
    expect(calcularIsrMensual(60000)).toBe(4195.85); // 31,216+(720,000-624,329)*20% /12
  });
  it('tramo 25% (fijo 79,776)', () => {
    expect(calcularIsrMensual(100000)).toBe(13582.94); // 79,776+(1,200,000-867,123)*25% /12
  });
});

describe('calcularDetalleNomina', () => {
  it('quincenal con TSS, adelanto y otros', () => {
    const d = calcularDetalleNomina(
      { sueldo_mensual: 26000, frecuencia_pago: 'quincenal', cotiza_tss: true },
      { adelantosDescuento: 2000, otrosIngresos: 500, otrosDescuentos: 100 }
    );
    expect(d.sueldo_base).toBe(13000);
    expect(d.tss_afp).toBe(373.1);   // mitad de 746.20
    expect(d.tss_sfs).toBe(395.2);   // mitad de 790.40
    expect(d.isr).toBe(0);           // 26,000 - TSS queda bajo el exento
    expect(d.neto).toBe(10631.7);    // 13,000+500-373.10-395.20-2,000-100
  });
  it('sin TSS es sueldo simple', () => {
    const d = calcularDetalleNomina(
      { sueldo_mensual: 12000, frecuencia_pago: 'semanal', cotiza_tss: false },
      {}
    );
    expect(d.sueldo_base).toBe(3000); // 12000/4, sin tarifa propia
    expect(d.tss_afp).toBe(0);
    expect(d.isr).toBe(0);
    expect(d.neto).toBe(d.sueldo_base);
  });
  it('sin TSS NO se aplica NINGÚN descuento de ley, ni ISR (empleado informal)', () => {
    const d = calcularDetalleNomina(
      { sueldo_mensual: 60000, frecuencia_pago: 'quincenal', cotiza_tss: false },
      {}
    );
    expect(d.tss_afp).toBe(0);
    expect(d.tss_sfs).toBe(0);
    expect(d.isr).toBe(0);        // aunque el sueldo pase del exento
    expect(d.neto).toBe(30000);   // quincena limpia
  });
  it('el ISR del período se prorratea con el factor', () => {
    const d = calcularDetalleNomina(
      { sueldo_mensual: 60000, frecuencia_pago: 'quincenal', cotiza_tss: true },
      {}
    );
    // ISR mensual sobre (60,000 - 3,546 TSS) = 56,454 → anual 677,448
    // 31,216 + (677,448-624,329)*20% = 41,839.80 → /12 = 3,486.65 → quincena 1,743.33
    expect(d.isr).toBe(1743.33);
  });
});

describe('periodoSugerido (pago 15 y 30)', () => {
  it('quincenal 1ra: del 1 al 15, paga el 15', () => {
    expect(periodoSugerido('quincenal', '2026-07-10'))
      .toEqual({ desde: '2026-07-01', hasta: '2026-07-15', fecha_pago: '2026-07-15' });
  });
  it('quincenal 2da: del 16 a fin de mes, paga el 30 (aunque el mes tenga 31)', () => {
    expect(periodoSugerido('quincenal', '2026-07-18'))
      .toEqual({ desde: '2026-07-16', hasta: '2026-07-31', fecha_pago: '2026-07-30' });
  });
  it('quincenal 2da en febrero: paga el último día (28), no el 30', () => {
    expect(periodoSugerido('quincenal', '2026-02-20'))
      .toEqual({ desde: '2026-02-16', hasta: '2026-02-28', fecha_pago: '2026-02-28' });
  });
  it('mensual: mes completo, paga el último día', () => {
    expect(periodoSugerido('mensual', '2026-07-18'))
      .toEqual({ desde: '2026-07-01', hasta: '2026-07-31', fecha_pago: '2026-07-31' });
  });
  it('semanal: lunes a sábado de la semana de hoy, paga el sábado', () => {
    const p = periodoSugerido('semanal', '2026-07-18');
    expect(p.fecha_pago).toBe(p.hasta);
    expect(p.desde <= '2026-07-18' && '2026-07-18' <= p.hasta).toBe(true);
    const dias = (new Date(p.hasta) - new Date(p.desde)) / 864e5;
    expect(dias).toBe(5);
  });
});

describe('adelantos', () => {
  it('pendienteAdelanto = monto - descontado', () => {
    expect(pendienteAdelanto({ monto: 3000, descontado: 1200 })).toBe(1800);
    expect(pendienteAdelanto({ monto: 3000 })).toBe(3000);
  });
  it('proponerDescuentos propone el pendiente completo por adelanto', () => {
    const r = proponerDescuentos([
      { id: 'a', pendiente: 3000 },
      { id: 'b', pendiente: 1500 },
    ]);
    expect(r).toEqual([{ id: 'a', monto: 3000 }, { id: 'b', monto: 1500 }]);
    expect(r.reduce((s, x) => s + x.monto, 0)).toBe(4500);
  });
});
