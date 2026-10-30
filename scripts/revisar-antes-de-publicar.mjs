#!/usr/bin/env node
// =====================================================================
// Revisor antes de publicar — los errores que ya nos pasaron, en código
// ---------------------------------------------------------------------
//   node scripts/revisar-antes-de-publicar.mjs              revisa (lo corre npm run deploy)
//   node scripts/revisar-antes-de-publicar.mjs --detalle    además lista cada caso nuevo con su línea
//   node scripts/revisar-antes-de-publicar.mjs --base       acepta lo que hay hoy como punto de partida
//
// Nació el 30/10/2026. Casi ningún error de MotoFlow revienta la pantalla:
// fallan CALLADOS. errores_app tenía 2 errores en 18 días mientras pasaban
// estos, todos de verdad:
//   • un update sin .select() que "guardaba" cero filas sin dar error;
//   • .limit(1) sin .order() que agarró la fila equivocada (espejo TikTok);
//   • un panel escondido que seguía oyendo el teclado;
//   • una función SQL STABLE que escribía y rompió la búsqueda de Hermes;
//   • un CREATE OR REPLACE con otros argumentos que creó una función doble.
//
// >>> CÓMO DECIDE <<<
// Esos patrones ya existen por cientos en el código viejo, y muchos están
// bien. Bloquear todos haría que nadie lo usara. Así que funciona como un
// TRINQUETE: revision-base.json guarda cuántos casos tiene hoy cada archivo,
// y solo se bloquea si un archivo tiene MÁS que en la base. Lo viejo no
// empeora; lo nuevo entra limpio. Cuando alguien arregla casos, la base se
// baja sola (nunca sube sola).
//
// Si un caso nuevo es correcto a propósito, se marca en la misma línea (o
// la de arriba) con el comentario:   revisado: <por qué>
//
// Las revisiones de la base de datos (STABLE que escribe, funciones dobles)
// necesitan SUPABASE_ACCESS_TOKEN (scripts/migracion-siif/.env). Sin él se
// saltan con aviso; no bloquean. Solo lee: no escribe nada en la base.
// =====================================================================

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = join(RAIZ, 'scripts', 'revision-base.json');
const PROD = 'zdvxowpuklbypweyqqki';
const args = process.argv.slice(2);
const MODO_BASE = args.includes('--base');
const DETALLE = args.includes('--detalle');

const CARPETAS = ['src', 'mobile/app', 'mobile/src', 'mobile/services', 'whatsapp-quote-extension/src', 'supabase/functions'];
const EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs']);
const SALTAR = /(^|\/)(node_modules|dist|graphify-out|\.expo|android|ios|build)(\/|$)/;

// ---------------------------------------------------------------- archivos
function listar(dir, out = []) {
  const abs = join(RAIZ, dir);
  if (!existsSync(abs)) return out;
  for (const n of readdirSync(abs)) {
    const rel = `${dir}/${n}`;
    if (SALTAR.test(rel)) continue;
    const st = statSync(join(RAIZ, rel));
    if (st.isDirectory()) listar(rel, out);
    else if (EXT.has(extname(n)) && !/\.(test|spec)\./.test(n)) out.push(rel);
  }
  return out;
}

// Quita los comentarios (un ".update(" comentado no cuenta). Los textos se
// recorren aparte solo para no confundir un "//" de una URL con un
// comentario. Conserva los saltos de línea para que las líneas cuadren.
function limpiar(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') { out += ' '; i++; }
    } else if (c === '/' && d === '*') {
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2;
    } else if (c === '"' || c === "'" || c === '`') {
      const q = c; out += q; i++;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
        if (q === '`' && src[i] === '$' && src[i + 1] === '{') {
          // ${...} dentro de template: se conserva (puede llevar código)
          let depth = 0;
          while (i < n) {
            if (src[i] === '{') depth++;
            if (src[i] === '}') { depth--; if (depth === 0) { out += '}'; i++; break; } }
            out += src[i]; i++;
          }
          continue;
        }
        out += src[i]; i++;
      }
      out += q; i++;
    } else { out += c; i++; }
  }
  return out;
}

const lineaDe = (txt, idx) => txt.slice(0, idx).split('\n').length;

