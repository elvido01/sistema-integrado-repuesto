// Usuarios administradores + almacén principal para las financieras separadas.
// Mismo procedimiento que la edge function admin-management:
//   auth.admin.createUser (email confirmado) + profiles + usuarios_empresas.
// Idempotente: si el usuario ya existe, solo re-vincula.
//
//   node crear-usuarios-financieras.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CUENTAS = [
  {
    tenant: 'c05a1d05-0d1e-4a2b-8c3f-0da1e5000005',
    empresa: 'MOTO PRESTAMOS ODALYS',
    email: 'motoprestamosodalys@gmail.com',
    password: 'admin.123',
  },
  {
    tenant: 'c07a1d07-1e2f-4b3c-9d4a-107a10500007',
    empresa: 'INVERSIONES LOS NARANJOS',
    email: 'inversioneslosnaranjos@gmail.com',
    password: 'admin.123',
  },
];

async function findUserIdByEmail(email) {
  // admin.listUsers pagina; con pocos miles de usuarios esto alcanza
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = (data?.users || []).find((u) => (u.email || '').toLowerCase() === email);
    if (hit) return hit.id;
    if (!data?.users?.length || data.users.length < 200) break;
  }
  return null;
}

for (const c of CUENTAS) {
  let userId = null;

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: c.email,
    password: c.password,
    email_confirm: true,
    user_metadata: { full_name: c.empresa, role: 'admin' },
  });

  if (createErr) {
    if (/already|exists|registered/i.test(createErr.message)) {
      userId = await findUserIdByEmail(c.email);
      if (!userId) { console.error(`❌ ${c.email}: existe pero no lo encuentro.`); process.exit(1); }
      // asegurar la clave pedida
      await supabase.auth.admin.updateUserById(userId, { password: c.password, email_confirm: true });
      console.log(`↺ ${c.email} ya existía; clave actualizada.`);
    } else {
      console.error(`❌ createUser ${c.email}:`, createErr.message);
      process.exit(1);
    }
  } else {
    userId = created.user.id;
    console.log(`＋ ${c.email} creado.`);
  }

  // profiles (rol admin del tenant)
  const { error: pErr } = await supabase.from('profiles').upsert({
    id: userId,
    email: c.email,
    full_name: c.empresa,
    role: 'admin',
    tenant_id: c.tenant,
  }, { onConflict: 'id' });
  if (pErr) { console.error(`❌ profiles ${c.email}:`, pErr.message); process.exit(1); }

  // usuarios_empresas (lo usa get_user_tenant / selector multi-empresa)
  const { error: ueErr } = await supabase.from('usuarios_empresas').upsert({
    user_id: userId,
    tenant_id: c.tenant,
    rol: 'admin',
  }, { onConflict: 'user_id,tenant_id' });
  if (ueErr) { console.error(`❌ usuarios_empresas ${c.email}:`, ueErr.message); process.exit(1); }

  // Almacén principal (venderán sus propios motores: inventario propio)
  const { data: alm } = await supabase.from('almacenes').select('id').eq('tenant_id', c.tenant).limit(1).maybeSingle();
  if (!alm) {
    const { error: aErr } = await supabase.from('almacenes').insert({
      tenant_id: c.tenant, codigo: 'A01', nombre: 'ALMACEN PRINCIPAL', activo: true,
    });
    if (aErr) { console.error(`❌ almacen ${c.empresa}:`, aErr.message); process.exit(1); }
    console.log(`   Almacén principal creado para ${c.empresa}.`);
  }

  console.log(`✅ ${c.empresa}: ${c.email} → admin del tenant ${c.tenant}`);
}
console.log('\nUsuarios listos.');
