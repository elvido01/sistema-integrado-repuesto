// El ITBIS de la orden de compra.
//
// (2026-08-23) El dueño señaló dos casillas —"Aplicar ITBIS" e "ITBIS
// incluido?"— diciendo que se leían como lo mismo. Al mirarlo apareció algo
// peor: "ITBIS incluido" no entraba en ningún cálculo de esa pantalla, solo
// se guardaba. Y `productos.costo` se guarda CON ITBIS dentro (lo escribe
// ComprasPage al recibir la mercancía). La orden llenaba el precio desde ahí
// y le sumaba 18% encima.
//
// Con los números de su captura, una sola orden de MAGNA MOTORS salía
// pidiendo RD$20,900.33 cuando el suplidor cobra RD$17,712.14: RD$3,188.19
// de más, en el papel que se le entrega y en el presupuesto de caja.
//
// Se prueba con esas líneas reales, no con números inventados.

import { describe, it, expect } from 'vitest';
import { desgloseLinea } from '../src/pages/OrdenCompraPage.jsx';

const linea = (precio, cantidad = 1, itbis_pct = 18, descuento_pct = 0) =>
  ({ precio, cantidad, itbis_pct, descuento_pct });

// De la orden real: CILINDRO COMPLETO PLATINA 125, costo 3,224.27
const cilindro = linea(3224.27);

describe('cuando el precio ya trae el ITBIS', () => {
  it('lo desglosa en vez de sumarlo', () => {
    const g = desgloseLinea(cilindro, true, true);
    expect(g.importe).toBeCloseTo(3224.27, 2);       // lo que cobra el suplidor
    expect(g.base).toBeCloseTo(2732.43, 2);
    expect(g.itbis).toBeCloseTo(491.84, 2);
    // base + itbis tiene que dar exactamente el precio: si no, el desglose
    // se esta inventando o perdiendo dinero.
    expect(g.base + g.itbis).toBeCloseTo(g.importe, 6);
  });

  it('no infla la orden', () => {
    // Lo que hacia antes: 3,224.27 * 1.18 = 3,804.64. Ese era el error.
    const g = desgloseLinea(cilindro, true, true);
    expect(g.importe).toBeLessThan(3804.64);
  });
});

describe('cuando el precio es neto', () => {
  it('le suma el ITBIS encima', () => {
    const g = desgloseLinea(cilindro, true, false);
    expect(g.base).toBeCloseTo(3224.27, 2);
    expect(g.itbis).toBeCloseTo(580.37, 2);
    expect(g.importe).toBeCloseTo(3804.64, 2);
  });
});

describe('exento', () => {
  it('no cobra ITBIS de ninguna forma', () => {
    const g = desgloseLinea(cilindro, false, true);
    expect(g.itbis).toBe(0);
    expect(g.importe).toBeCloseTo(3224.27, 2);
    // Y da igual como este la otra opcion: exento es exento.
    expect(desgloseLinea(cilindro, false, false).importe).toBeCloseTo(3224.27, 2);
  });

  it('un producto con itbis_pct 0 no paga aunque se aplique', () => {
    const g = desgloseLinea(linea(100, 1, 0), true, false);
    expect(g.itbis).toBe(0);
    expect(g.importe).toBeCloseTo(100, 2);
  });
});

describe('la orden completa de MAGNA MOTORS', () => {
  // Las 9 lineas de la captura, con su cantidad real.
  const orden = [
    linea(280.00, 1),    // CABLE FRENO PLATINA 100
    linea(312.14, 3),    // ESPEJO DERECHO PLATINA 125
    linea(7642.92, 1),   // ARO DELANTERO PLATINA 125
    linea(331.72, 1),    // PALANCA CAMBIO PLATINA 100
    linea(269.59, 3),    // CABLE DE CLUTCH PLATINA 125
    linea(418.74, 2),    // ESPEJO IZQUIERDO PLATINA 125
    linea(2662.24, 1),   // ASIENTO PLATINA 100 125
    linea(3224.27, 1),   // CILINDRO COMPLETO PLATINA 125
    linea(494.16, 2),    // RELAY PUERQUITO AUTOMATICO
  ];
  const suma = (f) => orden.reduce((t, l) => t + f(l), 0);

  it('pide lo que el suplidor cobra, no un 18% mas', () => {
    const total = suma((l) => desgloseLinea(l, true, true).importe);
    expect(total).toBeCloseTo(17712.14, 1);
  });

  it('el desglose cuadra con el total', () => {
    const base  = suma((l) => desgloseLinea(l, true, true).base);
    const itbis = suma((l) => desgloseLinea(l, true, true).itbis);
    expect(base + itbis).toBeCloseTo(17712.14, 1);
  });

  it('en neto si daria el numero inflado que salia antes', () => {
    // No es un error: es el modo correcto cuando el suplidor cotiza sin
    // ITBIS. El error era que fuera el unico modo.
    const total = suma((l) => desgloseLinea(l, true, false).importe);
    expect(total).toBeCloseTo(20900.33, 1);
  });
});
