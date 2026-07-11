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

// Nombre de marca/modelo resueltos desde marcas_modelos del SiiF. Cuando el
// código no estaba en el catálogo viejo, mysql (con `< archivo`) escribe el
// texto literal "NULL" → se trata como sin valor.
const limpioLookup = (v) => { const u = upper(v); return (u && u !== 'NULL') ? u : null; };
const marcaNomRaw = (r) => limpioLookup(get(r, 'marca_nom'));

// Modelo de la MOTO extraído de la descripción (lo que el usuario reconoce:
// C70, CG150, AX100…). El SiiF no lo guarda en el campo modelo para muchos
// repuestos (modelo='0000'); sí está en el texto. Extractor curado de alta
// precisión: familias con cilindrada + algunos nombres propios.
const MODELOS_NOMBRE = ['STRYKER', 'STRIKER', 'APACHE', 'PLATINA', 'WAVE', 'BIZ', 'DAX', 'TRUENO', 'BESTIA', 'CHAPPY', 'CHAPY'];
const PREFIJOS = 'CGL?|AX|AXIS|DT|RX|RS|GN|GS|EN|DR|YBR|XTZ|CRF|XR|GY|HLX|GLH|CB|CBF|CD';
const extraerModeloDesc = (desc) => {
  const d = upper(desc);
  let m = d.match(/\bC(50|70|90|100|110)\b/);            // Honda C-series
  if (m) return 'C' + m[1];
  m = d.match(new RegExp(`\\b(${PREFIJOS})\\s?-?\\s?(\\d{2,3})\\b`));
  if (m) return (m[1] + m[2]).replace(/[\s-]/g, '');
  for (const n of MODELOS_NOMBRE) {
    if (d.includes(n)) return n === 'STRIKER' ? 'STRYKER' : (n === 'CHAPY' ? 'CHAPPY' : n);
  }
  return null;
};
// ¿El texto (venga de donde venga) parece un modelo de moto real? Filtra la
// basura del SiiF (tallas de goma "18", "PRESS CUB", "ALMACEN", "BLANCO"…).
const esModeloValido = (v) => {
  if (!v) return false;
  const u = upper(v);
  return /^C(50|70|90|100|110)$/.test(u)
    || new RegExp(`^(${PREFIJOS})\\d{2,3}$`).test(u)
    || MODELOS_NOMBRE.includes(u);
};

// Modelo final: prioriza el de la descripción; si no, acepta el del SiiF SOLO
// si también parece un modelo de moto real (no talla de goma ni "PRESS CUB").
const modeloNom = (r) => {
  const porDesc = extraerModeloDesc(get(r, 'descripcion'));
  if (porDesc) return porDesc;
  const siif = limpioLookup(get(r, 'modelo_nom'));
  return esModeloValido(siif) ? siif : null;
};

// Marca final: la del SiiF; si el producto NO trae marca pero SÍ tiene un modelo
// de moto reconocible, se rotula GENERICO (los modelos cuelgan de una marca, y
// así el producto muestra su modelo). Los genéricos sin modelo quedan sin marca.
const marcaNom = (r) => marcaNomRaw(r) || (modeloNom(r) ? 'GENERICO' : null);

const mapProducto = (r, id, marcaId, modeloId) => ({
  id, tenant_id: TENANT,
  legacy_id: get(r, 'id') ? Number(get(r, 'id')) : null,
  codigo: s(get(r, 'codigo')),
  referencia: s(get(r, 'referencia')) || null,
  descripcion: s(get(r, 'descripcion')) || s(get(r, 'codigo')),
  marca_id: marcaId || null,
  modelo_id: modeloId || null,
  // El Maestro de Artículos muestra el modelo desde modelos_ids (arreglo),
  // no desde modelo_id → hay que llenar ambos.
  modelos_ids: modeloId ? [modeloId] : [],
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
  const conMarca = merc.filter((r) => marcaNom(r)).length;
  const conModelo = merc.filter((r) => modeloNom(r)).length;
  console.log(`Con precio>0: ${conPrecio} | con existencia>0: ${conStock} | con marca: ${conMarca} | con modelo: ${conModelo}`);
  console.log(`Marcas distintas: ${new Set(merc.map(marcaNom).filter(Boolean)).size}`);
  console.log('\nMuestra:', JSON.stringify(merc.slice(0, 5).map((r) => ({
    ...mapProducto(r, '(uuid)', '(marca)', '(modelo)'), marca: marcaNom(r), modelo: modeloNom(r), stock: num(get(r, 'stock')),
  })), null, 2));
  console.log('\n(DRY-RUN — no se escribio nada.)');
  process.exit(0);
}

// ---- COMMIT ----
// 0) Resolver/crear marcas y modelos del tenant (upsert por nombre)
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
  const mId = marcaNom(r) ? marcaMap.get(marcaNom(r)) : null;
  const moId = (marcaNom(r) && modeloNom(r)) ? modeloMap.get(modeloNom(r) + '|' + mId) : null;
  return mapProducto(r, id, mId, moId);
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
