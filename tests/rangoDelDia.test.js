// El día del cierre de caja empieza y termina en hora de aquí.
//
// (2026-08-20) El Cierre de Caja filtraba las columnas de hora mandando
// '2026-08-20T00:00:00' sin zona. La base está en UTC y lo leía como las
// 00:00 UTC — las 8:00 PM del día ANTERIOR en República Dominicana. La
// ventana del día iba corrida cuatro horas:
//
//   · una moto facturada a las 9:00 PM no entraba en el cierre de esa noche
//   · lo de ayer entre 8 PM y medianoche sí entraba en el de hoy
//
// Caminero cierra caja como a las 5 PM, así que todavía no había mordido.
// Se prueba con horas de la noche a propósito: es el único rango donde el
// error se ve, y es exactamente el que un negocio de motores va a usar.

import { describe, it, expect } from 'vitest';
import { rangoDelDia } from '../src/lib/dateUtils.js';

// Santo Domingo es UTC-4 todo el año.
const dentro = (instante, { desde, hasta }) => instante >= desde && instante <= hasta;

describe('rangoDelDia', () => {
  it('abre a medianoche de aquí, no a medianoche UTC', () => {
    const { desde, hasta } = rangoDelDia('2026-08-20');
    expect(desde).toBe('2026-08-20T04:00:00.000Z');
    expect(hasta).toBe('2026-08-21T03:59:59.999Z');
  });

  it('mete la venta de las 9 de la noche en el día que se vendió', () => {
    // 20/08 21:00 en RD = 21/08 01:00 UTC. Con la ventana vieja
    // ('2026-08-20T23:59:59' leído como UTC) esta venta quedaba fuera.
    const ventaDeLaNoche = '2026-08-21T01:00:00.000Z';
    expect(dentro(ventaDeLaNoche, rangoDelDia('2026-08-20'))).toBe(true);
    expect(dentro(ventaDeLaNoche, rangoDelDia('2026-08-21'))).toBe(false);
  });

  it('deja fuera lo de anoche', () => {
    // 19/08 20:30 en RD = 20/08 00:30 UTC. La ventana vieja empezaba
    // justo ahí y se lo llevaba al cierre del 20.
    const ventaDeAnoche = '2026-08-20T00:30:00.000Z';
    expect(dentro(ventaDeAnoche, rangoDelDia('2026-08-20'))).toBe(false);
    expect(dentro(ventaDeAnoche, rangoDelDia('2026-08-19'))).toBe(true);
  });

  it('no deja ningún hueco entre un día y el siguiente', () => {
    // Un milisegundo perdido entre las dos ventanas es una venta que no
    // aparece en ningún cierre.
    const hoy = rangoDelDia('2026-08-20');
    const manana = rangoDelDia('2026-08-21');
    expect(new Date(manana.desde) - new Date(hoy.hasta)).toBe(1);
  });

  it('los días completos duran un día completo', () => {
    const { desde, hasta } = rangoDelDia('2026-02-28');
    expect(new Date(hasta) - new Date(desde)).toBe(24 * 60 * 60 * 1000 - 1);
  });
});
