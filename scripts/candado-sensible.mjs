#!/usr/bin/env node
// =====================================================================
// Candado de las zonas donde se pierde dinero
// ---------------------------------------------------------------------
//   node scripts/candado-sensible.mjs                     ¿hay cambios sin revisar? (lo corre npm run deploy)
//   node scripts/candado-sensible.mjs --ruta supabase/functions/emitir-fiscal   solo esa carpeta
//   node scripts/candado-sensible.mjs --aprobar "code-review high: 2 hallazgos arreglados (…)"
//
// Nació el 30/10/2026. Caja, préstamos, inventario, ventas/compras y DGII
// son las zonas donde un error cuesta dinero o una multa, y donde casi
// todos los nuestros fallaron CALLADOS. Quien escribe el cambio no es buen
// revisor de su propio cambio. Por eso aquí un segundo par de ojos
// (/code-review) es obligatorio antes de publicar.
//
// >>> CÓMO FUNCIONA <<<
// revision-sensible.json guarda una huella (sha1) de cada archivo sensible
// tal como estaba en la ÚLTIMA revisión aprobada. Si alguno cambió, se
// agregó o se borró desde entonces, no se publica: lista cuáles son para
// pasárselos a /code-review. Hecha la revisión y arreglado lo que encontró,
// --aprobar guarda las huellas nuevas con una nota de qué se revisó.
//
// >>> LA REGLA <<<
// --aprobar SOLO después de correr /code-review sobre esos archivos y
// arreglar lo que salió. La nota dice el resultado. Aprobar sin revisar es
// apagar el candado a escondidas: igual que correr --base en el revisor.
// =====================================================================

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SELLO = join(RAIZ, 'scripts', 'revision-sensible.json');
const args = process.argv.slice(2);

const iAprobar = args.indexOf('--aprobar');
const NOTA = iAprobar >= 0 ? (args[iAprobar + 1] || '').trim() : null;
const RUTAS = args.flatMap((a, i) => (a === '--ruta' && args[i + 1] ? [args[i + 1]] : []));

const CARPETAS = ['src', 'mobile/app', 'mobile/src', 'mobile/services', 'supabase/functions', 'sql'];

// Por nombre de archivo o de carpeta. Si una pieza de dinero queda fuera, se
// agrega aquí; un falso positivo se saca en NO_ES.
const ES_SENSIBLE = /caja|cierre|cuadre|prestam|financ|recibo|cobro|pago|amortiz|mora|interes|inventario|kardex|existencia|almacen|compra|venta|factur|devoluc|nota_?credito|dgii|fiscal|e-?cf|ncf|\/pos\.tsx|cuentas?(por|_)|cxc|cxp|nomina|banc|retencion|itbis|comision/i;
const NO_ES = /ventana|\/dist\/|graphify|\.test\.|\.spec\.|\.md$/i;

function archivos() {
  const git = (extra) => execFileSync('git', ['ls-files', ...extra, '--', ...CARPETAS], { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n').map((s) => s.trim()).filter(Boolean);
  // Los nuevos sin commitear también cuentan: ahí es donde más se escapa.
  const todos = [...new Set([...git([]), ...git(['--others', '--exclude-standard'])])];
  return todos
    .filter((f) => ES_SENSIBLE.test(f) && !NO_ES.test(f))
    .filter((f) => !RUTAS.length || RUTAS.some((r) => f.startsWith(r) || f.startsWith('supabase/functions/_shared/')))
    .sort();
}

// git convierte LF↔CRLF al hacer checkout en Windows: la huella se toma con
// LF para que cambiar de PC no parezca un cambio.
function huella(f) {
  try {
    const t = readFileSync(join(RAIZ, f), 'utf8').replace(/\r\n/g, '\n');
    return createHash('sha1').update(t).digest('hex').slice(0, 16);
  } catch { return null; }
}

const actual = {};
for (const f of archivos()) {
  const h = huella(f);
  if (h) actual[f] = h;
}

const sello = existsSync(SELLO) ? JSON.parse(readFileSync(SELLO, 'utf8')) : null;

if (!sello) {
  writeFileSync(SELLO, JSON.stringify({ huellas: actual, historial: [{ fecha: new Date().toISOString().slice(0, 10), nota: 'punto de partida', archivos: Object.keys(actual).length }] }, null, 2) + '\n');
  console.log(`\n  Candado: punto de partida guardado (${Object.keys(actual).length} archivos sensibles).`);
  process.exit(0);
}

const previas = sello.huellas || {};
const enAlcance = (f) => !RUTAS.length || RUTAS.some((r) => f.startsWith(r) || f.startsWith('supabase/functions/_shared/'));
const cambiados = [];
for (const [f, h] of Object.entries(actual)) {
  if (!previas[f]) cambiados.push({ f, que: 'nuevo' });
  else if (previas[f] !== h) cambiados.push({ f, que: 'cambiado' });
}
for (const f of Object.keys(previas)) {
  if (enAlcance(f) && !actual[f]) cambiados.push({ f, que: 'borrado' });
}

if (NOTA !== null) {
  if (NOTA.length < 15) {
    console.error('\n  Candado: --aprobar necesita una nota con el resultado de /code-review (qué se revisó y qué se arregló).\n');
    process.exit(1);
  }
  if (!cambiados.length) {
    console.log('\n  Candado: no hay cambios sensibles pendientes; nada que aprobar.\n');
    process.exit(0);
  }
  const huellas = { ...previas };
  for (const { f, que } of cambiados) {
    if (que === 'borrado') delete huellas[f];
    else huellas[f] = actual[f];
  }
  const historial = [...(sello.historial || []), {
    fecha: new Date().toISOString().slice(0, 10),
    nota: NOTA,
    archivos: cambiados.map((c) => c.f),
  }].slice(-60);
  writeFileSync(SELLO, JSON.stringify({ huellas, historial }, null, 2) + '\n');
  console.log(`\n  Candado: aprobados ${cambiados.length} archivo(s) sensibles. Queda en el historial de scripts/revision-sensible.json.\n`);
  process.exit(0);
}

if (!cambiados.length) {
  console.log('  ✔ Candado: nada de caja/préstamos/inventario/ventas/DGII cambió sin revisión.');
  process.exit(0);
}

console.log('\n  ✖ Candado: cambió código donde un error cuesta dinero, y nadie más lo ha revisado. No se publica.\n');
for (const { f, que } of cambiados) console.log(`    - ${f}  (${que})`);
console.log(`
  Qué hacer:
    1. /code-review high sobre esos archivos (otro par de ojos: no el que lo escribió).
    2. Arreglar lo que encuentre y volver a probar.
    3. node scripts/candado-sensible.mjs --aprobar "code-review high: <resultado>"
    4. npm run deploy
`);
process.exitCode = 1;
