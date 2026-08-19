// Las fechas del seguimiento comercial.
//
// (2026-08-19) Un seguimiento sin fecha no es un seguimiento. Y una fecha mal
// calculada es peor que ninguna: el vendedor llama el día equivocado y el
// cliente ya compró en otro sitio.
//
// Dos trampas concretas que estas pruebas cuidan:
//
//   * toISOString() da la fecha en UTC. En República Dominicana (UTC-4) eso
//     adelanta el día desde las 8 de la noche: un seguimiento creado el jueves
//     a las 9 pm saldría fechado el viernes, y el servidor —que compara contra
//     "hoy" en hora dominicana— podría hasta rechazarlo.
//   * sumar días con aritmética de milisegundos se rompe en los cambios de
//     hora. Aquí todo se ancla al mediodía, que ningún cambio cruza.

import { describe, it, expect } from 'vitest';
import {
  aISO, sumarDias, proximoDia, atajosDeFecha, comoSeLee, diasDesde,
} from '../whatsapp-quote-extension/src/lib/fechasSeguimiento.js';

// Un jueves a las 9 de la noche: la hora que rompe toISOString().
const JUEVES_9PM = new Date(2026, 7, 20, 21, 0, 0);   // 20/08/2026, jueves

describe('la fecha es la del reloj de la tienda, no la de UTC', () => {
  it('a las 9 pm sigue siendo el mismo día', () => {
    expect(aISO(JUEVES_9PM)).toBe('2026-08-20');
    // La prueba que importa: con toISOString() esto daría el 21.
    expect(JUEVES_9PM.toISOString().slice(0, 10)).toBe('2026-08-21');
  });

  it('a medianoche y un minuto ya es el día siguiente', () => {
    expect(aISO(new Date(2026, 7, 21, 0, 1, 0))).toBe('2026-08-21');
  });

  it('con basura no revienta', () => {
    for (const v of [null, undefined, 'no soy fecha']) expect(aISO(v)).toBe('');
  });
});

describe('sumar días', () => {
  it('mañana, en 3 y en 15', () => {
    expect(aISO(sumarDias(JUEVES_9PM, 1))).toBe('2026-08-21');
    expect(aISO(sumarDias(JUEVES_9PM, 3))).toBe('2026-08-23');
    expect(aISO(sumarDias(JUEVES_9PM, 15))).toBe('2026-09-04');
  });

  it('cruza de mes sin perderse', () => {
    expect(aISO(sumarDias(new Date(2026, 7, 30, 10, 0), 3))).toBe('2026-09-02');
  });

  it('cruza de año', () => {
    expect(aISO(sumarDias(new Date(2026, 11, 30, 10, 0), 3))).toBe('2027-01-02');
  });

  it('sin días devuelve el mismo día', () => {
    expect(aISO(sumarDias(JUEVES_9PM, 0))).toBe('2026-08-20');
  });
});

describe('el próximo lunes', () => {
  it('desde un jueves, el lunes siguiente', () => {
    expect(aISO(proximoDia(JUEVES_9PM, 1))).toBe('2026-08-24');
  });

  it('dicho un lunes, es el de la semana que viene', () => {
    // "Lo llamo el lunes" dicho un lunes no significa hoy: significa dentro de
    // siete días. Si devolviera hoy, el seguimiento nacería ya vencido.
    const lunes = new Date(2026, 7, 24, 10, 0);
    expect(lunes.getDay()).toBe(1);
    expect(aISO(proximoDia(lunes, 1))).toBe('2026-08-31');
  });

  it('desde un domingo, el lunes es mañana', () => {
    const domingo = new Date(2026, 7, 23, 10, 0);
    expect(domingo.getDay()).toBe(0);
    expect(aISO(proximoDia(domingo, 1))).toBe('2026-08-24');
  });
});

describe('los atajos del formulario', () => {
  it('ninguno cae en el pasado ni hoy', () => {
    // El servidor rechaza una fecha de ayer. Y un seguimiento para hoy mismo
    // no es un seguimiento, es la conversación que está pasando.
    for (const a of atajosDeFecha(JUEVES_9PM)) {
      expect(diasDesde(a.fecha, JUEVES_9PM), a.etiqueta).toBeLessThan(0);
    }
  });

  it('salen los cinco, en orden de cercanía', () => {
    const a = atajosDeFecha(JUEVES_9PM);
    expect(a).toHaveLength(5);
    const dias = a.map((x) => -diasDesde(x.fecha, JUEVES_9PM));
    expect([...dias].sort((p, q) => p - q)).toEqual(dias);
  });

  it('cada uno trae etiqueta y fecha usable', () => {
    for (const a of atajosDeFecha(JUEVES_9PM)) {
      expect(a.etiqueta, a.clave).toBeTruthy();
      expect(a.fecha, a.clave).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('cómo se lee en la lista', () => {
  const hoy = new Date(2026, 7, 20, 10, 0);

  it('hoy, ayer y mañana se dicen con palabras', () => {
    expect(comoSeLee('2026-08-20', hoy)).toBe('hoy');
    expect(comoSeLee('2026-08-19', hoy)).toBe('ayer');
    expect(comoSeLee('2026-08-21', hoy)).toBe('mañana');
  });

  it('lo atrasado se dice como atraso', () => {
    // Es lo que hace que se mire: "hace 5 días" pesa más que "15/08".
    expect(comoSeLee('2026-08-15', hoy)).toBe('hace 5 días');
    expect(comoSeLee('2026-08-27', hoy)).toBe('en 7 días');
  });

  it('sin fecha no inventa nada', () => {
    expect(comoSeLee(null, hoy)).toBe('');
    expect(comoSeLee('', hoy)).toBe('');
  });
});

describe('días de atraso', () => {
  const hoy = new Date(2026, 7, 20, 10, 0);

  it('positivo si ya pasó, negativo si falta', () => {
    expect(diasDesde('2026-08-18', hoy)).toBe(2);
    expect(diasDesde('2026-08-20', hoy)).toBe(0);
    expect(diasDesde('2026-08-22', hoy)).toBe(-2);
  });

  it('acepta una fecha con hora pegada', () => {
    // La RPC devuelve date, pero si algún día viene con hora no debe romperse.
    expect(diasDesde('2026-08-18T00:00:00Z', hoy)).toBe(2);
  });

  it('con basura devuelve cero y no NaN', () => {
    for (const v of [null, '', 'ayer', '2026-13-45']) {
      expect(Number.isFinite(diasDesde(v, hoy)), String(v)).toBe(true);
    }
  });
});
