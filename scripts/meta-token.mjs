// ============================================================
// Instalar un token nuevo de Meta
// ------------------------------------------------------------
// El token de la página NO vence nunca. Lo que vence es el
// "acceso a datos": Meta lo corta a los 60 días de la última vez
// que una persona autorizó la app en el diálogo de Facebook.
// Ese contador solo se reinicia con un humano delante — no hay
// manera de renovarlo desde el servidor.
//
// Cuando vuelvas del Explorador de la API con el token nuevo:
//
//   npm run meta:token -- EAAG...elTokenCompleto
//
// El script no lo guarda a ciegas. Antes comprueba que sea de la
// app correcta, que alcance la página y la cuenta de Instagram, y
// te dice qué permisos ganaste o perdiste frente al que ya está.
// Solo si todo cuadra escribe en la base — y escribe en LAS CUATRO
// filas donde vive, que es el error fácil de cometer a mano.
//
// Con --forzar lo guarda aunque pierda permisos (te lo va a decir).
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

const G = 'https://graph.facebook.com/v21.0';
const api = async (ruta, token) => {
  const sep = ruta.includes('?') ? '&' : '?';
  const r = await fetch(`${G}${ruta}${sep}access_token=${encodeURIComponent(token)}`);
  return { ok: r.ok, body: await r.json().catch(() => null) };
};
const corto = (t) => (t ? `${String(t).slice(0, 10)}…${String(t).slice(-6)}` : '—');
const salir = (msg) => { console.log(`\n✗ ${msg}\n`); process.exit(1); };

const args = process.argv.slice(2);
const forzar = args.includes('--forzar');
const nuevo = args.find((a) => !a.startsWith('--'));

if (!nuevo) {
  console.log(`
  Falta el token.

    npm run meta:token -- EAAG...elTokenCompleto

  Para conseguirlo: developers.facebook.com/tools/explorer
  App "MotoFlow CRM" → Token de usuario → Generar → luego cambia
  el desplegable a Token de página → Repuestos Morla → copiar.
`);
  process.exit(1);
}

// ── 1. ¿QUÉ ES ESTE TOKEN? ─────────────────────────────────
console.log('\n═══ EL TOKEN NUEVO ═══');
const dbgN = await api(`/debug_token?input_token=${encodeURIComponent(nuevo)}`, nuevo);
const n = dbgN.body?.data;
if (!n?.is_valid) salir(`no sirve: ${dbgN.body?.error?.message || JSON.stringify(dbgN.body)}`);

console.log(`  app   : ${n.application} (${n.app_id})`);
console.log(`  tipo  : ${n.type}`);
if (n.data_access_expires_at) {
  const v = new Date(n.data_access_expires_at * 1000);
  console.log(`  acceso a datos hasta ${v.toISOString().slice(0, 10)} (${Math.round((v - Date.now()) / 86400000)} días)`);
}

// ── 2. COMPARAR CON EL QUE YA ESTÁ ─────────────────────────
const { data: canales } = await supabase
  .from('sales_channels')
  .select('id, platform, account_name, external_account_id, access_token')
  .in('platform', ['facebook', 'instagram'])
  .eq('status', 'active');

if (!canales?.length) salir('no hay canales activos de Facebook/Instagram en sales_channels.');

const fb = canales.find((c) => c.platform === 'facebook');
const ig = canales.find((c) => c.platform === 'instagram');
const viejo = fb?.access_token || canales[0].access_token;

const dbgV = await api(`/debug_token?input_token=${encodeURIComponent(viejo)}`, viejo);
const v = dbgV.body?.data;

if (v?.app_id && n.app_id !== v.app_id) {
  salir(`es de otra app (${n.application}). El sistema está montado sobre "${v.application}".`);
}

const permisosV = new Set(v?.scopes || []);
const permisosN = new Set(n.scopes || []);
const perdidos = [...permisosV].filter((p) => !permisosN.has(p));
const ganados = [...permisosN].filter((p) => !permisosV.has(p));

console.log('\n═══ PERMISOS ═══');
if (ganados.length) console.log(`  + gana  : ${ganados.join(', ')}`);
if (perdidos.length) console.log(`  - PIERDE: ${perdidos.join(', ')}`);
if (!ganados.length && !perdidos.length) console.log('  = los mismos de antes');

// ── 3. ¿ALCANZA LA PÁGINA Y EL INSTAGRAM? ──────────────────
console.log('\n═══ ALCANCE ═══');
let sirve = true;

if (n.type === 'PAGE') {
  if (String(n.profile_id) !== String(fb?.external_account_id)) {
    console.log(`  ✗ es token de la página ${n.profile_id}, no de ${fb?.external_account_id} (${fb?.account_name})`);
    sirve = false;
  } else {
    console.log(`  ✓ página ${fb.account_name} (${fb.external_account_id})`);
  }
} else {
  salir(`es un token de tipo ${n.type}. Hace falta uno de PÁGINA.
    En el Explorador, tras generar el de usuario, cambia el
    desplegable de arriba a "Token de página" → ${fb?.account_name}.`);
}

if (ig) {
  const r = await api(`/${ig.external_account_id}?fields=username`, nuevo);
  if (r.body?.username) console.log(`  ✓ instagram @${r.body.username} (${ig.external_account_id})`);
  else { console.log(`  ✗ no alcanza el instagram: ${r.body?.error?.message || '—'}`); sirve = false; }
}

if (!sirve && !forzar) salir('no se guardó nada. Revisa arriba, o repite con --forzar si sabes lo que haces.');
if (perdidos.length && !forzar) {
  salir(`pierde permisos (${perdidos.join(', ')}) y no se guardó nada.
    Vuelve al Explorador y márcalos antes de generar, o repite
    con --forzar si de verdad quieres bajar el token.`);
}

// ── 4. GUARDAR EN LAS CUATRO FILAS ─────────────────────────
console.log('\n═══ GUARDANDO ═══');
const ahora = new Date().toISOString();

for (const c of canales) {
  const { error } = await supabase
    .from('sales_channels')
    .update({ access_token: nuevo, updated_at: ahora })
    .eq('id', c.id);
  console.log(error ? `  ✗ sales_channels ${c.platform}: ${error.message}` : `  ✓ sales_channels ${c.platform} (${c.account_name})`);
}

const { data: secretos } = await supabase.from('social_account_secrets').select('account_id, access_token');
for (const s of secretos || []) {
  if (s.access_token !== viejo) {
    console.log(`  · social_account_secrets ${s.account_id.slice(0, 8)} tenía otro token (${corto(s.access_token)}), no se toca`);
    continue;
  }
  const { error } = await supabase
    .from('social_account_secrets')
    .update({ access_token: nuevo, updated_at: ahora })
    .eq('account_id', s.account_id);
  console.log(error ? `  ✗ social_account_secrets ${s.account_id.slice(0, 8)}: ${error.message}` : `  ✓ social_account_secrets ${s.account_id.slice(0, 8)}`);
}

console.log(`\n  ${corto(viejo)}  →  ${corto(nuevo)}`);
console.log('\nAhora comprueba con:  npm run meta:estado\n');
