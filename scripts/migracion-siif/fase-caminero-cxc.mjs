// Fase Caminero Motors — CLIENTES + CxC (facturas pendientes + cobros)
// ---------------------------------------------------------------------
// La base propia de CAMINERO MOTORS (scv8_caminero_motors.<fecha>.SQL) trae
// UNA sola tabla con datos: cxc_mov_master (el libro de cuentas por cobrar
// del dealer). Es auto-contenida: cada movimiento trae los datos del cliente
// (nombre/rnc/telefono/direccion), la factura (FT, debito, vence, balance) y
// los cobros (RI, credito/recibido).
//
// De ese libro se derivan y cargan al tenant CAMINERO MOTORS (b39506c3):
//   1) clientes          (upsert por legacy_id = cliente_id del libro)
//   2) facturas          (upsert por legacy_id = id del movimiento FT;
//                         estado PENDIENTE si balance>0 -> alimenta la
//                         cobranza de la extension via get_clientes_morosos)
//   3) recibos_ingreso   (upsert por legacy_id = id del movimiento RI;
//                         alimenta "Ult. pago" y "pagaron ult. 15 dias")
//
// REQUIERE haber corrido sql/facturas_recibos_legacy_id.sql (agrega la
// columna legacy_id a facturas y recibos_ingreso).
//
// created_at/fecha se ponen con la FECHA DEL LIBRO (no "ahora") para no
// contaminar la caja/cierre del dia del dealer con historico migrado.
//
//   node fase-caminero-cxc.mjs            (dry-run: muestra y cuenta)
//   node fase-caminero-cxc.mjs --commit   (carga real)

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
const FILE = path.join(BASE_DIR, FECHA, `scv8_caminero_motors.${FECHA}.SQL`);

const s = (v) => (v == null ? '' : String(v).trim());
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const fechaOk = (v) => (/^\d{4}-\d{2}-\d{2}/.test(s(v)) && !s(v).startsWith('0000') ? s(v).slice(0, 10) : null);

console.log(`Respaldo: ${FECHA} | dealer: ${DEALER} | commit=${COMMIT}`);
if (!fs.existsSync(FILE)) { console.error(`No existe ${FILE}`); process.exit(1); }

const { columns, rows } = await parseTable(FILE, 'cxc_mov_master');
console.log(`cxc_mov_master: ${rows.length} movimientos | columnas: ${columns?.length}`);

// ---- Clasificacion del libro ----
const tipos = new Map();
for (const r of rows) {
  const t = s(r.tip_transaccion).toUpperCase() || '(vacio)';
  tipos.set(t, (tipos.get(t) || 0) + 1);
}
console.log('Tipos de transaccion:', [...tipos.entries()].map(([t, c]) => `${t}=${c}`).join(', '));

const esFactura = (r) => s(r.tip_transaccion).toUpperCase() === 'FT' || (num(r.debito) > 0 && s(r.tip_transaccion).toUpperCase() !== 'RI');
const esRecibo = (r) => s(r.tip_transaccion).toUpperCase() === 'RI';

const facturas = rows.filter(esFactura);
const recibos = rows.filter(esRecibo);
const pendientes = facturas.filter((r) => num(r.balance) > 0.01);

// ---- Clientes unicos (dato mas reciente por cliente_id) ----
const cliPorLegacy = new Map();
for (const r of rows) {
  const cid = num(r.cliente_id);
  if (!cid) continue;
  const prev = cliPorLegacy.get(cid);
  if (!prev || s(r.fecha) > s(prev.fecha)) cliPorLegacy.set(cid, r);
}

console.log(`\nFacturas (FT): ${facturas.length} | con balance pendiente: ${pendientes.length} | suma pendiente: ${pendientes.reduce((a, r) => a + num(r.balance), 0).toFixed(2)}`);
console.log(`Recibos (RI): ${recibos.length}`);
console.log(`Clientes unicos: ${cliPorLegacy.size}`);
const fechas = rows.map((r) => fechaOk(r.fecha)).filter(Boolean).sort();
console.log(`Rango de fechas: ${fechas[0]} .. ${fechas[fechas.length - 1]}`);

