// Análisis prueba de recibos 2026-07-09:
//  a) SAGRARIO 001-1122541-3 — AD-0000391 en el viejo (monto/abonos)
//  b) buscar RAMON ALBURQUERQUE(S) en clientes del viejo
//  c) censo de cargos AD en cxc_pendiente vs cxc_mov_master (¿faltan ADs?)
import fs from 'node:fs';
import path from 'node:path';
import { parseTable } from './lib/parseDump.mjs';

const baseDir = 'E:\\COPIAS';
const fecha = fs.readdirSync(baseDir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop();
const F = (n) => path.join(baseDir, fecha, `${n}.${fecha}.SQL`);
console.log('Respaldo:', fecha);

// b) Ramón en clientes del viejo
const clientes = await parseTable(F('prestamos_01'), 'clientes');
const ramones = clientes.rows.filter((r) => /ALBU/i.test(`${r.nombre} ${r.apellido}`) || (/RAMON/i.test(`${r.nombre}`) && /ALB/i.test(`${r.apellido || ''}`)));
console.log('\n— Posibles RAMON ALBURQUERQUE en el viejo:');
for (const r of ramones) console.log('  ', r.codigo, '|', `${r.nombre} ${r.apellido || ''}`.trim());

// a) SAGRARIO: movimientos del AD 391 + pendientes
const CED = '001-1122541-3';
const pend = await parseTable(F('prestamos_01'), 'cxc_pendiente');
const sagPend = pend.rows.filter((r) => (r.cliente || '').trim() === CED);
console.log('\n— SAGRARIO cxc_pendiente (todo, incl. saldados):', sagPend.length, 'filas; con pendiente:');
for (const r of sagPend.filter((x) => Number(x.pendiente) > 0)) {
  console.log('  ', JSON.stringify({ tip: r.tip_transaccion, num: r.num_transaccion, cuota: r.cuota, vence: r.vence, debito: r.debito, pendiente: r.pendiente }));
}
const mov = await parseTable(F('prestamos_01'), 'cxc_mov_master');
const sagMov = mov.rows.filter((r) => (r.cliente || '').trim() === CED);
console.log('\n— SAGRARIO últimos 10 movimientos:');
for (const r of sagMov.slice(-10)) console.log('  ', JSON.stringify({ fecha: r.fecha, tip: r.tip_transaccion, num: r.num_transaccion, desc: (r.descripcion||'').slice(0,30), deb: r.debito, cre: r.credito }));
console.log('\n— SAGRARIO movimientos del AD 391:');
for (const r of sagMov.filter((x) => String(x.num_transaccion) === '391' || /391/.test(String(x.num_transaccion)))) {
  console.log('  ', JSON.stringify({ fecha: r.fecha, tip: r.tip_transaccion, num: r.num_transaccion, desc: (r.descripcion||'').slice(0,40), deb: r.debito, cre: r.credito }));
}

// c) censo AD: en mov_master (todos los AD emitidos) vs cxc_pendiente (solo con saldo)
const adsMov = mov.rows.filter((r) => (r.tip_transaccion || '').trim() === 'AD');
const adsPend = new Set(pend.rows.filter((r) => (r.tip_transaccion || '').trim() === 'AD').map((r) => String(r.num_transaccion)));
const adsSinPend = [...new Set(adsMov.filter((r) => !adsPend.has(String(r.num_transaccion))).map((r) => String(r.num_transaccion)))];
console.log(`\n— ADs en mov_master: ${new Set(adsMov.map((r) => String(r.num_transaccion))).size} distintos | en cxc_pendiente: ${adsPend.size} | solo en mov_master (sin pendiente): ${adsSinPend.length}`);
process.exit(0);
