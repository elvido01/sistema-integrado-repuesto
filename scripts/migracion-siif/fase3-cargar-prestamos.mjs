// Fase 3 (v2, basada en el LIBRO REAL) — Préstamos de Los Naranjos.
//  - Cabeceras: todas (prestamos_01/02/05). Activo solo si tiene saldo real en cxc_pendiente.
//  - Cuotas: desde cxc_pendiente (saldo real por préstamo) → capital + intereses pendientes exactos.
//  - Pagos: transacciones RI de cxc_mov_master → prestamo_pagos (historial / "Último Pago").
//  Idempotente. Enlaza cliente por cédula; préstamo↔cxc por num_transaccion / ref.
//
//  node fase3-cargar-prestamos.mjs                (dry-run + valida un cliente)
//  node fase3-cargar-prestamos.mjs --commit       (carga real)

import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { parseTable } from './lib/parseDump.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const TENANT_ID = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
const COMMIT = process.argv.includes('--commit');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Carpeta de respaldo: por defecto la MÁS RECIENTE en E:\COPIAS (igual que fase1/fase2).
// Se puede forzar una fecha: node fase3-cargar-prestamos.mjs 2026-07-01 --commit
const BASE_DIR = process.env.COPIAS_DIR || 'E:\\COPIAS';
function latestBackup(baseDir) {
  const dirs = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
    .map((d) => d.name)
    .sort();
  if (!dirs.length) throw new Error(`No hay carpetas de respaldo en ${baseDir}`);
  return dirs[dirs.length - 1];
}
const FECHA = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || process.env.FECHA || latestBackup(BASE_DIR);
const SOURCES = [
  { file: `prestamos_01.${FECHA}.SQL`, offset: 0 },
  { file: `prestamos_02.${FECHA}.SQL`, offset: 200_000_000 },
  { file: `prestamos_05.${FECHA}.SQL`, offset: 500_000_000 },
];
const BASE = path.join(BASE_DIR, FECHA) + path.sep;
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const txt = (v) => (v == null ? '' : String(v).trim());
const pad7 = (x) => String(x).padStart(7, '0');
function fecha(v) { const s = txt(v); const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (!m) return null; const y = +m[1]; if (y < 1990 || y > 2100) return null; return `${m[1]}-${m[2]}-${m[3]}`; }
function loanNumOf(row) { // a qué préstamo (num_transaccion) pertenece una fila cxc
  const ref = txt(row.referencia || row.ref_origen);
  const mm = /^PT-?0*(\d+)/i.exec(ref);
  if (txt(row.tip_transaccion) === 'IP' && mm) return Number(mm[1]);
  return Number(row.num_transaccion) || (mm ? Number(mm[1]) : 0);
}

// --- 1. Parsear todo por base ---
const headers = [];               // cabeceras de préstamo
const pendingByKey = new Map();   // `${offset}:${loanNum}` -> [filas pendientes]
const pagosByClienteFecha = [];   // RI -> pagos

