import { parseTable } from './lib/parseDump.mjs';
const f = 'E:\\COPIAS\\2026-06-30\\prestamos_01.2026-06-30.SQL';

const pr = await parseTable(f, 'prestamos');
console.log(`\nprestamos_01 -> prestamos: ${pr.rows.length} filas`);
if (pr.rows.length) console.log('  columnas:', Object.keys(pr.rows[0]).join(', '));
if (pr.rows.length) {
  const s = pr.rows[0];
  console.log('  muestra:', JSON.stringify(s).slice(0, 400));
}
const cl = await parseTable(f, 'clientes');
console.log(`\nprestamos_01 -> clientes: ${cl.rows.length} filas`);
