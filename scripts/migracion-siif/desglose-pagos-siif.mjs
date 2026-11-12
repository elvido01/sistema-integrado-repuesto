// Desglose de los pagos que vinieron del SiiF (12/11/2026).
//
// La migración copió cada recibo (RI) del SiiF a prestamo_pagos solo con su
// TOTAL. El SiiF guarda además cuánto de ese recibo fue interés y mora
// (cxc_mov_master: columnas `interes` y `mora`). Este script los copia a
// prestamo_pagos.siif_interes / siif_mora para el reporte "Interés cobrado o
// acreditado" (sql/reporte_intereses_cobrados.sql). Capital = total - interés - mora.
//
// SOLO escribe esas dos columnas de consulta: no toca cuotas, detalle ni
// balances. Nunca toca pagos que ya tienen prestamo_pago_detalle (los hechos
// en MotoFlow traen su propio desglose).
//
// Casa cada recibo por (número RI-0000000, fecha, total). Si un recibo casa con
// más de un pago, o con ninguno, se salta y se cuenta.
//
//   node desglose-pagos-siif.mjs odalys                       (dry-run, último respaldo)
//   node desglose-pagos-siif.mjs odalys --commit
//   node desglose-pagos-siif.mjs naranjos E:\2026-06-24 --commit
//   (empresas: odalys | inversiones | naranjos)
//
// Idempotente: correrlo de nuevo con un respaldo más nuevo completa lo que falte.
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

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const empresaKey = args.find((a) => EMPRESAS[a]);
if (!empresaKey) {
  console.error('Uso: node desglose-pagos-siif.mjs <odalys|inversiones|naranjos> [carpeta-respaldo] [--commit]');
  process.exit(1);
}
const EMP = EMPRESAS[empresaKey];

// La carpeta del respaldo: la que se pase, o la fecha más nueva dentro de COPIAS_DIR / E:\COPIAS.
function carpetaRespaldo() {
  const dada = args.find((a) => a !== '--commit' && !EMPRESAS[a]);
  if (dada) return dada;
  const base = process.env.COPIAS_DIR || 'E:\\COPIAS';
  const dirs = fs.readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name)).map((d) => d.name).sort();
  if (!dirs.length) throw new Error(`No hay respaldos en ${base}`);
  return path.join(base, dirs[dirs.length - 1]);
}
const DIR = carpetaRespaldo();
const FECHA_DIR = path.basename(DIR);

const n = (v) => { const x = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(x) ? x : 0; };
const txt = (v) => String(v ?? '').trim();
const pad7 = (v) => String(v).replace(/\D/g, '').padStart(7, '0');
const r2 = (v) => Math.round(v * 100) / 100;

// 1) Recibos RI del respaldo
const recibos = [];
for (const base of EMP.bases) {
  const file = path.join(DIR, `${base}.${FECHA_DIR}.SQL`);
  if (!fs.existsSync(file)) { console.warn(`  (no está ${file}: se salta)`); continue; }
  const { rows } = await parseTable(file, 'cxc_mov_master').catch(() => ({ rows: [] }));
  for (const r of rows) {
    if (txt(r.tip_transaccion) !== 'RI') continue;
    const total = n(r.credito) > 0 ? n(r.credito) : n(r.recibido);
    if (total <= 0) continue;
    const interes = r2(n(r.interes)), mora = r2(n(r.mora));
    if (interes < 0 || mora < 0 || interes + mora > total + 0.01) continue; // dato raro: no se inventa
    recibos.push({ numero: `RI-${pad7(r.num_transaccion)}`, fecha: txt(r.fecha).slice(0, 10), total: r2(total), interes, mora });
  }
}
// El mismo recibo (número + fecha + total) en dos bases con cifras distintas:
// no se sabe cuál es, se descarta.
{
  const visto = new Map(), malos = new Set();
  for (const r of recibos) {
    const k = `${r.numero}|${r.fecha}|${r.total.toFixed(2)}`;
    const otro = visto.get(k);
    if (!otro) visto.set(k, r);
    else if (otro.interes !== r.interes || otro.mora !== r.mora) malos.add(k);
  }
  const antes = recibos.length;
  const unicos = [...visto.entries()].filter(([k]) => !malos.has(k)).map(([, r]) => r);
  recibos.length = 0; recibos.push(...unicos);
  if (malos.size) console.log(`  ${malos.size} recibos repetidos entre bases con cifras distintas: se saltan`);
  if (antes !== recibos.length) console.log(`  ${antes - recibos.length} filas repetidas/descartadas`);
}
console.log(`Respaldo ${DIR} · ${empresaKey}: ${recibos.length} recibos RI con desglose`);
if (!recibos.length) process.exit(0);

