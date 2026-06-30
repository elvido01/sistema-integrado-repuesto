import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const TID = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { count } = await supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('tenant_id', TID);
console.log('Total clientes en el tenant:', count);
const { count: mig } = await supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('tenant_id', TID).not('legacy_id', 'is', null);
console.log('Migrados (legacy_id no nulo):', mig);

const { data } = await supabase.from('clientes').select('legacy_id, codigo, nombre, rnc, telefono, direccion, generar_mora, autorizar_credito').eq('tenant_id', TID).not('legacy_id', 'is', null).order('legacy_id').limit(3);
console.log('\nMuestra migrada:');
for (const r of data) console.log(' ', JSON.stringify(r));
process.exit(0);
