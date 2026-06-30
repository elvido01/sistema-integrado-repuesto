// Muestra detalle de los tenants candidatos para decidir a cuál cargar.
// Solo lectura.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ids = [
  '766fe3d6-6885-4f2b-b2cc-1a91db696fb4',
  'f1e5ed03-447c-4e6a-bf56-2113d774d747',
];

async function count(table, tid) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', tid);
  return error ? `err(${error.message.slice(0, 40)})` : count;
}

for (const tid of ids) {
  const { data: ce } = await supabase
    .from('config_empresa')
    .select('tenant_id, nombre, razon_social, rnc, telefono, tipo_negocio, feat_financiera')
    .eq('tenant_id', tid).maybeSingle();
  console.log('\n===== tenant', tid, '=====');
  console.log('  nombre:', ce?.nombre, '| razon:', ce?.razon_social, '| rnc:', ce?.rnc);
  console.log('  tel:', ce?.telefono, '| tipo_negocio:', ce?.tipo_negocio, '| feat_financiera:', ce?.feat_financiera);
  console.log('  clientes:', await count('clientes', tid));
  console.log('  productos:', await count('productos', tid));
  console.log('  facturas:', await count('facturas', tid));
}
