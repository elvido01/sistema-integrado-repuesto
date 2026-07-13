// Fase Caminero Motors — CUENTAS POR PAGAR (facturas de suplidores)
// ---------------------------------------------------------------------
// Carga la CxP del SiiF al tenant CAMINERO MOTORS (b39506c3) como compras
// a crédito (estado PENDIENTE si el balance > 0), con su suplidor.
//
// La base viva del dealer es scv8_mp_los_naranjos (ver migrar-todo.mjs),
// así que se busca ahí primero. Como la tabla de CxP nunca se había
// migrado y no conocemos su nombre exacto, la fase AUTO-DETECTA:
//   1) escanea los CREATE TABLE del dump buscando nombres con
//      cxp / pagar / suplid / provee,
//   2) prueba primero 'cxp_mov_master' (espejo de cxc_mov_master),
//   3) del resto, usa la primera candidata con filas y columnas de saldo.
// Si no encuentra nada, lo reporta y sale con código 0 para NO tumbar el
// respaldo diario (migrar-todo aborta ante exit != 0).
//
// Idempotente: upsert por compras.legacy_id (REQUIERE haber corrido
// sql/compras_legacy_id.sql). Suplidores: find-or-create por nombre.
// created_at/fecha = fecha del libro (no contamina la caja del día).
//
//   node fase-caminero-cxp.mjs            (dry-run: detecta y muestra)
//   node fase-caminero-cxp.mjs --commit   (carga real)

import path from 'node:path';
import fs from 'node:fs';
import readline from 'node:readline';
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
const DIA_DIR = path.join(BASE_DIR, FECHA);

const s = (v) => (v == null ? '' : String(v).trim());
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const fechaOk = (v) => (/^\d{4}-\d{2}-\d{2}/.test(s(v)) && !s(v).startsWith('0000') ? s(v).slice(0, 10) : null);
// Primer campo con valor entre varios alias (los dumps SiiF varían de nombre).
const pick = (r, nombres) => { for (const n of nombres) { if (r[n] != null && s(r[n]) !== '') return r[n]; } return null; };

console.log(`Respaldo: ${FECHA} | dealer: ${DEALER} | commit=${COMMIT}`);

// ── 1) Archivos del día: primero la base viva, luego el resto ─────────
const archivos = fs.readdirSync(DIA_DIR).filter((f) => /\.sql$/i.test(f))
  .sort((a, b) => (a.includes('mp_los_naranjos') ? -1 : 1) - (b.includes('mp_los_naranjos') ? -1 : 1));
if (!archivos.length) { console.error(`No hay archivos .SQL en ${DIA_DIR}`); process.exit(1); }

// ── 2) Detectar tablas candidatas a CxP en cada dump ──────────────────
async function tablasDelDump(file) {
  const nombres = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'latin1' }) });
  for await (const line of rl) {
    const m = line.match(/CREATE TABLE `?(\w+)`?/i);
    if (m) nombres.push(m[1]);
  }
  return nombres;
}

const CANDIDATA = /cxp|pagar|suplid|provee/i;
let libro = null; // { archivo, tabla, columns, rows }
for (const f of archivos) {
  const file = path.join(DIA_DIR, f);
  const tablas = await tablasDelDump(file);
  const candidatas = tablas.filter((t) => CANDIDATA.test(t));
  console.log(`\n${f}: ${tablas.length} tablas | candidatas CxP: ${candidatas.join(', ') || '(ninguna)'}`);
  // cxp_mov_master primero (espejo del libro de CxC), luego el resto
  candidatas.sort((a, b) => (a === 'cxp_mov_master' ? -1 : 0) - (b === 'cxp_mov_master' ? -1 : 0));
  for (const t of candidatas) {
    const { columns, rows } = await parseTable(file, t);
    const tieneSaldo = (columns || []).some((c) => /balance|saldo|pendiente|debito|monto/i.test(c));
    console.log(`  · ${t}: ${rows.length} filas | columnas: ${(columns || []).join(', ')}`);
    if (rows.length > 0 && tieneSaldo && !libro) libro = { archivo: f, tabla: t, columns, rows };
  }
  if (libro) break;
}

if (!libro) {
  console.log('\n⚠️  SIN TABLA DE CxP DETECTADA en el respaldo de hoy. No se cargó nada.');
  console.log('    (Revisar la lista de tablas de arriba para mapear manualmente.)');
  process.exit(0); // no tumbar el pipeline diario
}

console.log(`\n>> Usando ${libro.archivo} · tabla ${libro.tabla} (${libro.rows.length} filas)`);

// ── 3) Interpretar el libro ────────────────────────────────────────────
const rows = libro.rows;
const tipoDe = (r) => s(pick(r, ['tip_transaccion', 'tipo', 'tipo_doc'])).toUpperCase();
const tipos = new Map();
for (const r of rows) { const t = tipoDe(r) || '(vacio)'; tipos.set(t, (tipos.get(t) || 0) + 1); }
console.log('Tipos de transaccion:', [...tipos.entries()].map(([t, c]) => `${t}=${c}`).join(', '));

const getNombre = (r) => s(pick(r, ['nombre', 'suplidor', 'proveedor', 'razon_social', 'nombre_suplidor'])) || 'SUPLIDOR SIN NOMBRE';
const getNum = (r) => s(pick(r, ['num_transaccion', 'numero', 'num_documento', 'documento', 'factura']));
const getId = (r) => s(pick(r, ['id', 'id_mov', 'consecutivo'])) || `${getNum(r)}|${fechaOk(pick(r, ['fecha']))}`;
const getDebito = (r) => num(pick(r, ['debito', 'monto', 'total', 'importe']));
const getBalance = (r) => num(pick(r, ['balance', 'saldo', 'pendiente']));
// Factura de compra: tipo FT/FC o cualquier movimiento con débito (excluye pagos)
const esFactura = (r) => ['FT', 'FC', 'CP'].includes(tipoDe(r)) || (getDebito(r) > 0 && !['RI', 'PG', 'PA'].includes(tipoDe(r)));

