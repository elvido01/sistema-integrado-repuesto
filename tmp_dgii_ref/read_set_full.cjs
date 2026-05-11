const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const file = path.resolve(__dirname, '../133267772-07052026104751.xlsx');
const wb = XLSX.readFile(file);

const out = {};
for (const name of wb.SheetNames) {
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  out[name] = rows;
}

// Guardar JSON completo
fs.writeFileSync(path.resolve(__dirname, 'set_pruebas.json'), JSON.stringify(out, null, 2));

// Resumen
console.log('=== RESUMEN ===');
console.log('');
for (const name of Object.keys(out)) {
  const rows = out[name];
  console.log(`Hoja "${name}": ${rows.length} casos`);
  // Conteo por TipoeCF
  const porTipo = {};
  for (const r of rows) {
    const t = r.TipoeCF || '?';
    porTipo[t] = (porTipo[t] || 0) + 1;
  }
  console.log('  Por tipo:', porTipo);
  // Listar columnas
  if (rows.length > 0) {
    const cols = Object.keys(rows[0]);
    console.log(`  Columnas (${cols.length}):`, cols.slice(0, 25).join(', '));
    if (cols.length > 25) console.log(`    ... y ${cols.length - 25} mas`);
  }
  console.log('');
}

console.log('=== Detalle del primer caso de cada tipo en ECF ===');
const tiposVistos = new Set();
for (const r of out.ECF) {
  if (tiposVistos.has(r.TipoeCF)) continue;
  tiposVistos.add(r.TipoeCF);
  console.log('');
  console.log(`--- Tipo ${r.TipoeCF} (${r.CasoPrueba}) ---`);
  // Mostrar solo campos no vacios y no "#e"
  for (const k of Object.keys(r)) {
    const v = r[k];
    if (v === '' || v === '#e' || v === null || v === undefined) continue;
    const sv = String(v);
    const display = sv.length > 50 ? sv.slice(0, 47) + '...' : sv;
    console.log(`  ${k}: ${display}`);
  }
}
