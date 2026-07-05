// Fase FINANCIERA genérica — separación de empresas del sistema viejo.
// Carga UNA financiera (clientes + préstamos + cuotas + pagos) desde SU base
// del respaldo hacia SU tenant propio. Misma lógica probada de fase1+fase3
// (libro real: cxc_pendiente = saldo exacto; RI de cxc_mov_master = pagos).
//
//   node fase-financiera-cxc.mjs odalys                (dry-run)
//   node fase-financiera-cxc.mjs odalys --commit       (carga real)
//   node fase-financiera-cxc.mjs inversiones --commit [--force] [YYYY-MM-DD]
//
// Empresas (catálogo cpf_gen_cias del sistema viejo):
//   odalys      = 05 MOTO PRESTAMOS ODALYS      (base prestamos_05)
//   inversiones = 07 INVERSIONES LOS NARANJOS   (base cpf_inv_los_naranjos)
//
// Idempotente: upsert por legacy_id (offset 0: cada empresa vive en su tenant).
// --force: re-genera cuotas aunque existan abonos de la app en ESTE tenant.

import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { parseTable } from './lib/parseDump.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));

const EMPRESAS = {
  odalys: {
    tenant: process.env.ODALYS_TENANT_ID || 'c05a1d05-0d1e-4a2b-8c3f-0da1e5000005',
    nombre: 'MOTO PRESTAMOS ODALYS',
    baseFile: (fecha) => `prestamos_05.${fecha}.SQL`,
  },
  inversiones: {
    tenant: process.env.INVERSIONES_LN_TENANT_ID || 'c07a1d07-1e2f-4b3c-9d4a-107a10500007',
    nombre: 'INVERSIONES LOS NARANJOS',
    baseFile: (fecha) => `cpf_inv_los_naranjos.${fecha}.SQL`,
  },
};

const empresaKey = process.argv[2];
const EMPRESA = EMPRESAS[empresaKey];
if (!EMPRESA) {
  console.error(`Uso: node fase-financiera-cxc.mjs <${Object.keys(EMPRESAS).join('|')}> [--commit] [--force] [YYYY-MM-DD]`);
  process.exit(1);
}
const TENANT_ID = EMPRESA.tenant;
const COMMIT = process.argv.includes('--commit');
const FORCE = process.argv.includes('--force');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const BASE_DIR = process.env.COPIAS_DIR || 'E:\\COPIAS';
function latestBackup(baseDir) {
  const dirs = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name)).map((d) => d.name).sort();
  if (!dirs.length) throw new Error(`No hay respaldos en ${baseDir}`);
  return dirs[dirs.length - 1];
}
const FECHA = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || latestBackup(BASE_DIR);
const FILE = path.join(BASE_DIR, FECHA, EMPRESA.baseFile(FECHA));

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const txt = (v) => (v == null ? '' : String(v).trim());
const pad7 = (x) => String(x).padStart(7, '0');
function fecha(v) { const s = txt(v); const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (!m) return null; const y = +m[1]; if (y < 1990 || y > 2100) return null; return `${m[1]}-${m[2]}-${m[3]}`; }
function loanNumOf(row) {
  const ref = txt(row.referencia || row.ref_origen);
  const mm = /^PT-?0*(\d+)/i.exec(ref);
  if (txt(row.tip_transaccion) === 'IP' && mm) return Number(mm[1]);
  return Number(row.num_transaccion) || (mm ? Number(mm[1]) : 0);
}

console.log(`Empresa: ${EMPRESA.nombre} | tenant: ${TENANT_ID}`);
console.log(`Respaldo: ${FECHA} | base: ${EMPRESA.baseFile(FECHA)} | commit=${COMMIT}${FORCE ? ' FORCE' : ''}`);
if (!fs.existsSync(FILE)) { console.error(`No existe ${FILE}`); process.exit(1); }

