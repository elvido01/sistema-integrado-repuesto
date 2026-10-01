// ============================================================
// Traer a la bandeja los mensajes viejos de Messenger
// ------------------------------------------------------------
// El webhook de la PÁGINA de Facebook no estuvo configurado nunca hasta el
// 30/09/2026: ni un solo mensaje de Messenger entró al CRM antes de eso.
// Ejemplo: Anneris Herrera pidió "un pistón de press cub std" el 08/08 y solo
// recibió la respuesta automática de Business Suite.
//
// Esto los recupera leyendo las conversaciones de la página. Solo lee de
// Facebook y escribe en la base; NO manda ni contesta nada.
//
//   npm run meta:messenger              ← solo mira, no toca nada
//   npm run meta:messenger -- --commit  ← guarda de verdad
//   npm run meta:messenger -- --commit --conversaciones 200
//
// Se puede repetir: la clave es el id del mensaje (mid), lo ya importado no
// se duplica. Usa el mismo id de conversación que el webhook
// (facebook:<pagina>:<cliente>), así que si ese cliente vuelve a escribir
// cae en el mismo hilo.
//
// >>> LA RESPUESTA AUTOMÁTICA NO ES UNA RESPUESTA <<<
// Business Suite contesta solo ("Escríbenos directamente por WhatsApp…") y
// avisa cuando se responde un comentario. Eso se guarda como 'system': se ve
// en el hilo pero NO cuenta como contestado. Si contara, el cliente que solo
// recibió eso saldría como atendido y nadie volvería a mirarlo.
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
const iConv = args.indexOf('--conversaciones');
const tope = iConv >= 0 ? Number(args[iConv + 1]) || 100 : 100;

const G = 'https://graph.facebook.com/v22.0';

const { data: canal } = await supabase
  .from('sales_channels')
  .select('id, tenant_id, account_name, external_account_id, access_token')
  .eq('platform', 'facebook')
  .eq('status', 'active')
  .limit(1)
  .maybeSingle();
if (!canal?.access_token) { console.log('\n✗ No hay canal de Facebook activo con token.\n'); process.exit(1); }

