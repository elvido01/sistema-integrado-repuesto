import { parseTable } from './lib/parseDump.mjs';
const f = 'E:\\COPIAS\\2026-06-30\\prestamos_01.2026-06-30.SQL';

const pr = await parseTable(f, 'prestamos');
const activos = pr.rows.filter((r) => Number(r.balance) > 0);
console.log(`prestamos: ${pr.rows.length} total, ${activos.length} con balance>0 (activos)`);
console.log('  ejemplo activo:', JSON.stringify({
  id: activos[0]?.id, cliente: activos[0]?.cliente, capital: activos[0]?.capital,
  interes: activos[0]?.interes, cantidad_cuotas: activos[0]?.cantidad_cuotas,
  monto_cuotas: activos[0]?.monto_cuotas, balance: activos[0]?.balance,
  forma_pago: activos[0]?.forma_pago, fecha_inicio: activos[0]?.fecha_inicio, vence: activos[0]?.vence,
}));

const pend = await parseTable(f, 'cxc_pendiente');
console.log(`\ncxc_pendiente: ${pend.rows.length} filas`);
// cuotas pendientes del mismo cliente del ejemplo
const cli = activos[0]?.cliente;
const suyas = pend.rows.filter((r) => r.cliente === cli).slice(0, 6);
console.log(`  cuotas pendientes del cliente ${cli}:`);
for (const r of suyas) console.log('   ', JSON.stringify({ cuota: r.cuota, vence: r.vence, debito: r.debito, credito: r.credito, pendiente: r.pendiente, interes: r.interes, mora: r.mora, tip: r.tip_transaccion, num: r.num_transaccion }));
process.exit(0);
