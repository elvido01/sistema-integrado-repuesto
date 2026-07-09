// Lista los recibos (RI) de HOY en el viejo con su cliente — la prueba de recibos.
import fs from 'node:fs';
import path from 'node:path';
import { parseTable } from './lib/parseDump.mjs';

const baseDir = 'E:\\COPIAS';
const fecha = fs.readdirSync(baseDir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop();
const F = (n) => path.join(baseDir, fecha, `${n}.${fecha}.SQL`);
const HOY = fecha; // el respaldo es del mismo día de la prueba
console.log('Respaldo/día:', HOY);

for (const b of ['prestamos_01', 'prestamos_05', 'cpf_inv_los_naranjos']) {
  const mov = await parseTable(F(b), 'cxc_mov_master').catch(() => ({ rows: [] }));
  const cls = await parseTable(F(b), 'clientes').catch(() => ({ rows: [] }));
  const nombre = new Map(cls.rows.map((c) => [(c.codigo || '').trim(), `${c.nombre} ${c.apellido || ''}`.trim()]));
  const hoy = mov.rows.filter((r) => String(r.fecha) === HOY);
  if (!hoy.length) { console.log(`\n${b}: sin movimientos hoy`); continue; }
  console.log(`\n${b}: ${hoy.length} movimientos hoy`);
  for (const r of hoy) {
    console.log('  ', r.tip_transaccion, r.num_transaccion, '|', (nombre.get((r.cliente || '').trim()) || r.cliente || '').slice(0, 42), '| deb', r.debito, '| cre', r.credito, '|', (r.descripcion || '').slice(0, 30));
  }
}
process.exit(0);