// ============ 1) CLIENTES (misma transformación de fase1) ============
const bool01 = (v, def = false) => { if (v == null || v === '') return def; return Number(v) === 1; };
const cliParsed = await parseTable(FILE, 'clientes');
const byCodigo = new Map();
for (const r of cliParsed.rows) {
  const c = txt(r.codigo);
  if (!c || byCodigo.has(c)) continue;
  const nombre = [txt(r.nombre), txt(r.apellido)].filter(Boolean).join(' ').trim();
  byCodigo.set(c, {
    legacy_id: r.id ? Number(r.id) : null,
    codigo: c,
    nombre: nombre || txt(r.sobrenombre) || '(SIN NOMBRE)',
    rnc: txt(r.cedula) || txt(r.rnc) || c || null,
    telefono: txt(r.telefono) || txt(r.celular) || null,
    email: txt(r.email) || null,
    direccion: txt(r.direccion) || null,
    activo: r.activo == null ? true : Number(r.activo) !== 0,
    autorizar_credito: txt(r.autorizar_credito).toUpperCase() === 'S',
    limite_credito: n(r.credito),
    dias_credito: n(r.plazo),
    generar_mora: bool01(r.cargar_mora, true),
    notas: txt(r.notas) || null,
  });
}
const clientesSrc = [...byCodigo.values()];
console.log(`clientes en base: ${cliParsed.rows.length} | únicos por código: ${clientesSrc.length}`);

// ============ 2) LIBRO: cabeceras + pendiente + pagos RI ============
const headers = [];
const pendingByKey = new Map();
const pagosRI = [];
{
  const pr = await parseTable(FILE, 'prestamos').catch(() => ({ rows: [] }));
  for (const r of pr.rows) {
    if (!r.id) continue;
    headers.push({
      legacy_id: Number(r.id),
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
  const pend = await parseTable(FILE, 'cxc_pendiente').catch(() => ({ rows: [] }));
  for (const r of pend.rows) {
    if (n(r.pendiente) <= 0.005) continue;
    const key = String(loanNumOf(r));
    if (!pendingByKey.has(key)) pendingByKey.set(key, []);
    pendingByKey.get(key).push(r);
  }
  const mov = await parseTable(FILE, 'cxc_mov_master').catch(() => ({ rows: [] }));
  for (const r of mov.rows) {
    if (txt(r.tip_transaccion) !== 'RI') continue;
    const monto = n(r.credito) > 0 ? n(r.credito) : n(r.recibido);
    if (monto <= 0) continue;
    pagosRI.push({ cedula: txt(r.cliente), fecha: fecha(r.fecha) || FECHA, monto, numero: `RI-${pad7(r.num_transaccion)}`, desc: txt(r.descripcion) });
  }
}
console.log(`Cabeceras: ${headers.length} | grupos pendientes: ${pendingByKey.size} | pagos RI: ${pagosRI.length}`);

// ============ 3) Estados (castigo por antigüedad, igual que fase3) ============
const CASTIGO_ANIOS = Number(process.env.CASTIGO_ANIOS || 6);
const CASTIGO_CUTOFF = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - CASTIGO_ANIOS); return d.toISOString().slice(0, 10); })();
const ultPagoByCedula = new Map();
for (const p of pagosRI) {
  const cur = ultPagoByCedula.get(p.cedula);
  if (!cur || (p.fecha && p.fecha > cur)) ultPagoByCedula.set(p.cedula, p.fecha);
}
for (const h of headers) {
  h.tienePendiente = (pendingByKey.get(String(h.loanNum)) || []).length > 0;
  h.refPago = ultPagoByCedula.get(h.cedula) || h.ult_pago || h.fecha_inicio;
  h.esCastigo = h.tienePendiente && !!h.refPago && h.refPago < CASTIGO_CUTOFF;
  h.estado = !h.tienePendiente ? 'saldado' : (h.esCastigo ? 'castigado' : 'activo');
}
const activos = headers.filter((h) => h.estado === 'activo').length;
const castigados = headers.filter((h) => h.estado === 'castigado').length;
const sumaPend = [...pendingByKey.values()].flat().reduce((s, r) => s + n(r.pendiente), 0);
console.log(`activos: ${activos} | castigados(<${CASTIGO_CUTOFF}): ${castigados} | saldo pendiente total: ${sumaPend.toFixed(2)}`);

