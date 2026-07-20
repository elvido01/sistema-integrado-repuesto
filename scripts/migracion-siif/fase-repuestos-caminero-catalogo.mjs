// Fase REPUESTOS CAMINERO — CATALOGO + EXISTENCIAS
// ---------------------------------------------------------------------
// Carga el catalogo de repuestos de Repuestos Caminero desde la tabla
// `mercancias` de scv8_repuestos_cm (respaldo diario en E:\COPIAS) a
// `productos` del tenant REPUESTOS CAMINERO (91cc1e82). La existencia neta
// de cada producto se carga como un movimiento ENTRADA inicial en
// inventario_movimientos (MotoFlow calcula la existencia de ahi).
//
// Mismo tratamiento que Repuestos Morla/Morla Vieja: catalogo + existencias.
// Idempotente: upsert por legacy_id, si no por codigo; los movimientos de
// saldo inicial se re-generan (borra los legacy_id previos del tenant).
//
//   node fase-repuestos-caminero-catalogo.mjs            (dry-run: muestra y cuenta)
//   node fase-repuestos-caminero-catalogo.mjs --commit   (carga real)
//   node fase-repuestos-caminero-catalogo.mjs 2026-07-20 (respaldo especifico)

import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { parseTable } from './lib/parseDump.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const TENANT = process.env.REPUESTOS_CAMINERO_TENANT_ID || '91cc1e82-441e-4c22-8e30-9c8866294c00';
const COMMIT = process.argv.includes('--commit');
const BASE_DIR = process.env.COPIAS_DIR || 'E:\\COPIAS';
const DB = 'scv8_repuestos_cm';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function latestBackup(baseDir) {
  const dirs = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name)).map((d) => d.name).sort();
  if (!dirs.length) throw new Error(`No hay respaldos en ${baseDir}`);
  return dirs[dirs.length - 1];
}
const FECHA = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || latestBackup(BASE_DIR);
const FILE = path.join(BASE_DIR, FECHA, `${DB}.${FECHA}.SQL`);

const s = (v) => (v == null ? '' : String(v).trim());
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const upper = (v) => s(v).toUpperCase();

// ITBIS del SiiF: el campo trae codigos tipo IE / I18 / I08. Se mapea la tasa.
const itbisPct = (code) => { const c = upper(code); if (c.includes('18')) return 0.18; if (c.includes('08')) return 0.08; return 0; };

// marca/modelo: MISMA logica que Repuestos Morla. Los campos marca_txt/
// modelo_txt vienen vacios en esta base, pero la descripcion trae el modelo
// de moto (C70, CG150...). Se extrae del texto; si hay modelo reconocible y
// no hay marca, se rotula GENERICO (los modelos cuelgan de una marca). No se
// crean "tipos": tomar la 1ra palabra de la descripcion daba 343 tipos basura.
const MODELOS_NOMBRE = ['STRYKER', 'STRIKER', 'APACHE', 'PLATINA', 'WAVE', 'BIZ', 'DAX', 'TRUENO', 'BESTIA', 'CHAPPY', 'CHAPY'];
const PREFIJOS = 'CGL?|AX|AXIS|DT|RX|RS|GN|GS|EN|DR|YBR|XTZ|CRF|XR|GY|HLX|GLH|CB|CBF|CD';
const extraerModeloDesc = (desc) => {
  const d = upper(desc);
  let m = d.match(/\bC(50|70|90|100|110)\b/);
  if (m) return 'C' + m[1];
  m = d.match(new RegExp(`\\b(${PREFIJOS})\\s?-?\\s?(\\d{2,3})\\b`));
  if (m) return (m[1] + m[2]).replace(/[\s-]/g, '');
  for (const n of MODELOS_NOMBRE) {
    if (d.includes(n)) return n === 'STRIKER' ? 'STRYKER' : (n === 'CHAPY' ? 'CHAPPY' : n);
  }
  return null;
};
const esModeloValido = (v) => {
  if (!v) return false;
  const u = upper(v);
  return /^C(50|70|90|100|110)$/.test(u)
    || new RegExp(`^(${PREFIJOS})\\d{2,3}$`).test(u)
    || MODELOS_NOMBRE.includes(u);
};
const limpioLookup = (v) => { const u = upper(v); return (u && u !== 'NULL') ? u : null; };
const modeloNom = (r) => {
  const porDesc = extraerModeloDesc(r.descripcion);
  if (porDesc) return porDesc;
  const siif = limpioLookup(r.modelo_txt);
  return esModeloValido(siif) ? siif : null;
};
const marcaNom = (r) => limpioLookup(r.marca_txt) || (modeloNom(r) ? 'GENERICO' : null);