const facturas = rows.filter(esFactura);
const pendientes = facturas.filter((r) => getBalance(r) > 0.01);
const totalPend = pendientes.reduce((a, r) => a + getBalance(r), 0);
console.log(`Facturas de compra: ${facturas.length} | con balance pendiente: ${pendientes.length} | suma pendiente: ${totalPend.toFixed(2)}`);

const porSuplidor = new Map();
for (const r of pendientes) {
  const n = getNombre(r).toUpperCase();
  porSuplidor.set(n, (porSuplidor.get(n) || 0) + getBalance(r));
}
console.log('Pendiente por suplidor:');
[...porSuplidor.entries()].sort((a, b) => b[1] - a[1]).forEach(([n, t]) => console.log(`  ${n.padEnd(40)} RD$${t.toFixed(2)}`));

if (!COMMIT) {
  console.log('\nMuestra:', JSON.stringify(pendientes.slice(0, 3).map((r) => ({
    id: getId(r), num: getNum(r), fecha: fechaOk(pick(r, ['fecha'])),
    suplidor: getNombre(r), total: getDebito(r), balance: getBalance(r), tipo: tipoDe(r),
  })), null, 1));
  console.log('\n(DRY-RUN — no se escribió nada.)');
  process.exit(0);
}

// ── 4) CARGA: suplidores (find-or-create) + compras (upsert legacy) ───
// Suplidores existentes del dealer
const { data: provs, error: eProv } = await supabase.from('proveedores')
  .select('id, nombre').eq('tenant_id', DEALER);
if (eProv) { console.error('Error leyendo proveedores:', eProv.message); process.exit(1); }
const provPorNombre = new Map((provs || []).map((p) => [s(p.nombre).toUpperCase(), p.id]));

const nombresNuevos = [...new Set(facturas.map((r) => getNombre(r)))]
  .filter((n) => !provPorNombre.has(n.toUpperCase()));
if (nombresNuevos.length) {
  const { data: creados, error } = await supabase.from('proveedores')
    .insert(nombresNuevos.map((n) => ({ tenant_id: DEALER, nombre: n, activo: true, dias_credito: 0, vende_a_credito: true, moneda: 'DOP' })))
    .select('id, nombre');
  if (error) { console.error('Error creando proveedores:', error.message); process.exit(1); }
  (creados || []).forEach((p) => provPorNombre.set(s(p.nombre).toUpperCase(), p.id));
  console.log(`Suplidores creados: ${nombresNuevos.length}`);
}

// Compras ya migradas (por legacy_id) para decidir insert vs update
const { data: previas, error: ePrev } = await supabase.from('compras')
  .select('id, legacy_id, monto_pendiente, estado').eq('tenant_id', DEALER).not('legacy_id', 'is', null);
if (ePrev) { console.error('Error leyendo compras previas:', ePrev.message); process.exit(1); }
const prevPorLegacy = new Map((previas || []).map((c) => [c.legacy_id, c]));

let insertadas = 0, actualizadas = 0, sinCambio = 0;
const aInsertar = [];
for (const r of facturas) {
  const legacy = `siif:cxp:${libro.tabla}:${getId(r)}`;
  const balance = getBalance(r);
  const total = getDebito(r) || balance;
  const fila = {
    tenant_id: DEALER,
    legacy_id: legacy,
    numero: getNum(r) || legacy.slice(-12),
    referencia: getNum(r),
    fecha: fechaOk(pick(r, ['fecha'])) || FECHA,
    ncf: '',
    suplidor_id: provPorNombre.get(getNombre(r).toUpperCase()) || null,
    forma_pago: 'Credito',
    dias_credito: 0,
    total_exento: 0,
    total_gravado: total,
    descuento_total: 0,
    itbis_total: 0,
    itbis_incluido: true,
    actualizar_precios: false,
    total_compra: total,
    monto_pagado: Math.max(0, total - balance),
    monto_pendiente: balance,
    estado: balance > 0.01 ? 'PENDIENTE' : 'PAGADA',
    created_at: `${fechaOk(pick(r, ['fecha'])) || FECHA}T12:00:00-04:00`,
  };
  const prev = prevPorLegacy.get(legacy);
  if (!prev) { aInsertar.push(fila); continue; }
  // Solo actualizar si cambió el saldo o el estado (abonos digitados en SiiF)
  if (Math.abs(num(prev.monto_pendiente) - balance) > 0.01 || prev.estado !== fila.estado) {
    const { error } = await supabase.from('compras')
      .update({ monto_pendiente: fila.monto_pendiente, monto_pagado: fila.monto_pagado, estado: fila.estado })
      .eq('id', prev.id);
    if (error) { console.error(`Error actualizando ${legacy}:`, error.message); process.exit(1); }
    actualizadas++;
  } else sinCambio++;
}

for (let i = 0; i < aInsertar.length; i += 200) {
  const lote = aInsertar.slice(i, i + 200);
  const { error } = await supabase.from('compras').insert(lote);
  if (error) { console.error('Error insertando compras:', error.message); process.exit(1); }
  insertadas += lote.length;
}

console.log(`\n✅ CxP Caminero: ${insertadas} insertadas | ${actualizadas} actualizadas | ${sinCambio} sin cambio.`);
console.log(`   Pendiente total del libro: RD$${totalPend.toFixed(2)}`);
