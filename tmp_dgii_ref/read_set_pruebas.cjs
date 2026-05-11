const XLSX = require('xlsx');
const path = require('path');

const file = path.resolve(__dirname, '../133267772-07052026104751.xlsx');
const wb = XLSX.readFile(file);

console.log('=== HOJAS ===');
console.log(wb.SheetNames);
console.log('Total hojas:', wb.SheetNames.length);
console.log('');

for (const name of wb.SheetNames) {
  const sheet = wb.Sheets[name];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  console.log(`=== HOJA: "${name}" — ${data.length} filas ===`);
  // Primeras 5 filas (incluyendo header)
  for (let i = 0; i < Math.min(data.length, 5); i++) {
    const row = data[i];
    // Solo mostrar primeras 10 columnas para no inundar
    const preview = row.slice(0, 12).map(v => {
      if (v === '' || v === null || v === undefined) return '_';
      const s = String(v);
      return s.length > 25 ? s.slice(0, 22) + '...' : s;
    });
    console.log(`  [${i}]`, preview.join(' | '));
  }
  if (data.length > 5) {
    console.log(`  ... (+${data.length - 5} filas mas)`);
  }
  console.log('');
}
