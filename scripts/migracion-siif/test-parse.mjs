// Prueba del parser contra un dump real. No escribe nada en ninguna base.
// Uso: node scripts/migracion-siif/test-parse.mjs "<ruta.SQL>"
import { parseTable } from './lib/parseDump.mjs';

const file = process.argv[2];
if (!file) {
  console.error('Falta la ruta del .SQL. Ej: node test-parse.mjs "E:\\\\COPIAS\\\\2026-06-30\\\\scv8_repuestos_cm.2026-06-30.SQL"');
  process.exit(1);
}

const tablas = ['marcas', 'modelos', 'unidades', 'grupos', 'almacenes', 'suplidores', 'mercancias', 'mercancias_presentacion'];

for (const t of tablas) {
  const { columns, rows } = await parseTable(file, t);
  console.log(`\n== ${t}: ${rows.length} filas ==`);
  if (rows.length && t === 'mercancias') {
    const s = rows.find((r) => r.codigo && r.codigo !== '000-0000') || rows[0];
    console.log('  muestra:', {
      codigo: s.codigo, descripcion: s.descripcion, costo_1: s.costo_1,
      precio_1: s.precio_1, itbis: s.itbis, existencia: s.existencia,
      marca_txt: s.marca_txt, suplidor: s.suplidor, activo: s.activo,
    });
  } else if (rows.length) {
    console.log('  muestra:', rows[0]);
  }
}
