import { describe, it, expect } from 'vitest';
import {
  sueldoPorPeriodo,
  factorPeriodo,
  calcularTssEmpleado,
  calcularIsrMensual,
  calcularDetalleNomina,
  pendienteAdelanto,
  proponerDescuentos,
} from '../src/lib/nominaUtils.js';

describe('sueldoPorPeriodo / factorPeriodo', () => {
  it('mensual, quincenal y semanal (12 pagas / 52 semanas)', () => {
    expect(sueldoPorPeriodo(26000, 'mensual')).toBe(26000);
    expect(sueldoPorPeriodo(26000, 'quincenal')).toBe(13000);
    expect(sueldoPorPeriodo(26000, 'semanal')).toBe(6000); // 26000*12/52
    expect(factorPeriodo('mensual')).toBe(1);
    expect(factorPeriodo('quincenal')).toBe(0.5);
    expect(factorPeriodo('semanal')).toBeCloseTo(12 / 52, 10);
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
    expect(d.sueldo_base).toBeCloseTo(12000 * 12 / 52, 2);
    expect(d.tss_afp).toBe(0);
    expect(d.isr).toBe(0);
    expect(d.neto).toBe(d.sueldo_base);
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
