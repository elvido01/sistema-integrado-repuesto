// Interés de las cuotas migradas del SiiF (14/11/2026).
//
// fase-financiera-cxc.mjs cargó cada cuota pendiente con TODO su pendiente
// como capital (interés 0), aunque el SiiF guarda el interés de cada cuota
// (cxc_pendiente.interes). Resultado: lo que se cobra en MotoFlow sobre esas
// cuotas se anota completo a capital y "Interés cobrado o acreditado" sale en 0.
//
// Regla del SiiF (comprobada con sus recibos): dentro de cada cuota, el
// interés se cobra con el PRIMER dinero que entra a esa cuota; luego capital.
//   VIDAL MOTA, cuota 750 (83.33 interés): "PAGO 1 Y ABONO A 2/30" 1,000 → 166.66
//
// Este script NO escribe en la base: arma un archivo SQL con los UPDATE
//   1. de cada cuota migrada: interés pendiente = interés de la cuota − lo que
//      ya se le había pagado en el SiiF (si no alcanzó a cubrir el interés);
//      capital = pendiente − ese interés (monto_cuota no cambia);
//   2. de cada abono hecho en MotoFlow sobre esas cuotas (pagos y notas de
//      crédito, en orden de fecha): primero interés hasta cubrirlo, luego capital
//      (el total de cada abono y la mora no cambian);
//   3. interes_pagado / capital_pagado de la cuota = suma de sus abonos.
// El SQL se ensaya (BEGIN…ROLLBACK) y se corre con scripts/correr-sql.mjs.
//
//   node interes-cuotas-siif.mjs odalys E:\COPIAS\2026-09-28
//   (empresas: odalys | inversiones | naranjos)
//
//   --reporte  (lo que se usa desde el 14/11, decisión del dueño): NO cambia
//   cuotas ni abonos; solo llena prestamo_cuotas.siif_interes (columna de
//   consulta) y el reporte "Interés cobrado o acreditado" reparte con la regla
//   del SiiF (sql/reporte_interes_siif_cuotas.sql). Sale en
//   sql/interes_siif_reporte_<empresa>.sql. Sin --reporte arma el arreglo
//   completo, que SÍ cambia lo que deben los préstamos ya vencidos.
// Solo préstamos con legacy_id (vinieron del SiiF), que no son de solo interés
// y cuyas cuotas tienen interés 0 en MotoFlow. Los digitados en MotoFlow no se tocan.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { parseTable } from './lib/parseDump.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));

const EMPRESAS = {
  odalys: { tenant: 'c05a1d05-0d1e-4a2b-8c3f-0da1e5000005', bases: ['prestamos_05'] },
  inversiones: { tenant: 'c07a1d07-1e2f-4b3c-9d4a-107a10500007', bases: ['cpf_inv_los_naranjos'] },
  naranjos: { tenant: '766fe3d6-6885-4f2b-b2cc-1a91db696fb4', bases: ['prestamos_01', 'prestamos_02'] },
};
const SOLO_REPORTE = process.argv.includes('--reporte');
const args = process.argv.slice(2).filter((a) => a !== '--reporte');
const key = args.find((a) => EMPRESAS[a]);
const DIR = args.find((a) => a !== key);
if (!key || !DIR) { console.error('Uso: node interes-cuotas-siif.mjs <odalys|inversiones|naranjos> <carpeta-respaldo>'); process.exit(1); }
const EMP = EMPRESAS[key];
const FECHA_DIR = path.basename(DIR);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const n = (v) => { const x = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(x) ? x : 0; };
const txt = (v) => String(v ?? '').trim();
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