const PAGINA = String(canal.external_account_id);
const pedir = async (url) => {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${canal.access_token}` } });
  const body = await r.json().catch(() => null);
  if (body?.error) throw new Error(`${body.error.code}/${body.error.error_subcode || '-'} ${body.error.message}`);
  return body;
};

// Lo que escribe Business Suite solo. Se reconoce por el texto: la API no
// distingue un mensaje automático de uno escrito por una persona.
const AUTOMATICOS = [
  /escr[ií]benos directamente por whatsapp/i,
  /est[aá]s respondiendo el comentario de un usuario/i,
  /gracias por (tu|su) (inter[eé]s|mensaje)/i,
  /respondi[oó] un anuncio/i,
  /c[oó]mo podemos ayudarte\?/i,
];
const esAutomatico = (t) => AUTOMATICOS.some((re) => re.test(String(t || '')));

function intencion(texto) {
  const t = String(texto || '').toLowerCase();
  if (/precio|cuánto|cuanto|vale|costo|cotiz/.test(t)) return 'precio_cotizacion';
  if (/tienen|hay|disponible|queda|stock|existencia/.test(t)) return 'disponibilidad';
  if (/sirve|compatible|le queda|para mi|año/.test(t)) return 'compatibilidad';
  if (/dónde|donde|ubicad|dirección|direccion|envío|envio|delivery/.test(t)) return 'ubicacion_envio';
  return 'general';
}

console.log(`\n  página   : ${canal.account_name} (${PAGINA})`);
console.log(`  modo     : ${commit ? 'GUARDANDO' : 'solo mirando (agrega --commit para guardar)'}`);
console.log(`  revisando hasta ${tope} conversaciones…\n`);

// ── las conversaciones, con paginación ─────────────────────
const conversaciones = [];
let url = `${G}/${PAGINA}/conversations?platform=messenger&limit=25`
  + `&fields=${encodeURIComponent('id,updated_time,participants,messages.limit(50){id,message,created_time,from}')}`;
while (url && conversaciones.length < tope) {
  const pagina = await pedir(url);
  conversaciones.push(...(pagina.data || []));
  url = pagina.paging?.next || null;
}

const sinResponder = [];
let nuevos = 0, yaEstaban = 0, hilosNuevos = 0;

for (const conv of conversaciones.slice(0, tope)) {
  const cliente = (conv.participants?.data || []).find((p) => String(p.id) !== PAGINA);
  if (!cliente) continue;

  // La API los da del más nuevo al más viejo.
  const mensajes = [...(conv.messages?.data || [])]
    .filter((m) => String(m.message || '').trim())
    .sort((a, b) => String(a.created_time).localeCompare(String(b.created_time)));
  if (!mensajes.length) continue;

  const delCliente = (m) => String(m.from?.id) !== PAGINA;
  const ultimoCliente = [...mensajes].reverse().find(delCliente);
  const respuestaHumana = ultimoCliente && mensajes.some((m) => !delCliente(m) && !esAutomatico(m.message)
    && m.created_time > ultimoCliente.created_time);
  if (ultimoCliente && !respuestaHumana) {
    sinResponder.push({ nombre: cliente.name, fecha: ultimoCliente.created_time.slice(0, 10), texto: ultimoCliente.message });
  }

  const externalConversationId = `facebook:${PAGINA}:${cliente.id}`;
  let convId = null;
  const { data: existente } = await supabase.from('sales_conversations')
    .select('id').eq('tenant_id', canal.tenant_id).eq('platform', 'facebook')
    .eq('external_conversation_id', externalConversationId).maybeSingle();
  convId = existente?.id || null;

  let cabecera = false;
  for (const m of mensajes) {
    const { data: ya } = await supabase.from('sales_messages').select('id')
      .eq('tenant_id', canal.tenant_id).eq('platform', 'facebook').eq('external_message_id', m.id).maybeSingle();
    if (ya) { yaEstaban++; continue; }

    if (!cabecera) { console.log(`── ${cliente.name}${existente ? '' : '  (hilo nuevo)'}`); cabecera = true; }
    const quien = delCliente(m) ? 'cliente' : (esAutomatico(m.message) ? 'automático' : 'nosotros');
    console.log(`   ${m.created_time.slice(0, 16).replace('T', ' ')}  ${quien.padEnd(10)}  ${String(m.message).replace(/\s+/g, ' ').slice(0, 70)}`);
    nuevos++;
    if (!commit) continue;

    if (!convId) {
      const primero = mensajes.find(delCliente) || mensajes[0];
      const { data: creada, error } = await supabase.from('sales_conversations').insert({
        tenant_id: canal.tenant_id,
        channel_id: canal.id,
        platform: 'facebook',
        external_conversation_id: externalConversationId,
        customer_name: cliente.name || cliente.id,
        customer_external_id: cliente.id,
        status: 'nuevo',
        intent: intencion(primero.message),
        bot_enabled: false,
        metadata: { source: 'messenger_importado', conversacion_meta: conv.id },
      }).select('id').single();
      if (error) { console.log(`      ✗ ${error.message}`); break; }
      convId = creada.id;
      hilosNuevos++;
    }

    const { error: errMsg } = await supabase.from('sales_messages').insert({
      tenant_id: canal.tenant_id,
      conversation_id: convId,
      platform: 'facebook',
      sender_type: delCliente(m) ? 'user' : (esAutomatico(m.message) ? 'system' : 'agent'),
      message_type: 'text',
      message_text: String(m.message).trim(),
      external_message_id: m.id,
      status: delCliente(m) ? 'received' : 'sent',
      created_at: m.created_time,
      raw_data: { source: 'messenger_importado', ts: m.created_time, from: m.from, automatico: !delCliente(m) && esAutomatico(m.message) },
    });
    if (errMsg) console.log(`      ✗ ${errMsg.message}`);
  }
  if (cabecera) console.log();
}

console.log('══════════════════════════════════════════');
console.log(`  conversaciones revisadas : ${Math.min(conversaciones.length, tope)}`);
console.log(`  mensajes ya en la bandeja: ${yaEstaban}`);
console.log(`  ${commit ? 'mensajes importados      ' : 'mensajes importables     '}: ${nuevos}`);
if (commit) console.log(`  hilos nuevos             : ${hilosNuevos}`);
if (sinResponder.length) {
  console.log(`\n  SIN RESPUESTA DE UNA PERSONA (${sinResponder.length}) — solo recibieron la automática o nada:`);
  for (const s of sinResponder) console.log(`    ${s.fecha}  ${String(s.nombre).padEnd(26)}  "${String(s.texto).replace(/\s+/g, ' ').slice(0, 60)}"`);
}
if (!commit) console.log('\n  No se guardó nada. Repite con --commit.');
console.log();
