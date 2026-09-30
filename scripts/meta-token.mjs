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

// La salida (nunca el token entero: solo `corto()`) queda tambien en
// scripts/.meta-token-ultimo.log, para revisarla sin copiar la terminal.
import { appendFileSync, writeFileSync } from 'node:fs';
const LOG = path.join(RAIZ, 'scripts/.meta-token-ultimo.log');
try { writeFileSync(LOG, `${new Date().toISOString()}\n`); } catch { /* sin log no pasa nada */ }
const logOriginal = console.log;
console.log = (...a) => { logOriginal(...a); try { appendFileSync(LOG, `${a.join(' ')}\n`); } catch { /* idem */ } };
process.on('uncaughtException', (e) => { console.log(`\n✗ ERROR: ${e?.message || e}`); process.exit(1); });
process.on('unhandledRejection', (e) => { console.log(`\n✗ ERROR: ${e?.message || e}`); process.exit(1); });
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
let nuevo = args.find((a) => !a.startsWith('--'));

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
let dbgN = await api(`/debug_token?input_token=${encodeURIComponent(nuevo)}`, nuevo);
let n = dbgN.body?.data;
if (!n?.is_valid) salir(`no sirve: ${dbgN.body?.error?.message || JSON.stringify(dbgN.body)}`);

// (30/09/2026) Si pegan el token de USUARIO se saca aqui el de la pagina, que
// hereda sus permisos. Cambiar el desplegable del Explorador a "token de
// pagina" fallo tres veces seguidas: el paso sobraba.
if (n.type === 'USER') {
  // El token de usuario del Explorador dura ~1-2 horas, y la pagina sacada de
  // el caduca igual: el 30/09 se guardo uno a las 14:18 y murio a las 16:00,
  // tumbando publicar, medir y responder. Solo sirve el de usuario de LARGA
  // duracion (60 dias): de ese sale una pagina que no caduca.
  const horas = n.expires_at ? (n.expires_at * 1000 - Date.now()) / 3600000 : Infinity;
  if (horas < 48) {
    salir(`es un token de usuario de CORTA duración (caduca en ${Math.max(0, horas).toFixed(1)} h).
    La página que saldría de él caduca igual. Antes de pegarlo, extiéndelo:
      https://developers.facebook.com/tools/debug/accesstoken → pega el token → Depurar
      → abajo "Extender token de acceso" → copia el token NUEVO que aparece.
    Y pega ese aquí.`);
  }
  const { data: fbCanal } = await supabase.from('sales_channels')
    .select('external_account_id, account_name').eq('platform', 'facebook').eq('status', 'active')
    .limit(1).maybeSingle();
  const cuentas = await api('/me/accounts?fields=id,name,access_token&limit=100', nuevo);
  const pagina = (cuentas.body?.data || []).find((p) => String(p.id) === String(fbCanal?.external_account_id));
  if (!pagina?.access_token) {
    salir(`es un token de usuario y no alcanza la página ${fbCanal?.account_name || ''} (${fbCanal?.external_account_id}).
    Al generarlo, en la ventana de Facebook marca esa página.`);
  }
  console.log(`  (era de usuario: se sacó el de la página ${pagina.name})`);
  nuevo = pagina.access_token;
  dbgN = await api(`/debug_token?input_token=${encodeURIComponent(nuevo)}`, nuevo);
  n = dbgN.body?.data;
  if (!n?.is_valid) salir(`el de la página no sirve: ${dbgN.body?.error?.message || JSON.stringify(dbgN.body)}`);
}

// Un token de página que caduca pronto no se guarda nunca, venga de donde venga.
if (n.type === 'PAGE' && n.expires_at && (n.expires_at * 1000 - Date.now()) < 7 * 86400000) {
  salir(`el token de página caduca el ${new Date(n.expires_at * 1000).toLocaleString('es-DO')}: no se guarda.
    Sale de un token de usuario de corta duración. Extiéndelo primero en
    https://developers.facebook.com/tools/debug/accesstoken ("Extender token de acceso").`);
}

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
