import { parseTable } from './lib/parseDump.mjs';
const files = ['prestamos_01', 'prestamos_02', 'prestamos_05'].map((n) => `E:\\COPIAS\\2026-06-30\\${n}.2026-06-30.SQL`);

let total = 0, activos = 0;
const porAnioUltPago = {};
let activosRecientes = 0; // balance>0 y ult_pago >= 2024
for (const f of files) {
  let pr;
  try { pr = await parseTable(f, 'prestamos'); } catch { continue; }
  for (const r of pr.rows) {
    total++;
    const bal = Number(r.balance) || 0;
    if (bal > 0) {
      activos++;
      const y = (r.ult_pago || '').slice(0, 4) || '????';
      porAnioUltPago[y] = (porAnioUltPago[y] || 0) + 1;
      if (y >= '2024') activosRecientes++;
    }
  }
}
console.log('Total préstamos (01+02+05):', total);
console.log('Activos (balance>0):', activos);
console.log('Activos con último pago en 2024+:', activosRecientes);
console.log('\nActivos por año de último pago:');
for (const y of Object.keys(porAnioUltPago).sort()) console.log(`  ${y}: ${porAnioUltPago[y]}`);
process.exit(0);
