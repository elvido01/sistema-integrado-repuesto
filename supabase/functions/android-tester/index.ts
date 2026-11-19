// ============================================================
// android-tester — anota un tester de la app Android y le manda el enlace
// ============================================================
// (19/11/2026) Botón "Instalar en Android" (login e Inicio). La página ya
// registró el correo con la RPC registrar_tester_android; aquí, en el servidor:
//   1. Se mete el correo al grupo de Google que es tester de la prueba
//      cerrada en Play (Cloud Identity Groups API, cuenta de servicio con rol
//      de administrador de grupos). Play solo acepta GRUPOS como testers por
//      API: por eso el grupo.
//   2. Se le manda el correo con el enlace (Resend).
// Si falta configuración, el correo queda anotado y pendiente: cuando se
// pongan los secretos, {accion:'pendientes'} (con la service role) los procesa.
//
// Sin JWT (el login no tiene sesión). Solo actúa sobre correos que ya están
// en android_testers, no reenvía antes de 10 min y topa 80 correos al día.
// Secretos: ANDROID_TESTERS_SA_JSON (cuenta de servicio), ANDROID_TESTERS_GRUPO
// (correo del grupo), RESEND_API_KEY, ANDROID_TESTERS_FROM ("MotoFlow <app@motoflow.com.do>").
// ============================================================
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { correoValido, puedeReenviar, membresiaOk, correoBienvenida, TOPE_CORREOS_DIA } from '../_shared/androidTesters.mjs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: 'json' }, 400); }
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  try {
    // Reintentar los que quedaron pendientes (solo con la service role).
    if (body?.accion === 'pendientes') {
      const auth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      if (auth !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return json({ ok: false, error: 'no' }, 403);
      const { data: filas } = await sb.from('android_testers').select('email, en_grupo_at, correo_enviado_at')
        .or('en_grupo_at.is.null,correo_enviado_at.is.null').order('created_at', { ascending: true }).limit(50);
      const res = [];
      for (const f of filas || []) res.push({ email: f.email, ...(await procesar(sb, f)) });
      return json({ ok: true, procesados: res });
    }

    const email = correoValido(body?.email);
    if (!email) return json({ ok: false, error: 'Escribe un correo válido.' }, 400);
    const { data: fila } = await sb.from('android_testers').select('email, en_grupo_at, correo_enviado_at')
      .eq('email', email).maybeSingle();
    if (!fila) return json({ ok: false, error: 'Ese correo no está anotado.' }, 404);
    return json({ ok: true, ...(await procesar(sb, fila)) });
  } catch (e) {
    console.error('[android-tester]', e?.message || e);
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});

async function procesar(sb: any, fila: any) {
  const errores: string[] = [];
  let enGrupo = !!fila.en_grupo_at;
  let correo = !!fila.correo_enviado_at;
  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // 1. Al grupo de testers (solo con grupo de Cloud Identity configurado; con
  //    el grupo gratis de Google Groups la persona se une sola desde el correo).
  const grupoApi = !!Deno.env.get('ANDROID_TESTERS_GRUPO');
  if (grupoApi && !enGrupo) {
    const r = await agregarAlGrupo(fila.email);
    if (r.ok) { enGrupo = true; cambios.en_grupo_at = new Date().toISOString(); } else errores.push(r.error);
  }

  // 2. El correo con el enlace (con grupo por API, solo cuando ya está dentro).
  if ((enGrupo || !grupoApi) && puedeReenviar(fila.correo_enviado_at) && !correo) {
    const r = await mandarCorreo(sb, fila.email);
    if (r.ok) { correo = true; cambios.correo_enviado_at = new Date().toISOString(); } else errores.push(r.error);
  }

  cambios.ultimo_error = errores.length ? errores.join(' · ').slice(0, 500) : null;
  await sb.from('android_testers').update(cambios).eq('email', fila.email).select('id');
  return { en_grupo: enGrupo, correo_enviado: correo, pendiente: grupoApi && !enGrupo };
}

// ── Cloud Identity: meter el correo al grupo ─────────────────────────
let grupoCache: string | null = null;
async function agregarAlGrupo(email: string) {
  const saTxt = Deno.env.get('ANDROID_TESTERS_SA_JSON');
  const grupo = Deno.env.get('ANDROID_TESTERS_GRUPO');
  if (!saTxt || !grupo) return { ok: false, error: 'sin_config_grupo' };
  try {
    const token = await tokenGoogle(JSON.parse(saTxt), 'https://www.googleapis.com/auth/cloud-identity.groups');
    const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    if (!grupoCache) {
      const r = await fetch(`https://cloudidentity.googleapis.com/v1/groups:lookup?groupKey.id=${encodeURIComponent(grupo)}`, { headers: h });
      const j = await r.json().catch(() => ({}));
      if (!j.name) return { ok: false, error: `grupo: ${j.error?.message || r.status}` };
      grupoCache = j.name;
    }
    const r = await fetch(`https://cloudidentity.googleapis.com/v1/${grupoCache}/memberships`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ preferredMemberKey: { id: email }, roles: [{ name: 'MEMBER' }] }),
    });
    const j = await r.json().catch(() => ({}));
    return membresiaOk(r.status, j) ? { ok: true } : { ok: false, error: `miembro: ${j.error?.message || r.status}` };
  } catch (e) {
    return { ok: false, error: `grupo: ${e?.message || e}` };
  }
}

async function tokenGoogle(sa: any, scope: string) {
  const b64 = (s: string | Uint8Array) => btoa(typeof s === 'string' ? s : String.fromCharCode(...s))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const ahora = Math.floor(Date.now() / 1000);
  const cuerpo = `${b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64(JSON.stringify({
    iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600,
  }))}`;
  const pem = String(sa.private_key).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const clave = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const firma = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', clave, new TextEncoder().encode(cuerpo)));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${cuerpo}.${b64(firma)}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(j.error_description || j.error || 'sin token de Google');
  return j.access_token;
}

// ── Resend: el correo con el enlace ──────────────────────────────────
async function mandarCorreo(sb: any, email: string) {
  const clave = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('ANDROID_TESTERS_FROM');
  if (!clave || !from) return { ok: false, error: 'sin_config_correo' };
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await sb.from('android_testers').select('id', { count: 'exact', head: true }).gte('correo_enviado_at', desde);
  if ((count || 0) >= TOPE_CORREOS_DIA) return { ok: false, error: 'tope_diario_correos' };
  const c = correoBienvenida(email);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [email], subject: c.subject, html: c.html, text: c.text }),
  });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true } : { ok: false, error: `correo: ${j.message || r.status}` };
}

function json(p: unknown, status = 200) {
  return new Response(JSON.stringify(p), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
