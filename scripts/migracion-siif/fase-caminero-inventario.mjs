// Fase Caminero Motors — MOVIMIENTOS DE INVENTARIO (kardex)
// ---------------------------------------------------------------------
// Migra inv_mov_detalle (SCV8, en scv8_mp_los_naranjos) → inventario_movimientos
// del tenant CAMINERO MOTORS (b39506c3). Entradas (CM/EN) y salidas (FT), por
// mercancia. Resuelve producto_id por codigo (catalogo ya cargado).
// Idempotente: borra los migrados (legacy_id) y re-inserta; respeta los
// movimientos hechos a mano (legacy_id NULL).
// REQUIERE correr antes: sql/inventario_movimientos_legacy_id.sql
//
//   node fase-caminero-inventario.mjs            (dry-run)
//   node fase-caminero-inventario.mjs --commit

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { parseTable } from './lib/parseDump.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const DEALER = process.env.DEALER_TENANT_ID || 'b39506c3-27dc-467d-830b-096731b83113';
const COMMIT = process.argv.includes('--commit');
const BASE_DIR = process.env.COPIAS_DIR || 'E:\\COPIAS';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function latestBackup(baseDir) {
  const dirs = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name)).map((d) => d.name).sort();
  if (!dirs.length) throw new Error(`No hay respaldos en ${baseDir}`);
  return dirs[dirs.length - 1];
}
const FECHA = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || latestBackup(BASE_DIR);
const FILE = path.join(BASE_DIR, FECHA, `scv8_mp_los_naranjos.${FECHA}.SQL`);
const s = (v) => (v == null ? '' : String(v).trim());
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const fecha = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s(v)); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };

console.log(`Respaldo: ${FECHA} | dealer: ${DEALER} | commit=${COMMIT}`);
const { rows } = await parseTable(FILE, 'inv_mov_detalle');
console.log(`inv_mov_detalle: ${rows.length}`);

// producto_id por codigo (catalogo de Caminero)
const byCod = new Map(); let from = 0;
for (;;) {
  const { data, error } = await supabase.from('productos').select('id, codigo').eq('tenant_id', DEALER).range(from, from + 999);
  if (error) { console.error('productos:', error.message); process.exit(1); }
  for (const r of data) if (r.codigo) byCod.set(s(r.codigo), r.id);
  if (data.length < 1000) break; from += 1000;
}
console.log(`productos en catalogo dealer: ${byCod.size}`);

let sinProducto = 0;
const movs = [];
for (const r of rows) {
  const pid = byCod.get(s(r.codigo));
  if (!pid) { sinProducto++; continue; }
  const ent = num(r.entrada), sal = num(r.salida);
  const cantidad = ent - sal;
  if (cantidad === 0) continue;
  movs.push({
    tenant_id: DEALER, legacy_id: r.id ? Number(r.id) : null,
    producto_id: pid, fecha: fecha(r.fecha) || FECHA,
    tipo: cantidad >= 0 ? 'ENTRADA' : 'SALIDA',
    cantidad, costo_unitario: num(r.costo),
    referencia_doc: s(r.referencia) || (s(r.tip_transaccion) + '-' + s(r.num_transaccion)),
  });
}
console.log(`movimientos mapeados: ${movs.length} | sin producto en catalogo (omitidos): ${sinProducto}`);

if (!COMMIT) {
  console.log('\nMuestra:', JSON.stringify(movs.slice(0, 4), null, 1));
  const ent = movs.filter((m) => m.cantidad > 0).length, sal = movs.filter((m) => m.cantidad < 0).length;
  console.log(`\nEntradas: ${ent} | Salidas: ${sal}`);
  console.log('\n(DRY-RUN — no se escribio nada.)');
  process.exit(0);
}

// idempotencia: borrar migrados previos (legacy_id) y re-insertar.
// En LOTES por id: un DELETE masivo de miles de filas excede el
// statement_timeout de Supabase ("canceling statement due to statement timeout").
let borrados = 0;
for (;;) {
  const { data: lote, error: selErr } = await supabase
    .from('inventario_movimientos')
    .select('id')
    .eq('tenant_id', DEALER)
    .not('legacy_id', 'is', null)
    // 150 por lote: con mas IDs la URL del DELETE (PostgREST manda los ids en
    // el query string) se pasa de largo y devuelve 400 Bad Request.
    .limit(150);
  if (selErr) { console.error('❌ limpiando migrados (select):', selErr.message); process.exit(1); }
  if (!lote?.length) break;
  const { error: delErr } = await supabase
    .from('inventario_movimientos')
    .delete()
    .in('id', lote.map((r) => r.id));
  if (delErr) { console.error('❌ limpiando migrados (delete):', delErr.message); process.exit(1); }
  borrados += lote.length;
  console.log(`  limpiando migrados: ${borrados}`);
}

const B = 500; let ok = 0;
for (let i = 0; i < movs.length; i += B) {
  const { error } = await supabase.from('inventario_movimientos').insert(movs.slice(i, i + B));
  if (error) { console.error(`❌ insert ${i}: ${error.message}`); process.exit(1); }
  ok += Math.min(B, movs.length - i);
  if (ok % 2000 === 0 || ok === movs.length) console.log(`  movimientos: ${ok}/${movs.length}`);
}
console.log(`\n✅ Kardex Caminero Motors cargado: ${ok} movimientos en ${DEALER}.`);
process.exit(0);
