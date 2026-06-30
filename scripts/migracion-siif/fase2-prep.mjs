// Prep Fase 2: muestra columnas de productos, verifica clientes y deja
// tipo_negocio='financiera' en Los Naranjos (para que el chasis se vea completo).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const TID = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Revisión clientes
const { count } = await supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('tenant_id', TID).not('legacy_id', 'is', null);
console.log('Clientes migrados:', count);

// Columnas de productos
const { data: p, error: pe } = await supabase.from('productos').select('*').eq('tenant_id', TID).limit(1);
if (pe) console.log('productos error:', pe.message);
else console.log('\nColumnas de productos:\n', p && p[0] ? Object.keys(p[0]).sort().join(', ') : '(sin filas; intento global)');
if (!p || !p.length) {
  const { data: pg } = await supabase.from('productos').select('*').limit(1);
  console.log('Columnas (global):', pg && pg[0] ? Object.keys(pg[0]).sort().join(', ') : '(no hay productos en ningún tenant)');
}

// tipo_negocio -> financiera
const { error: ue } = await supabase.from('config_empresa').update({ tipo_negocio: 'financiera' }).eq('tenant_id', TID);
console.log(ue ? ('No se pudo actualizar tipo_negocio: ' + ue.message) : '\n✅ tipo_negocio de Los Naranjos = financiera');
process.exit(0);
