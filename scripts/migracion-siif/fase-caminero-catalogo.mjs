// Fase Caminero Motors — CATALOGO
// ---------------------------------------------------------------------
// El catalogo de vehiculos/motos de CAMINERO MOTORS vive en la tabla
// `mercancias` de scv8_mp_los_naranjos (el archivo tiene otro nombre, pero
// los codigos -VIN- son de Caminero: motos HONDA NAVI, etc. — confirmado por
// el usuario). Se carga a `productos` del tenant CAMINERO MOTORS (b39506c3),
// resolviendo marca/modelo/tipo (upsert por nombre). NO toca la financiera.
// Idempotente: upsert por legacy_id, si no por codigo (fusiona con los
// productos que ya se cargaron a mano en el sistema nuevo).
//
//   node fase-caminero-catalogo.mjs            (dry-run: muestra y cuenta)
//   node fase-caminero-catalogo.mjs --commit   (carga real)

import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { parseTable } from './lib/parseDump.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const DEALER = process.env.DEALER_TENANT_ID || 'b39506c3-27dc-467d-830b-096731b83113'; // CAMINERO MOTORS
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
const upper = (v) => s(v).toUpperCase();

// tipo = primera palabra de la descripcion (MOTOCICLETA / AUTOMOVIL / JEEP / ...)
const tipoDe = (desc) => upper(desc).split(/\s+/)[0] || 'GENERAL';

console.log(`Respaldo: ${FECHA} | dealer: ${DEALER} | commit=${COMMIT}`);
const { rows } = await parseTable(FILE, 'mercancias');
console.log(`mercancias en dump: ${rows.length}`);

// dedup por codigo (VIN); conserva la primera
const byCodigo = new Map();
for (const r of rows) {
  const c = s(r.codigo);
  if (!c || byCodigo.has(c)) continue;
  byCodigo.set(c, r);
}
const merc = [...byCodigo.values()];
console.log(`unicos por codigo: ${merc.length}`);

// Nombres de marca/modelo/tipo (usa *_txt; si falta, cae a la descripcion)
const marcaNom = (r) => upper(r.marca_txt) || upper((s(r.descripcion).split(/\s+/)[1] || '')) || 'SIN MARCA';
const modeloNom = (r) => upper(r.modelo_txt) || upper((s(r.descripcion).split(/\s+/)[2] || '')) || 'SIN MODELO';

if (!COMMIT) {
  const muestra = merc.slice(0, 5).map((r) => ({
    codigo: s(r.codigo), descripcion: s(r.descripcion), tipo: tipoDe(r.descripcion),
    marca: marcaNom(r), modelo: modeloNom(r), precio: num(r.precio_1), costo: num(r.costo_1),
    existencia: num(r.existencia), activo: upper(r.activo) === 'S' || num(r.activo) === 1,
  }));
  const marcas = new Set(merc.map(marcaNom));
  const tipos = new Set(merc.map((r) => tipoDe(r.descripcion)));
  console.log(`\nMarcas distintas: ${marcas.size} | Tipos: ${[...tipos].join(', ')}`);
  console.log('Con precio>0:', merc.filter((r) => num(r.precio_1) > 0).length, '| con existencia>0:', merc.filter((r) => num(r.existencia) > 0).length);
  console.log('\nMuestra:\n', JSON.stringify(muestra, null, 2));
  console.log('\n(DRY-RUN — no se escribio nada.)');
  process.exit(0);
}

// ---- COMMIT ----
// 1) Resolver/crear marcas, tipos, modelos para el tenant dealer
async function fetchMap(table, extraCols = '') {
  const map = new Map(); let from = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select(`id, nombre${extraCols}`).eq('tenant_id', DEALER).range(from, from + 999);
    if (error) { console.error(`${table}:`, error.message); process.exit(1); }
    for (const r of data) map.set(upper(r.nombre) + (extraCols.includes('marca_id') ? '|' + r.marca_id : ''), r.id);
    if (data.length < 1000) break; from += 1000;
  }
  return map;
}
const marcaMap = await fetchMap('marcas');
const tipoMap = await fetchMap('tipos_producto');

