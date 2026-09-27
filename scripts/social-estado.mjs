// ============================================================
// Estado REAL de las cuentas de publicación (social_accounts)
// ------------------------------------------------------------
// `status = 'connected'` en la tabla no prueba absolutamente nada:
// es un texto que alguien escribió el día que conectó la cuenta y
// que nadie vuelve a tocar cuando el token se muere. El 27/09/2026
// las cuatro filas decían "connected"/"manual" mientras el token de
// Meta llevaba mes y medio vencido.
//
// Esto lo comprueba preguntándole a cada plataforma, sin publicar
// nada: solo GET de identidad y de cupo.
//
//   node scripts/social-estado.mjs
//
// NUNCA imprime un token. Solo si sirve, de quién es y hasta cuándo.
// ============================================================

import path from 'node:path';
import { createRequire } from 'node:module';

const RAIZ = path.resolve(import.meta.dirname, '..');
const require_ = createRequire(path.join(RAIZ, 'package.json'));
const { createClient } = require_('@supabase/supabase-js');

process.loadEnvFile(path.join(RAIZ, 'scripts/migracion-siif/.env'));
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const V = 'v22.0';

// El token va en la cabecera, no en la URL: en la URL acaba en los
// registros de Meta, en los de cualquier proxy y en los nuestros.
const get = async (url, token) => {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await r.json().catch(() => null);
  return { ok: r.ok && !body?.error, status: r.status, body, error: body?.error?.message };
};

const { data: cuentas, error } = await supabase
  .from('social_accounts')
  .select('id, tenant_id, platform, account_name, external_account_id, status, connected_at')
  .order('platform');

if (error) { console.error('No se pudo leer social_accounts:', error.message); process.exit(1); }
if (!cuentas?.length) { console.log('No hay cuentas en social_accounts.'); process.exit(0); }

const { data: secretos } = await supabase
  .from('social_account_secrets')
  .select('account_id, access_token, refresh_token, expires_at');
const porCuenta = new Map((secretos || []).map((s) => [s.account_id, s]));

for (const c of cuentas) {
  console.log(`\n═══ ${c.platform.toUpperCase()} — ${c.account_name} ═══`);
  console.log(`  En la tabla dice: ${c.status} (desde ${String(c.connected_at).slice(0, 10)})`);

  const sec = porCuenta.get(c.id);
  if (!sec?.access_token) {
    console.log('  ✗ SIN TOKEN: no se puede publicar por API. Falta conectar la cuenta.');
    continue;
  }
  const token = sec.access_token;
  if (sec.expires_at) console.log(`  Caduca (según la tabla): ${sec.expires_at}`);

  if (c.platform === 'facebook') {
    const yo = await get(`https://graph.facebook.com/${V}/me?fields=id,name`, token);
    if (!yo.ok) { console.log(`  ✗ TOKEN MUERTO: ${yo.error || yo.status}`); continue; }
    console.log(`  ✓ Token vivo — responde como: ${yo.body.name} (${yo.body.id})`);
    if (yo.body.id !== c.external_account_id) {
      console.log(`  ⚠ OJO: la tabla apunta a ${c.external_account_id} y el token es de ${yo.body.id}`);
    }
    const dbg = await get(`https://graph.facebook.com/${V}/debug_token?input_token=${encodeURIComponent(token)}`, token);
    if (dbg.ok && dbg.body?.data) {
      const d = dbg.body.data;
      console.log(`    tipo: ${d.type} · caduca: ${d.expires_at ? new Date(d.expires_at * 1000).toISOString() : 'nunca'}`);
      console.log(`    permisos: ${(d.scopes || []).join(', ') || '(no los dice)'}`);
      for (const falta of ['pages_manage_posts', 'pages_read_engagement']) {
        if (!(d.scopes || []).includes(falta)) console.log(`    ⚠ falta el permiso ${falta} (hace falta para publicar en el feed)`);
      }
    }
  }

  if (c.platform === 'instagram') {
    const esIgApi = token.startsWith('IGAA');
    const host = esIgApi ? 'graph.instagram.com' : 'graph.facebook.com';
    const ident = esIgApi ? 'me' : c.external_account_id;
    const yo = await get(`https://${host}/${V}/${ident}?fields=id,username`, token);
    if (!yo.ok) { console.log(`  ✗ TOKEN MUERTO: ${yo.error || yo.status}`); continue; }
    console.log(`  ✓ Token vivo — cuenta: @${yo.body.username} (${yo.body.id})`);
    // Este endpoint exige el MISMO permiso que publicar, y no publica nada:
    // si contesta, la cuenta puede publicar; si no, dice por qué no.
    const cupo = await get(`https://${host}/${V}/${ident}/content_publishing_limit?fields=config,quota_usage`, token);
    if (cupo.ok) {
      const q = cupo.body?.data?.[0];
      console.log(`  ✓ PUEDE PUBLICAR — usadas ${q?.quota_usage ?? '?'} de ${q?.config?.quota_total ?? '?'} en 24 h`);
    } else {
      console.log(`  ✗ NO PUEDE PUBLICAR: ${cupo.error || cupo.status}`);
    }
  }

  if (c.platform === 'tiktok' || c.platform === 'youtube') {
    console.log('  (hay token guardado: comprobación específica pendiente de implementar)');
  }
}

console.log('\nRecuerda: esto NO publica nada. Solo pregunta.');