if (!COMMIT) {
  const ej = headers.find((h) => h.estado === 'activo');
  if (ej) {
    const rows = pendingByKey.get(String(ej.loanNum)) || [];
    console.log(`\nEjemplo ${ej.numero} (cédula ${ej.cedula}): ${rows.length} partidas pendientes = ${rows.reduce((s, r) => s + n(r.pendiente), 0).toFixed(2)}`);
  }
  console.log('\n(DRY-RUN — no se escribió nada.)');
  process.exit(0);
}

// ================= COMMIT =================
// Guardia: el tenant debe existir (correr sql/crear_tenants_odalys_inversiones.sql)
{
  const { data, error } = await supabase.from('config_empresa').select('tenant_id, nombre').eq('tenant_id', TENANT_ID).maybeSingle();
  if (error || !data) {
    console.error(`❌ El tenant ${TENANT_ID} no existe. Corre sql/crear_tenants_odalys_inversiones.sql primero.`);
    process.exit(1);
  }
  console.log(`Tenant destino OK: ${data.nombre}`);
}

// ---- 4) CLIENTES (upsert por legacy_id) ----
const byLegacyCli = new Map();
{
  let f = 0;
  for (;;) {
    const { data, error } = await supabase.from('clientes').select('id, legacy_id').eq('tenant_id', TENANT_ID).range(f, f + 999);
    if (error) { console.error('clientes:', error.message); process.exit(1); }
    for (const r of data) if (r.legacy_id != null) byLegacyCli.set(Number(r.legacy_id), r.id);
    if (data.length < 1000) break; f += 1000;
  }
}
const cliRows = clientesSrc.map((c) => ({
  id: (c.legacy_id != null && byLegacyCli.get(c.legacy_id)) || crypto.randomUUID(),
  tenant_id: TENANT_ID,
  legacy_id: c.legacy_id,
  codigo: c.codigo,
  nombre: c.nombre,
  rnc: c.rnc,
  telefono: c.telefono,
  email: c.email,
  direccion: c.direccion,
  activo: c.activo,
  autorizar_credito: c.autorizar_credito,
  limite_credito: c.limite_credito,
  dias_credito: c.dias_credito,
  generar_mora: c.generar_mora,
  mora_pct: 0,
}));
async function up(table, rows, label) {
  const B = 500; let ok = 0;
  for (let i = 0; i < rows.length; i += B) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + B), { onConflict: 'id' });
    if (error) { console.error(`❌ ${label} ${i}: ${error.message}`); process.exit(1); }
    ok += Math.min(B, rows.length - i);
    if (ok % 2000 === 0 || ok === rows.length) console.log(`  ${label}: ${ok}/${rows.length}`);
  }
}
await up('clientes', cliRows, 'clientes');

// cédula/código -> cliente_id (del tenant destino)
const cliByCedula = new Map();
for (const c of cliRows) { if (c.codigo) cliByCedula.set(c.codigo, c.id); if (c.rnc) cliByCedula.set(c.rnc, c.id); }

// ---- 5) PRÉSTAMOS (upsert por legacy_id) ----
let sinCliente = 0;
for (const h of headers) {
  h.cliente_id = cliByCedula.get(h.cedula) || null;
  if (!h.cliente_id) sinCliente++;
}
const lista = headers.filter((h) => h.cliente_id);
console.log(`Sin cliente: ${sinCliente} (omitidos) | préstamos a cargar: ${lista.length}`);