if (!COMMIT) {
  console.log('\nMuestra facturas pendientes:', JSON.stringify(pendientes.slice(0, 3).map((r) => ({
    num: s(r.num_transaccion), fecha: fechaOk(r.fecha), vence: fechaOk(r.vence),
    cliente: s(r.nombre), total: num(r.debito), balance: num(r.balance),
    credito_contado: s(r.credito_contado), financiamiento: s(r.financiamiento),
  })), null, 1));
  console.log('\nMuestra recibos:', JSON.stringify(recibos.slice(0, 2).map((r) => ({
    num: s(r.num_transaccion), fecha: fechaOk(r.fecha), cliente: s(r.nombre),
    credito: num(r.credito), recibido: num(r.recibido),
  })), null, 1));
  console.log('\n(DRY-RUN — no se escribio nada.)');
  process.exit(0);
}

// ================= COMMIT =================

// Guardas: columnas legacy_id requeridas en facturas y recibos_ingreso.
{
  const { error } = await supabase.from('facturas').select('legacy_id').limit(1);
  if (error && /legacy_id/.test(error.message)) {
    console.error('❌ Falta correr sql/facturas_recibos_legacy_id.sql (columna facturas.legacy_id).');
    process.exit(1);
  }
}

// ---- 1) CLIENTES (upsert por legacy_id) ----
const byLegacyCli = new Map();
{
  let f = 0;
  for (;;) {
    const { data, error } = await supabase.from('clientes').select('id, legacy_id').eq('tenant_id', DEALER).range(f, f + 999);
    if (error) { console.error('clientes:', error.message); process.exit(1); }
    for (const r of data) if (r.legacy_id != null) byLegacyCli.set(Number(r.legacy_id), r.id);
    if (data.length < 1000) break; f += 1000;
  }
}
const cliRows = [...cliPorLegacy.entries()].map(([legacy, r]) => ({
  id: byLegacyCli.get(legacy) || crypto.randomUUID(),
  tenant_id: DEALER,
  legacy_id: legacy,
  codigo: s(r.cliente) || String(legacy),
  nombre: s(r.nombre) || `CLIENTE ${legacy}`,
  rnc: s(r.rnc) || null,
  telefono: s(r.telefonos) || null,
  direccion: s(r.direccion) || null,
  activo: true,
}));
{
  const B = 500; let ok = 0;
  for (let i = 0; i < cliRows.length; i += B) {
    const { error } = await supabase.from('clientes').upsert(cliRows.slice(i, i + B), { onConflict: 'id' });
    if (error) { console.error(`❌ clientes ${i}: ${error.message}`); process.exit(1); }
    ok += Math.min(B, cliRows.length - i);
    if (ok % 2000 === 0 || ok === cliRows.length) console.log(`  clientes: ${ok}/${cliRows.length}`);
  }
  cliRows.forEach((c) => byLegacyCli.set(Number(c.legacy_id), c.id));
}

