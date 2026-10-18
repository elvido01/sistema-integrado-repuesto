// ============================================================
// ZERNIO — API unificada de mensajes (Instagram DM, Messenger…)
// ============================================================
// (16/10/2026) Por Zernio entran los mensajes de Messenger y salen las
// respuestas de Instagram y Messenger, que por la app propia de Meta siguen
// esperando el Acceso Avanzado. La llave es la de la cuenta de Repuestos
// Morla (secreto ZERNIO_API_KEY); qué cuenta de Zernio es de qué empresa
// lo dice public.zernio_cuentas (sql/zernio_cuentas.sql).
// Documentación: https://docs.zernio.com · https://zernio.com/openapi.json
// ============================================================
// @ts-nocheck

const BASE = 'https://zernio.com/api/v1';

export function hayZernio() {
  return !!Deno.env.get('ZERNIO_API_KEY');
}

export async function zernio(ruta: string, { method = 'GET', body = null, idempotencia = null } = {}) {
  const key = Deno.env.get('ZERNIO_API_KEY');
  if (!key) return { ok: false, status: 0, body: { error: 'ZERNIO_API_KEY no configurada' } };
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  if (body) headers['Content-Type'] = 'application/json';
  if (idempotencia) headers['Idempotency-Key'] = idempotencia;
  const r = await fetch(`${BASE}${ruta}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const texto = await r.text();
  let j: any; try { j = JSON.parse(texto); } catch { j = { raw: texto.slice(0, 500) }; }
  return { ok: r.ok, status: r.status, body: j };
}

// La cuenta de Zernio de esta empresa en esta red (la que corresponde a la
// cuenta que el CRM ya conoce: social_accounts.external_account_id).
export async function cuentaZernio(supabase: any, tenantId: string, platform: string, externalAccountId: string | null) {
  let q = supabase.from('zernio_cuentas').select('zernio_account_id, external_account_id')
    .eq('tenant_id', tenantId).eq('platform', platform).eq('activo', true);
  if (externalAccountId) q = q.eq('external_account_id', externalAccountId);
  const { data } = await q.limit(1);
  return data?.[0] || null;
}

// El id de la conversación en Zernio. Se guarda en metadata.zernio_conversation_id
// cuando la conversación entró por Zernio; si entró por el webhook de Meta, se
// busca por el id del cliente (participantId) y se recuerda.
export async function conversacionZernio(supabase: any, conversacion: any, zernioAccountId: string, participantId: string) {
  const guardado = conversacion?.metadata?.zernio_conversation_id;
  if (guardado) return guardado;
  let cursor = null;
  for (let pagina = 0; pagina < 5; pagina++) {
    const r = await zernio(`/inbox/conversations?accountId=${encodeURIComponent(zernioAccountId)}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (!r.ok) return null;
    const hallada = (r.body?.data || []).find((c: any) => String(c.participantId) === String(participantId));
    if (hallada) {
      await supabase.from('sales_conversations')
        .update({ metadata: { ...(conversacion.metadata || {}), zernio_conversation_id: hallada.id, zernio_account_id: zernioAccountId } })
        .eq('id', conversacion.id);
      return hallada.id;
    }
    cursor = r.body?.pagination?.nextCursor;
    if (!r.body?.pagination?.hasMore || !cursor) break;
  }
  return null;
}

// Enviar un texto por Zernio. Idempotente por el id de nuestro mensaje: si la
// llamada se repite, Zernio no lo manda dos veces.
//
// (18/10/2026) humano=true: respuesta escrita por una persona fuera de la
// ventana de 24 h. Meta la admite hasta 7 días después del último mensaje
// del cliente con la etiqueta HUMAN_AGENT (en Instagram es la única).
export async function enviarPorZernio({ conversationId, accountId, texto, idMensaje, humano = false }) {
  const body: any = { accountId, message: texto };
  if (humano) { body.messagingType = 'MESSAGE_TAG'; body.messageTag = 'HUMAN_AGENT'; }
  return zernio(`/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST', body, idempotencia: humano ? `${idMensaje}:humano` : idMensaje,
  });
}

// ¿Zernio lo rechazó porque se cerró la ventana de 24 h? (subcode 2534022)
export function ventanaCerrada(body: any) {
  return Number(body?.platformError?.subcode) === 2534022 || /2534022/.test(String(body?.error || ''));
}
