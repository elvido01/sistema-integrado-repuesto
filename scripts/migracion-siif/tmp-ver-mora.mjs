// Diagnóstico: ¿el backup trae los cargos por mora? Caso TEODORA (PT-0026270)
import path from 'node:path';
import { parseTable } from './lib/parseDump.mjs';

const fecha = '2026-07-03';
const file = path.join('E:\\COPIAS', fecha, `prestamos_01.${fecha}.SQL`);
const s = (v) => (v == null ? '' : String(v).trim());
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

// 1) Préstamo num_transaccion 26270
const pre = await parseTable(file, 'prestamos');
const p = pre.rows.find((r) => Number(r.num_transaccion) === 26270);
if (!p) { console.log('Prestamo 26270 NO encontrado en prestamos_01'); process.exit(0); }
console.log('PRESTAMO PT-0026270 (campos clave):');
console.log({
  id: p.id, cliente: p.cliente, capital: p.capital, interes: p.interes,
  mora: p.mora, tipo_interes: p.tipo_interes, tipo_prestamo: p.tipo_prestamo,
  cantidad_cuotas: p.cantidad_cuotas, monto_cuotas: p.monto_cuotas,
  balance: p.balance, int_generado: p.int_generado, int_cobrado: p.int_cobrado,
  mora_generada: p.mora_generada, mora_cobrada: p.mora_cobrada,
  ult_pago: p.ult_pago, ult_interes: p.ult_interes, ult_mora: p.ult_mora,
});

// 2) Distribución de la columna "mora" en TODOS los préstamos de prestamos_01
const dist = {};
for (const r of pre.rows) { const m = s(r.mora) || '(vacio)'; dist[m] = (dist[m] || 0) + 1; }
const top = Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log('\nDistribución de prestamos.mora (top 10):', top);

// 3) cxc_pendiente del préstamo: conceptos e interes
const cxc = await parseTable(file, 'cxc_pendiente');
console.log('\nColumnas cxc_pendiente:', Object.keys(cxc.rows[0] || {}).join(', '));
const rows = cxc.rows.filter((r) => {
  const ref = s(r.referencia || r.ref_origen);
  return Number(r.num_transaccion) === 26270 || /PT-?0*26270/i.test(ref);
});
console.log(`Filas cxc_pendiente del préstamo: ${rows.length}`);
rows.slice(0, 4).forEach((r) => console.log(JSON.stringify(r)));
const conceptos = {};
for (const r of rows) { const c = s(r.concepto) || '(vacio)'; conceptos[c] = (conceptos[c] || 0) + 1; }
console.log('Conceptos en las filas del préstamo:', conceptos);

// 4) ¿Existe alguna fila de MORA como dato en cxc_pendiente global?
const conceptosGlobal = {};
for (const r of cxc.rows) { const c = s(r.concepto) || '(vacio)'; conceptosGlobal[c] = (conceptosGlobal[c] || 0) + 1; }
console.log('\nConceptos globales cxc_pendiente:', conceptosGlobal);
