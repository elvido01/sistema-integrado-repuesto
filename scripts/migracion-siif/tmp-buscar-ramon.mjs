// Busca a RAMON ALBURQUERQUE(S) en las 3 bases del viejo y muestra su cuenta.
import fs from 'node:fs';
import path from 'node:path';
import { parseTable } from './lib/parseDump.mjs';

const baseDir = 'E:\\COPIAS';
const fecha = fs.readdirSync(baseDir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop();
const F = (n) => path.join(baseDir, fecha, `${n}.${fecha}.SQL`);
console.log('Respaldo:', fecha);

for (const b of ['prestamos_01', 'prestamos_05', 'cpf_inv_los_naranjos']) {
  const cls = await parseTable(F(b), 'clientes').catch(() => ({ rows: [] }));
  const hits = cls.rows.filter((r) => {
    const full = `${r.nombre || ''} ${r.apellido || ''}`.toUpperCase();
    return full.includes('RAMON') && (full.includes('ALB') || full.includes('BURQUE'));
  });
  console.log(`\n${b}: ${hits.length} candidatos`);
  for (const r of hits) console.log('  ', r.codigo, '|', `${r.nombre} ${r.apellido || ''}`.trim());
  // si hay un único candidato, mostrar sus movimientos de HOY y su pendiente
  if (hits.length >= 1) {
    const mov = await parseTable(F(b), 'cxc_mov_master').catch(() => ({ rows: [] }));
    const pend = await parseTable(F(b), 'cxc_pendiente').catch(() => ({ rows: [] }));
    for (const h of hits) {
      const ced = (h.codigo || '').trim();
      const movs = mov.rows.filter((r) => (r.cliente || '').trim() === ced);
      const hoy = movs.filter((r) => String(r.fecha) >= '2026-07-08');
      const pendientes = pend.rows.filter((r) => (r.cliente || '').trim() === ced && Number(r.pendiente) > 0);
      if (!movs.length) continue;
      console.log(`\n  == ${h.nombre} ${h.apellido || ''} (${ced}) — movs recientes:`);
      for (const r of hoy.slice(-6)) console.log('    ', JSON.stringify({ fecha: r.fecha, tip: r.tip_transaccion, num: r.num_transaccion, desc: (r.descripcion || '').slice(0, 34), deb: r.debito, cre: r.credito }));
      console.log(`     pendientes con saldo: ${pendientes.length} | total: ${pendientes.reduce((a, r) => a + Number(r.pendiente), 0).toFixed(2)}`);
      for (const r of pendientes.slice(0, 8)) console.log('    ', JSON.stringify({ tip: r.tip_transaccion, num: r.num_transaccion, cuota: r.cuota, vence: r.vence, pendiente: r.pendiente, interes: r.interes, mora: r.mora }));
    }
  }
}
process.exit(0);
