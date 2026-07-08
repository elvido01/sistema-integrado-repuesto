// Limpieza COMPLETA de las pruebas de financiamiento de junio 2026:
//  NARANJOS: 9 prestamos PT-0000001..9 (sin legacy) + cuotas + abonos +
//            notas de credito de prueba + 6 CxP FIN- + pagos/recibos de prueba
//  CAMINERO: facturas de prueba #6..#11 (las de los prestamos FT) + detalle +
//            recibos de inicial + movimientos de inventario de esas ventas
//   node tmp-limpiar-pruebas-financiamiento.mjs [--commit]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const COMMIT = process.argv.includes('--commit');
const NARANJOS = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
const CAMINERO = 'b39506c3-27dc-467d-830b-096731b83113';

const del = async (table, filterFn, label) => {
  if (!COMMIT) return;
  const { error } = await filterFn(s.from(table).delete());
  if (error) { console.error(`❌ ${label}:`, error.message); process.exit(1); }
  console.log(`   borrado: ${label}`);
};

console.log(`Limpieza pruebas financiamiento | commit=${COMMIT}\n`);

// ============ NARANJOS ============
console.log('===== NARANJOS =====');
const { data: prestamos } = await s.from('prestamos')
  .select('id, numero, monto_capital, clientes(nombre)')
  .eq('tenant_id', NARANJOS).is('legacy_id', null);
console.log(`Préstamos de prueba: ${prestamos.length}`);
prestamos.forEach(p => console.log(`  ${p.numero} RD$${p.monto_capital} (${p.clientes?.nombre?.slice(0,20)})`));
const pIds = prestamos.map(p => p.id);

const { data: cuotas } = await s.from('prestamo_cuotas').select('id').in('prestamo_id', pIds);
const cuotaIds = (cuotas || []).map(c => c.id);
console.log(`Cuotas: ${cuotaIds.length}`);

const { count: cntDet } = await s.from('prestamo_pago_detalle').select('id', { count: 'exact', head: true }).in('cuota_id', cuotaIds.slice(0, 500));
console.log(`Abonos aplicados (pago_detalle) sobre esas cuotas: ${cntDet || 0}`);

const { data: ncs } = await s.from('prestamo_notas_credito').select('id, numero, monto').eq('tenant_id', NARANJOS);
console.log(`Notas de crédito en Naranjos (todas prueba): ${(ncs||[]).length}`);

const { data: fins } = await s.from('compras').select('id, numero, total_compra').eq('tenant_id', NARANJOS).like('numero', 'FIN-%');
console.log(`CxP FIN- a Caminero: ${(fins||[]).length} (RD$${(fins||[]).reduce((a,c)=>a+Number(c.total_compra),0).toFixed(2)})`);

const { data: pagosApp } = await s.from('prestamo_pagos').select('id, numero, fecha, total_pagado').eq('tenant_id', NARANJOS).not('numero', 'like', 'RI-%');
console.log(`Pagos hechos en la app (prueba): ${(pagosApp||[]).length}`);
(pagosApp||[]).forEach(p => console.log(`  ${p.numero} ${p.fecha} RD$${p.total_pagado}`));

const { data: recibosN } = await s.from('recibos_ingreso').select('id, numero, fecha, monto_pagado').eq('tenant_id', NARANJOS);
console.log(`Recibos de ingreso en Naranjos (prueba — la operación real vive en el viejo): ${(recibosN||[]).length}`);
(recibosN||[]).forEach(r => console.log(`  ${r.numero} ${r.fecha} RD$${r.monto_pagado}`));

// ============ CAMINERO ============
console.log('\n===== CAMINERO =====');
const { data: facts } = await s.from('facturas')
  .select('id, numero, fecha, total, monto_pendiente, estado, clientes(nombre), manual_cliente_nombre')
  .eq('tenant_id', CAMINERO).in('numero', [6,7,8,9,10,11]);
