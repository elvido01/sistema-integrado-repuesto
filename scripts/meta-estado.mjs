// ============================================================
// Estado de los canales de Meta (Facebook + Instagram)
// ------------------------------------------------------------
// Contesta, sin abrir el panel de Meta, las tres preguntas que
// deciden si el CRM puede recibir y responder:
//
//   1. ¿El token sirve todavía, y hasta cuándo?
//   2. ¿La página está suscrita a la app (por eso entran los DM)?
//   3. ¿Se puede RESPONDER, o el permiso está en Acceso Estándar?
//
// La tercera se prueba mandando un indicador de "escribiendo…"
// (sender_action: typing_on). Usa el mismo endpoint, el mismo
// token y los mismos permisos que una respuesta de verdad, pero
// NO le manda ningún mensaje al cliente.
//
//   node scripts/meta-estado.mjs
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
const api = async (ruta, token, init) => {
  const sep = ruta.includes('?') ? '&' : '?';
  const r = await fetch(`${G}${ruta}${sep}access_token=${encodeURIComponent(token)}`, init);
  return { status: r.status, ok: r.ok, body: await r.json().catch(() => null) };
};

const { data: canales } = await supabase
  .from('sales_channels')
  .select('platform, account_name, external_account_id, access_token, status')
  .in('platform', ['facebook', 'instagram'])
  .eq('status', 'active');

if (!canales?.length) {
  console.log('No hay canales de Facebook/Instagram activos en sales_channels.');
  process.exit(0);
}

const page = canales.find((c) => c.platform === 'facebook');
const token = page?.access_token || canales[0].access_token;

// ── 1. EL TOKEN ────────────────────────────────────────────
console.log('\n═══ TOKEN ═══');
const dbg = await api(`/debug_token?input_token=${encodeURIComponent(token)}`, token);
const d = dbg.body?.data;
if (!d?.is_valid) {
  console.log('  ✗ NO SIRVE:', dbg.body?.error?.message || JSON.stringify(dbg.body));
  console.log('    Hay que reconectar la página desde el módulo de redes sociales.');
  process.exit(1);
}
console.log(`  ✓ válido · app "${d.application}" · tipo ${d.type}`);
if (d.data_access_expires_at) {
  const vence = new Date(d.data_access_expires_at * 1000);
  const dias = Math.round((vence - Date.now()) / 86400000);
  const señal = dias <= 0 ? '✗ VENCIDO' : dias <= 14 ? '⚠ ' : '  ';
  console.log(`  ${señal} acceso a datos hasta ${vence.toISOString().slice(0, 10)} (${dias} días)`);
  if (dias > 0 && dias <= 14) {
    console.log('    Renuévalo entrando de nuevo por "Conectar con Facebook" o los dos canales se caen ese día.');
  }
}

// ── 2. LA SUSCRIPCIÓN (por eso llegan los mensajes) ────────
console.log('\n═══ ENTRADA DE MENSAJES ═══');
if (page) {
  const sub = await api(`/${page.external_account_id}/subscribed_apps`, token);
  const campos = sub.body?.data?.[0]?.subscribed_fields || [];
  console.log(campos.includes('messages')
    ? `  ✓ la página recibe: ${campos.join(', ')}`
    : `  ✗ la página NO está suscrita a "messages" — los DM no van a entrar. ${JSON.stringify(sub.body).slice(0, 160)}`);
} else {
  console.log('  ? no hay canal de Facebook: sin página no entran los DM de Instagram');
}

// ── 3. LA SALIDA (aquí es donde se cae) ────────────────────
console.log('\n═══ RESPUESTA AUTOMÁTICA ═══');
for (const canal of canales) {
  const etiqueta = canal.platform === 'instagram' ? 'Instagram' : 'Facebook ';
  // Instagram se responde por el id de la PÁGINA, no por el de IG.
  const emisor = canal.platform === 'instagram' ? page?.external_account_id : canal.external_account_id;
  if (!emisor) { console.log(`  ${etiqueta}: sin página desde donde responder`); continue; }

  // A quién probarle: primero el último que NOS escribió (lo sabemos por el
  // webhook, y si es de hoy cae dentro de las 24h, así que el resultado no
  // se confunde con un error de ventana). Si no hay, el hilo más reciente
  // que devuelva Meta.
  const { data: ult } = await supabase
    .from('meta_webhook_events')
    .select('sender_id')
    .eq('platform', canal.platform)
    .not('sender_id', 'is', null)
    .order('received_at', { ascending: false })
    .limit(1);
  let destino = ult?.[0]?.sender_id || null;

  if (!destino) {
    const filtro = canal.platform === 'instagram' ? '&platform=instagram' : '';
    const hilos = await api(`/${page.external_account_id}/conversations?fields=participants,updated_time&limit=1${filtro}`, token);
    const partes = hilos.body?.data?.[0]?.participants?.data || [];
    destino = partes.find((p) => p.id !== page.external_account_id && p.id !== canal.external_account_id)?.id || null;
  }
  if (!destino) { console.log(`  ${etiqueta}: no hay ninguna conversación con la cual probar`); continue; }

  const prueba = await api(`/${emisor}/messages`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: destino }, sender_action: 'typing_on' }),
  });

  const err = prueba.body?.error;
  const cod = `${err?.code}/${err?.error_subcode || 0}`;
  if (prueba.ok) {
    console.log(`  ${etiqueta}: ✓ PUEDE RESPONDER`);
  } else if (err?.code === 10) {
    // Fuera de las 24h. El permiso está bien: este error saldría igual con
    // todo aprobado, porque el último mensaje de ese hilo es viejo.
    console.log(`  ${etiqueta}: ✓ permiso OK (solo fuera de la ventana de 24h · ${cod})`);
  } else if (err?.code === 200 || err?.code === 3) {
    console.log(`  ${etiqueta}: ✗ ACCESO ESTÁNDAR — falta Acceso Avanzado (${cod})`);
    console.log(`             ${err.message}`);
  } else {
    console.log(`  ${etiqueta}: ✗ ${cod} · ${err?.message || JSON.stringify(prueba.body).slice(0, 200)}`);
  }
}

// ── 4. QUÉ HA ENTRADO DE VERDAD ────────────────────────────
const { data: ev } = await supabase
  .from('meta_webhook_events')
  .select('received_at, platform, event_type, status, error_message')
  .order('received_at', { ascending: false })
  .limit(5);
console.log('\n═══ ÚLTIMOS EVENTOS RECIBIDOS ═══');
for (const e of ev || []) {
  console.log(`  ${String(e.received_at).slice(0, 16).replace('T', ' ')}  ${e.platform.padEnd(9)} ${e.event_type.padEnd(12)} ${e.status}${e.error_message ? ' · ' + e.error_message : ''}`);
}
if (!ev?.length) console.log('  (ninguno)');
console.log('');
