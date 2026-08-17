// El vocabulario con el que Jarvis escucha.
//
// (2026-08-17) Antes transcribía el navegador y no sabía que existen "Pruss
// 200" ni "millero". Estas pruebas cuidan lo que hace que ahora sí: que las
// palabras de la pantalla lleguen al oído, y que quepan.

import { describe, it, expect } from 'vitest';
import { armarGlosario, terminosDeConversacion, _internos } from '../src/lib/glosarioVoz.js';

describe('armarGlosario — lo de pantalla manda', () => {
  it('el nombre del cliente que se está mirando entra sí o sí', () => {
    // Es lo único que el modelo no puede adivinar solo. Una marca conocida
    // la puede acertar; "Sander" no.
    const g = armarGlosario({ datos: { cliente_nombre: 'Sander' } });
    expect(g).toContain('Sander');
  });

  it('el número de cotización viaja entero', () => {
    // Sin esto el STT escribe "sete cero cero cero noventa y siete".
    const g = armarGlosario({ datos: { cotizacion: 'CT-000097' } });
    expect(g).toContain('CT-000097');
  });

  it('una descripción larga aporta sus palabras, no la frase', () => {
    // Nadie dice "farol delantero platina 100" de corrido; dice "farol" y
    // "Platina". Las partes sirven más que el bloque.
    const g = armarGlosario({ datos: { descripcion: 'FAROL DELANTERO PLATINA 100' } });
    expect(g).toContain('FAROL');
    expect(g).toContain('PLATINA');
  });

  it('sin contexto sigue dando el oficio', () => {
    const g = armarGlosario(null, []);
    expect(g).toContain('Loncin');
    expect(g).toMatch(/Rep[uú]blica Dominicana/);
  });
});

describe('armarGlosario — cabe en el prompt', () => {
  it('no se pasa del presupuesto por muchos términos que haya', () => {
    // El parámetro `prompt` del STT tope ~224 tokens. Pasarse no da error:
    // la API recorta por su cuenta, y lo que se pierde es justo la cola —
    // que es donde estarían los términos del negocio si no se ordenara.
    const muchos = Array.from({ length: 400 }, (_, i) => `Repuesto${i}Largo`);
    const g = armarGlosario(null, muchos);
    expect(g.length).toBeLessThan(_internos.TOPE_CHARS + 200);
  });

  it('si hay que cortar, se corta del núcleo y no de la pantalla', () => {
    // Lo específico gana a lo genérico: "Loncin" lo puede acertar el modelo;
    // el cliente que tienes delante, no.
    const dePantalla = Array.from({ length: 60 }, (_, i) => `ClienteRaro${i}`);
    const g = armarGlosario(null, dePantalla);
    expect(g).toContain('ClienteRaro0');
  });
});

describe('armarGlosario — no mete ruido', () => {
  it('descarta números sueltos y palabras de relleno', () => {
    expect(_internos.util('123')).toBe(false);
    expect(_internos.util('de')).toBe(false);
    expect(_internos.util('Sander')).toBe(true);
  });

  it('no repite el mismo término con distinta caja', () => {
    const r = _internos.unicos(['Platina', 'platina', 'PLATINA']);
    expect(r).toHaveLength(1);
    expect(r[0]).toBe('Platina');   // se queda la primera forma vista
  });

  it('nunca lanza, pase lo que pase', () => {
    // Si esto reventara, la nota de voz se quedaría sin transcribir. Peor
    // el remedio que la enfermedad.
    const circular = {};
    circular.yo = circular;
    expect(() => armarGlosario(circular, null)).not.toThrow();
    expect(() => armarGlosario(undefined, 'no es un array')).not.toThrow();
  });
});

describe('terminosDeConversacion', () => {
  it('rescata los códigos de documento que se acaban de decir', () => {
    // "mándala a facturar" viene después de que alguien dijo CT-000097.
    const t = terminosDeConversacion([
      { content: 'Busca la cotización de Sander' },
      { content: 'Encontré la CT-000097 por 11,800' },
    ]);
    expect(t).toContain('CT-000097');
    expect(t).toContain('Sander');
  });

  it('con historial vacío devuelve vacío sin quejarse', () => {
    expect(terminosDeConversacion([])).toEqual([]);
    expect(terminosDeConversacion(null)).toEqual([]);
  });
});
