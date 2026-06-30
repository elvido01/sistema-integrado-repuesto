// Fase 1 — CARGA de clientes de MotoPréstamos Los Naranjos a Supabase.
// Lee out/clientes-los-naranjos.json (de fase1-clientes.mjs) y hace UPSERT
// idempotente por PK id, casando por legacy_id y por codigo. La cédula (rnc)
// es única por tenant, así que se carga en DOS pasadas:
//   1) todos los clientes con rnc = null (nunca colisiona)
//   2) se asigna la cédula solo a la 1ra ocurrencia de cada una
//
// Uso:
//   node fase1-cargar-clientes.mjs                 (simula)
//   node fase1-cargar-clientes.mjs --limit 20 --commit
//   node fase1-cargar-clientes.mjs --commit        (carga todos)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));

const TENANT_ID = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'; // MotoPréstamos Los Naranjos
const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const limIdx = args.indexOf('--limit');
const LIMIT = limIdx >= 0 ? parseInt(args[limIdx + 1], 10) : Infinity;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function baseRow(c, id) {
  return {
    id,
    tenant_id: TENANT_ID,
    legacy_id: c.legacy_id,
    codigo: c.codigo,
    nombre: c.nombre,
    telefono: c.telefono,
    email: c.email,
    direccion: c.direccion,
    activo: c.activo,
    autorizar_credito: c.autorizar_credito,
    generar_mora: c.generar_mora,
    mora_pct: 0,
  };
}

async function upsertBatches(rows, label) {
  const BATCH = 500;
  let ok = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase.from('clientes').upsert(chunk, { onConflict: 'id' });
    if (error) { console.error(`❌ ${label} lote ${i}: ${error.message}`); process.exit(1); }
    ok += chunk.length;
    console.log(`  ${label}: ${ok}/${rows.length}`);
  }
}

// 1. JSON transformado
const all = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'clientes-los-naranjos.json'), 'utf8'));
const clientes = Number.isFinite(LIMIT) ? all.slice(0, LIMIT) : all;
console.log(`Clientes a procesar: ${clientes.length} (de ${all.length})  | commit=${COMMIT}`);

// 2. Existentes del tenant
const existing = [];
const byLegacy = new Map();
const byCodigo = new Map();
let from = 0;
for (;;) {
  const { data, error } = await supabase
    .from('clientes').select('id, legacy_id, codigo, rnc')
    .eq('tenant_id', TENANT_ID).range(from, from + 999);
  if (error) { console.error('Error leyendo existentes:', error.message); process.exit(1); }
  for (const r of data) {
    existing.push(r);
    if (r.legacy_id != null) byLegacy.set(Number(r.legacy_id), r.id);
    if (r.codigo) byCodigo.set(String(r.codigo).trim(), r.id);
  }
  if (data.length < 1000) break;
  from += 1000;
}

// 3. Asignar id a cada fila
let nuevos = 0, actualizar = 0;
const usedIds = new Set();
const prelim = clientes.map((c) => {
  let id = byLegacy.get(Number(c.legacy_id)) || byCodigo.get(String(c.codigo).trim());
  if (id) actualizar++; else { id = crypto.randomUUID(); nuevos++; }
  usedIds.add(id);
  return { c, id };
});

// 4. Asignar cédula (rnc) determinísticamente: 1ra ocurrencia la conserva.
//    Se siembran las cédulas de filas existentes que NO vamos a tocar.
const seenRnc = new Set();
for (const r of existing) { if (r.rnc && !usedIds.has(r.id)) seenRnc.add(String(r.rnc).trim()); }
let rncDup = 0;
for (const p of prelim) {
  let rnc = p.c.cedula_rnc ? String(p.c.cedula_rnc).trim() : null;
  if (rnc) { if (seenRnc.has(rnc)) { rnc = null; rncDup++; } else seenRnc.add(rnc); }
  p.rnc = rnc;
}
console.log(`Plan: ${nuevos} nuevos, ${actualizar} actualizaciones, ${rncDup} con cédula duplicada (queda en blanco).`);

if (!COMMIT) { console.log('\n(Simulación — no se escribió nada. Agrega --commit.)'); process.exit(0); }

// 5. Pasada 1: todos sin rnc
await upsertBatches(prelim.map((p) => ({ ...baseRow(p.c, p.id), rnc: null })), 'pasada1');
// 6. Pasada 2: asignar cédula a la 1ra ocurrencia
const conRnc = prelim.filter((p) => p.rnc != null).map((p) => ({ ...baseRow(p.c, p.id), rnc: p.rnc }));
await upsertBatches(conRnc, 'pasada2-cedula');

console.log(`\n✅ Listo. ${prelim.length} clientes cargados/actualizados en MotoPréstamos Los Naranjos.`);
process.exit(0);