console.log(`Respaldo: ${FECHA} | fuente: ${DB} | tenant: ${TENANT} | commit=${COMMIT}`);
if (!fs.existsSync(FILE)) { console.error(`❌ No existe el archivo: ${FILE}`); process.exit(1); }
const { rows } = await parseTable(FILE, 'mercancias');
console.log(`mercancias en dump: ${rows.length}`);

// dedup por codigo (conserva la primera)
const byCodigo = new Map();
for (const r of rows) { const c = s(r.codigo); if (!c || byCodigo.has(c)) continue; byCodigo.set(c, r); }
const merc = [...byCodigo.values()];
console.log(`unicos por codigo: ${merc.length}`);

const mapProducto = (r, id, marcaId, modeloId) => ({
  id, tenant_id: TENANT,
  legacy_id: r.id ? Number(r.id) : null,
  codigo: s(r.codigo),
  referencia: s(r.referencia) || null,
  descripcion: s(r.descripcion) || s(r.nombre) || s(r.codigo),
  marca_id: marcaId || null,
  modelo_id: modeloId || null,
  modelos_ids: modeloId ? [modeloId] : [],
  costo: num(r.costo_1),
  precio: num(r.precio_1),
  itbis_pct: itbisPct(r.itbis),
  min_stock: num(r.minimo),
  max_stock: num(r.maximo),
  ubicacion: s(r.almacen) || null,
  activo: upper(r.activo) === 'S' || num(r.activo) === 1,
});

if (!COMMIT) {
  const conPrecio = merc.filter((r) => num(r.precio_1) > 0).length;
  const conStock = merc.filter((r) => num(r.existencia) > 0).length;
  const conMarca = merc.filter((r) => marcaNom(r)).length;
  const conModelo = merc.filter((r) => modeloNom(r)).length;
  const marcas = new Set(merc.map(marcaNom).filter(Boolean));
  const modelos = new Set(merc.map(modeloNom).filter(Boolean));
  console.log(`Con precio>0: ${conPrecio} | con existencia>0: ${conStock} | con marca: ${conMarca} | con modelo: ${conModelo}`);
  console.log(`Marcas distintas: ${marcas.size} | Modelos distintos: ${modelos.size} (${[...modelos].slice(0, 15).join(', ')})`);
  console.log('\nMuestra:', JSON.stringify(merc.slice(0, 5).map((r) => ({
    ...mapProducto(r, '(uuid)', marcaNom(r) && '(marca)', modeloNom(r) && '(modelo)'),
    marca: marcaNom(r), modelo: modeloNom(r), existencia: num(r.existencia),
  })), null, 2));
  console.log('\n(DRY-RUN — no se escribio nada.)');
  process.exit(0);
}

// ---- COMMIT ----
async function fetchMap(table, extraCols = '') {
  const map = new Map(); let from = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select(`id, nombre${extraCols}`).eq('tenant_id', TENANT).range(from, from + 999);
    if (error) { console.error(`${table}:`, error.message); process.exit(1); }
    for (const r of data) map.set(upper(r.nombre) + (extraCols.includes('marca_id') ? '|' + r.marca_id : ''), r.id);
    if (data.length < 1000) break; from += 1000;
  }
  return map;
}

// 1) marcas, tipos, modelos del tenant (upsert por nombre)
const marcaMap = await fetchMap('marcas');
const nuevasMarcas = [...new Set(merc.map(marcaNom).filter(Boolean))].filter((n) => !marcaMap.has(n))
  .map((nombre) => ({ id: crypto.randomUUID(), tenant_id: TENANT, nombre, activo: true }));
