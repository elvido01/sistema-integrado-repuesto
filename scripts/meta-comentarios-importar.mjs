// ============================================================
// Traer a la bandeja los comentarios viejos de Instagram
// ------------------------------------------------------------
// Un webhook solo avisa de lo que pasa desde que existe. La entrada
// de comentarios se activó el 11/08/2026, así que todo lo anterior
// —meses de gente preguntando precios— no llegó nunca al CRM y no
// va a llegar: Meta no reenvía lo viejo.
//
// Esto lo recupera leyendo las publicaciones una por una. Solo lee
// de Instagram y escribe en la base; NO publica ni contesta nada.
//
//   npm run meta:comentarios              ← solo mira, no toca nada
//   npm run meta:comentarios -- --commit  ← guarda de verdad
//   npm run meta:comentarios -- --commit --medios 50
//
// Se puede repetir sin miedo: la clave es el id del comentario, así
// que lo ya importado no se duplica ni se pisa. Las conversaciones
// que ya existan no se tocan — ni su estado ni su último mensaje —
// para que importar algo de enero no mande al principio de la cola
// a un cliente que escribió ayer.
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

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const cuantos = Number(args[args.indexOf('--medios') + 1]) || 25;

const G = 'https://graph.facebook.com/v21.0';

// ── de qué cuenta hablamos ─────────────────────────────────
const { data: canal } = await supabase
  .from('sales_channels')
  .select('id, tenant_id, platform, account_name, external_account_id, access_token')
  .eq('platform', 'instagram')
  .eq('status', 'active')
  .limit(1)
  .maybeSingle();

if (!canal) { console.log('\n✗ No hay canal de Instagram activo.\n'); process.exit(1); }

const token = canal.access_token;
const api = async (ruta) => {
  const sep = ruta.includes('?') ? '&' : '?';
  const r = await fetch(`${G}${ruta}${sep}access_token=${encodeURIComponent(token)}`);
  const body = await r.json().catch(() => null);
  if (body?.error) throw new Error(`${body.error.code}/${body.error.error_subcode || '-'} ${body.error.message}`);
  return body;
};

// El nombre de la tienda, para no confundir nuestras propias respuestas
// con las de un cliente. Se pregunta en vez de escribirlo a mano: si
// mañana el negocio se cambia el usuario de Instagram, esto sigue bien.
const yo = await api(`/${canal.external_account_id}?fields=username`);
const NOSOTROS = yo.username;

console.log(`\n  cuenta   : @${NOSOTROS} (${canal.external_account_id})`);
console.log(`  empresa  : ${canal.account_name}`);
console.log(`  modo     : ${commit ? 'GUARDANDO' : 'solo mirando (agrega --commit para guardar)'}`);
console.log(`  revisando las últimas ${cuantos} publicaciones…\n`);

// ── qué quiere el cliente, a ojo ───────────────────────────
// Lo mismo que hace el webhook con los mensajes: no es adivinar, es
// que la bandeja pueda ordenarse por lo que urge.
function intencion(texto) {
  const t = texto.toLowerCase();
  if (/precio|cuánto|cuanto|vale|costo|cotiz/.test(t)) return 'precio_cotizacion';
  if (/tienen|hay|disponible|queda|stock|existencia/.test(t)) return 'disponibilidad';
  if (/sirve|compatible|le queda|para mi|año/.test(t)) return 'compatibilidad';
  if (/dónde|donde|ubicad|dirección|direccion|envío|envio|delivery/.test(t)) return 'ubicacion_envio';
  return 'general';
}

// ── recorrer las publicaciones ─────────────────────────────
const medios = (await api(`/${canal.external_account_id}/media?fields=id,caption,permalink,timestamp,comments_count&limit=${cuantos}`)).data || [];

const pendientes = [];
let leidos = 0, nuevos = 0, yaEstaban = 0, respuestasNuestras = 0;

