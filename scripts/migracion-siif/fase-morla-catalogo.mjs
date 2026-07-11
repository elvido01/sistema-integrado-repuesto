// Fase REPUESTOS MORLA VIEJA — CATALOGO + EXISTENCIAS
// ---------------------------------------------------------------------
// Carga el catalogo de repuestos del SiiF viejo de Morla (tabla mercancias
// de siif_repuestos_morla, rescatada por copia en frio del datadir MySQL 5.5)
// a `productos` del tenant REPUESTOS MORLA VIEJA (00000000-...-0002).
// La existencia neta de cada producto se carga como un movimiento ENTRADA
// inicial en inventario_movimientos (MotoFlow calcula la existencia de ahi).
//
// Fuente: out/morla_catalogo.tsv  (exportado con mysql --batch, latin1)
//   columnas: id codigo referencia descripcion marca modelo tipo
//             costo_1 precio_1 precio_2 precio_3 itbis minimo maximo
//             almacen activo stock
//
//   node fase-morla-catalogo.mjs            (dry-run: muestra y cuenta)
//   node fase-morla-catalogo.mjs --commit   (carga real)

import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const TENANT = process.env.MORLA_VIEJA_TENANT_ID || '00000000-0000-0000-0000-000000000002';
const COMMIT = process.argv.includes('--commit');
const TSV = path.join(__dirname, 'out', 'morla_catalogo.tsv');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const s = (v) => (v == null ? '' : String(v).trim());
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const upper = (v) => s(v).toUpperCase();

// mysql --batch escapa \t \n \\ dentro de los campos y usa \N para NULL
const unesc = (v) => {
  if (v === '\\N') return null;
  return v.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
};

// ITBIS del SiiF: codigos tipo IE / I08 / *E. Se mapea la tasa; la mayoria
// de los repuestos vienen 'IE'. Si el codigo trae 18/08 se usa esa tasa.
const itbisPct = (code) => {
  const c = upper(code);
  if (c.includes('18')) return 0.18;
  if (c.includes('08')) return 0.08;
  return 0;
};

// --- leer TSV (latin1 para conservar acentos del SiiF) ---
const raw = fs.readFileSync(TSV, 'latin1').replace(/\r/g, '');
const lines = raw.split('\n').filter((l) => l.length > 0);
const header = lines[0].split('\t');
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
const filas = [];
let malformadas = 0;
for (let i = 1; i < lines.length; i++) {
  const c = lines[i].split('\t');
  if (c.length !== header.length) { malformadas++; continue; }
  filas.push(c.map(unesc));
}
const get = (row, col) => row[idx[col]];
console.log(`Tenant: ${TENANT} | commit=${COMMIT}`);
console.log(`Filas en TSV: ${filas.length} | malformadas (saltadas): ${malformadas}`);

// dedup por codigo (conserva la primera)
const byCodigo = new Map();
for (const r of filas) {
  const cod = s(get(r, 'codigo'));
  if (!cod || byCodigo.has(cod)) continue;
  byCodigo.set(cod, r);
}
const merc = [...byCodigo.values()];
console.log(`Unicos por codigo: ${merc.length}`);

const mapProducto = (r, id) => ({
  id, tenant_id: TENANT,
  legacy_id: get(r, 'id') ? Number(get(r, 'id')) : null,
  codigo: s(get(r, 'codigo')),
  referencia: s(get(r, 'referencia')) || null,
  descripcion: s(get(r, 'descripcion')) || s(get(r, 'codigo')),
  costo: num(get(r, 'costo_1')),
  precio: num(get(r, 'precio_1')),
  itbis_pct: itbisPct(get(r, 'itbis')),
  min_stock: num(get(r, 'minimo')),
  max_stock: num(get(r, 'maximo')),
  ubicacion: s(get(r, 'almacen')) || null,
  activo: upper(get(r, 'activo')) === 'S' || num(get(r, 'activo')) === 1,
});

if (!COMMIT) {
  const conStock = merc.filter((r) => num(get(r, 'stock')) > 0).length;
  const conPrecio = merc.filter((r) => num(get(r, 'precio_1')) > 0).length;
  console.log(`Con precio>0: ${conPrecio} | con existencia>0: ${conStock}`);
  console.log('\nMuestra:', JSON.stringify(merc.slice(0, 5).map((r) => ({
    ...mapProducto(r, '(uuid)'), stock: num(get(r, 'stock')),
  })), null, 2));
  console.log('\n(DRY-RUN — no se escribio nada.)');
  process.exit(0);
}

