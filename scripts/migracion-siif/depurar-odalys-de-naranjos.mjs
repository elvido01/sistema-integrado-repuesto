// Depuración post-separación: saca de MOTOPRESTAMOS LOS NARANJOS lo que vino
// de la base de MOTO PRESTAMOS ODALYS (prestamos_05), ahora que Odalys vive en
// su propio tenant (fase-financiera-cxc.mjs odalys).
//
// Identificación por namespacing de la migración:
//   prestamos.legacy_id  ∈ [500,000,000 .. 600,000,000)  → origen prestamos_05
//   clientes.legacy_id   ∈ [500,000,000 .. 600,000,000)  → cliente EXCLUSIVO de
//     Odalys (los compartidos con Naranjos conservaron el legacy de scv8 y se
//     quedan en ambos tenants, que es lo correcto en multi-tenant).
//
// Acciones (--commit):
//   1) prestamo_pago_detalle de las cuotas de esos préstamos  → DELETE
//   2) prestamo_cuotas de esos préstamos                      → DELETE
//   3) prestamos (origen 05)                                  → DELETE
//   4) prestamo_pagos de clientes EXCLUSIVOS de Odalys        → DELETE
//   5) clientes exclusivos: DELETE; si un lote tiene FKs
//      (gestiones/recibos), se DESACTIVA (activo=false) en su lugar.
//
//   node depurar-odalys-de-naranjos.mjs            (dry-run: solo cuenta)
//   node depurar-odalys-de-naranjos.mjs --commit   (depura de verdad)

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const NARANJOS = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
const LO = 500_000_000, HI = 600_000_000;
const COMMIT = process.argv.includes('--commit');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function fetchAll(table, select, filter) {
  const rows = []; let from = 0;
  for (;;) {
    let q = supabase.from(table).select(select).eq('tenant_id', NARANJOS).range(from, from + 999);
    q = filter(q);
    const { data, error } = await q;
    if (error) { console.error(`${table}:`, error.message); process.exit(1); }
    rows.push(...data);
    if (data.length < 1000) break; from += 1000;
  }
  return rows;
}

console.log(`Tenant Naranjos: ${NARANJOS} | rango legacy Odalys: [${LO}, ${HI}) | commit=${COMMIT}`);

// 1) Préstamos de origen Odalys dentro de Naranjos
const prestamos = await fetchAll('prestamos', 'id, legacy_id, numero, estado, cliente_id',
  (q) => q.gte('legacy_id', LO).lt('legacy_id', HI));
const porEstado = prestamos.reduce((a, p) => { a[p.estado] = (a[p.estado] || 0) + 1; return a; }, {});
console.log(`Préstamos origen Odalys en Naranjos: ${prestamos.length} | por estado: ${JSON.stringify(porEstado)}`);

// 2) Clientes EXCLUSIVOS de Odalys en Naranjos
const clientesExc = await fetchAll('clientes', 'id, legacy_id, nombre, activo',
  (q) => q.gte('legacy_id', LO).lt('legacy_id', HI));
console.log(`Clientes exclusivos de Odalys en Naranjos: ${clientesExc.length}`);

// 3) Cuotas de esos préstamos (conteo)
const prestamoIds = prestamos.map((p) => p.id);
let cuotaIds = [];
for (let i = 0; i < prestamoIds.length; i += 150) {
  const { data, error } = await supabase.from('prestamo_cuotas').select('id')
    .in('prestamo_id', prestamoIds.slice(i, i + 150));
  if (error) { console.error('cuotas:', error.message); process.exit(1); }
  cuotaIds.push(...data.map((r) => r.id));
}
console.log(`Cuotas de esos préstamos: ${cuotaIds.length}`);

// 4) Pagos de clientes exclusivos (conteo)
const excIds = clientesExc.map((c) => c.id);
let pagosCount = 0;
for (let i = 0; i < excIds.length; i += 150) {
  const { count, error } = await supabase.from('prestamo_pagos')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', NARANJOS)
    .in('cliente_id', excIds.slice(i, i + 150));
  if (error) { console.error('pagos:', error.message); process.exit(1); }
  pagosCount += count || 0;
}
console.log(`Pagos de clientes exclusivos: ${pagosCount}`);

if (!COMMIT) {
  console.log('\n(DRY-RUN — nada borrado. Agrega --commit para depurar.)');
  process.exit(0);
}

// ================= COMMIT =================
// 1) detalle de pagos aplicado a esas cuotas
for (let i = 0; i < cuotaIds.length; i += 150) {
  const { error } = await supabase.from('prestamo_pago_detalle').delete()
    .in('cuota_id', cuotaIds.slice(i, i + 150));
  if (error) { console.error('❌ pago_detalle:', error.message); process.exit(1); }
}
console.log('pago_detalle: limpio');

// 2) cuotas
for (let i = 0; i < prestamoIds.length; i += 150) {
  const { error } = await supabase.from('prestamo_cuotas').delete()
    .in('prestamo_id', prestamoIds.slice(i, i + 150));
  if (error) { console.error('❌ cuotas:', error.message); process.exit(1); }
}
console.log(`cuotas: ${cuotaIds.length} borradas`);

// 3) préstamos
for (let i = 0; i < prestamoIds.length; i += 150) {
  const { error } = await supabase.from('prestamos').delete()
    .in('id', prestamoIds.slice(i, i + 150));
  if (error) { console.error('❌ prestamos:', error.message); process.exit(1); }
}
console.log(`prestamos: ${prestamos.length} borrados`);

// 4) pagos de clientes exclusivos
for (let i = 0; i < excIds.length; i += 150) {
  const { error } = await supabase.from('prestamo_pagos').delete()
    .eq('tenant_id', NARANJOS)
    .in('cliente_id', excIds.slice(i, i + 150));
  if (error) { console.error('❌ pagos:', error.message); process.exit(1); }
}
console.log(`pagos: ${pagosCount} borrados`);

// 5) clientes exclusivos: DELETE; si el lote tiene FKs -> desactivar
let borrados = 0, desactivados = 0;
for (let i = 0; i < excIds.length; i += 50) {
  const lote = excIds.slice(i, i + 50);
  const { error } = await supabase.from('clientes').delete().in('id', lote);
  if (!error) { borrados += lote.length; continue; }
  // FK (gestiones/recibos/seguimiento): desactivar en su lugar
  const { error: updErr } = await supabase.from('clientes')
    .update({ activo: false }).in('id', lote);
  if (updErr) { console.error('❌ clientes:', updErr.message); process.exit(1); }
  desactivados += lote.length;
}
console.log(`clientes exclusivos: ${borrados} borrados, ${desactivados} desactivados (tenían historial vinculado)`);

console.log('\n✅ Naranjos depurado: lo de Odalys ya vive solo en su tenant.');
process.exit(0);
