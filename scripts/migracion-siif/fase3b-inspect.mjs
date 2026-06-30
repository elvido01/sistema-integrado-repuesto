import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { parseTable } from './lib/parseDump.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const TID = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Esquema de nuestras tablas de pagos
for (const t of ['prestamo_pagos', 'prestamo_pago_detalle', 'recibos_ingreso']) {
  let { data, error } = await supabase.from(t).select('*').eq('tenant_id', TID).limit(1);
  if (error && /does not exist|schema cache/.test(error.message)) { console.log(`\n${t}: NO existe (${error.message.slice(0,50)})`); continue; }
  if (!data || !data.length) { const g = await supabase.from(t).select('*').limit(1); data = g.data; }
  console.log(`\n${t}:`, data && data[0] ? Object.keys(data[0]).sort().join(', ') : '(sin filas)');
}

// cxc_pendiente con referencia para el cliente
const F = (n) => `E:\\COPIAS\\2026-06-30\\${n}.2026-06-30.SQL`;
const cli = 'R11164274';
const pend = await parseTable(F('prestamos_01'), 'cxc_pendiente');
const pc = pend.rows.filter((r) => (r.cliente || '').trim() === cli);
console.log(`\ncxc_pendiente de ${cli}: ${pc.length} filas (con saldo>0: ${pc.filter(r=>Number(r.pendiente)>0).length})`);
for (const r of pc.filter(r=>Number(r.pendiente)>0).slice(0, 8)) console.log('  ', JSON.stringify({ ref: r.referencia, tip: r.tip_transaccion, num: r.num_transaccion, cuota: r.cuota, vence: r.vence, pendiente: r.pendiente, interes: r.interes, concepto: r.concepto, desc: (r.descripcion||'').slice(0,30) }));

const mov = await parseTable(F('prestamos_01'), 'cxc_mov_master');
const ri = mov.rows.filter((r) => (r.cliente || '').trim() === cli && (r.tip_transaccion === 'RI'));
console.log(`\nRI (pagos) de ${cli}: ${ri.length}`);
for (const r of ri.slice(0, 6)) console.log('  ', JSON.stringify({ ref: r.referencia, fecha: r.fecha, credito: r.credito, desc: (r.descripcion||'').slice(0,30) }));
process.exit(0);
