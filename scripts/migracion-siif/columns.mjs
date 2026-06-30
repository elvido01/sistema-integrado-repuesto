import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await supabase.from('clientes').select('*').limit(1);
if (error) { console.error(error.message); process.exit(1); }
console.log('Columnas de clientes:\n', data && data[0] ? Object.keys(data[0]).sort().join(', ') : '(sin filas)');
process.exit(0);