// ---- 1) SiiF: interés y débito de cada cuota, por (legacy_id del préstamo, número de cuota) ----
const siif = new Map();     // `${legacy}|${cuota}` → { debito, interes }
for (const base of EMP.bases) {
  const file = path.join(DIR, `${base}.${FECHA_DIR}.SQL`);
  if (!fs.existsSync(file)) { console.warn(`(no está ${file})`); continue; }
  const pr = await parseTable(file, 'prestamos');
  const legacyDeNum = new Map(pr.rows.map((r) => [txt(r.num_transaccion), Number(r.id)]));
  const pend = await parseTable(file, 'cxc_pendiente');
  for (const r of pend.rows) {
    if (txt(r.tip_transaccion) !== 'PT') continue;
    const legacy = legacyDeNum.get(txt(r.num_transaccion));
    const mc = /^0*(\d+)/.exec(txt(r.cuota));
    if (!legacy || !mc) continue;
    siif.set(`${legacy}|${parseInt(mc[1], 10)}`, { debito: n(r.debito), interes: n(r.interes) });
  }
}
console.log(`SiiF: ${siif.size} cuotas con su interés`);

// ---- 2) MotoFlow ----
async function todo(tabla, cols, filtro) {
  const out = [];
  for (let d = 0; ; d += 1000) {
    let q = supabase.from(tabla).select(cols).range(d, d + 999).order('id');
    q = filtro(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
const prestamos = await todo('prestamos', 'id, legacy_id, es_solo_interes, numero', (q) => q.eq('tenant_id', EMP.tenant).not('legacy_id', 'is', null));
const cuotas = await todo('prestamo_cuotas', 'id, prestamo_id, numero_cuota, capital, interes, monto_cuota, capital_pagado, interes_pagado', (q) => q.eq('tenant_id', EMP.tenant));
const porPrestamo = new Map();
for (const c of cuotas) { if (!porPrestamo.has(c.prestamo_id)) porPrestamo.set(c.prestamo_id, []); porPrestamo.get(c.prestamo_id).push(c); }

const candidatas = [];   // cuotas a corregir
const sinDato = [];
for (const p of prestamos) {
  if (p.es_solo_interes) continue;
  const cs = porPrestamo.get(p.id) || [];
  if (!cs.length || cs.some((c) => n(c.interes) > 0)) continue;    // ya tiene interés: no es el caso
  let tocadas = 0;
  for (const c of cs) {
    const s = siif.get(`${p.legacy_id}|${c.numero_cuota}`);
    if (!s || s.interes <= 0) continue;
    const pendiente = n(c.monto_cuota);
    const pagadoEnSiif = Math.max(0, s.debito - pendiente);
    const intPend = r2(Math.max(0, Math.min(pendiente, s.interes - pagadoEnSiif)));
    if (intPend <= 0) continue;
    candidatas.push({ c, p, intPend, capPend: r2(pendiente - intPend) });
    tocadas++;
  }
  if (!tocadas) sinDato.push(p.numero);
}
console.log(`Préstamos migrados revisados: ${prestamos.length} · cuotas a corregir: ${candidatas.length} · préstamos sin interés en el SiiF: ${sinDato.length}`);

if (SOLO_REPORTE) {
  const salidaR = path.join(__dirname, '..', '..', 'sql', `interes_siif_reporte_${key}.sql`);
  fs.writeFileSync(salidaR, [
    `-- Interés del SiiF por cuota, SOLO para el reporte: ${key} (respaldo ${FECHA_DIR}).`,
    `-- Generado por scripts/migracion-siif/interes-cuotas-siif.mjs --reporte el ${new Date().toISOString().slice(0, 10)}.`,
    `-- ${candidatas.length} cuotas. Llena prestamo_cuotas.siif_interes; no cambia capital, interés, pagos ni balances.`,
    ...candidatas.map(({ c, intPend }) => `UPDATE public.prestamo_cuotas SET siif_interes = ${intPend} WHERE id = '${c.id}' AND interes = 0;`),
    `SELECT registrar_migracion('interes_siif_reporte_${key}.sql');`,
    '',
  ].join('\n'));
  console.log(`SQL (solo reporte): ${salidaR}`);
  process.exit(0);
}

// Abonos de MotoFlow sobre esas cuotas (pagos y notas de crédito), en orden.
const ids = candidatas.map((x) => x.c.id);
const abonos = [];
for (let i = 0; i < ids.length; i += 150) {
  const lote = ids.slice(i, i + 150);
  const { data: pd, error: e1 } = await supabase.from('prestamo_pago_detalle')
    .select('id, cuota_id, abono_capital, abono_interes, prestamo_pagos!inner(fecha, created_at, anulado)').in('cuota_id', lote);
  if (e1) throw e1;
  for (const d of pd) abonos.push({ tabla: 'prestamo_pago_detalle', id: d.id, cuota_id: d.cuota_id, cap: n(d.abono_capital), int: n(d.abono_interes),
    fecha: d.prestamo_pagos.fecha, creado: d.prestamo_pagos.created_at, anulado: !!d.prestamo_pagos.anulado });
  const { data: nd, error: e2 } = await supabase.from('prestamo_nota_credito_detalle')
    .select('id, cuota_id, abono_capital, abono_interes, prestamo_notas_credito!inner(fecha, created_at, anulada)').in('cuota_id', lote);
  if (e2) throw e2;
  for (const d of nd) abonos.push({ tabla: 'prestamo_nota_credito_detalle', id: d.id, cuota_id: d.cuota_id, cap: n(d.abono_capital), int: n(d.abono_interes),
    fecha: d.prestamo_notas_credito.fecha, creado: d.prestamo_notas_credito.created_at, anulado: !!d.prestamo_notas_credito.anulada });
}
const abonosDe = new Map();
for (const a of abonos) { if (!abonosDe.has(a.cuota_id)) abonosDe.set(a.cuota_id, []); abonosDe.get(a.cuota_id).push(a); }

// ---- 3) Repartir y armar el SQL ----
const sql = [];
let antesInt = 0; let despuesInt = 0; let abonosCambiados = 0;
for (const { c, intPend, capPend } of candidatas) {
  sql.push(`UPDATE public.prestamo_cuotas SET interes = ${intPend}, capital = ${capPend} WHERE id = '${c.id}' AND interes = 0;`);
  let falta = intPend;
  let intPag = 0; let capPag = 0;
  const lista = (abonosDe.get(c.id) || []).sort((a, b) => (a.fecha + a.creado < b.fecha + b.creado ? -1 : 1));
  for (const a of lista) {
    const monto = r2(a.cap + a.int);
    // Un abono anulado no cuenta para la cuota, pero se reparte igual para que su detalle quede coherente.
    const intNuevo = r2(Math.min(monto, Math.max(0, falta)));
    const capNuevo = r2(monto - intNuevo);
    if (!a.anulado) { falta = r2(falta - intNuevo); intPag += intNuevo; capPag += capNuevo; }
    if (a.tabla === 'prestamo_pago_detalle' && !a.anulado) { antesInt += a.int; despuesInt += intNuevo; }
    if (intNuevo !== r2(a.int) || capNuevo !== r2(a.cap)) {
      abonosCambiados++;
      sql.push(`UPDATE public.${a.tabla} SET abono_interes = ${intNuevo}, abono_capital = ${capNuevo} WHERE id = '${a.id}' AND abono_interes = ${r2(a.int)} AND abono_capital = ${r2(a.cap)};`);
    }
  }
  if (r2(intPag) !== r2(n(c.interes_pagado)) || r2(capPag) !== r2(n(c.capital_pagado))) {
    sql.push(`UPDATE public.prestamo_cuotas SET interes_pagado = ${r2(intPag)}, capital_pagado = ${r2(capPag)} WHERE id = '${c.id}';`);
  }
}
const salida = path.join(__dirname, '..', '..', 'sql', `interes_cuotas_siif_${key}.sql`);
fs.writeFileSync(salida, [
  `-- Interés de las cuotas migradas del SiiF: ${key} (respaldo ${FECHA_DIR}).`,
  `-- Generado por scripts/migracion-siif/interes-cuotas-siif.mjs el ${new Date().toISOString().slice(0, 10)}.`,
  `-- ${candidatas.length} cuotas; ${abonosCambiados} abonos re-repartidos (interés primero, como el SiiF).`,
  `-- El total de cada abono, la mora y la caja no cambian.`,
  ...sql,
  `SELECT registrar_migracion('interes_cuotas_siif_${key}.sql');`,
  '',
].join('\n'));
console.log(`Abonos re-repartidos: ${abonosCambiados} · interés en esos pagos: antes ${r2(antesInt)} → después ${r2(despuesInt)}`);
console.log(`SQL: ${salida} (${sql.length} sentencias)`);
