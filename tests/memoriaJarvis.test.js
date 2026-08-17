// Lo que Jarvis recuerda de la frase anterior.
//
// (2026-08-17) El dueño dijo "sigue sin entender lo que le digo". No era el
// oído. La consulta del historial pedía:
//
//     .order('created_at', { ascending: true }).limit(24)
//
// y eso NO trae los 24 últimos mensajes: trae los 24 PRIMEROS. Con el
// .slice(-12) de después, el modelo recibía los mensajes 13 al 24 — el
// principio de la conversación. La sesión del dueño llevaba 130 mensajes y
// ocho días, así que Jarvis llevaba una semana contestando desde el mensaje
// 24, del 16/08 a las 12:52.
//
// De ahí salía todo: le enseñaba tres calipers numerados, le decían
// "cotízame el número dos", y el número dos de la única lista que él veía
// era un tanque de gasolina de tres días antes. Y "Juan Alonzo", el cliente
// que aparecía solo, era el del mensaje 23.
//
// Estas pruebas cuidan las dos mitades del arreglo: que la ventana mire
// hacia el lado correcto, y que el "número dos" apunte a algo de verdad.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const FUENTE = readFileSync(
  new URL('../supabase/functions/motoflow-ai-chat/index.ts', import.meta.url).pathname
    .replace(/^\/([A-Za-z]:)/, '$1'),
  'utf8',
);

// El trozo que lee ai_chat_messages para armar el historial.
const consultaHistorial = () => {
  const i = FUENTE.indexOf("from('ai_chat_messages')");
  expect(i, 'ya no se lee ai_chat_messages: revisa esta prueba').toBeGreaterThan(0);
  return FUENTE.slice(i, i + 400);
};

describe('la ventana del historial mira hacia atrás', () => {
  it('pide los mensajes DESCENDENTES, que son los últimos', () => {
    // Con `ascending: true` + limit se traen los primeros de la conversación.
    // Es el fallo exacto que dejó a Jarvis ocho días en el pasado.
    const q = consultaHistorial();
    expect(q).toMatch(/ascending:\s*false/);
    expect(q, 'ascendente + limit = los PRIMEROS mensajes, no los últimos')
      .not.toMatch(/ascending:\s*true/);
  });

  it('y se les da la vuelta para leerlos en orden', () => {
    // Pedirlos al revés sin invertirlos deja la conversación del revés, que
    // es un fallo distinto y igual de malo.
    expect(FUENTE).toMatch(/\.reverse\(\)/);
  });

  it('cada línea lleva cuánto hace que se dijo', () => {
    // Sin la hora, una lista de hace tres minutos y otra de hace tres días se
    // leen igual y el modelo no tiene con qué preferir la reciente.
    expect(FUENTE).toMatch(/haceCuanto\(/);
  });
});

// Copia de la de index.ts. Se prueba la REGLA, no la implementación: si
// alguien cambia el orden de las claves allá, esto sigue verde — por eso
// abajo van los nombres reales que devuelven las herramientas de hoy.
const CLAVES_LISTA = ['piezas', 'datos', 'resultados', 'items', 'cotizaciones', 'clientes'];
const listaDeResultado = (d) => {
  if (Array.isArray(d)) return d;
  for (const k of CLAVES_LISTA) if (Array.isArray(d?.[k])) return d[k];
  return null;
};

describe('"el número dos" apunta a algo', () => {
  it('encuentra la lista dentro de lo que devuelve buscar_piezas', () => {
    // La forma real: mcp_buscar_piezas envuelve las piezas en un objeto con
    // la búsqueda y las palabras al lado.
    const salida = {
      busqueda: 'caliper trasero pruss 200',
      palabras: ['caliper', 'trasero', 'pruss'],
      encontradas: 3,
      piezas: [
        { codigo: '8523431', descripcion: 'CALIPER TRASERO FORWELL 200 LONCIN', precio: 3300, existencia: 1 },
        { codigo: '292010037-0001', descripcion: 'CALIPER TRASERO-SEVEN LONCIN PRUSS 200', precio: 3877.73, existencia: 1 },
        { codigo: 'I-7633', descripcion: 'CALIPER TRASERO GY150/200/250 RACING GATO', precio: 2275, existencia: 1 },
      ],
    };
    const lista = listaDeResultado(salida);
    expect(lista).toHaveLength(3);
    // El caso literal del 17/08: "cotízame el número dos".
    expect(lista[1].codigo).toBe('292010037-0001');
  });

  it('el envoltorio NO se confunde con una fila', () => {
    // Este era el fallo de la memoria anclada: cuando venían varias piezas,
    // el `?? d` caía en el objeto envoltorio y se leían campos que ahí no
    // existen. Por eso el `estado` de una sesión de 130 mensajes era, entero,
    // {"ultima_accion":"cobrar_venta"}.
    const envoltorio = { busqueda: 'x', palabras: [], encontradas: 0, piezas: [] };
    expect(listaDeResultado(envoltorio)).toEqual([]);
    expect(envoltorio.codigo).toBeUndefined();
  });

  it('un resultado suelto no es una lista', () => {
    expect(listaDeResultado({ cliente_id: 'abc', nombre: 'SANDER' })).toBeNull();
    expect(listaDeResultado(null)).toBeNull();
  });

  it('la numeración empieza en 1, como se dice hablando', () => {
    // Nadie pide "el número cero".
    const piezas = [{ codigo: 'A' }, { codigo: 'B' }, { codigo: 'C' }];
    const opciones = piezas.map((x, i) => ({ n: i + 1, codigo: x.codigo }));
    expect(opciones[0].n).toBe(1);
    expect(opciones.find((o) => o.n === 2).codigo).toBe('B');
  });
});

describe('la memoria sobrevive al viaje de vuelta', () => {
  it('ultima_lista está en la lista blanca que se guarda', () => {
    // La memoria se filtra por CAMPOS_MEMORIA antes de escribirla. Sin el
    // campo ahí, la lista se arma y se tira en el mismo viaje, y "el número
    // dos" vuelve a no apuntar a nada.
    const i = FUENTE.indexOf('const CAMPOS_MEMORIA');
    expect(i).toBeGreaterThan(0);
    expect(FUENTE.slice(i, i + 500)).toMatch(/'ultima_lista'/);
  });

  it('la regla del ordinal está escrita para el modelo', () => {
    // De nada sirve guardar la lista si nadie le dice que la mire.
    expect(FUENTE).toMatch(/en_curso\.ultima_lista/);
  });
});
