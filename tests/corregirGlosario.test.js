// Corregir lo que se oyó mal, después de oírlo.
//
// (2026-08-17) El glosario se le da al transcriptor ANTES de escuchar, y eso
// es una sugerencia, no una regla. Con "Sander" en la lista, el servidor
// escribió igual "Sandel" — y Chrome, que lo había oído bien, pierde el
// desempate porque el servidor gana por defecto.
//
// Esta corrección es a propósito CORTA DE ALCANCE. Vale más dejar pasar un
// fallo que inventar una corrección: una letra mala la aguanta la búsqueda
// del catálogo, una palabra cambiada en una orden de facturar no.

import { describe, it, expect } from 'vitest';
import { corregirConGlosario, _internos } from '../src/lib/glosarioVoz.js';

const { distancia, topeDe } = _internos;

describe('el caso que lo motivó', () => {
  it('"Sandel" vuelve a ser "Sander"', () => {
    // El cliente estaba en la conversación, así que estaba en el glosario.
    expect(corregirConGlosario('Busca la cotización de Sandel', ['Sander', 'cotización']))
      .toBe('Busca la cotización de Sander');
  });

  it('"platino" vuelve a ser "platina"', () => {
    // Lo que oyó Chrome en "cuánto cuesta el farol del platino".
    expect(corregirConGlosario('cuánto cuesta el farol del platino', ['Platina', 'farol']))
      .toBe('cuánto cuesta el farol del Platina');
  });

  it('lo que está demasiado lejos se deja como vino', () => {
    // "frudo" por "Pruss" está a 3 de distancia. Adivinar ahí es inventar, y
    // la búsqueda del catálogo encontró la pieza igual con "frudo".
    expect(corregirConGlosario('caliper trasero frudo 200', ['Pruss', 'caliper']))
      .toBe('caliper trasero frudo 200');
  });
});

describe('lo que NO puede hacer', () => {
  it('no toca palabras cortas', () => {
    // Con tres o cuatro letras, casi todo está a distancia 1 de casi todo.
    expect(corregirConGlosario('dame una tapa', ['taza', 'tapa'])).toBe('dame una tapa');
    expect(corregirConGlosario('el pin', ['pon'])).toBe('el pin');
  });

  it('no cambia una palabra que YA es un término', () => {
    // Sin esto, dos términos parecidos se corregían el uno al otro y el
    // resultado dependía del orden de la lista.
    expect(corregirConGlosario('quiero una Platina', ['Platina', 'Platino']))
      .toBe('quiero una Platina');
  });

  it('ante un empate, no elige', () => {
    // "carena" está a 1 de "carona" y a 1 de "careta". Elegir a cara o cruz
    // es exactamente lo que no queremos.
    expect(corregirConGlosario('trae la carena', ['carona', 'careta']))
      .toBe('trae la carena');
  });

  it('sin términos devuelve el texto intacto', () => {
    for (const t of [[], null, undefined, 'no es lista']) {
      expect(corregirConGlosario('cotízame un tanque', t)).toBe('cotízame un tanque');
    }
  });

  it('con texto vacío o raro no revienta', () => {
    for (const t of ['', '   ', null, undefined]) {
      expect(() => corregirConGlosario(t, ['Sander'])).not.toThrow();
    }
    expect(corregirConGlosario(null, ['Sander'])).toBe('');
  });

  it('los términos de varias palabras no se usan', () => {
    // No hay forma de casar "tanque gasolina" contra una palabra suelta sin
    // adivinar dónde empieza y dónde termina.
    expect(corregirConGlosario('el tanquo', ['tanque gasolina'])).toBe('el tanquo');
  });
});

describe('detalles que se notan al leer la frase', () => {
  it('respeta las mayúsculas de lo dictado', () => {
    expect(corregirConGlosario('COTIZAME A SANDEL', ['Sander'])).toBe('COTIZAME A SANDER');
  });

  it('no se lleva por delante la puntuación', () => {
    expect(corregirConGlosario('la de Sandel, ya.', ['Sander'])).toBe('la de Sander, ya.');
  });

  it('las tildes no cuentan para comparar', () => {
    // "cotizacion" dictada sin tilde tiene que casar con "cotización".
    expect(corregirConGlosario('busca la cotizacion', ['cotización'])).toBe('busca la cotización');
  });
});

describe('la regla de cuánto se permite equivocarse', () => {
  it('el margen crece con la palabra', () => {
    expect(topeDe(4)).toBe(0);   // no se toca
    expect(topeDe(5)).toBe(1);
    expect(topeDe(7)).toBe(1);
    expect(topeDe(8)).toBe(2);
  });

  it('la distancia cuenta lo que uno esperaría', () => {
    expect(distancia('sandel', 'sander', 2)).toBe(1);
    expect(distancia('platino', 'platina', 2)).toBe(1);
    expect(distancia('igual', 'igual', 2)).toBe(0);
    // Y abandona cuando se pasa del tope, en vez de seguir calculando.
    expect(distancia('frudo', 'pruss', 1)).toBeGreaterThan(1);
  });
});