// 2) Pagos migrados de esa empresa (sin detalle de MotoFlow)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pagos = [];
for (let desde = 0; ; desde += 1000) {
  const { data, error } = await supabase.from('prestamo_pagos')
    .select('id, numero, fecha, total_pagado, siif_interes, siif_mora')
    .eq('tenant_id', EMP.tenant).ilike('numero', 'RI-%').eq('anulado', false)
    .order('id').range(desde, desde + 999);
  if (error) throw error;
  pagos.push(...data);
  if (data.length < 1000) break;
}
const conDetalle = new Set();
for (let i = 0; i < pagos.length; i += 200) {
  const ids = pagos.slice(i, i + 200).map((p) => p.id);
  for (let desde = 0; ; desde += 1000) {   // paginado: un lote puede traer más de 1000 filas de detalle
    const { data, error } = await supabase.from('prestamo_pago_detalle').select('pago_id')
      .in('pago_id', ids).order('id').range(desde, desde + 999);
    if (error) throw error;
    for (const d of data) conDetalle.add(d.pago_id);
    if (data.length < 1000) break;
  }
}
const clave = (numero, fecha, total) => `${numero}|${String(fecha).slice(0, 10)}|${r2(Number(total)).toFixed(2)}`;
const porClave = new Map();
for (const p of pagos) {
  const k = clave(p.numero, p.fecha, p.total_pagado);
  if (!porClave.has(k)) porClave.set(k, []);
  porClave.get(k).push(p);
}
console.log(`Pagos RI migrados en la empresa: ${pagos.length} (${conDetalle.size} ya tienen detalle de MotoFlow)`);

// 3) Casar
const cambios = [];
let sinPago = 0, ambiguos = 0, yaIgual = 0, conDet = 0;
for (const r of recibos) {
  const lista = porClave.get(clave(r.numero, r.fecha, r.total)) || [];
  if (!lista.length) { sinPago++; continue; }
  if (lista.length > 1) { ambiguos++; continue; }
  const p = lista[0];
  if (conDetalle.has(p.id)) { conDet++; continue; }
  if (p.siif_interes != null && r2(Number(p.siif_interes)) === r.interes
      && r2(Number(p.siif_mora || 0)) === r.mora) { yaIgual++; continue; }
  cambios.push({ id: p.id, siif_interes: r.interes, siif_mora: r.mora });
}
const sumaInt = cambios.reduce((a, c) => a + c.siif_interes, 0);
console.log(`Por escribir: ${cambios.length} (interés total ${sumaInt.toFixed(2)}) | ya estaban: ${yaIgual} | con detalle MotoFlow: ${conDet} | sin pago que case: ${sinPago} | ambiguos: ${ambiguos}`);

if (!COMMIT) {
  console.log('\n(DRY-RUN — no se escribió nada. Agrega --commit para guardar.)');
  process.exit(0);
}

// Por lotes: los pagos con el mismo interés y mora (hay muchos: cuotas
// iguales) se escriben en una sola llamada.
const grupos = new Map();
for (const c of cambios) {
  const k = `${c.siif_interes}|${c.siif_mora}`;
  if (!grupos.has(k)) grupos.set(k, { siif_interes: c.siif_interes, siif_mora: c.siif_mora, ids: [] });
  grupos.get(k).ids.push(c.id);
}
let hechos = 0, llamadas = 0;
for (const g of grupos.values()) {
  for (let i = 0; i < g.ids.length; i += 200) {
    const ids = g.ids.slice(i, i + 200);
    const { data, error } = await supabase.from('prestamo_pagos')
      .update({ siif_interes: g.siif_interes, siif_mora: g.siif_mora })
      .in('id', ids).eq('tenant_id', EMP.tenant).select('id');
    llamadas++;
    if (error) { console.error('  error en un lote:', error.message); continue; }
    hechos += data.length;
    if (data.length !== ids.length) console.warn(`  un lote escribió ${data.length} de ${ids.length}`);
  }
  if (llamadas % 200 === 0) console.log(`  ${hechos}/${cambios.length}`);
}
console.log(`Listo: ${hechos} pagos con su desglose del SiiF (${llamadas} llamadas).`);
