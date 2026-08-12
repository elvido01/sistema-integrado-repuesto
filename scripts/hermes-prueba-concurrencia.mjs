// ============================================================
// Prueba 2 del contrato: dos workers a la vez
// ------------------------------------------------------------
// Esta no cabe en el archivo de pruebas SQL. Dentro de una sola
// transacción no hay concurrencia que probar: hacen falta DOS
// conexiones reales peleándose por la misma cola, que es lo que
// pasa cuando Hermes corre con más de un worker o cuando el
// gateway se reinicia sin haber soltado el anterior.
//
// Lo que se comprueba es que FOR UPDATE SKIP LOCKED cumple: los
// dos llaman a chat_tomar() en el mismo instante y ninguno se
// lleva el mismo mensaje que el otro.
//
//   npm run hermes:concurrencia
//
// ANTES DE CORRERLA: manda 3 mensajes desde el widget de MotoFlow
// y NO esperes a que Hermes conteste — hacen falta pendientes de
// verdad. Si Hermes está atendiendo, apágalo primero o se los
// lleva él.
//
// NO deja basura: lo que tome se devuelve a 'pendiente' al final.
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

console.log('\n═══ PRUEBA 2 · DOS WORKERS A LA VEZ ═══\n');

const pend = await a.query(`SELECT count(*)::int n FROM hermes.chat_pendientes(50) WHERE estado = 'pendiente'`);
console.log(`  pendientes en la cola: ${pend.rows[0].n}`);
if (pend.rows[0].n < 2) {
  console.log(`
  ✗ Hacen falta al menos 2 pendientes para que la prueba signifique algo.
    Manda 3 mensajes desde el widget y vuelve a correrla.
`);
  await a.query('ROLLBACK'); await b.query('ROLLBACK');
  await a.end(); await b.end();
  process.exit(1);
}

// Los dos a la vez, de verdad: se lanzan sin await entre medias.
const [ra, rb] = await Promise.all([
  a.query('SELECT id, texto FROM hermes.chat_tomar(1)'),
  b.query('SELECT id, texto FROM hermes.chat_tomar(1)'),
]);

const ida = ra.rows.map((x) => String(x.id));
const idb = rb.rows.map((x) => String(x.id));
const chocan = ida.filter((x) => idb.includes(x));

console.log(`\n  worker A tomó: ${ida.join(', ') || '(ninguno)'}`);
for (const x of ra.rows) console.log(`     "${String(x.texto).slice(0, 55)}"`);
console.log(`  worker B tomó: ${idb.join(', ') || '(ninguno)'}`);
for (const x of rb.rows) console.log(`     "${String(x.texto).slice(0, 55)}"`);

console.log('\n  ─────────────────────────────────────');
const ok = chocan.length === 0 && (ida.length + idb.length) > 0;
if (chocan.length) {
  console.log(`  ✗ FALLA · los dos se llevaron el mismo mensaje: ${chocan.join(', ')}`);
  console.log('    SKIP LOCKED no está entrando. Mirar chat_tomar().');
} else if (ida.length + idb.length === 0) {
  console.log('  ✗ FALLA · ninguno tomó nada habiendo pendientes.');
} else {
  console.log('  ✓ PASA · mensajes distintos. Ninguno se llevó el del otro.');
}

// Se devuelve todo como estaba: ROLLBACK deshace las dos transacciones.
await a.query('ROLLBACK');
await b.query('ROLLBACK');
await a.end();
await b.end();
console.log('  (deshecho: la cola queda como estaba)\n');
process.exit(ok ? 0 : 1);
