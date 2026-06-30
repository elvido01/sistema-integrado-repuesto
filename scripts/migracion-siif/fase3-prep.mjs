import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const TID = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const t of ['prestamos', 'prestamo_cuotas']) {
  // intenta una fila del tenant; si no hay, global
  let { data } = await supabase.from(t).select('*').eq('tenant_id', TID).limit(1);
  if (!data || !data.length) { const g = await supabase.from(t).select('*').limit(1); data = g.data; }
  console.log(`\n=== ${t} ===`);
  console.log('columnas:', data && data[0] ? Object.keys(data[0]).sort().join(', ') : '(no hay filas en ningún tenant)');
  const { count } = await supabase.from(t).select('*', { count: 'exact', head: true }).eq('tenant_id', TID);
  console.log('filas en el tenant:', count);
}
process.exit(0);
