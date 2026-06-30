// Analiza un cliente en los dumps para entender préstamos, balances y pagos.
// Uso: node analizar-cliente.mjs R11164274
import { parseTable } from './lib/parseDump.mjs';
const cli = (process.argv[2] || 'R11164274').trim();
const F = (n) => `E:\\COPIAS\\2026-06-30\\${n}.2026-06-30.SQL`;

console.log('Cliente:', cli);

// 1. Préstamos del cliente en las 3 bases
for (const b of ['prestamos_01', 'prestamos_02', 'prestamos_05']) {
  const { rows } = await parseTable(F(b), 'prestamos').catch(() => ({ rows: [] }));
  const suyos = rows.filter((r) => (r.cliente || '').trim() === cli);
  if (suyos.length) {
    console.log(`\n${b}: ${suyos.length} préstamo(s)`);
    for (const r of suyos) console.log('  ', JSON.stringify({ id: r.id, num: r.num_transaccion, tip: r.tip_transaccion, capital: r.capital, interes: r.interes, cuotas: r.cantidad_cuotas, monto_cuotas: r.monto_cuotas, balance: r.balance, fecha_inicio: r.fecha_inicio, ult_pago: r.ult_pago }));
  }
}

// 2. Movimientos de cuenta (pagos/cargos) en prestamos_01
const mov = await parseTable(F('prestamos_01'), 'cxc_mov_master').catch(() => ({ rows: [] }));
const movc = mov.rows.filter((r) => (r.cliente || '').trim() === cli);
console.log(`\ncxc_mov_master: ${movc.length} movimientos`);
for (const r of movc.slice(-12)) console.log('  ', JSON.stringify({ fecha: r.fecha, tip: r.tip_transaccion, num: r.num_transaccion, desc: r.descripcion, debito: r.debito, credito: r.credito, balance: r.balance, db_cr: r.db_cr, monto: r.monto }));

// 3. Pendiente por cuota
const pend = await parseTable(F('prestamos_01'), 'cxc_pendiente').catch(() => ({ rows: [] }));
const pc = pend.rows.filter((r) => (r.cliente || '').trim() === cli && Number(r.pendiente) > 0);
console.log(`\ncxc_pendiente con saldo: ${pc.length}`);
for (const r of pc.slice(0, 12)) console.log('  ', JSON.stringify({ cuota: r.cuota, vence: r.vence, debito: r.debito, pendiente: r.pendiente, interes: r.interes, mora: r.mora }));
process.exit(0);