console.log(`Facturas de prueba #6-#11: ${(facts||[]).length}`);
(facts||[]).forEach(f => console.log(`  FT-${f.numero} ${f.fecha?.slice(0,10)} RD$${f.total} pend ${f.monto_pendiente} | CxC a: ${f.clientes?.nombre?.slice(0,24)} | comprador: ${f.manual_cliente_nombre || '-'}`));
const fIds = (facts||[]).map(f => f.id);

const { data: ridet } = await s.from('recibos_ingreso_detalle').select('id, recibo_id').in('factura_id', fIds);
const reciboIds = [...new Set((ridet||[]).map(r => r.recibo_id))];
console.log(`Detalles de recibos (iniciales de prueba): ${(ridet||[]).length} en ${reciboIds.length} recibos`);

const { data: movs } = await s.from('inventario_movimientos').select('id, referencia_doc, cantidad').eq('tenant_id', CAMINERO).in('referencia_doc', [6,7,8,9,10,11].map(n => `FT-${n}`));
console.log(`Movimientos de inventario de esas ventas: ${(movs||[]).length}`);

if (!COMMIT) { console.log('\n(DRY-RUN — nada borrado. Agrega --commit)'); process.exit(0); }

// ============ BORRADO (orden por FKs) ============
console.log('\n===== BORRANDO =====');
// Naranjos
for (let i = 0; i < cuotaIds.length; i += 200) {
  const lote = cuotaIds.slice(i, i + 200);
  await del('prestamo_pago_detalle', q => q.in('cuota_id', lote), `pago_detalle lote ${i}`);
  await del('prestamo_nota_credito_detalle', q => q.in('cuota_id', lote), `nc_detalle lote ${i}`);
}
if ((ncs||[]).length) {
  const ncIds = ncs.map(n => n.id);
  await del('prestamo_nota_credito_detalle', q => q.in('nota_id', ncIds), 'nc_detalle por nota');
  await del('prestamo_notas_credito', q => q.in('id', ncIds), 'notas de crédito');
}
await del('prestamo_cuotas', q => q.in('prestamo_id', pIds), 'cuotas de prueba');
await del('prestamos', q => q.in('id', pIds), 'préstamos de prueba');
if ((fins||[]).length) {
  const finIds = fins.map(f => f.id);
  await del('compras_detalle', q => q.in('compra_id', finIds), 'detalle FIN-');
  await del('pagos_suplidores_detalle', q => q.in('compra_id', finIds), 'pagos supl detalle FIN-');
  await del('compras', q => q.in('id', finIds), 'compras FIN-');
}
if ((pagosApp||[]).length) {
  const pagoIds = pagosApp.map(p => p.id);
  await del('prestamo_pago_detalle', q => q.in('pago_id', pagoIds), 'detalle de pagos app');
  await del('prestamo_pagos', q => q.in('id', pagoIds), 'pagos de prueba');
}
if ((recibosN||[]).length) {
  const rIds = recibosN.map(r => r.id);
  await del('recibos_ingreso_detalle', q => q.in('recibo_id', rIds), 'recibos detalle Naranjos');
  await del('recibos_ingreso', q => q.in('id', rIds), 'recibos Naranjos');
}
// Caminero
if (fIds.length) {
  if (reciboIds.length) {
    await del('recibos_ingreso_detalle', q => q.in('recibo_id', reciboIds), 'recibo detalle Caminero');
    await del('recibos_ingreso', q => q.in('id', reciboIds), 'recibos Caminero');
  }
  if ((movs||[]).length) await del('inventario_movimientos', q => q.in('id', movs.map(m => m.id)), 'movimientos inventario');
  await del('facturas_detalle', q => q.in('factura_id', fIds), 'facturas detalle');
  await del('facturas', q => q.in('id', fIds), 'facturas 6-11');
}
console.log('\n✅ Pruebas de financiamiento eliminadas.');
process.exit(0);