for (const src of SOURCES) {
  const fp = BASE + src.file;
  if (!fs.existsSync(fp)) continue;
  const pr = await parseTable(fp, 'prestamos');
  for (const r of pr.rows) {
    if (!r.id) continue;
    headers.push({
      legacy_id: Number(r.id) + src.offset,
      offset: src.offset,
      loanNum: Number(r.num_transaccion),
      cedula: txt(r.cliente),
      numero: `PT-${pad7(r.num_transaccion)}`,
      monto_capital: n(r.capital),
      tasa_interes: n(r.interes),
      mora_pct: n(r.mora),
      plazo_cuotas: parseInt(r.cantidad_cuotas, 10) || parseInt(r.cant_cuotas, 10) || 1,
      fecha_inicio: fecha(r.fecha_inicio) || fecha(r.fecha) || fecha(r.vence) || '2000-01-01',
      vence: fecha(r.vence),
      ult_pago: fecha(r.ult_pago),
      garantia: [txt(r.vhmarca), txt(r.vhmodelo), txt(r.vhano), txt(r.vhchasis), txt(r.vhmatricula) ? 'Mat:' + txt(r.vhmatricula) : ''].filter(Boolean).join(' ') || null,
      notas: txt(r.grnombre) ? `Garante: ${txt(r.grnombre)} ${txt(r.grcedula)}`.trim() : null,
    });
  }
  const pend = await parseTable(fp, 'cxc_pendiente').catch(() => ({ rows: [] }));
  for (const r of pend.rows) {
    if (n(r.pendiente) <= 0.005) continue;
    const key = `${src.offset}:${loanNumOf(r)}`;
    if (!pendingByKey.has(key)) pendingByKey.set(key, []);
    pendingByKey.get(key).push(r);
  }
  const mov = await parseTable(fp, 'cxc_mov_master').catch(() => ({ rows: [] }));
  for (const r of mov.rows) {
    if (txt(r.tip_transaccion) !== 'RI') continue;
    if (n(r.credito) <= 0) continue;
    pagosByClienteFecha.push({ cedula: txt(r.cliente), fecha: fecha(r.fecha) || FECHA, monto: n(r.credito), numero: `RI-${pad7(r.num_transaccion)}`, desc: txt(r.descripcion) });
  }
}
console.log(`Cabeceras: ${headers.length} | grupos pendientes: ${pendingByKey.size} | pagos RI: ${pagosByClienteFecha.length}`);

// --- 2. Cédula -> cliente_id ---
const cliByCedula = new Map();
let from = 0;
for (;;) {
  const { data, error } = await supabase.from('clientes').select('id, codigo, rnc').eq('tenant_id', TENANT_ID).range(from, from + 999);
  if (error) { console.error('clientes:', error.message); process.exit(1); }
  for (const c of data) { if (c.codigo) cliByCedula.set(txt(c.codigo), c.id); if (c.rnc) cliByCedula.set(txt(c.rnc), c.id); }
  if (data.length < 1000) break; from += 1000;
}

// --- 3. Construir cuotas desde pendiente y estado del préstamo ---
function cuotasDe(h, prestamoId) {
  const rows = pendingByKey.get(`${h.offset}:${h.loanNum}`) || [];
  let i = 0;
  return rows
    .sort((a, b) => (fecha(a.vence) || '') < (fecha(b.vence) || '') ? -1 : 1)
    .map((r) => {
      i += 1;
      const pend = n(r.pendiente);
      const esInteres = txt(r.concepto) === 'INT' || n(r.interes) >= pend - 0.005;
      return {
        prestamo_id: prestamoId, tenant_id: TENANT_ID, numero_cuota: i,
        fecha_vencimiento: fecha(r.vence) || h.vence || h.fecha_inicio,
        capital: esInteres ? 0 : pend, interes: esInteres ? pend : 0,
        monto_cuota: pend, capital_pagado: 0, interes_pagado: 0, mora_pagada: 0, estado: 'pendiente',
      };
    });
}

