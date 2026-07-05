// Renumera prestamo_cuotas con el número REAL del sistema viejo (campo
// cuota "143/365" de cxc_pendiente), SIN tocar montos, pagos ni estados.
// Antes la migración numeraba 1..N sobre las cuotas PENDIENTES, por lo que
// la última salía 217/365 en vez de 365/365.
//
// Alinea por posición: las cuotas se cargaron ordenadas por vencimiento y
// aquí se ordenan igual (backup por vence, cargadas por numero_cuota).
// Si el conteo no cuadra (pagos nuevos posteriores al backup), se omite el
// préstamo y lo corrige el próximo sync diario (los loaders ya traen el fix).
//
//   node renumerar-cuotas.mjs            (dry-run)
//   node renumerar-cuotas.mjs --commit
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { parseTable } from './lib/parseDump.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const COMMIT = process.argv.includes('--commit');

const BASE_DIR = 'E:\\COPIAS';
function latestBackup(baseDir) {
  const dirs = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
    .map((d) => d.name).sort();
  return dirs[dirs.length - 1];
}
const FECHA = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || latestBackup(BASE_DIR);
const FOLDER = path.join(BASE_DIR, FECHA);
console.log(`Backup: ${FECHA} | commit=${COMMIT}`);

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const txt = (v) => (v == null ? '' : String(v).trim());
const fecha = (v) => { const s = txt(v); const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
function loanNumOf(row) {
  const ref = txt(row.referencia || row.ref_origen);
  const mm = /^PT-?0*(\d+)/i.exec(ref);
  if (txt(row.tip_transaccion) === 'IP' && mm) return Number(mm[1]);
  return Number(row.num_transaccion) || (mm ? Number(mm[1]) : 0);
}

const JOBS = [
  { nombre: 'NARANJOS', tenant: '766fe3d6-6885-4f2b-b2cc-1a91db696fb4',
    files: [
      { file: `prestamos_01.${FECHA}.SQL`, offset: 0 },
      { file: `prestamos_02.${FECHA}.SQL`, offset: 200_000_000 },
    ] },
  { nombre: 'ODALYS', tenant: 'c05a1d05-0d1e-4a2b-8c3f-0da1e5000005',
    files: [{ file: `prestamos_05.${FECHA}.SQL`, offset: 0 }] },
  { nombre: 'INVERSIONES', tenant: 'c07a1d07-1e2f-4b3c-9d4a-107a10500007',
    files: [{ file: `cpf_inv_los_naranjos.${FECHA}.SQL`, offset: 0 }] },
];

for (const job of JOBS) {
  console.log(`\n===== ${job.nombre} =====`);
  // 1) Backup: legacy_id -> numeros reales ordenados por vencimiento
  const numsByLegacy = new Map();
  for (const src of job.files) {
    const fp = path.join(FOLDER, src.file);
    if (!fs.existsSync(fp)) { console.log(`  (no existe ${src.file}, omitido)`); continue; }
    const pre = await parseTable(fp, 'prestamos');
    const legacyByLoan = new Map(); // num_transaccion -> legacy_id
    for (const r of pre.rows) if (r.id) legacyByLoan.set(Number(r.num_transaccion), Number(r.id) + src.offset);
    const pend = await parseTable(fp, 'cxc_pendiente').catch(() => ({ rows: [] }));
    const byLoan = new Map();
    for (const r of pend.rows) {
      if (n(r.pendiente) <= 0.005) continue;
      const ln = loanNumOf(r);
      if (!byLoan.has(ln)) byLoan.set(ln, []);
      byLoan.get(ln).push(r);
    }
    for (const [ln, rows] of byLoan) {
      const legacy = legacyByLoan.get(ln);
      if (legacy == null) continue;
      // Números reales con desempate: hay unique (tenant, prestamo, numero),
      // así que los duplicados/vacíos toman el menor número libre.
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
      numsByLegacy.set(legacy, reales.map((v) => v || alloc()));
    }
  }
  console.log(`  Préstamos con pendientes en el backup: ${numsByLegacy.size}`);

  // 2) Préstamos migrados del tenant (id -> legacy)
  const legacyByPrestamoId = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('prestamos')
      .select('id, legacy_id').eq('tenant_id', job.tenant).not('legacy_id', 'is', null)
      .range(from, from + 999);
    if (error) { console.error('  prestamos:', error.message); process.exit(1); }
    for (const r of data) legacyByPrestamoId.set(r.id, Number(r.legacy_id));
    if (data.length < 1000) break;
  }

  // 3) Cuotas del tenant, agrupadas por préstamo (orden = numero_cuota actual)
  const cuotasByPrestamo = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('prestamo_cuotas')
      .select('id, prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_cuota, capital_pagado, interes_pagado, mora_pagada, estado')
      .eq('tenant_id', job.tenant).range(from, from + 999);
    if (error) { console.error('  cuotas:', error.message); process.exit(1); }
    for (const r of data) {
      if (!cuotasByPrestamo.has(r.prestamo_id)) cuotasByPrestamo.set(r.prestamo_id, []);
      cuotasByPrestamo.get(r.prestamo_id).push(r);
    }
    if (data.length < 1000) break;
  }

  // 4) Alinear y armar updates
  const updates = [];
  let prestamosOk = 0, prestamosSkip = 0;
  for (const [prestamoId, cuotas] of cuotasByPrestamo) {
    const legacy = legacyByPrestamoId.get(prestamoId);
    const nums = legacy != null ? numsByLegacy.get(legacy) : null;
    if (!nums) { prestamosSkip++; continue; }
    if (nums.length !== cuotas.length) { prestamosSkip++; continue; } // pagos post-backup: lo cuadra el sync
    cuotas.sort((a, b) => a.numero_cuota - b.numero_cuota);
    let cambio = false;
    cuotas.forEach((c, idx) => {
      if (c.numero_cuota !== nums[idx]) {
        cambio = true;
        updates.push({ ...c, tenant_id: job.tenant, numero_cuota: nums[idx] });
      }
    });
    if (cambio) prestamosOk++;
  }
  console.log(`  Préstamos a renumerar: ${prestamosOk} | omitidos (sin match/conteo distinto): ${prestamosSkip} | cuotas a actualizar: ${updates.length}`);

  if (!COMMIT || !updates.length) continue;
  // Hay unique (tenant_id, prestamo_id, numero_cuota): renumerar en sitio
  // colisiona transitoriamente (el 1->149 choca con la 149 vieja). Dos fases:
  // 1) mover TODAS las afectadas a números temporales altos, 2) número final.
  const temp = updates.map((u, idx) => ({ ...u, numero_cuota: 1_000_000 + idx }));
  for (const [label, rows] of [['fase temp', temp], ['fase final', updates]]) {
    let done = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from('prestamo_cuotas')
        .upsert(rows.slice(i, i + 500), { onConflict: 'id' });
      if (error) { console.error(`  ❌ ${label}:`, error.message); process.exit(1); }
      done += Math.min(500, rows.length - i);
      if (done % 5000 === 0 || done === rows.length) console.log(`  ${label}: ${done}/${rows.length}`);
    }
  }
}

console.log(COMMIT ? '\n✅ Renumeración aplicada.' : '\n(DRY-RUN — nada cambiado. Agrega --commit.)');
process.exit(0);