// ---- COMMIT ----
// 1) productos existentes (upsert por legacy_id / codigo)
const byLegacy = new Map(); const byCod = new Map(); let f = 0;
for (;;) {
  const { data, error } = await supabase.from('productos').select('id, legacy_id, codigo').eq('tenant_id', TENANT).range(f, f + 999);
  if (error) { console.error(error.message); process.exit(1); }
  for (const r of data) { if (r.legacy_id != null) byLegacy.set(Number(r.legacy_id), r.id); if (r.codigo) byCod.set(s(r.codigo), r.id); }
  if (data.length < 1000) break; f += 1000;
}

const prodRows = merc.map((r) => {
  const legacy = get(r, 'id') ? Number(get(r, 'id')) : null;
  const id = (legacy != null && byLegacy.get(legacy)) || byCod.get(s(get(r, 'codigo'))) || crypto.randomUUID();
  return mapProducto(r, id);
});

const B = 500; let ok = 0;
for (let i = 0; i < prodRows.length; i += B) {
  const { error } = await supabase.from('productos').upsert(prodRows.slice(i, i + B), { onConflict: 'id' });
  if (error) { console.error(`❌ productos ${i}: ${error.message}`); process.exit(1); }
  ok += Math.min(B, prodRows.length - i);
  if (ok % 2000 === 0 || ok === prodRows.length) console.log(`  productos: ${ok}/${prodRows.length}`);
}
console.log(`✅ ${ok} productos cargados.`);

// 2) Existencia como movimiento ENTRADA inicial (idempotente por legacy_id).
//    producto_id por codigo (recien cargado).
const codToId = new Map();
let g = 0;
for (;;) {
  const { data, error } = await supabase.from('productos').select('id, codigo, legacy_id').eq('tenant_id', TENANT).range(g, g + 999);
  if (error) { console.error(error.message); process.exit(1); }
  for (const r of data) if (r.codigo) codToId.set(s(r.codigo), r.id);
  if (data.length < 1000) break; g += 1000;
}

const movs = [];
for (const r of merc) {
  const stock = num(get(r, 'stock'));
  if (stock <= 0) continue;
  const pid = codToId.get(s(get(r, 'codigo')));
  if (!pid) continue;
  movs.push({
    tenant_id: TENANT, legacy_id: get(r, 'id') ? Number(get(r, 'id')) : null,
    producto_id: pid, fecha: '2026-05-28',
    tipo: 'ENTRADA', cantidad: stock, costo_unitario: num(get(r, 'costo_1')),
    referencia_doc: 'SALDO INICIAL SiiF',
  });
}

// idempotencia: borrar movimientos migrados previos (legacy_id) en lotes
let borrados = 0;
for (;;) {
  const { data: lote, error: selErr } = await supabase
    .from('inventario_movimientos').select('id').eq('tenant_id', TENANT).not('legacy_id', 'is', null).limit(150);
  if (selErr) { console.error('❌ limpiando (select):', selErr.message); process.exit(1); }
  if (!lote?.length) break;
  const { error: delErr } = await supabase.from('inventario_movimientos').delete().in('id', lote.map((r) => r.id));
  if (delErr) { console.error('❌ limpiando (delete):', delErr.message); process.exit(1); }
  borrados += lote.length;
}
if (borrados) console.log(`  (limpiados ${borrados} movimientos previos)`);

let okm = 0;
for (let i = 0; i < movs.length; i += B) {
  const { error } = await supabase.from('inventario_movimientos').insert(movs.slice(i, i + B));
  if (error) { console.error(`❌ movimientos ${i}: ${error.message}`); process.exit(1); }
  okm += Math.min(B, movs.length - i);
  if (okm % 2000 === 0 || okm === movs.length) console.log(`  existencias: ${okm}/${movs.length}`);
}
console.log(`\n✅ REPUESTOS MORLA VIEJA: ${ok} productos, ${okm} existencias iniciales → ${TENANT}.`);
process.exit(0);
