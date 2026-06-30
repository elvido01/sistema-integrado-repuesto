// Verifica el .env y la conexión a Supabase SIN escribir nada ni mostrar la llave.
// - Confirma que la llave es service_role.
// - Resuelve el tenant de MotoPréstamos Los Naranjos por nombre.
// - Verifica que clientes.legacy_id exista (migracion_legacy_id.sql corrido).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(msg) { console.error('❌ ' + msg); process.exit(1); }

if (!url || url.includes('TU_PROYECTO')) fail('SUPABASE_URL no está configurada en .env');
if (!key || key.includes('PEGA_AQUI')) fail('SUPABASE_SERVICE_ROLE_KEY no está configurada en .env');

// Decodifica el rol de la llave (sin imprimirla)
let role = 'desconocido';
try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString()).role; } catch {}
console.log('Host:', new URL(url).host);
console.log('Rol de la llave:', role);
if (role !== 'service_role') fail(`La llave NO es service_role (es "${role}"). Usa la secret service_role.`);

const supabase = createClient(url, key, { auth: { persistSession: false } });

// Buscar tenant de Los Naranjos por nombre en config_empresa
const { data: cias, error: e1 } = await supabase
  .from('config_empresa')
  .select('tenant_id, nombre, razon_social')
  .or('nombre.ilike.%naranjo%,razon_social.ilike.%naranjo%,nombre.ilike.%motoprestamo%,razon_social.ilike.%motoprestamo%');
if (e1) fail('No se pudo leer config_empresa: ' + e1.message);

console.log('\nEmpresas que coinciden con "naranjo/motoprestamo":');
for (const c of cias || []) console.log(`  tenant_id=${c.tenant_id}  nombre=${c.nombre}  razon=${c.razon_social}`);
if (!cias || cias.length === 0) console.log('  ⚠️ Ninguna. Revisa el nombre exacto de la empresa.');

// ¿Existe clientes.legacy_id?
const { error: e2 } = await supabase.from('clientes').select('legacy_id').limit(1);
if (e2 && /legacy_id/.test(e2.message)) {
  console.log('\n⚠️ clientes.legacy_id NO existe todavía → falta correr sql/migracion_legacy_id.sql en este proyecto.');
} else if (e2) {
  console.log('\n(aviso al leer clientes: ' + e2.message + ')');
} else {
  console.log('\n✅ clientes.legacy_id existe (migracion_legacy_id.sql ya corrido).');
}
console.log('\nChequeo de solo-lectura completo. No se escribió nada.');