// Corte de castigo: préstamo cuyo ÚLTIMO PAGO (o inicio, si nunca pagó) tiene
// MÁS de N años -> incobrable. N configurable con CASTIGO_ANIOS (default 6).
const CASTIGO_ANIOS = Number(process.env.CASTIGO_ANIOS || 6);
const CASTIGO_CUTOFF = (() => {
  const d = new Date(); d.setFullYear(d.getFullYear() - CASTIGO_ANIOS);
  return d.toISOString().slice(0, 10);
})();
// Último pago REAL por cédula = fecha máxima de un RI (cxc_mov_master). Es el
// mismo dato que muestra Gestión de Cobro y es MÁS confiable que el campo
// ult_pago del header (que viene vacío en muchos préstamos).
const ultPagoByCedula = new Map();
for (const p of pagosByClienteFecha) {
  const cur = ultPagoByCedula.get(p.cedula);
  if (!cur || (p.fecha && p.fecha > cur)) ultPagoByCedula.set(p.cedula, p.fecha);
}
let sinCliente = 0;
for (const h of headers) {
  h.cliente_id = cliByCedula.get(h.cedula) || null;
  if (!h.cliente_id) sinCliente++;
  h.tienePendiente = (pendingByKey.get(`${h.offset}:${h.loanNum}`) || []).length > 0;
  // Último pago: RI real del cliente; si nunca ha pagado, el ult_pago del header o el inicio.
  h.refPago = ultPagoByCedula.get(h.cedula) || h.ult_pago || h.fecha_inicio;
  h.esCastigo = h.tienePendiente && !!h.refPago && h.refPago < CASTIGO_CUTOFF; // incobrable por antigüedad
  h.estado = !h.tienePendiente ? 'saldado' : (h.esCastigo ? 'castigado' : 'activo');
}
const lista = headers.filter((h) => h.cliente_id);
console.log(`Sin cliente: ${sinCliente} (omitidos) | a cargar: ${lista.length} | activos: ${lista.filter((h) => h.estado === 'activo').length} | castigados(<${CASTIGO_CUTOFF}): ${lista.filter((h) => h.estado === 'castigado').length}`);

if (!COMMIT) {
  // valida cliente de ejemplo
  const ej = lista.find((h) => h.numero === 'PT-0026260') || lista.find((h) => h.tienePendiente);
  if (ej) {
    const cs = cuotasDe(ej, 'demo');
    const capPend = cs.filter((c) => c.capital > 0).reduce((s, c) => s + c.capital, 0);
    const intPend = cs.filter((c) => c.interes > 0).reduce((s, c) => s + c.interes, 0);
    console.log(`\nEjemplo ${ej.numero} (cédula ${ej.cedula}): capital ${ej.monto_capital}, estado ${ej.estado}`);
    console.log(`  Capital pendiente: ${capPend.toFixed(2)} | Intereses pendientes: ${intPend.toFixed(2)} | Balance: ${(capPend + intPend).toFixed(2)}`);
    console.log(`  Cuotas pendientes: ${cs.length}`);
    const pagos = pagosByClienteFecha.filter((p) => p.cedula === ej.cedula);
    console.log(`  Pagos (RI) del cliente: ${pagos.length}, último: ${pagos.map((p) => p.fecha).sort().slice(-1)[0]}`);
  }
  console.log('\n(DRY-RUN — no se escribió nada.)');
  process.exit(0);
}

// --- 4. Cargar cabeceras (upsert por id, casa por legacy_id) ---
const byLegacy = new Map();
const byLegacyInfo = new Map();  // legacy_id -> {estado, castigado_manual, motivo_castigo, fecha_castigo}
const manualNumeros = new Set(); // números de préstamos NO migrados (no pisarlos)
let f2 = 0;
for (;;) {
  const { data, error } = await supabase.from('prestamos')
    .select('id, legacy_id, numero, estado, castigado_manual, motivo_castigo, fecha_castigo')
    .eq('tenant_id', TENANT_ID).range(f2, f2 + 999);
  if (error) { console.error(error.message); process.exit(1); }
  for (const r of data) {
    if (r.legacy_id != null) { byLegacy.set(Number(r.legacy_id), r.id); byLegacyInfo.set(Number(r.legacy_id), r); }
    else if (r.numero) manualNumeros.add(r.numero);
  }
  if (data.length < 1000) break; f2 += 1000;
}
const seenNumero = new Set(manualNumeros);
const headerRows = lista.map((h) => {
  const id = byLegacy.get(h.legacy_id) || crypto.randomUUID(); h._id = id;
  let numero = h.numero;
  if (seenNumero.has(numero)) numero = `${numero}-${h.legacy_id}`; // garantizar unicidad
  seenNumero.add(numero);
  // Clasificación de castigo: si es MANUAL, se respeta lo que puso la persona;
  // si no, aplica la regla por antigüedad.
  const prev = byLegacyInfo.get(h.legacy_id);
  let estado = h.estado, motivo_castigo = null, fecha_castigo = null, castigado_manual = false;
  if (prev && prev.castigado_manual) {
    estado = prev.estado; motivo_castigo = prev.motivo_castigo; fecha_castigo = prev.fecha_castigo; castigado_manual = true;
  } else if (estado === 'castigado') {
    motivo_castigo = 'incobrable';
    fecha_castigo = h.refPago || h.ult_pago || h.fecha_inicio;
  }
  return { id, tenant_id: TENANT_ID, legacy_id: h.legacy_id, cliente_id: h.cliente_id, numero, monto_capital: h.monto_capital, tasa_interes: h.tasa_interes, mora_pct: h.mora_pct, plazo_cuotas: h.plazo_cuotas, frecuencia: 'mensual', metodo_interes: 'simple', tipo: 'financiamiento', estado, fecha_inicio: h.fecha_inicio, fecha_primera_cuota: h.vence || h.fecha_inicio, garantia: h.garantia, notas: h.notas, motivo_castigo, fecha_castigo, castigado_manual };
});
async function up(table, rows, label) {
  const B = 500; let ok = 0;
  for (let i = 0; i < rows.length; i += B) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + B), { onConflict: 'id' });
    if (error) { console.error(`❌ ${label} ${i}: ${error.message}`); process.exit(1); }
    ok += Math.min(B, rows.length - i); if (ok % 5000 === 0 || ok === rows.length) console.log(`  ${label}: ${ok}/${rows.length}`);
  }
}
await up('prestamos', headerRows, 'cabeceras');