// marcas nuevas
const nuevasMarcas = [...new Set(merc.map(marcaNom))].filter((n) => !marcaMap.has(n))
  .map((nombre) => ({ id: crypto.randomUUID(), tenant_id: DEALER, nombre, activo: true }));
if (nuevasMarcas.length) { await supabase.from('marcas').insert(nuevasMarcas); nuevasMarcas.forEach((m) => marcaMap.set(upper(m.nombre), m.id)); }
// tipos nuevos
const nuevosTipos = [...new Set(merc.map((r) => tipoDe(r.descripcion)))].filter((n) => !tipoMap.has(n))
  .map((nombre) => ({ id: crypto.randomUUID(), tenant_id: DEALER, nombre, activo: true }));
if (nuevosTipos.length) { await supabase.from('tipos_producto').insert(nuevosTipos); nuevosTipos.forEach((t) => tipoMap.set(upper(t.nombre), t.id)); }
// modelos (por marca_id + nombre)
const modeloMap = await fetchMap('modelos', ', marca_id');
const nuevosModelos = [];
for (const r of merc) {
  const mId = marcaMap.get(marcaNom(r));
  const key = modeloNom(r) + '|' + mId;
  if (!modeloMap.has(key) && !nuevosModelos.find((x) => upper(x.nombre) + '|' + x.marca_id === key)) {
    nuevosModelos.push({ id: crypto.randomUUID(), tenant_id: DEALER, marca_id: mId, nombre: modeloNom(r), activo: true });
  }
}
if (nuevosModelos.length) {
  for (let i = 0; i < nuevosModelos.length; i += 500) await supabase.from('modelos').insert(nuevosModelos.slice(i, i + 500));
  nuevosModelos.forEach((m) => modeloMap.set(upper(m.nombre) + '|' + m.marca_id, m.id));
}
console.log(`Marcas +${nuevasMarcas.length}, Tipos +${nuevosTipos.length}, Modelos +${nuevosModelos.length}`);

// 2) Productos existentes (para upsert por legacy_id / codigo)
const byLegacy = new Map(); const byCod = new Map(); let f = 0;
for (;;) {
  const { data, error } = await supabase.from('productos').select('id, legacy_id, codigo').eq('tenant_id', DEALER).range(f, f + 999);
  if (error) { console.error(error.message); process.exit(1); }
  for (const r of data) { if (r.legacy_id != null) byLegacy.set(Number(r.legacy_id), r.id); if (r.codigo) byCod.set(s(r.codigo), r.id); }
  if (data.length < 1000) break; f += 1000;
}

const prodRows = merc.map((r) => {
  const legacy = r.id ? Number(r.id) : null;
  const id = (legacy != null && byLegacy.get(legacy)) || byCod.get(s(r.codigo)) || crypto.randomUUID();
  const mId = marcaMap.get(marcaNom(r));
  return {
    id, tenant_id: DEALER, legacy_id: legacy,
    codigo: s(r.codigo), referencia: s(r.referencia) || null,
    descripcion: s(r.descripcion) || s(r.nombre) || s(r.codigo),
    tipo_id: tipoMap.get(tipoDe(r.descripcion)) || null,
    marca_id: mId || null,
    modelo_id: modeloMap.get(modeloNom(r) + '|' + mId) || null,
    costo: num(r.costo_1), precio: num(r.precio_1),
    itbis_pct: s(r.itbis).includes('18') ? 0.18 : 0,
    chasis: s(r.codigo), ubicacion: s(r.almacen) || null,
    min_stock: num(r.minimo), max_stock: num(r.maximo),
    activo: upper(r.activo) === 'S' || num(r.activo) === 1,
  };
});

const B = 500; let ok = 0;
for (let i = 0; i < prodRows.length; i += B) {
  const { error } = await supabase.from('productos').upsert(prodRows.slice(i, i + B), { onConflict: 'id' });
  if (error) { console.error(`❌ productos ${i}: ${error.message}`); process.exit(1); }
  ok += Math.min(B, prodRows.length - i);
  if (ok % 2000 === 0 || ok === prodRows.length) console.log(`  productos: ${ok}/${prodRows.length}`);
}
console.log(`\n✅ Catalogo Caminero Motors cargado: ${ok} productos en ${DEALER}.`);
process.exit(0);
