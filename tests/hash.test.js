// =====================================================================
// El hash del móvil, contra el de Node
// ---------------------------------------------------------------------
// mobile/src/lib/hash.ts calcula SHA-256 en JavaScript puro porque React
// Native no trae `crypto.subtle` y meter un módulo nativo obligaría a
// compilar y republicar en Play por cada arreglo.
//
// >>> POR QUÉ ESTA PRUEBA NO ES OPCIONAL <<<
// Un hash mal calculado NO da error. El archivo sube, la base lo acepta,
// el mensaje se envía, y el fallo aparece días después cuando Hermes
// compara el hash de lo que descargó contra el que se guardó. Para
// entonces nadie relaciona una foto que "no se ve" con una función de
// hashing. Es barato comprobarlo aquí y carísimo descubrirlo allá.
//
// Se compara contra `node:crypto`, no contra una lista de valores
// escritos a mano: si alguien toca el algoritmo, esto lo dice enseguida y
// con cualquier entrada, no solo con las tres que se nos ocurrieron.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { sha256Hex, bytesDesdeBase64 } from '../mobile/src/lib/hash.ts';

const nodeSha = (bytes) => createHash('sha256').update(Buffer.from(bytes)).digest('hex');

describe('sha256Hex', () => {
  it('acierta los vectores oficiales del estándar', () => {
    expect(sha256Hex(new Uint8Array(0)))
      .toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex(new TextEncoder().encode('abc')))
      .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex(new TextEncoder().encode('The quick brown fox jumps over the lazy dog')))
      .toBe('d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592');
  });

  // Los largos alrededor de 55/56 y 63/64 son donde el relleno decide si
  // hace falta un bloque extra. Ahí es donde se rompen las implementaciones
  // caseras, y con una foto de verdad nunca lo notarías.
  it('acierta en las fronteras de bloque', () => {
    for (const n of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129]) {
      const b = randomBytes(n);
      expect(sha256Hex(new Uint8Array(b)), `largo ${n}`).toBe(nodeSha(b));
    }
  });

  it('acierta con datos grandes y aleatorios', () => {
    for (const n of [1000, 4096, 100_000, 1_048_576]) {
      const b = randomBytes(n);
      expect(sha256Hex(new Uint8Array(b)), `largo ${n}`).toBe(nodeSha(b));
    }
  });

  it('distingue entradas que solo cambian en un bit', () => {
    const a = new Uint8Array([0b0000_0000]);
    const b = new Uint8Array([0b0000_0001]);
    expect(sha256Hex(a)).not.toBe(sha256Hex(b));
  });
});

describe('bytesDesdeBase64', () => {
  it('decodifica igual que Buffer, con y sin relleno', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 100, 1023, 4096]) {
      const b = randomBytes(n);
      const b64 = b.toString('base64');
      expect(Array.from(bytesDesdeBase64(b64)), `largo ${n}`).toEqual(Array.from(b));
    }
  });

  // Algunos lectores devuelven el base64 partido en columnas. Si los
  // saltos de línea no se ignoran, el archivo llega corrupto y el hash
  // deja de cuadrar — pero solo con archivos grandes, que son justo los
  // que nadie usa para probar.
  it('ignora saltos de linea y espacios', () => {
    const b = randomBytes(300);
    const plano = b.toString('base64');
    const partido = plano.replace(/(.{40})/g, '$1\n');
    expect(Array.from(bytesDesdeBase64(partido))).toEqual(Array.from(b));
    expect(Array.from(bytesDesdeBase64(` ${plano} `))).toEqual(Array.from(b));
  });

  it('el viaje completo conserva el hash', () => {
    const b = randomBytes(50_000);
    const vuelta = bytesDesdeBase64(b.toString('base64'));
    expect(sha256Hex(vuelta)).toBe(nodeSha(b));
  });
});
