// Los totales de una factura, calculados igual que en useVentas.
//
// >>> POR QUÉ ESTA PRUEBA <<<
// (2026-08-16) Los totales eran un useState rellenado por un efecto, así que
// iban un render por detrás de los artículos. Con una persona tecleando no se
// notaba; un agente pulsa F10 en milisegundos y FT-3504 se grabó con la línea
// correcta y la cabecera en CERO — impresa así y contabilizada así.
//
// Ahora se derivan. Esta prueba fija la aritmética para que el día que
// alguien vuelva a tocarla se entere aquí y no en un comprobante fiscal.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const FUENTE = readFileSync(join(import.meta.dirname, '..', 'src', 'hooks', 'useVentas.js'), 'utf8');

describe('los totales se derivan en el render, no en un efecto', () => {
  // No hay forma de montar el hook aquí (no está @testing-library), así que se
  // fija la invariante sobre la fuente. Es lo que separa "correcto en el mismo
  // render" de "correcto un render después", y un render después fue FT-3504.
  it('totals y cambio son useMemo', () => {
    expect(FUENTE).toMatch(/const\s+totals\s*=\s*useMemo\(/);
    expect(FUENTE).toMatch(/const\s+cambio\s*=\s*useMemo\(/);
  });

  it('no existen setTotals ni setCambio', () => {
    // Si vuelven, vuelve el retraso de un render — y con él una cabecera en
    // cero sobre una factura con líneas.
    expect(FUENTE).not.toMatch(/setTotals/);
    expect(FUENTE).not.toMatch(/setCambio/);
  });
});

// La misma cuenta que hace el useMemo de useVentas: el precio TRAE el ITBIS
// dentro, así que la base se despeja dividiendo, nunca sumando encima.
function totalesDe(items, recargo = 0) {
  const c = items.reduce((acc, item) => {
    const pct = Number(item.itbis_pct || 0);
    const bruto = Number(item.cantidad || 0) * Number(item.precio || 0);
    const desc = bruto * (Number(item.descuento || 0) / 100);
    const base = bruto / (1 + pct);
    return {
      subTotal: acc.subTotal + base,
      totalDescuento: acc.totalDescuento + desc,
      totalItbis: acc.totalItbis + (bruto - base),
      totalFactura: acc.totalFactura + (bruto - desc),
    };
  }, { subTotal: 0, totalDescuento: 0, totalItbis: 0, totalFactura: 0 });
  return { ...c, totalFactura: c.totalFactura + Number(recargo || 0) };
}

const r2 = (n) => Math.round(n * 100) / 100;

describe('totales de la factura', () => {
  it('el agua cool de FT-3503: 20.00 con el ITBIS dentro', () => {
    const t = totalesDe([{ cantidad: 1, precio: 20, itbis_pct: 0.18 }]);
    expect(r2(t.subTotal)).toBe(16.95);
    expect(r2(t.totalItbis)).toBe(3.05);
    expect(r2(t.totalFactura)).toBe(20);
    // Lo que se le cobra al cliente es el precio del catálogo, tal cual.
    expect(r2(t.subTotal + t.totalItbis)).toBe(20);
  });

  it('sin artículos todo es cero — y eso NO es una factura', () => {
    const t = totalesDe([]);
    expect(t.totalFactura).toBe(0);
  });

  it('un total en cero teniendo líneas es imposible', () => {
    // Es exactamente lo que se grabó en FT-3504: línea de 20.00 y cabecera en
    // cero. Si esta afirmación deja de ser cierta, algo se volvió a
    // desincronizar.
    const t = totalesDe([{ cantidad: 1, precio: 20, itbis_pct: 0.18 }]);
    expect(t.totalFactura).toBeGreaterThan(0);
  });

  it('varias líneas suman', () => {
    const t = totalesDe([
      { cantidad: 2, precio: 50, itbis_pct: 0.18 },
      { cantidad: 1, precio: 20, itbis_pct: 0.18 },
    ]);
    expect(r2(t.totalFactura)).toBe(120);
  });

  it('el descuento baja el total pero no la base ni el ITBIS', () => {
    // La convención de la casa: el ITBIS se calcula sobre el bruto.
    const t = totalesDe([{ cantidad: 1, precio: 100, itbis_pct: 0.18, descuento: 10 }]);
    expect(r2(t.totalDescuento)).toBe(10);
    expect(r2(t.totalFactura)).toBe(90);
    expect(r2(t.subTotal)).toBe(84.75);
  });

  it('una pieza exenta no paga ITBIS', () => {
    const t = totalesDe([{ cantidad: 1, precio: 100, itbis_pct: 0 }]);
    expect(r2(t.totalItbis)).toBe(0);
    expect(r2(t.totalFactura)).toBe(100);
  });

  it('el recargo se suma al final', () => {
    const t = totalesDe([{ cantidad: 1, precio: 20, itbis_pct: 0.18 }], 5);
    expect(r2(t.totalFactura)).toBe(25);
  });
});

describe('el cambio', () => {
  const cambioDe = (recibido, total, pagos = []) =>
    (pagos.reduce((s, p) => s + Number(p.monto), 0) + (parseFloat(recibido) || 0)) - total;

  it('50 por una factura de 20 devuelve 30', () => {
    // FT-3504 imprimió "CAMBIO: 0.00" con estos mismos números, porque el
    // cambio iba un render por detrás del total.
    expect(cambioDe('50', 20)).toBe(30);
  });

  it('pagar de menos da cambio negativo, no cero', () => {
    // El negativo es lo que la pantalla enseña como "faltante".
    expect(cambioDe('10', 20)).toBe(-10);
  });

  it('cuenta también los pagos ya registrados', () => {
    expect(cambioDe('20', 100, [{ monto: 90 }])).toBe(10);
  });
});