for (const medio of medios) {
  if (!medio.comments_count) continue;

  let comentarios = [];
  try {
    comentarios = (await api(`/${medio.id}/comments?fields=id,text,timestamp,from{id,username},replies{id,text,timestamp,from{id,username}}&limit=50`)).data || [];
  } catch (e) {
    console.log(`  ⚠ no se pudieron leer los comentarios de ${medio.permalink}: ${e.message}`);
    continue;
  }

  const titulo = String(medio.caption || '(sin texto)').split('\n')[0].slice(0, 58);
  let cabecera = false;

  for (const c of comentarios) {
    const autor = c.from?.username || '';
    const autorId = c.from?.id || '';
    const texto = String(c.text || '').trim();
    if (!texto || !autorId || autor === NOSOTROS) continue;

    leidos++;
    const respuestas = c.replies?.data || [];
    const contestado = respuestas.some((r) => r.from?.username === NOSOTROS);
    if (!contestado) pendientes.push({ autor, texto, fecha: c.timestamp?.slice(0, 10), enlace: medio.permalink });

    if (!cabecera) { console.log(`── ${titulo}`); cabecera = true; }

    // ¿ya lo tenemos?
    const { data: existe } = await supabase
      .from('sales_messages')
      .select('id')
      .eq('tenant_id', canal.tenant_id)
      .eq('platform', 'instagram')
      .eq('external_message_id', c.id)
      .maybeSingle();

    if (existe) {
      yaEstaban++;
      console.log(`   · @${autor} "${texto.slice(0, 50)}" — ya estaba`);
      continue;
    }

    nuevos++;
    console.log(`   ${contestado ? '✓' : '✗'} @${autor} ${c.timestamp?.slice(0, 10)} "${texto.slice(0, 50)}"${contestado ? '' : '  ← SIN RESPONDER'}`);
    if (!commit) continue;

    // ── la conversación ──
    const externalConversationId = `instagram:${canal.external_account_id}:${autorId}`;
    let convId;

    const { data: conv } = await supabase
      .from('sales_conversations')
      .select('id')
      .eq('tenant_id', canal.tenant_id)
      .eq('platform', 'instagram')
      .eq('external_conversation_id', externalConversationId)
      .maybeSingle();

    if (conv) {
      // Existe ya. No se toca nada suyo: importar un comentario de enero
      // no debe cambiarle el estado ni el resumen a alguien que escribió hoy.
      convId = conv.id;
    } else {
      const { data: creada, error } = await supabase
        .from('sales_conversations')
        .insert({
          tenant_id: canal.tenant_id,
          channel_id: canal.id,
          platform: 'instagram',
          external_conversation_id: externalConversationId,
          customer_name: autor || autorId,
          customer_external_id: autorId,
          status: 'nuevo',
          intent: intencion(texto),
          bot_enabled: false,
          last_message_preview: `💬 ${texto}`.slice(0, 180),
          metadata: { source: 'comentarios_importados', media_id: medio.id, permalink: medio.permalink },
        })
        .select('id')
        .single();
      if (error) { console.log(`      ✗ ${error.message}`); continue; }
      convId = creada.id;
    }

    // ── el comentario ──
    const { error: errMsg } = await supabase.from('sales_messages').insert({
      tenant_id: canal.tenant_id,
      conversation_id: convId,
      platform: 'instagram',
      sender_type: 'user',
      message_type: 'comment',
      message_text: texto,
      external_message_id: c.id,
      status: 'received',
      created_at: c.timestamp || new Date().toISOString(),
      // Con el id del comentario y el de la publicación se puede responder
      // después sin volver a preguntarle nada a Meta.
      raw_data: {
        id: c.id,
        text: texto,
        from: c.from,
        media: { id: medio.id, permalink: medio.permalink },
        source: 'importado_api',
      },
    });
    if (errMsg) { console.log(`      ✗ ${errMsg.message}`); continue; }

    // ── lo que ya se le contestó ──
    // Va como 'agent': lo escribió la respuesta rápida de Instagram o una
    // persona, no MotoFlow. Sin esto el hilo mentiría por omisión y quien
    // atienda contestaría dos veces lo mismo.
    for (const r of respuestas) {
      if (r.from?.username !== NOSOTROS) continue;
      const { error: errR } = await supabase.from('sales_messages').insert({
        tenant_id: canal.tenant_id,
        conversation_id: convId,
        platform: 'instagram',
        sender_type: 'agent',
        message_type: 'comment',
        message_text: String(r.text || '').trim(),
        external_message_id: r.id,
        status: 'sent',
        created_at: r.timestamp || c.timestamp,
        raw_data: { id: r.id, respuesta_a: c.id, media: { id: medio.id, permalink: medio.permalink }, source: 'importado_api' },
      });
      if (!errR) respuestasNuestras++;
    }
  }
  if (cabecera) console.log();
}

// ── resumen ────────────────────────────────────────────────
console.log('══════════════════════════════════════════');
console.log(`  comentarios de clientes leídos : ${leidos}`);
console.log(`  ya estaban en la bandeja       : ${yaEstaban}`);
console.log(`  ${commit ? 'importados' : 'importables'}${' '.repeat(commit ? 21 : 20)}: ${nuevos}`);
if (commit) console.log(`  respuestas nuestras guardadas  : ${respuestasNuestras}`);

if (pendientes.length) {
  console.log(`\n  SIN RESPONDER (${pendientes.length}):`);
  for (const p of pendientes) {
    console.log(`    @${p.autor}  ${p.fecha}  "${p.texto.slice(0, 60)}"`);
    console.log(`       ${p.enlace}`);
  }
}
if (!commit) console.log('\n  No se guardó nada. Repite con --commit.');
console.log();
