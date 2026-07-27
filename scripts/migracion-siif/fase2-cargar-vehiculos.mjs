// Fase 2 — CARGA de vehículos de Los Naranjos a productos (UPSERT idempotente).
// Uso:
//   node fase2-cargar-vehiculos.mjs                (simula)
//   node fase2-cargar-vehiculos.mjs --limit 20 --commit
//   node fase2-cargar-vehiculos.mjs --commit       (todos)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const TENANT_ID = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const limIdx = args.indexOf('--limit');
const LIMIT = limIdx >= 0 ? parseInt(args[limIdx + 1], 10) : Infinity;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function row(p, id) {
  return {
    id, tenant_id: TENANT_ID, legacy_id: p.legacy_id,
    codigo: p.codigo, referencia: p.referencia, descripcion: p.descripcion,
    costo: p.costo, precio: p.precio, itbis_pct: p.itbis_pct,
    chasis: p.chasis, activo: p.activo, min_stock: p.min_stock, max_stock: p.max_stock,
  };
}

const all = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'vehiculos-los-naranjos.json'), 'utf8'));
const items = Number.isFinite(LIMIT) ? all.slice(0, LIMIT) : all;
console.log(`Productos a procesar: ${items.length} (de ${all.length}) | commit=${COMMIT}`);

// existentes
const byLegacy = new Map();
const byCodigo = new Map();
let from = 0;
for (;;) {
  const { data, error } = await supabase.from('productos').select('id, legacy_id, codigo').eq('tenant_id', TENANT_ID).range(from, from + 999);
  if (error) { console.error('Error leyendo productos:', error.message); process.exit(1); }
  for (const r of data) {
    if (r.legacy_id != null) byLegacy.set(Number(r.legacy_id), r.id);
    // En MAYÚSCULAS, igual que en fase1-cargar-clientes: el SiiF trae el mismo
    // código escrito de las dos formas y casando así se creaba un duplicado.
    if (r.codigo) byCodigo.set(String(r.codigo).trim().toUpperCase(), r.id);
  }
  if (data.length < 1000) break;
  from += 1000;
}

let nuevos = 0, actualizar = 0;
const rows = items.map((p) => {
  let id = byLegacy.get(Number(p.legacy_id)) || byCodigo.get(String(p.codigo).trim().toUpperCase());
  if (id) actualizar++; else { id = crypto.randomUUID(); nuevos++; }
  return row(p, id);
});
console.log(`Plan: ${nuevos} nuevos, ${actualizar} actualizaciones.`);
if (!COMMIT) { console.log('\n(Simulación — no se escribió nada.)'); process.exit(0); }

const BATCH = 500;
let ok = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH);
  const { error } = await supabase.from('productos').upsert(chunk, { onConflict: 'id' });
  if (error) { console.error(`❌ lote ${i}: ${error.message}`); process.exit(1); }
  ok += chunk.length;
  console.log(`  cargados ${ok}/${rows.length}`);
}
console.log(`\n✅ Listo. ${ok} vehículos cargados en productos de Los Naranjos.`);
process.exit(0);