// La cadena completa de la que forma parte idx: hacia atrás hasta el
// comienzo de la sentencia y hacia adelante hasta su final (profundidad 0 y
// ';' o salto de línea que no siga con '.').
function cadena(txt, idx) {
  let ini = idx;
  let depth = 0;
  while (ini > 0) {
    const c = txt[ini - 1];
    if (')]}'.includes(c)) depth++;
    else if ('([{'.includes(c)) { if (depth === 0) break; depth--; }
    else if (depth === 0 && (c === ';' || c === '=' && txt[ini - 2] !== '=' && txt[ini] !== '=' && txt[ini - 2] !== '!' && txt[ini - 2] !== '<' && txt[ini - 2] !== '>')) break;
    ini--;
    if (idx - ini > 1500) break;
  }
  let fin = idx;
  depth = 0;
  while (fin < txt.length) {
    const c = txt[fin];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { if (depth === 0) break; depth--; }
    else if (depth === 0 && (c === ';' || c === ',')) break;
    else if (depth === 0 && c === '\n') {
      const resto = txt.slice(fin + 1).match(/^\s*(\S)/);
      if (!resto || resto[1] !== '.') break;
    }
    fin++;
    if (fin - idx > 3000) break;
  }
  return txt.slice(ini, fin);
}

const marcado = (lineas, l) => /revisado:/i.test(lineas[l - 1] || '') || /revisado:/i.test(lineas[l - 2] || '');

