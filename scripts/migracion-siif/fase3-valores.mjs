import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const TID = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: pr } = await supabase.from('prestamos').select('numero, estado, frecuencia, metodo_interes, tipo, tasa_interes, mora_pct, plazo_cuotas, garantia, fecha_inicio, fecha_primera_cuota, monto_capital, cliente_id').eq('tenant_id', TID).limit(9);
console.log('prestamos existentes (muestra):');
for (const r of pr || []) console.log(' ', JSON.stringify(r));

const { data: q } = await supabase.from('prestamo_cuotas').select('*').eq('tenant_id', TID).limit(4);
console.log('\nprestamo_cuotas existentes (muestra):');
for (const r of q || []) console.log(' ', JSON.stringify(r));

// valores distintos
const u = (arr, k) => [...new Set((arr || []).map((x) => x[k]))];
console.log('\nDistintos -> estado:', u(pr, 'estado'), '| frecuencia:', u(pr, 'frecuencia'), '| metodo_interes:', u(pr, 'metodo_interes'), '| tipo:', u(pr, 'tipo'));
process.exit(0);
