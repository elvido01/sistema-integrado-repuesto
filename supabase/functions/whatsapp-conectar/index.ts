// ============================================================
// whatsapp-conectar — termina la conexión de WhatsApp oficial de una empresa
// ============================================================
// (19/11/2026) La pantalla Configuración → Conexiones abre la ventana de Meta
// (registro integrado v4 + coexistencia). Al terminar, Meta le da a la página
// tres cosas: el código, waba_id y phone_number_id. La página los manda aquí
// y esta función, en el servidor:
//   1. Cambia el código por el permiso de la empresa (oauth/access_token).
//   2. Lee el número y el nombre que muestra WhatsApp.
//   3. Suscribe la app "MotoFlow" a los avisos de esa cuenta (subscribed_apps).
//   4. Coexistencia: NO registra el número (ya está en la app del teléfono).
//      Pide UNA vez contactos e historial de 6 meses (smb_app_data). Meta
//      solo deja pedirlos en las primeras 24 h.
//   5. Guarda whatsapp_conexiones (la empresa la ve) y el permiso en
//      whatsapp_conexion_secretos (nadie lo lee desde la web).
//
// Llama: usuario con sesión (JWT), dueño o administrador de la empresa ACTIVA
// (get_user_tenant). Secretos: WHATSAPP_OFICIAL_APP_ID,
// WHATSAPP_OFICIAL_APP_SECRET. Versión de Graph: WHATSAPP_GRAPH_VERSION (v23.0).
// ============================================================
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

  const appId = Deno.env.get('WHATSAPP_OFICIAL_APP_ID');
  const appSecret = Deno.env.get('WHATSAPP_OFICIAL_APP_SECRET');
  if (!appId || !appSecret) return json({ ok: false, error: 'WhatsApp oficial todavía no está configurado en MotoFlow.' }, 503);
  const graph = `https://graph.facebook.com/${Deno.env.get('WHATSAPP_GRAPH_VERSION') || 'v23.0'}`;

  // ── Quién llama y de qué empresa ──
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ ok: false, error: 'Sin sesión' }, 401);
  const base = Deno.env.get('SUPABASE_URL')!;
  const comoUsuario = createClient(base, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const sb = createClient(base, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const { data: u } = await comoUsuario.auth.getUser(jwt);
  const userId = u?.user?.id;
  if (!userId) return json({ ok: false, error: 'Sesión vencida' }, 401);
  const { data: tenantId, error: eT } = await comoUsuario.rpc('get_user_tenant');
  if (eT || !tenantId) return json({ ok: false, error: 'No se encontró la empresa activa' }, 400);
  if (!(await esAdmin(sb, userId, tenantId))) return json({ ok: false, error: 'Solo el dueño o un administrador puede conectar WhatsApp.' }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'json' }, 400); }
  const code = String(body?.code || '').trim();
  const wabaId = String(body?.waba_id || '').trim();
  const phoneNumberId = String(body?.phone_number_id || '').trim();
  const coexistencia = body?.coexistencia !== false;   // la ventana lo indica; por defecto, coexistencia
  if (!code || !/^\d+$/.test(wabaId) || !/^\d+$/.test(phoneNumberId)) {
    return json({ ok: false, error: 'Faltan los datos que devuelve Meta (código, cuenta y número).' }, 400);
  }

  // Ese número no puede estar ya conectado en OTRA empresa.
  const { data: ajena } = await sb.from('whatsapp_conexiones').select('tenant_id, estado')
    .eq('phone_number_id', phoneNumberId).maybeSingle();
  if (ajena && ajena.tenant_id !== tenantId && ajena.estado !== 'desconectado') {
    return json({ ok: false, error: 'Ese número ya está conectado en otra empresa de MotoFlow.' }, 409);
  }

  try {
    // 1. Código → permiso de la empresa.
    const t = await graphGet(`${graph}/oauth/access_token?client_id=${appId}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`);
    const token = t.access_token;
    if (!token) throw new Error('Meta no devolvió el permiso');
    const auth = { Authorization: `Bearer ${token}` };

    // 2. Número y nombre visibles.
    const num = await graphGet(`${graph}/${phoneNumberId}?fields=display_phone_number,verified_name`, auth);

    // 3. Avisos de esta cuenta → whatsapp-oficial.
    await graphPost(`${graph}/${wabaId}/subscribed_apps`, auth, {});

    // 5 (antes que 4: si la sincronización falla, la conexión queda guardada).
    const ahora = new Date().toISOString();
    const fila = {
      tenant_id: tenantId, waba_id: wabaId, phone_number_id: phoneNumberId,
      numero: num.display_phone_number || null, nombre_visible: num.verified_name || null,
      modo: coexistencia ? 'coexistencia' : 'cloud', estado: 'conectado',
      motivo_desconexion: null, desconectado_at: null, conectado_at: ahora, conectado_por: userId,
      ultimo_error: null, historial_progreso: null, historial_rechazado: false, updated_at: ahora,
    };
    // Si la empresa tenía otro número vivo, se da por desconectado (una viva por empresa).
    await sb.from('whatsapp_conexiones').update({ estado: 'desconectado', desconectado_at: ahora, motivo_desconexion: 'REEMPLAZADO', updated_at: ahora })
      .eq('tenant_id', tenantId).neq('phone_number_id', phoneNumberId).neq('estado', 'desconectado').select('id');
    const { data: cx, error: eC } = await sb.from('whatsapp_conexiones')
      .upsert(fila, { onConflict: 'phone_number_id' }).select('id').single();
    if (eC) throw new Error(`guardar conexión: ${eC.message}`);
    const { error: eS } = await sb.from('whatsapp_conexion_secretos')
      .upsert({ conexion_id: cx.id, access_token: token, updated_at: ahora }, { onConflict: 'conexion_id' });
    if (eS) throw new Error(`guardar permiso: ${eS.message}`);

    // 4. Coexistencia: contactos + historial (una vez; un fallo no deshace la conexión).
    const avisos: string[] = [];
    if (coexistencia) {
      for (const [tipo, col] of [['smb_app_state_sync', 'contactos_pedido_at'], ['history', 'historial_pedido_at']]) {
        try {
          await graphPost(`${graph}/${phoneNumberId}/smb_app_data`, auth, { messaging_product: 'whatsapp', sync_type: tipo });
          await sb.from('whatsapp_conexiones').update({ [col]: new Date().toISOString() }).eq('id', cx.id).select('id');
        } catch (e) {
          avisos.push(`${tipo}: ${e?.message || e}`);
        }
      }
      if (avisos.length) {
        await sb.from('whatsapp_conexiones').update({ ultimo_error: avisos.join(' · ').slice(0, 500) }).eq('id', cx.id).select('id');
      }
    }

    return json({ ok: true, conexion_id: cx.id, numero: fila.numero, nombre: fila.nombre_visible, avisos });
  } catch (e) {
    console.error('[whatsapp-conectar]', e?.message || e);
    return json({ ok: false, error: `No se pudo conectar: ${e?.message || e}` }, 502);
  }
});

async function esAdmin(sb: any, userId: string, tenantId: string) {
  const [{ data: ue }, { data: pr }] = await Promise.all([
    sb.from('usuarios_empresas').select('rol').eq('user_id', userId).eq('tenant_id', tenantId).in('rol', ['owner', 'admin']).limit(1), // revisado: solo importa si existe alguna fila
    sb.from('profiles').select('role, is_superadmin, tenant_id').eq('id', userId).maybeSingle(),
  ]);
  return !!(ue?.length || pr?.is_superadmin || (pr?.tenant_id === tenantId && ['owner', 'admin'].includes(pr?.role)));
}

async function graphGet(url: string, headers: Record<string, string> = {}) {
  const r = await fetch(url, { headers });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) throw new Error(j?.error?.message || `Meta respondió ${r.status}`);
  return j;
}
async function graphPost(url: string, headers: Record<string, string>, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) throw new Error(j?.error?.message || `Meta respondió ${r.status}`);
  return j;
}
function json(p: unknown, status = 200) {
  return new Response(JSON.stringify(p), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