const byLegacy = new Map();
const byLegacyInfo = new Map();
const manualNumeros = new Set();
{
  let f = 0;
  for (;;) {
    const { data, error } = await supabase.from('prestamos')
      .select('id, legacy_id, numero, estado, castigado_manual, motivo_castigo, fecha_castigo')
      .eq('tenant_id', TENANT_ID).range(f, f + 999);
    if (error) { console.error(error.message); process.exit(1); }
    for (const r of data) {
      if (r.legacy_id != null) { byLegacy.set(Number(r.legacy_id), r.id); byLegacyInfo.set(Number(r.legacy_id), r); }
      else if (r.numero) manualNumeros.add(r.numero);
    }
    if (data.length < 1000) break; f += 1000;
  }
}
const seenNumero = new Set(manualNumeros);
const headerRows = lista.map((h) => {
  const id = byLegacy.get(h.legacy_id) || crypto.randomUUID(); h._id = id;
  let numero = h.numero;
  if (seenNumero.has(numero)) numero = `${numero}-${h.legacy_id}`;
  seenNumero.add(numero);
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
await up('prestamos', headerRows, 'cabeceras');

// ---- 6) CUOTAS (borrar y regenerar; guardia de abonos de la app) ----
{
  const { count, error } = await supabase
    .from('prestamo_pago_detalle')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  if (error) { console.error('chequeo pago_detalle:', error.message); process.exit(1); }
  if (count > 0 && !FORCE) {
    console.error(`\n⛔ Hay ${count} abonos aplicados en el sistema nuevo (tenant ${EMPRESA.nombre}).`);
    console.error('   Re-generar cuotas los borraría. Usa --force solo si entiendes el riesgo.');
    process.exit(1);
  }
}
const ids = lista.map((h) => h._id);
for (let i = 0; i < ids.length; i += 200) {
  const { error } = await supabase.from('prestamo_cuotas').delete().in('prestamo_id', ids.slice(i, i + 200));
  if (error) { console.error('❌ limpiando cuotas:', error.message); process.exit(1); }
}
function cuotasDe(h, prestamoId) {
  const rows = pendingByKey.get(String(h.loanNum)) || [];
  // Número REAL de la cuota del viejo (campo cuota "143/365"); antes se
  // renumeraba 1..N sobre las pendientes y la última no era NNN/plazo.
  // Hay unique (tenant, prestamo, numero_cuota): filas sin número (INT) o
  // duplicadas toman el menor número libre.
  const sorted = rows.sort((a, b) => ((fecha(a.vence) || '') < (fecha(b.vence) || '') ? -1 : 1));
  const used = new Set();
  const reales = sorted.map((r) => {
    const mc = /^0*(\d+)/.exec(txt(r.cuota));
    const v = mc ? parseInt(mc[1], 10) : 0;
    if (v && !used.has(v)) { used.add(v); return v; }
    return 0;
  });
  let next = 1;
  const alloc = () => { while (used.has(next)) next++; used.add(next); return next; };
  return sorted
    .map((r, idx) => {
      const pend = n(r.pendiente);
      const esInteres = txt(r.concepto) === 'INT' || n(r.interes) >= pend - 0.005;
      return {
        prestamo_id: prestamoId, tenant_id: TENANT_ID, numero_cuota: reales[idx] || alloc(),
        fecha_vencimiento: fecha(r.vence) || h.vence || h.fecha_inicio,
        capital: esInteres ? 0 : pend, interes: esInteres ? pend : 0,
        monto_cuota: pend, capital_pagado: 0, interes_pagado: 0, mora_pagada: 0, estado: 'pendiente',
      };
    });
}
let cuotas = [];
for (const h of lista.filter((x) => x.tienePendiente)) cuotas = cuotas.concat(cuotasDe(h, h._id));
await up('prestamo_cuotas', cuotas, 'cuotas');

// ---- 7) PAGOS RI (idempotente por numero dentro del tenant) ----
const existentes = new Set();
{
  let f = 0;
  for (;;) {
    const { data, error } = await supabase.from('prestamo_pagos').select('numero').eq('tenant_id', TENANT_ID).range(f, f + 999);
    if (error) { console.error(error.message); break; }
    for (const r of data) if (r.numero) existentes.add(r.numero);
    if (data.length < 1000) break; f += 1000;
  }
}
const pagoRows = [];
for (const p of pagosRI) {
  const cid = cliByCedula.get(p.cedula); if (!cid) continue;
  if (existentes.has(p.numero)) continue;
  existentes.add(p.numero);
  pagoRows.push({ tenant_id: TENANT_ID, cliente_id: cid, numero: p.numero, fecha: p.fecha, total_pagado: p.monto, forma_pago: 'Efectivo', comentarios: p.desc || null, anulado: false });
}
await up('prestamo_pagos', pagoRows, 'pagos');

console.log(`\n✅ ${EMPRESA.nombre}: ${cliRows.length} clientes, ${headerRows.length} préstamos (${activos} activos), ${cuotas.length} cuotas, ${pagoRows.length} pagos → tenant ${TENANT_ID}.`);
process.exit(0);