for (let i = 0; i < nuevasMarcas.length; i += 500) await supabase.from('marcas').insert(nuevasMarcas.slice(i, i + 500));
nuevasMarcas.forEach((m) => marcaMap.set(upper(m.nombre), m.id));

const modeloMap = await fetchMap('modelos', ', marca_id');
const nuevosModelos = [];
for (const r of merc) {
  const mn = marcaNom(r), mo = modeloNom(r);
  if (!mn || !mo) continue;
  const mId = marcaMap.get(mn);
  const key = mo + '|' + mId;
  if (!modeloMap.has(key) && !nuevosModelos.find((x) => upper(x.nombre) + '|' + x.marca_id === key)) {
    nuevosModelos.push({ id: crypto.randomUUID(), tenant_id: TENANT, marca_id: mId, nombre: mo, activo: true });
  }
}
for (let i = 0; i < nuevosModelos.length; i += 500) await supabase.from('modelos').insert(nuevosModelos.slice(i, i + 500));
nuevosModelos.forEach((m) => modeloMap.set(upper(m.nombre) + '|' + m.marca_id, m.id));
console.log(`Marcas +${nuevasMarcas.length}, Modelos +${nuevosModelos.length}`);

// 2) productos (upsert por legacy_id / codigo)
const byLegacy = new Map(); const byCod = new Map(); let f = 0;
for (;;) {
  const { data, error } = await supabase.from('productos').select('id, legacy_id, codigo').eq('tenant_id', TENANT).range(f, f + 999);
  if (error) { console.error(error.message); process.exit(1); }
  for (const r of data) { if (r.legacy_id != null) byLegacy.set(Number(r.legacy_id), r.id); if (r.codigo) byCod.set(s(r.codigo), r.id); }
  if (data.length < 1000) break; f += 1000;
}

const prodRows = merc.map((r) => {
  const legacy = r.id ? Number(r.id) : null;
  const id = (legacy != null && byLegacy.get(legacy)) || byCod.get(s(r.codigo)) || crypto.randomUUID();
  const mId = marcaNom(r) ? marcaMap.get(marcaNom(r)) : null;
  const moId = (marcaNom(r) && modeloNom(r)) ? modeloMap.get(modeloNom(r) + '|' + mId) : null;
  return mapProducto(r, id, mId, moId);
});

const B = 500; let ok = 0;
for (let i = 0; i < prodRows.length; i += B) {
  const { error } = await supabase.from('productos').upsert(prodRows.slice(i, i + B), { onConflict: 'id' });
  if (error) { console.error(`❌ productos ${i}: ${error.message}`); process.exit(1); }
  ok += Math.min(B, prodRows.length - i);
  if (ok % 1000 === 0 || ok === prodRows.length) console.log(`  productos: ${ok}/${prodRows.length}`);
}
console.log(`✅ ${ok} productos cargados.`);

// 3) existencia como movimiento ENTRADA inicial (idempotente por legacy_id)
const codToId = new Map(); let g = 0;
for (;;) {
  const { data, error } = await supabase.from('productos').select('id, codigo').eq('tenant_id', TENANT).range(g, g + 999);
  if (error) { console.error(error.message); process.exit(1); }
  for (const r of data) if (r.codigo) codToId.set(s(r.codigo), r.id);
  if (data.length < 1000) break; g += 1000;
}

const movs = [];
for (const r of merc) {
  const stock = num(r.existencia);
  if (stock <= 0) continue;
  const pid = codToId.get(s(r.codigo));
  if (!pid) continue;
  movs.push({
    tenant_id: TENANT, legacy_id: r.id ? Number(r.id) : null,
    producto_id: pid, fecha: FECHA,
    tipo: 'ENTRADA', cantidad: stock, costo_unitario: num(r.costo_1),
    referencia_doc: 'SALDO INICIAL SiiF',
  });
}

// idempotencia: borrar movimientos migrados previos (legacy_id) del tenant
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
  if (okm % 1000 === 0 || okm === movs.length) console.log(`  existencias: ${okm}/${movs.length}`);
}
console.log(`\n✅ REPUESTOS CAMINERO: ${ok} productos, ${okm} existencias iniciales → ${TENANT}.`);
process.exit(0);
