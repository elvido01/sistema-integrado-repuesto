import { parseTable } from './lib/parseDump.mjs';
const base = 'E:\\COPIAS\\2026-06-30\\';

const mn = await parseTable(base + 'scv8_mp_los_naranjos.2026-06-30.SQL', 'mercancias');
console.log(`\nLos Naranjos mercancias: ${mn.rows.length} filas. Muestra de descripciones:`);
console.log(mn.rows.slice(0, 8).map((r) => `  ${r.codigo} | ${r.descripcion} | costo:${r.costo_1} precio:${r.precio_1} exist:${r.existencia}`).join('\n'));

const cl = await parseTable(base + 'scv8_mp_los_naranjos.2026-06-30.SQL', 'clientes');
console.log(`\nLos Naranjos clientes: ${cl.rows.length} filas. Muestra:`);
console.log(cl.rows.slice(0, 3).map((r) => `  ${r.codigo} | ${r.nombre} | tel:${r.telefono ?? r.telefonos ?? ''}`).join('\n'));
