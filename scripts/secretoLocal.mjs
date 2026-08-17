// De dónde salen los secretos de los scripts. De un solo sitio, a propósito.
//
// >>> POR QUE EXISTE ESTE ARCHIVO <<<
// El 2026-08-16 apareció un token de administración escrito dentro de
// scripts/setup_admin_rpcs_prod.mjs y commiteado. Un token `sbp_` no es una
// clave de lectura: da acceso a la CUENTA — crear y BORRAR proyectos
// enteros, leer todos los secretos. Estuvo en el repositorio hasta que se
// revocó.
//
// Eso no vuelve a pasar por disciplina, vuelve a no pasar porque los
// scripts no saben leer un secreto de ningún otro sitio que no sea este:
//
//   1. la variable de entorno, si está puesta
//   2. scripts/migracion-siif/.env, que .gitignore ya cubre (línea 15) y
//      que git no trackea — comprobado, no supuesto
//
// Si no está en ninguno de los dos, el script se para y explica cómo
// ponerlo. Nunca imprime el valor, ni entero ni en un mensaje de error.

import { readFileSync } from 'fs';
import path from 'path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const ARCHIVO = path.join(RAIZ, 'scripts/migracion-siif/.env');

let cache = null;

function cargarArchivo() {
  if (cache) return cache;
  cache = {};
  try {
    for (const linea of readFileSync(ARCHIVO, 'utf8').split('\n')) {
      const m = linea.match(/^\s*(?:export\s+)?([A-Za-z_0-9]+)\s*=\s*"?([^"\r\n]*?)"?\s*$/);
      if (m) cache[m[1]] = m[2];
    }
  } catch { /* sin archivo: solo cuenta el entorno */ }
  return cache;
}

/**
 * Lee un secreto. Devuelve null si no está — quien llama decide si eso es
 * fatal, y avisa con `explicar()`.
 */
export function leerSecreto(nombre) {
  if (process.env[nombre]) return process.env[nombre];
  const v = cargarArchivo()[nombre];
  return v || null;
}

/**
 * Lo mismo, pero se para si falta. Para scripts que escriben en producción:
 * seguir sin credencial solo lleva a un error peor tres pasos más adelante.
 */
export function leerToken(nombre) {
  const v = leerSecreto(nombre);
  if (!v) { explicar(nombre); process.exit(1); }
  return v;
}

export function explicar(nombre) {
  console.error(`
  Falta ${nombre}. Este script escribe en PRODUCCION.

  Ponlo en scripts/migracion-siif/.env (una linea):

      ${nombre}="..."

  Ese archivo esta en .gitignore y git no lo trackea, asi que no se sube.
  Tambien vale la variable de entorno, si prefieres que no toque disco:

      $env:${nombre} = "..."        (PowerShell)
      export ${nombre}="..."        (bash)

  El de Supabase se saca de https://supabase.com/dashboard/account/tokens
  y se revoca desde ahi mismo cuando ya no haga falta.
`);
}

/** Para poder decir "esta puesto" sin decir cual es. */
export function pista(valor) {
  if (!valor) return '(no esta)';
  return `${String(valor).slice(0, 4)}…${String(valor).slice(-4)} (${String(valor).length} chars)`;
}
