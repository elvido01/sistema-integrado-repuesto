#!/usr/bin/env node
// =====================================================================
// ¿Qué archivo de sql/ ya no es lo que está corriendo?
// ---------------------------------------------------------------------
//   node scripts/sql-deriva.mjs            el circuito de Equipo IA/Hermes
//   node scripts/sql-deriva.mjs prestamo   lo que se llame así
//   node scripts/sql-deriva.mjs %          TODO (sale largo)
//
// Nació el 01/09/2026, después de un susto. `equipo_borrador_a_la_mesa`
// —el disparador que revisa cada borrador antes de enseñárselo al dueño—
// existía en `sql/el_borrador_llega_a_tu_mesa.sql`, pero esa era la PRIMERA
// versión: sin revisión, sin reparos, sin aviso. La viva llevaba meses de
// ventaja y nadie la había traído al repo.
//
// >>> UN HUECO VACÍO SE VE. UN ARCHIVO VIEJO SE CORRE CON CONFIANZA. <<<
//
// Ese es el punto. Comprobar que la función "está en el repo" no sirve de
// nada: la vieja también está. Hay que comparar el CUERPO vivo contra el
// texto del archivo. Lo que sale de aquí como "REPO MÁS VIEJO" es un archivo
// que, si alguien lo abre para reinstalar algo, degrada producción sin dar
// un solo error.
//
// El arreglo, cuando aparece uno, es volcar la definición viva con
// pg_get_functiondef a un `sql/rescatar_*.sql` (verbatim, no transcrita a
// mano) y ponerle el aviso encima al archivo viejo. Hay dos ejemplos:
// `rescatar_el_borrador_a_la_mesa.sql` y `rescatar_al_firmar_el_concepto.sql`.
//
// FALSO POSITIVO CONOCIDO: `equipo_nube_llamar` sale siempre. Su archivo
// lleva marcadores (`__ANON_KEY__`, `__CRON_SECRET__`) a propósito, para que
// las claves no vivan en git. Ese NO se rescata.
//
// Requiere SUPABASE_ACCESS_TOKEN (scripts/migracion-siif/.env), igual que
// scripts/aplicar-sql.mjs. Solo lee: no escribe nada en la base.
// =====================================================================

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROD = 'zdvxowpuklbypweyqqki';

const env = join(RAIZ, 'scripts', 'migracion-siif', '.env');
if (existsSync(env)) {
  for (const l of (await readFile(env, 'utf8')).split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('\n  Falta SUPABASE_ACCESS_TOKEN (scripts/migracion-siif/.env).\n');
  process.exit(1);
}

const q = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROD}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(JSON.stringify(d).slice(0, 600));
  return d;
};

// El espacio en blanco no cuenta: el archivo está indentado a mano y
// pg_get_functiondef reformatea. Lo que importa es que el cuerpo sea el mismo.
const norm = (s) => s.replace(/\s+/g, ' ').trim();

const patron = process.argv[2] || 'equipo|hermes|creativo';
const like = patron.split('|').map((p) => `p.proname LIKE '%${p.replace(/'/g, "''")}%'`).join(' OR ');

const dir = join(RAIZ, 'sql');
const archivos = (await readdir(dir)).filter((f) => f.endsWith('.sql'));
const cuerpos = {};
for (const f of archivos) cuerpos[f] = norm(await readFile(join(dir, f), 'utf8'));

const filas = await q(`
  SELECT n.nspname AS esq, p.proname AS nom, p.prosrc
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.prokind='f' AND n.nspname IN ('public','hermes') AND (${like})
  ORDER BY 1,2`);

const sinFuente = [], viejas = [];
let alDia = 0;
for (const { esq, nom, prosrc } of filas) {
  const re = new RegExp(`FUNCTION\\s+(?:${esq}\\.)?${nom}\\s*\\(`, 'i');
  const donde = archivos.filter((f) => re.test(cuerpos[f]));
  if (!donde.length) { sinFuente.push(`${esq}.${nom}`); continue; }
  if (donde.some((f) => cuerpos[f].includes(norm(prosrc)))) alDia++;
  else viejas.push({ fn: `${esq}.${nom}`, donde });
}

console.log(`\n  funciones vivas revisadas: ${filas.length}`);
console.log(`    al día en el repo : ${alDia}`);
console.log(`    sin fuente        : ${sinFuente.length}`);
console.log(`    REPO MÁS VIEJO    : ${viejas.length}\n`);

if (sinFuente.length) {
  console.log('  SIN FUENTE — solo existen en producción:');
  for (const f of sinFuente) console.log(`    · ${f}`);
  console.log('');
}
if (viejas.length) {
  console.log('  EL ARCHIVO DEL REPO NO ES LO QUE ESTÁ VIVO:');
  for (const v of viejas) console.log(`    · ${v.fn}\n        ${v.donde.join(', ')}`);
  console.log('');
}
if (!sinFuente.length && !viejas.length) console.log('  Todo cuadra.\n');

process.exit(sinFuente.length || viejas.length ? 1 : 0);
