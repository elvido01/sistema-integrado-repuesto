// Cada frecuencia reparte las fechas como dice su nombre.
//
// (2026-08-06) PT-0026602 se originó diario, con 365 cuotas de 300. El
// sistema les puso una fecha con un MES de separación y el préstamo
// terminaba en 2056. La causa fue que 'diario' no estaba en el reparto y
// caía en el else, que suma meses.
//
// Se arregló en la base y en el cálculo del navegador, pero la opción
// nunca llegó al desplegable: hasta hoy había que originar los diarios por
// otro lado. Estas pruebas cuidan que las cuatro frecuencias sigan
// repartiendo bien, ahora que las cuatro se pueden elegir.

import { describe, it, expect } from 'vitest';
import { calcAmortizacion } from '../src/components/financiera/amortizacion.js';

const dias = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

const prestamo = (frecuencia, plazo = 6) => calcAmortizacion({
  monto: 10000, tasa: 10, plazo, metodo: 'simple',
  frecuencia, fechaPrimera: '2026-08-17',
});

describe('el reparto de fechas por frecuencia', () => {
  it('diario: un día entre cuotas', () => {
    const c = prestamo('diario');
    expect(dias(c[0].fecha_vencimiento, c[1].fecha_vencimiento)).toBe(1);
    // La quinta cae cuatro días después de la primera, no cuatro meses.
    expect(dias(c[0].fecha_vencimiento, c[4].fecha_vencimiento)).toBe(4);
  });

  it('semanal: siete días', () => {
    const c = prestamo('semanal');
    expect(dias(c[0].fecha_vencimiento, c[1].fecha_vencimiento)).toBe(7);
  });

  it('quincenal: quince días', () => {
    const c = prestamo('quincenal');
    expect(dias(c[0].fecha_vencimiento, c[1].fecha_vencimiento)).toBe(15);
  });

  it('mensual: cae el mismo día del mes siguiente', () => {
    const c = prestamo('mensual');
    expect(String(c[1].fecha_vencimiento).slice(0, 10)).toBe('2026-09-17');
  });
});

describe('un diario largo no se va a treinta años', () => {
  it('365 cuotas diarias terminan dentro del año', () => {
    // El caso exacto de PT-0026602. Con el fallo viejo la última vencía en
    // 2056; ahora tiene que caer a 364 días de la primera.
    const c = prestamo('diario', 365);
    expect(c).toHaveLength(365);
    expect(dias(c[0].fecha_vencimiento, c[364].fecha_vencimiento)).toBe(364);
    expect(String(c[364].fecha_vencimiento).slice(0, 4)).toBe('2027');
  });
});

describe('el dinero no cambia con la frecuencia', () => {
  it('el capital repartido sigue siendo el prestado', () => {
    // Cambiar cada cuánto se cobra no cambia cuánto se presta.
    for (const f of ['diario', 'semanal', 'quincenal', 'mensual']) {
      const total = prestamo(f, 10).reduce((a, x) => a + x.capital, 0);
      expect(Math.round(total), f).toBe(10000);
    }
  });
});
