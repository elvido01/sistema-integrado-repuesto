// ============================================================
// Prueba 2 del contrato: dos workers a la vez
// ------------------------------------------------------------
// Esta no cabe en el archivo de pruebas SQL. Dentro de una sola
// transacción no hay concurrencia que probar: hacen falta DOS
// conexiones reales peleándose por la misma cola, que es lo que
// pasa cuando Hermes corre con más de un worker o cuando el
// gateway se reinicia sin haber soltado el anterior.
//
// Lo que se comprueba:
//   2a · FOR UPDATE SKIP LOCKED cumple: ninguno se lleva el
//        mensaje del otro.
//   2b · Cada claim estrena su propio claim_token (v4). Dos
//        workers vivos a la vez nunca comparten llave.
//   2c · Cada uno puede renovar LO SUYO desde su conexión.
//
// Lo que NO se prueba aquí, a propósito: que A no pueda renovar
// el mensaje de B. Cruzar tokens entre conexiones abiertas
// bloquea —la fila de B está tomada por una transacción sin
// cerrar y A se quedaría esperando—, así que el fencing cruzado
// se prueba en la misma transacción, en la nº 24 de
// sql/hermes_canal_v4_pruebas.sql.
//
//   npm run hermes:concurrencia
//
// ANTES DE CORRERLA: manda 3 mensajes desde el widget de MotoFlow
// y NO esperes a que Hermes conteste — hacen falta pendientes de
// verdad. Si Hermes está atendiendo, apágalo primero o se los
// lleva él.
//
// NO deja basura: lo que tome se devuelve al estado anterior con
// un ROLLBACK al final.
// ============================================================

import path from 'node:path';
import { createRequire } from 'node:module';

const RAIZ = path.resolve(import.meta.dirname, '..');
const require_ = createRequire(path.join(RAIZ, 'package.json'));
const { Client } = require_('pg');

process.loadEnvFile(path.join(RAIZ, 'scripts/migracion-siif/.env'));

const DSN = {
  host: 'aws-0-us-east-2.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'hermes_readonly.zdvxowpuklbypweyqqki',
  password: process.env.HERMES_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
};

if (!DSN.password) {
  console.log(`
  Falta la clave de hermes_readonly.

    $env:HERMES_DB_PASSWORD = "la-clave"   (PowerShell)
    HERMES_DB_PASSWORD=la-clave npm run hermes:concurrencia   (bash)

  No se guarda en el repo a propósito.
`);
  process.exit(1);
}

const abrir = async () => { const c = new Client(DSN); await c.connect(); return c; };

const a = await abrir();
const b = await abrir();

// El rol es de solo lectura por defecto; chat_tomar escribe.
for (const c of [a, b]) {
  await c.query('BEGIN');
  await c.query('SET TRANSACTION READ WRITE');
}

const cerrar = async (codigo) => {
  await a.query('ROLLBACK');
  await b.query('ROLLBACK');
  await a.end();
  await b.end();
  console.log('  (deshecho: la cola queda como estaba)\n');
  process.exit(codigo);
};

const linea = (ok, texto) => {
  console.log(`  ${ok ? '✓ PASA' : '✗ FALLA'} · ${texto}`);
  return ok;
};

console.log('\n═══ PRUEBA 2 · DOS WORKERS A LA VEZ ═══\n');

// chat_tomar de v4 devuelve claim_token; con v3 la columna no existe y
// la consulta falla con "column ... does not exist", que ya dice qué pasa.
const tieneV4 = (await a.query(
  `SELECT to_regprocedure('hermes.chat_renovar(bigint,uuid)') IS NOT NULL AS si`
)).rows[0].si;
console.log(`  contrato: ${tieneV4 ? 'v4 (con fencing)' : 'v3 (sin fencing)'}`);

const cols = tieneV4 ? 'id, texto, claim_token, lease_until' : 'id, texto';

const pend = await a.query(
  `SELECT count(*)::int n FROM hermes.chat_pendientes(50) WHERE estado = 'pendiente'`
);
console.log(`  pendientes en la cola: ${pend.rows[0].n}`);
if (pend.rows[0].n < 2) {
  console.log(`
  ✗ Hacen falta al menos 2 pendientes para que la prueba signifique algo.
    Manda 3 mensajes desde el widget y vuelve a correrla.
`);
  await cerrar(1);
}

// Los dos a la vez, de verdad: se lanzan sin await entre medias.
const [ra, rb] = await Promise.all([
  a.query(`SELECT ${cols} FROM hermes.chat_tomar(1)`),
  b.query(`SELECT ${cols} FROM hermes.chat_tomar(1)`),
]);

console.log(`\n  worker A tomó: ${ra.rows.map((x) => x.id).join(', ') || '(ninguno)'}`);
for (const x of ra.rows) console.log(`     "${String(x.texto).slice(0, 55)}"`);
console.log(`  worker B tomó: ${rb.rows.map((x) => x.id).join(', ') || '(ninguno)'}`);
for (const x of rb.rows) console.log(`     "${String(x.texto).slice(0, 55)}"`);

console.log('\n  ─────────────────────────────────────');
let todo = true;

// 2a · Ninguno se lleva el mensaje del otro
const ida = ra.rows.map((x) => String(x.id));
const idb = rb.rows.map((x) => String(x.id));
const chocan = ida.filter((x) => idb.includes(x));

if (ida.length + idb.length === 0) {
  todo = linea(false, 'ninguno tomó nada habiendo pendientes') && todo;
} else if (chocan.length) {
  todo = linea(false, `los dos se llevaron el mismo mensaje: ${chocan.join(', ')}`) && todo;
  console.log('        SKIP LOCKED no está entrando. Mirar chat_tomar().');
} else {
  todo = linea(true, '2a · mensajes distintos, ninguno se llevó el del otro') && todo;
}

if (tieneV4) {
  // 2b · Cada claim con su propia llave
  const toks = [...ra.rows, ...rb.rows].map((x) => x.claim_token);
  const sinToken = toks.filter((t) => !t).length;
  const repetidos = toks.length !== new Set(toks).size;

  if (sinToken) {
    todo = linea(false, `2b · ${sinToken} claim(s) salieron sin claim_token`) && todo;
  } else if (repetidos) {
    todo = linea(false, '2b · dos claims comparten claim_token') && todo;
  } else {
    todo = linea(true, '2b · cada claim estrenó su propio claim_token') && todo;
    for (const x of [...ra.rows, ...rb.rows]) {
      const restan = Math.round((new Date(x.lease_until) - Date.now()) / 1000);
      console.log(`        #${x.id} → ${String(x.claim_token).slice(0, 8)}… vence en ${restan}s`);
    }
  }

  // 2c · Cada uno renueva lo suyo desde su propia conexión
  const renovaciones = await Promise.all([
    ...ra.rows.map((x) => a.query('SELECT hermes.chat_renovar($1, $2) AS r', [x.id, x.claim_token])),
    ...rb.rows.map((x) => b.query('SELECT hermes.chat_renovar($1, $2) AS r', [x.id, x.claim_token])),
  ]);
  const malas = renovaciones.map((q) => q.rows[0].r).filter((r) => r.renovado !== true);
  if (malas.length) {
    todo = linea(false, `2c · ${malas.length} renovación(es) rechazadas: ${JSON.stringify(malas[0])}`) && todo;
  } else {
    todo = linea(true, '2c · cada worker renovó su propio arrendamiento') && todo;
  }
}

console.log('');
await cerrar(todo ? 0 : 1);
