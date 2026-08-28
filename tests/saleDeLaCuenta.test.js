// El caso real: PS-000020, TERUEL, 28/08/2026.
// US$4,650.66 en efectivo a tasa 58.90 = RD$273,923.87, sacados de la
// CAJA CHICA — Dólares. La caja no se movió.

import { describe, it, expect } from 'vitest';
import {
  montoQueSaleDeLaCuenta, salidaParaLaCuenta, hayQuePreguntarCuenta,
} from '../src/lib/saleDeLaCuenta';

const USD = { moneda: 'USD', banco: 'CAJA CHICA', alias: 'Dólares' };
const DOP = { moneda: 'DOP', banco: 'CAJA CHICA', alias: 'Pesos' };

const efectivo = (monto) => [{ id: 1, forma: 'Efectivo', monto }];
const transfer = (monto) => [{ id: 1, forma: 'Transferencia', monto }];

describe('el efectivo en pesos no toca cuentas', () => {
  it('no le resta nada a una cuenta en pesos', () => {
    // El cierre de caja ya se lo resta. Contarlo aqui seria dos veces.
    expect(montoQueSaleDeLaCuenta(efectivo(273923.87), DOP)).toBe(0);
  });

  it('sin cuenta elegida, no sale nada de ningun lado', () => {
    expect(montoQueSaleDeLaCuenta(transfer(5000), null)).toBe(0);
  });
});

describe('el efectivo en dolares SI toca la caja de dolares', () => {
  it('PS-000020 tenia que bajar la caja en US$4,650.66', () => {
    const formas = efectivo(273923.87);
    expect(montoQueSaleDeLaCuenta(formas, USD)).toBe(273923.87);
    const { monto, faltaTasa } = salidaParaLaCuenta(formas, USD, 58.9);
    expect(faltaTasa).toBe(false);
    expect(monto).toBeCloseTo(4650.66, 2);
  });

  it('sin tasa no se mueve nada, y se avisa', () => {
    // Restarle pesos a una caja en dolares le deja el saldo inventado.
    const r = salidaParaLaCuenta(efectivo(273923.87), USD, 0);
    expect(r).toEqual({ monto: 0, faltaTasa: true });
  });
});

describe('la transferencia sale de la cuenta siempre', () => {
  it('en pesos, tal cual', () => {
    expect(salidaParaLaCuenta(transfer(150000), DOP, 0)).toEqual({ monto: 150000, faltaTasa: false });
  });

  it('en dolares, convertida (PS-000019: US$5,000 a 59.10)', () => {
    const { monto } = salidaParaLaCuenta(transfer(295500), USD, 59.1);
    expect(monto).toBeCloseTo(5000, 2);
  });
});

describe('un pago mixto reparte bien', () => {
  it('de una cuenta en pesos solo sale la transferencia', () => {
    const formas = [
      { forma: 'Transferencia', monto: 100000 },
      { forma: 'Efectivo', monto: 50000 },
    ];
    expect(montoQueSaleDeLaCuenta(formas, DOP)).toBe(100000);
  });

  it('de una caja en dolares sale todo', () => {
    const formas = [
      { forma: 'Transferencia', monto: 100000 },
      { forma: 'Efectivo', monto: 50000 },
    ];
    expect(montoQueSaleDeLaCuenta(formas, USD)).toBe(150000);
  });
});

describe('cuando hay que preguntar de que cuenta salio', () => {
  it('con transferencia, siempre', () => {
    expect(hayQuePreguntarCuenta(transfer(1), false)).toBe(true);
  });

  it('con efectivo en pesos, no se pregunta', () => {
    expect(hayQuePreguntarCuenta(efectivo(1), false)).toBe(false);
  });

  it('con efectivo y dolares de por medio, si', () => {
    expect(hayQuePreguntarCuenta(efectivo(1), true)).toBe(true);
  });
});
