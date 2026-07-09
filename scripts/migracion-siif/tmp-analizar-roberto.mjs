// ROBERTO ALBURQUERQUE LOPEZ (028-0081323-6): viejo vs MotoFlow (dif 78.90)
import fs from 'node:fs';
import path from 'node:path';
import { parseTable } from './lib/parseDump.mjs';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const baseDir = 'E:\\COPIAS';
const fecha = fs.readdirSync(baseDir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop();
const F = (n) => path.join(baseDir, fecha, `${n}.${fecha}.SQL`);
const CED = '028-0081323-6';
console.log('Respaldo:', fecha, '| Cliente:', CED);

const pend = await parseTable(F('prestamos_01'), 'cxc_pendiente');
const rows = pend.rows.filter((r) => (r.cliente || '').trim() === CED && Number(r.pendiente) > 0);
console.log('\nVIEJO cxc_pendiente con saldo:', rows.length, 'filas');
let tot = 0;
for (const r of rows.slice(0, 12)) {
  tot += Number(r.pendiente);
  console.log('  ', JSON.stringify({ tip: r.tip_transaccion, num: r.num_transaccion, cuota: r.cuota, vence: r.vence, debito: r.debito, pendiente: r.pendiente, interes: r.interes, mora: r.mora }));
}
console.log('  TOTAL pendiente viejo:', rows.reduce((a, r) => a + Number(r.pendiente), 0).toFixed(2));

const mov = await parseTable(F('prestamos_01'), 'cxc_mov_master');
const movs = mov.rows.filter((r) => (r.cliente || '').trim() === CED);
console.log('\nVIEJO últimos 8 movimientos:');
for (const r of movs.slice(-8)) console.log('  ', JSON.stringify({ fecha: r.fecha, tip: r.tip_transaccion, num: r.num_transaccion, desc: (r.descripcion || '').slice(0, 34), deb: r.debito, cre: r.credito }));

// MotoFlow
const T = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
const { data: cli } = await s.from('clientes').select('id, nombre').eq('tenant_id', T).eq('rnc', CED).single();
const { data: ps } = await s.from('prestamos').select('id, numero, estado, mora_pct').eq('cliente_id', cli.id).eq('estado', 'activo');
console.log('\nMOTOFLOW préstamos activos:', JSON.stringify(ps?.map((p) => p.numero)));
for (const p of ps || []) {
  const { data: qs } = await s.from('prestamo_cuotas')
    .select('numero_cuota, fecha_vencimiento, capital, interes, monto_cuota, capital_pagado, interes_pagado, estado')
    .eq('prestamo_id', p.id).order('numero_cuota').limit(8);
  for (const q of qs || []) {
    const pendq = Math.max(q.capital - q.capital_pagado, 0) + Math.max(q.interes - q.interes_pagado, 0);
    console.log('  ', p.numero, `cuota ${q.numero_cuota}`, '| vence', q.fecha_vencimiento, '| monto', q.monto_cuota, '| pend', pendq.toFixed(2), '|', q.estado);
  }
  const { data: all } = await s.from('prestamo_cuotas').select('capital, interes, capital_pagado, interes_pagado').eq('prestamo_id', p.id);
  const totNew = (all || []).reduce((a, q) => a + Math.max(q.capital - q.capital_pagado, 0) + Math.max(q.interes - q.interes_pagado, 0), 0);
  console.log('  TOTAL pendiente MotoFlow', p.numero, ':', totNew.toFixed(2));
}
const { data: cargos } = await s.from('prestamo_cargos').select('numero, tipo, monto, monto_pagado, estado').eq('cliente_id', cli.id).neq('estado', 'pagado');
console.log('MOTOFLOW cargos con pendiente:', JSON.stringify(cargos));
process.exit(0);
