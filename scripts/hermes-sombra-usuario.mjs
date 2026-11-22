// =====================================================================
// hermes-sombra-usuario.mjs — crea el usuario "Hermes" de una empresa y
// enciende el modo sombra (22/11/2026)
// ---------------------------------------------------------------------
//   node scripts/hermes-sombra-usuario.mjs <tenant_id>
//   node scripts/hermes-sombra-usuario.mjs <tenant_id> --apagar
//
// Hermes propone una respuesta para CADA pregunta que entra por el espejo
// (sin enviar nada) y un juez la compara con lo que contestó la tienda.
// Para consultar el inventario lo hace con la sesión de ESTE usuario: rol
// vendedor, solo su empresa (get_user_tenant), igual que un empleado.
//
// La contraseña es aleatoria y no se muestra ni se guarda: nadie entra con
// este usuario. hermes-sombra le abre sesión con un enlace mágico que genera
// y verifica en el servidor (no sale ningún correo).
//
// Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (scripts/migracion-siif/.env).
// Idempotente: si ya existe, solo lo (re)activa.
// =====================================================================
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('./migracion-siif/.env', import.meta.url), 'utf8').split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);
const URL_BASE = process.env.SUPABASE_URL || env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) { console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const tenant = process.argv[2];
const apagar = process.argv.includes('--apagar');
if (!/^[0-9a-f-]{36}$/i.test(tenant || '')) {
  console.error('Uso: node scripts/hermes-sombra-usuario.mjs <tenant_id> [--apagar]');
  process.exit(1);
}

const db = createClient(URL_BASE, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: emp, error: ee } = await db.from('tenants').select('id, nombre').eq('id', tenant).maybeSingle();
if (ee || !emp) { console.error('No encontré esa empresa:', ee?.message || tenant); process.exit(1); }

if (apagar) {
  const { data, error } = await db.from('hermes_sombra_config').update({ activo: false }).eq('tenant_id', tenant).select('tenant_id');
  if (error) throw error;
  console.log(data?.length ? `✔ Sombra apagada en ${emp.nombre}.` : `(${emp.nombre} no tenía sombra.)`);
  process.exit(0);
}

const { data: cfg } = await db.from('hermes_sombra_config').select('user_id').eq('tenant_id', tenant).maybeSingle();
let userId = cfg?.user_id;

if (!userId) {
  const corto = tenant.replace(/-/g, '').slice(-8);
  const email = `hermes.${corto}@motoflow.com.do`;
  const { data: nuevo, error: ec } = await db.auth.admin.createUser({
    email,
    password: randomBytes(32).toString('base64url'),   // nadie la conoce
    email_confirm: true,
    user_metadata: { full_name: 'Hermes (IA)', role: 'seller' },
  });
  if (ec) throw ec;
  userId = nuevo.user.id;

  const { error: ep } = await db.from('profiles').upsert(
    { id: userId, email, full_name: 'Hermes (IA)', role: 'seller', tenant_id: tenant }, { onConflict: 'id' });
  if (ep) throw ep;
  const { error: eu } = await db.from('usuarios_empresas').upsert(
    { user_id: userId, tenant_id: tenant, rol: 'vendedor' }, { onConflict: 'user_id,tenant_id' });
  if (eu) throw eu;
  console.log(`✔ Usuario "Hermes (IA)" creado en ${emp.nombre} (${email}).`);
}

const { data: ok, error: ei } = await db.from('hermes_sombra_config')
  .upsert({ tenant_id: tenant, user_id: userId, activo: true }, { onConflict: 'tenant_id' })
  .select('tenant_id, desde');
if (ei || !ok?.length) throw ei || new Error('No se guardó la configuración');
console.log(`✔ Sombra encendida en ${emp.nombre}: Hermes propondrá cada respuesta desde ${ok[0].desde}.`);
