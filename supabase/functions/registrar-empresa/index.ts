// ============================================================
// registrar-empresa — alta pública de una empresa, con captcha
// ============================================================
// (11/10/2026) /registro llamaba registrar_nueva_empresa directo desde el
// navegador (anon): cualquiera podía llenar la base de empresas basura con
// un script. Ahora la llamada pasa por aquí:
//   1. Comprueba el captcha (Cloudflare Turnstile, secreto TURNSTILE_SECRET)
//      contra el servidor de Cloudflare, con la IP del visitante.
//   2. Si pasa, crea la empresa con la llave de servicio. El público ya no
//      puede ejecutar registrar_nueva_empresa (sql/registro_con_captcha.sql),
//      que además frena a 10 empresas por hora en total.
// Devuelve el tenant_id para el signUp, igual que antes devolvía el RPC.
// ============================================================
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '') || null;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

  const secreto = Deno.env.get('TURNSTILE_SECRET') || '';
  if (!secreto) return json({ ok: false, error: 'El registro no está disponible ahora mismo. Escríbenos por WhatsApp.' }, 503);

  const b = await req.json().catch(() => ({}));
  if (typeof b.captcha !== 'string' || !b.captcha || b.captcha.length > 4096) {
    return json({ ok: false, error: 'Completa la verificación de que no eres un robot.' }, 400);
  }

  // 1. Captcha
  const ip = req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const form = new FormData();
  form.append('secret', secreto);
  form.append('response', b.captcha);
  if (ip) form.append('remoteip', ip);
  let verif: { success?: boolean; 'error-codes'?: string[] } = {};
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    verif = await r.json();
  } catch (e) {
    return json({ ok: false, error: 'No se pudo comprobar la verificación. Intenta de nuevo.' }, 502);
  }
  if (!verif.success) {
    console.log('captcha rechazado', ip, verif['error-codes']);
    return json({ ok: false, error: 'La verificación venció o no pasó. Márcala de nuevo y vuelve a intentar.' }, 403);
  }

  // 2. Empresa
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb.rpc('registrar_nueva_empresa', {
    p_nombre: texto(b.nombre, 160),
    p_rnc: texto(b.rnc, 20),
    p_direccion: texto(b.direccion, 300),
    p_telefono: texto(b.telefono, 40),
    p_email: texto(b.email, 160),
    p_tipo_negocio: texto(b.tipo_negocio, 20) || 'repuestos',
  });
  if (error) return json({ ok: false, error: error.message }, 400);
  console.log('empresa registrada', data, ip);
  return json({ ok: true, tenant_id: data });
});