// ---- 2) FACTURAS (upsert por legacy_id = id del movimiento) ----
const byLegacyFac = new Map();
{
  let f = 0;
  for (;;) {
    const { data, error } = await supabase.from('facturas').select('id, legacy_id').eq('tenant_id', DEALER).not('legacy_id', 'is', null).range(f, f + 999);
    if (error) { console.error('facturas:', error.message); process.exit(1); }
    for (const r of data) byLegacyFac.set(Number(r.legacy_id), r.id);
    if (data.length < 1000) break; f += 1000;
  }
}
const facRows = facturas.map((r) => {
  const legacy = num(r.id);
  const fecha = fechaOk(r.fecha) || FECHA;
  const vence = fechaOk(r.vence);
  const total = num(r.debito);
  const balance = Math.max(0, num(r.balance));
  const dias = vence ? Math.max(0, Math.round((new Date(vence) - new Date(fecha)) / 86400000)) : 0;
  return {
    id: byLegacyFac.get(legacy) || crypto.randomUUID(),
    tenant_id: DEALER,
    legacy_id: legacy,
    numero: num(r.num_transaccion) || legacy,
    fecha: `${fecha}T12:00:00-04:00`,
    created_at: `${fecha}T12:00:00-04:00`,
    cliente_id: byLegacyCli.get(num(r.cliente_id)) || null,
    ncf: s(r.ncf) || null,
    subtotal: Math.max(0, total - num(r.itbis)),
    itbis: num(r.itbis),
    total,
    forma_pago: s(r.credito_contado).toUpperCase() === 'C' ? 'CREDITO' : 'CONTADO',
    tipo_pago: s(r.financiamiento).toUpperCase() === 'S' ? 'FINANCIAMIENTO' : null,
    dias_credito: dias,
    monto_pendiente: balance,
    estado: balance > 0.01 ? 'PENDIENTE' : 'PAGADA',
    notas: `MIGRADO SiiF (${s(r.tip_transaccion)}-${s(r.num_transaccion)})`,
  };
}).filter((r) => r.cliente_id);
{
  const B = 500; let ok = 0;
  for (let i = 0; i < facRows.length; i += B) {
    const { error } = await supabase.from('facturas').upsert(facRows.slice(i, i + B), { onConflict: 'id' });
    if (error) { console.error(`❌ facturas ${i}: ${error.message}`); process.exit(1); }
    ok += Math.min(B, facRows.length - i);
    if (ok % 5000 === 0 || ok === facRows.length) console.log(`  facturas: ${ok}/${facRows.length}`);
  }
}

// ---- 3) RECIBOS (upsert por legacy_id = id del movimiento) ----
const byLegacyRec = new Map();
{
  let f = 0;
  for (;;) {
    const { data, error } = await supabase.from('recibos_ingreso').select('id, legacy_id').eq('tenant_id', DEALER).not('legacy_id', 'is', null).range(f, f + 999);
    if (error) { console.error('recibos:', error.message); process.exit(1); }
    for (const r of data) byLegacyRec.set(Number(r.legacy_id), r.id);
    if (data.length < 1000) break; f += 1000;
  }
}
const recRows = recibos.map((r) => {
  const legacy = num(r.id);
  const fecha = fechaOk(r.fecha) || FECHA;
  const monto = num(r.credito) > 0 ? num(r.credito) : num(r.recibido);
  return {
    id: byLegacyRec.get(legacy) || crypto.randomUUID(),
    tenant_id: DEALER,
    legacy_id: legacy,
    numero: `RI-${String(num(r.num_transaccion) || legacy).padStart(6, '0')}`,
    fecha,
    created_at: `${fecha}T12:00:00-04:00`,
    cliente_id: byLegacyCli.get(num(r.cliente_id)) || null,
    monto_pagado: monto,
    concepto: s(r.descripcion) || 'Pago/Abono (migrado SiiF)',
    anulado: false,
  };
}).filter((r) => r.cliente_id && r.monto_pagado > 0);
{
  const B = 500; let ok = 0;
  for (let i = 0; i < recRows.length; i += B) {
    const { error } = await supabase.from('recibos_ingreso').upsert(recRows.slice(i, i + B), { onConflict: 'id' });
    if (error) { console.error(`❌ recibos ${i}: ${error.message}`); process.exit(1); }
    ok += Math.min(B, recRows.length - i);
    if (ok % 5000 === 0 || ok === recRows.length) console.log(`  recibos: ${ok}/${recRows.length}`);
  }
}

console.log(`\n✅ Caminero Motors CxC: ${cliRows.length} clientes, ${facRows.length} facturas (${pendientes.length} pendientes), ${recRows.length} recibos en ${DEALER}.`);
process.exit(0);
