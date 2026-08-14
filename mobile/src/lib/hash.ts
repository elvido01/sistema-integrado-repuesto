// =====================================================================
// SHA-256 y base64, sin depender del navegador ni de módulos nativos
// ---------------------------------------------------------------------
// >>> POR QUÉ EXISTE ESTE ARCHIVO <<<
// La primera versión de api.ts usaba `globalThis.crypto.subtle.digest`.
// Eso es una API del NAVEGADOR: React Native no la trae, y esta app no
// lleva polyfill. Resultado: cada intento de adjuntar una foto o una nota
// de voz lanzaba `TypeError: Cannot read property 'digest' of undefined`
// ANTES de subir un solo byte.
//
// El fallo era invisible desde fuera. La pantalla decía "No se pudo
// enviar" —el mismo texto que sale cuando se cae la red— así que parecía
// un problema de conexión. En la base quedó la prueba: ocho mensajes
// desde Android, los ocho de texto, cero medios en toda la historia.
//
// >>> POR QUÉ EN JAVASCRIPT PURO Y NO CON expo-crypto <<<
// expo-crypto lo resolvería en tres líneas, pero trae código nativo: haría
// falta compilar un binario nuevo y volver a pasar por la revisión de
// Play. Esto es JavaScript, así que viaja en un `eas update` y llega a los
// teléfonos en minutos.
//
// El costo es velocidad: hashear una foto de 3 MB toma unas décimas de
// segundo en el hilo de JS. Se paga una vez por archivo, al enviarlo, y
// por eso la pantalla dice "Subiendo foto…" desde antes de empezar.
//
// >>> ESTO NO SE TOCA SIN CORRER LAS PRUEBAS <<<
// Un hash mal calculado no falla: sube el archivo, la base lo acepta, y
// el error aparece mucho después, cuando Hermes compara el hash de lo que
// descargó y no cuadra. Es de los errores más caros de encontrar.
// Las pruebas están en tests/hash.test.js con los vectores oficiales.
// =====================================================================

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/** SHA-256 de un bloque de bytes, en hexadecimal minúscula. */
export const sha256Hex = (bytes: Uint8Array): string => {
  const largo = bytes.length;
  const bits = largo * 8;

  // Relleno del estándar: un bit a 1, ceros, y el largo en bits al final
  // como entero de 64 bits big-endian. El bloque total es múltiplo de 64.
  const total = ((largo + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[largo] = 0x80;

  const dv = new DataView(buf.buffer);
  // Dos mitades de 32 bits: JavaScript no tiene enteros de 64 fiables, y
  // un archivo de más de 512 MB desbordaría un solo Uint32.
  dv.setUint32(total - 8, Math.floor(bits / 0x100000000));
  dv.setUint32(total - 4, bits >>> 0);

  let h0 = 0x6a09e667; let h1 = 0xbb67ae85; let h2 = 0x3c6ef372; let h3 = 0xa54ff53a;
  let h4 = 0x510e527f; let h5 = 0x9b05688c; let h6 = 0x1f83d9ab; let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let pos = 0; pos < total; pos += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = dv.getUint32(pos + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const a = w[i - 15]; const b = w[i - 2];
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0; let b = h1; let c = h2; let d = h3;
    let e = h4; let f = h5; let g = h6; let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;

      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }

    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((x) => x.toString(16).padStart(8, '0')).join('');
};

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const INVERSO = (() => {
  const t = new Int16Array(256).fill(-1);
  for (let i = 0; i < ALFABETO.length; i += 1) t[ALFABETO.charCodeAt(i)] = i;
  return t;
})();

/**
 * base64 → bytes, sin `atob`.
 *
 * El motor de React Native trae `atob` desde 0.74, pero este archivo
 * existe justamente porque dar por sentada una API del navegador ya costó
 * una función rota en producción. Quince líneas cuestan menos que volver
 * a averiguarlo desde un teléfono.
 *
 * Ignora saltos de línea y espacios: algunos lectores de archivos
 * devuelven el base64 en columnas.
 */
export const bytesDesdeBase64 = (b64: string): Uint8Array => {
  let limpio = 0;
  for (let i = 0; i < b64.length; i += 1) {
    const c = b64.charCodeAt(i);
    if (c === 61) break;                       // '=' → fin de los datos
    if (INVERSO[c] >= 0) limpio += 1;
  }

  const bytes = new Uint8Array(Math.floor((limpio * 6) / 8));
  let acumulado = 0; let bits = 0; let salida = 0;

  for (let i = 0; i < b64.length; i += 1) {
    const v = INVERSO[b64.charCodeAt(i)];
    if (v < 0) continue;                       // salto de línea, espacio o '='
    acumulado = (acumulado << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[salida] = (acumulado >> bits) & 0xff;
      salida += 1;
      if (salida >= bytes.length) break;
    }
  }

  return bytes;
};
