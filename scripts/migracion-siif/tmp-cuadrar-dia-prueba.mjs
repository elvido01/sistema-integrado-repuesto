// Cuadre del día de la prueba (2026-07-09) para el CIERRE DE CAJA:
//  1) borra los pagos replicados a mano en MotoFlow hoy (duplicados del viejo)
//  2) borra sus recibos_ingreso
//  3) crea recibos_ingreso desde los pagos OFICIALES del día (RI- del viejo)
// Así el cierre de caja del día lee exactamente el día oficial.
//   node tmp-cuadrar-dia-prueba.mjs [--commit]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const COMMIT = process.argv.includes('--commit');
const HOY = '2026-07-09';

const TENANTS = [
  ['MotoPréstamos Los Naranjos', '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'],
  ['Moto Préstamos Odalys', 'c05a1d05-0d1e-4a2b-8c3f-0da1e5000005'],
  ['Inversiones Los Naranjos', 'c07a1d07-1e2f-4b3c-9d4a-107a10500007'],
];

console.log(`Cuadre del día ${HOY} | commit=${COMMIT}\n`);

for (const [nombre, T] of TENANTS) {
  const { data: pagos } = await s.from('prestamo_pagos')
    .select('id, numero, fecha, total_pagado, cliente_id, comentarios')
    .eq('tenant_id', T).eq('fecha', HOY).eq('anulado', false);
  const oficiales = (pagos || []).filter((p) => String(p.numero).startsWith('RI-'));
  const replicas = (pagos || []).filter((p) => !String(p.numero).startsWith('RI-'));

  const { data: recibos } = await s.from('recibos_ingreso')
    .select('id, numero, monto_pagado')
    .eq('tenant_id', T).eq('fecha', HOY);
  const numsOficiales = new Set(oficiales.map((p) => p.numero));
  const recibosReplica = (recibos || []).filter((r) => !numsOficiales.has(r.numero));
  const recibosOficialesExistentes = new Set((recibos || []).filter((r) => numsOficiales.has(r.numero)).map((r) => r.numero));
  const faltantes = oficiales.filter((p) => !recibosOficialesExistentes.has(p.numero));

  console.log(`── ${nombre}`);
  console.log(`   pagos hoy: ${oficiales.length} oficiales (RD$${oficiales.reduce((a, p) => a + Number(p.total_pagado), 0).toFixed(2)}) | ${replicas.length} réplicas a borrar (RD$${replicas.reduce((a, p) => a + Number(p.total_pagado), 0).toFixed(2)})`);
  console.log(`   recibos hoy: ${recibosReplica.length} réplicas a borrar | ${faltantes.length} oficiales a crear`);

  if (!COMMIT) continue;

  if (replicas.length) {
    const { error } = await s.from('prestamo_pagos').delete().in('id', replicas.map((p) => p.id));
    if (error) { console.error('   ❌ pagos réplica:', error.message); process.exit(1); }
  }
  if (recibosReplica.length) {
    const ids = recibosReplica.map((r) => r.id);
    await s.from('recibos_ingreso_detalle').delete().in('recibo_id', ids).then(() => {}, () => {});
    const { error } = await s.from('recibos_ingreso').delete().in('id', ids);
    if (error) { console.error('   ❌ recibos réplica:', error.message); process.exit(1); }
  }
  if (faltantes.length) {
    const rows = faltantes.map((p) => ({
      tenant_id: T,
      numero: p.numero,
      fecha: p.fecha,
      cliente_id: p.cliente_id,
      monto_pagado: p.total_pagado,
      concepto: p.comentarios || 'Pago de préstamo (sistema viejo)',
      formas_pago: [{ forma: 'Efectivo', monto: Number(p.total_pagado), referencia: p.numero }],
      anulado: false,
      origen: 'sync',
    }));
    const { error } = await s.from('recibos_ingreso').insert(rows);
    if (error) { console.error('   ❌ creando recibos:', error.message); process.exit(1); }
  }
  console.log('   ✅ día cuadrado');
}

console.log(COMMIT ? '\n✅ Listo: el cierre de caja del día lee el día oficial.' : '\n(DRY-RUN — nada escrito. Agrega --commit)');
process.exit(0);
