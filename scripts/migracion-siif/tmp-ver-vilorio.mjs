// Diagnóstico discrepancia JOSE F. VILORIO (402-4797018-5, PT-0024585):
// 1) ¿la cuota 015 se clasifica mal como interés (campo interes >= pendiente)?
// 2) ¿los cargos AB- (abogado/incautación) existen en cxc_pendiente y se pierden?
import path from 'node:path';
import { parseTable } from './lib/parseDump.mjs';

const fecha = '2026-07-06';
const file = path.join('E:\\COPIAS', fecha, `prestamos_01.${fecha}.SQL`);
const s = (v) => (v == null ? '' : String(v).trim());
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

const cxc = await parseTable(file, 'cxc_pendiente');

// 1) Filas del préstamo 24585
const rows = cxc.rows.filter((r) => Number(r.num_transaccion) === 24585 && n(r.pendiente) > 0.005);
console.log(`PT-0024585 filas pendientes: ${rows.length}`);
rows.forEach((r) => console.log({
  tip: r.tip_transaccion, cuota: r.cuota, vence: r.vence, concepto: s(r.concepto) || '(vacio)',
  debito: r.debito, pendiente: r.pendiente, interes: r.interes,
  esInteresHeuristica: s(r.concepto) === 'INT' || n(r.interes) >= n(r.pendiente) - 0.005,
}));

// 2) Cargos AB del cliente (por cédula)
const abs = cxc.rows.filter((r) => s(r.cliente) === '402-4797018-5' && s(r.tip_transaccion) === 'AB');
console.log(`\nFilas AB del cliente: ${abs.length}`);
abs.forEach((r) => console.log({ tip: r.tip_transaccion, num: r.num_transaccion, fecha: r.fecha, desc: r.descripcion, debito: r.debito, pendiente: r.pendiente }));

// 3) Alcance global: tips presentes con pendiente>0 y cuántas cuotas PT caerían
//    mal clasificadas por la heurística interes>=pendiente (sin ser INT)
const tips = {};
let malClasificadas = 0, conceptoINT = 0, tipIP = 0;
for (const r of cxc.rows) {
  if (n(r.pendiente) <= 0.005) continue;
  const t = s(r.tip_transaccion) || '(vacio)';
  tips[t] = (tips[t] || 0) + 1;
  if (t === 'PT') {
    if (s(r.concepto) === 'INT') conceptoINT++;
    else if (n(r.interes) >= n(r.pendiente) - 0.005) malClasificadas++;
  }
  if (t === 'IP') tipIP++;
}
console.log('\nTips con pendiente>0:', tips);
console.log(`Cuotas PT con concepto INT: ${conceptoINT} | PT mal clasificadas por heurística interes>=pend: ${malClasificadas} | filas IP: ${tipIP}`);

// 4) Total de cargos AB pendientes (lo que hoy se pierde)
const totalAB = cxc.rows.filter((r) => s(r.tip_transaccion) === 'AB' && n(r.pendiente) > 0.005)
  .reduce((a, r) => a + n(r.pendiente), 0);
const cntAB = cxc.rows.filter((r) => s(r.tip_transaccion) === 'AB' && n(r.pendiente) > 0.005).length;
console.log(`Cargos AB pendientes en Naranjos: ${cntAB} filas | RD$ ${totalAB.toFixed(2)}`);
