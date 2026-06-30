import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const TID = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const cnt = async (t, f) => { let q = supabase.from(t).select('*', { count: 'exact', head: true }).eq('tenant_id', TID); if (f) q = f(q); const { count } = await q; return count; };
console.log('Préstamos migrados:', await cnt('prestamos', (q) => q.not('legacy_id', 'is', null)));
console.log('  activos:', await cnt('prestamos', (q) => q.eq('estado', 'activo')));
console.log('  saldados:', await cnt('prestamos', (q) => q.eq('estado', 'saldado')));
console.log('Cuotas totales:', await cnt('prestamo_cuotas'));

// Muestra: un préstamo activo con sus cuotas
const { data: p } = await supabase.from('prestamos').select('id, numero, monto_capital, plazo_cuotas, tasa_interes, estado, garantia').eq('tenant_id', TID).eq('estado', 'activo').not('legacy_id', 'is', null).limit(1);
if (p && p[0]) {
  console.log('\nEjemplo préstamo activo:', JSON.stringify(p[0]));
  const { data: cs } = await supabase.from('prestamo_cuotas').select('numero_cuota, capital, interes, monto_cuota, capital_pagado, estado').eq('prestamo_id', p[0].id).order('numero_cuota').limit(3);
  console.log('  primeras cuotas:', JSON.stringify(cs));
}
process.exit(0);