// ---------------------------------------------------------------- reglas de código
const REGLAS = [
  {
    id: 'update-sin-select',
    titulo: 'update/delete de Supabase sin .select()',
    porque: 'si RLS o el filtro no encuentra la fila, devuelve 204 sin error y no guardó nada. Añade .select() y comprueba que volvió al menos una fila.',
    buscar(txt) {
      const casos = [];
      for (const m of txt.matchAll(/\.(update|delete)\s*\(/g)) {
        const ch = cadena(txt, m.index);
        if (!/\.from\s*\(/.test(ch)) continue;            // no es Supabase (Map.delete, hash.update…)
        if (/\.select\s*\(/.test(ch)) continue;
        if (/count\s*:/.test(ch)) continue;               // { count: 'exact' } también avisa
        casos.push(lineaDe(txt, m.index));
      }
      return casos;
    },
  },
  {
    id: 'limit1-sin-order',
    titulo: '.limit(1) / .maybeSingle() sin .order()',
    porque: 'si hay varias filas, Postgres devuelve cualquiera; un día cambia y agarra la equivocada (espejo de TikTok, 30/09).',
    buscar(txt) {
      const casos = [];
      for (const m of txt.matchAll(/\.limit\s*\(\s*1\s*\)/g)) {
        const ch = cadena(txt, m.index);
        if (!/\.from\s*\(/.test(ch)) continue;
        if (/\.order\s*\(/.test(ch)) continue;
        // Filtrar por id (o un eq a una clave única) ya da una sola fila.
        if (/\.eq\s*\(\s*['"`](id|uuid)['"`]/.test(ch)) continue;
        casos.push(lineaDe(txt, m.index));
      }
      return casos;
    },
  },
  {
    id: 'teclado-sin-panel',
    titulo: 'atajos de teclado globales sin mirar el panel activo',
    porque: 'los paneles escondidos siguen montados: sin comprobar activePanel dentro del manejador, F10/Escape disparan en una pantalla que no se ve.',
    soloSi: (ruta) => ruta.startsWith('src/'),
    buscar(txt) {
      const casos = [];
      if (/activePanel|isActive|panelActivo|esVisible/.test(txt)) return casos;
      for (const m of txt.matchAll(/(window|document)\.addEventListener\s*\(\s*['"`]keydown/g)) {
        casos.push(lineaDe(txt, m.index));
      }
      return casos;
    },
  },
];

function revisarCodigo() {
  const resultado = {};      // regla -> archivo -> [líneas]
  for (const r of REGLAS) resultado[r.id] = {};
  for (const carpeta of CARPETAS) {
    for (const ruta of listar(carpeta)) {
      const original = readFileSync(join(RAIZ, ruta), 'utf8');
      const lineas = original.split('\n');
      const txt = limpiar(original);
      for (const r of REGLAS) {
        if (r.soloSi && !r.soloSi(ruta)) continue;
        const casos = r.buscar(txt, ruta).filter((l) => !marcado(lineas, l));
        if (casos.length) resultado[r.id][ruta] = casos;
      }
    }
  }
  return resultado;
}

// ---------------------------------------------------------------- base de datos
function cargarEnv() {
  const env = join(RAIZ, 'scripts', 'migracion-siif', '.env');
  if (!existsSync(env)) return;
  for (const l of readFileSync(env, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function consulta(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROD}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const SQL_STABLE_ESCRIBE = `
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as firma
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f' and p.provolatile in ('s','i')
  and p.prolang in (select oid from pg_language where lanname in ('plpgsql','sql'))
  and regexp_replace(p.prosrc, '--[^\\n]*', '', 'g')
      ~* '(insert\\s+into|update\\s+[a-z_."]+\\s+set|delete\\s+from)\\s+(?!pg_temp|tmp_|_tmp)'
order by 1`;

const SQL_DOBLES = `
select p.proname as nombre, count(*) as versiones,
       string_agg(pg_get_function_identity_arguments(p.oid), ' | ' order by p.oid) as firmas
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind in ('f','p')
group by p.proname having count(*) > 1
order by 1`;

async function revisarBase() {
  cargarEnv();
  if (!process.env.SUPABASE_ACCESS_TOKEN) return { saltada: 'sin SUPABASE_ACCESS_TOKEN' };
  try {
    const [stable, dobles] = await Promise.all([consulta(SQL_STABLE_ESCRIBE), consulta(SQL_DOBLES)]);
    return {
      'stable-que-escribe': stable.map((f) => f.firma),
      'funcion-doble': dobles.map((f) => `${f.nombre} ×${f.versiones}: ${f.firmas}`),
      nombresDobles: dobles.map((f) => f.nombre),
    };
  } catch (e) {
    return { saltada: `no se pudo consultar (${e.message})` };
  }
}

// ---------------------------------------------------------------- comparar con la base
const contar = (porArchivo) => Object.fromEntries(Object.entries(porArchivo).map(([f, l]) => [f, l.length]));

async function main() {
  const t0 = Date.now();
  const codigo = revisarCodigo();
  const bd = await revisarBase();

  const actual = { codigo: {}, bd: {} };
  for (const r of REGLAS) actual.codigo[r.id] = contar(codigo[r.id]);
  if (!bd.saltada) {
    actual.bd['stable-que-escribe'] = bd['stable-que-escribe'];
    actual.bd['funcion-doble'] = bd.nombresDobles;
  }

  if (MODO_BASE || !existsSync(BASE)) {
    const previa = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : null;
    const guardar = { ...actual, actualizado: new Date().toISOString().slice(0, 10) };
    if (bd.saltada && previa?.bd) guardar.bd = previa.bd;
    writeFileSync(BASE, JSON.stringify(guardar, null, 2) + '\n');
    const total = Object.values(actual.codigo).reduce((s, x) => s + Object.values(x).reduce((a, b) => a + b, 0), 0);
    console.log(`\n  Base guardada en scripts/revision-base.json: ${total} casos viejos de código aceptados.`);
    if (!bd.saltada) console.log(`  Base de datos: ${bd['stable-que-escribe'].length} STABLE que escriben, ${bd.nombresDobles.length} funciones dobles aceptadas.`);
    else console.log(`  Base de datos: ${bd.saltada}.`);
    return;
  }

  const base = JSON.parse(readFileSync(BASE, 'utf8'));
  const problemas = [];
  let bajo = false;

  for (const r of REGLAS) {
    const b = base.codigo?.[r.id] || {};
    const nuevos = [];
    for (const [archivo, lineas] of Object.entries(codigo[r.id])) {
      const antes = b[archivo] || 0;
      if (lineas.length > antes) nuevos.push({ archivo, lineas, antes });
    }
    // trinquete: si un archivo mejoró, la base baja
    for (const [archivo, antes] of Object.entries(b)) {
      const ahora = actual.codigo[r.id][archivo] || 0;
      if (ahora < antes) bajo = true;
    }
    if (nuevos.length) problemas.push({ regla: r, nuevos });
  }

  const nuevosBd = [];
  if (!bd.saltada) {
    const bs = new Set(base.bd?.['stable-que-escribe'] || []);
    for (const f of bd['stable-que-escribe']) if (!bs.has(f)) nuevosBd.push({ tipo: 'STABLE/IMMUTABLE que escribe', que: f, porque: 'PostgREST la corre en solo-lectura y revienta ("cannot execute INSERT in a read-only transaction"). Debe ser VOLATILE.' });
    const bdb = new Set(base.bd?.['funcion-doble'] || []);
    for (let i = 0; i < bd.nombresDobles.length; i++) {
      if (!bdb.has(bd.nombresDobles[i])) nuevosBd.push({ tipo: 'función con dos versiones', que: bd['funcion-doble'][i], porque: 'un CREATE OR REPLACE con otros argumentos no reemplaza: crea otra y la llamada falla con "is not unique". Haz DROP FUNCTION de la vieja.' });
    }
    if (bd['stable-que-escribe'].length < bs.size || bd.nombresDobles.length < bdb.size) bajo = true;
  }

  if (bajo && !problemas.length && !nuevosBd.length) {
    // Solo se baja lo que mejoró; nunca se sube.
    const nueva = { codigo: {}, bd: base.bd, actualizado: new Date().toISOString().slice(0, 10) };
    for (const r of REGLAS) {
      nueva.codigo[r.id] = {};
      for (const [archivo, antes] of Object.entries(base.codigo?.[r.id] || {})) {
        const ahora = Math.min(antes, actual.codigo[r.id][archivo] || 0);
        if (ahora) nueva.codigo[r.id][archivo] = ahora;
      }
    }
    if (!bd.saltada) {
      nueva.bd = {
        'stable-que-escribe': (base.bd?.['stable-que-escribe'] || []).filter((f) => bd['stable-que-escribe'].includes(f)),
        'funcion-doble': (base.bd?.['funcion-doble'] || []).filter((f) => bd.nombresDobles.includes(f)),
      };
    }
    writeFileSync(BASE, JSON.stringify(nueva, null, 2) + '\n');
  }

  const seg = ((Date.now() - t0) / 1000).toFixed(1);
  if (!problemas.length && !nuevosBd.length) {
    console.log(`\n  ✔ Revisor: sin errores nuevos de los que ya conocemos (${seg} s).${bajo ? ' Algunos casos viejos se arreglaron: base actualizada.' : ''}`);
    if (bd.saltada) console.log(`  (base de datos sin revisar: ${bd.saltada})`);
    return;
  }

  console.log('\n  ✖ Revisor: hay errores NUEVOS de los que ya nos costaron caro. No se publica.\n');
  for (const { regla, nuevos } of problemas) {
    console.log(`  ■ ${regla.titulo}`);
    console.log(`    Por qué importa: ${regla.porque}`);
    for (const { archivo, lineas, antes } of nuevos) {
      const muestra = DETALLE || lineas.length - antes <= 5 ? lineas : lineas.slice(0, 5);
      console.log(`    - ${archivo}: tenía ${antes}, ahora ${lineas.length} (líneas ${muestra.join(', ')}${muestra.length < lineas.length ? ', …' : ''})`);
    }
    console.log('');
  }
  for (const p of nuevosBd) {
    console.log(`  ■ Base de datos — ${p.tipo}: ${p.que}`);
    console.log(`    Por qué importa: ${p.porque}\n`);
  }
  console.log('  Arréglalo, o si es correcto a propósito ponle en la línea el comentario  // revisado: <por qué>');
  console.log('  (Las líneas son del archivo nuevo; si un archivo ya tenía casos, el nuevo es uno de los listados.)\n');
  // exitCode y no process.exit(): en Windows, salir con un fetch aún abierto
  // revienta libuv y el código de salida sale 127 en vez de 1.
  process.exitCode = 1;
}

main().catch((e) => { console.error('\n  Revisor: falló por dentro —', e.message, '\n  No bloquea la publicación.\n'); });