// --- 5. Cuotas: borrar las de estos préstamos y regenerar desde pendiente ---
// SEGURIDAD: si la app nueva ya aplicó cobros (prestamo_pago_detalle), regenerar
// las cuotas pisaría esos pagos. Abortar salvo --force.
{
  const { count, error } = await supabase
    .from('prestamo_pago_detalle')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  if (error) { console.error('chequeo pago_detalle:', error.message); process.exit(1); }
  if (count > 0 && !process.argv.includes('--force')) {
    console.error(`\n⛔ Hay ${count} abonos aplicados en el sistema nuevo (prestamo_pago_detalle).`);
    console.error('   Re-generar cuotas los borraría. Aborta. Usa --force solo si entiendes el riesgo.');
    process.exit(1);
  }
}
const ids = lista.map((h) => h._id);
for (let i = 0; i < ids.length; i += 200) {
  const { error } = await supabase.from('prestamo_cuotas').delete().in('prestamo_id', ids.slice(i, i + 200));
  if (error) { console.error('❌ limpiando cuotas:', error.message); process.exit(1); }
}
let cuotas = [];
for (const h of lista.filter((x) => x.tienePendiente)) cuotas = cuotas.concat(cuotasDe(h, h._id));
await up('prestamo_cuotas', cuotas, 'cuotas');

// --- 6. Pagos RI -> prestamo_pagos (historial). Idempotente por numero. ---
const existentes = new Set();
let f3 = 0;
for (;;) {
  const { data, error } = await supabase.from('prestamo_pagos').select('numero').eq('tenant_id', TENANT_ID).range(f3, f3 + 999);
  if (error) { console.error(error.message); break; }
  for (const r of data) if (r.numero) existentes.add(r.numero);
  if (data.length < 1000) break; f3 += 1000;
}
const pagoRows = [];
for (const p of pagosByClienteFecha) {
  const cid = cliByCedula.get(p.cedula); if (!cid) continue;
  if (existentes.has(p.numero)) continue;
  existentes.add(p.numero);
  pagoRows.push({ tenant_id: TENANT_ID, cliente_id: cid, numero: p.numero, fecha: p.fecha, total_pagado: p.monto, forma_pago: 'Efectivo', comentarios: p.desc || null, anulado: false });
}
await up('prestamo_pagos', pagoRows, 'pagos');

console.log(`\n✅ ${headerRows.length} préstamos, ${cuotas.length} cuotas (saldo real), ${pagoRows.length} pagos cargados.`);
process.exit(0);
