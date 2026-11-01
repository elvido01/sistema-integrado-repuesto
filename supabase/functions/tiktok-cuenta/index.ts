// ════════════════════════════════════════════════════════════════════════
//  tiktok-cuenta — lo que la pantalla necesita de TikTok, sin dar el token
// ════════════════════════════════════════════════════════════════════════
//  (01/11/2026) Lo llama Equipo IA con la sesión del dueño/administrador.
//
//  POST { accion: 'creador' }
//    → { ok, nombre, usuario, avatar, privacidades[], sin_comentarios,
//        sin_duo, sin_stitch, max_segundos }   (creator_info: TikTok exige
//        mostrarlo y consultarlo antes de cada publicación directa)
//  POST { accion: 'videos' }
//    → { ok, videos: [{ id, titulo, portada, enlace, fecha, vistas,
//        me_gusta, comentarios, compartidos }] }   (video.list)
//  Si falta el permiso nuevo: { ok:false, motivo:'reconectar', error }.
// ════════════════════════════════════════════════════════════════════════

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { cuentaConAcceso } from '../_shared/cuentaSocial.mjs';
import { creadorTikTok, videosTikTok } from '../_shared/tiktok.mjs';

const env = (k: string) => Deno.env.get(k);
const base = env('SUPABASE_URL')!;
const origins = new Set([
  ...(env('SOCIAL_OAUTH_ORIGINS') || '').split(','),
  'https://repuestos-morla.pages.dev', 'https://motoflow.pages.dev',
  'https://repuestosmorla.com', 'https://www.repuestosmorla.com', 'http://localhost:5173',
].map((s) => s.trim()).filter(Boolean));
const sb = createClient(base, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin' };
  if (origins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info';
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  }
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers });
  if (req.method === 'OPTIONS') return new Response(null, { status: origins.has(origin) ? 204 : 403, headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido.' }, 405);

  const jwt = req.headers.get('authorization')?.replace(/^Bearer /i, '');
  if (!jwt) return json({ ok: false, error: 'Inicia sesión en MotoFlow.' }, 401);
  const userSb = createClient(base, env('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  const { data: tenant, error: tErr } = await userSb.rpc('promo_tenant_admin');
  if (tErr || !tenant) return json({ ok: false, error: 'Solo el dueño o administrador.' }, 403);

  let b: any = {};
  try { b = await req.json(); } catch { /* vacío */ }

  let cuenta;
  try {
    cuenta = await cuentaConAcceso({ sb, fetchFn: fetch, tenantId: tenant, platform: 'tiktok', env });
  } catch (e) {
    return json({ ok: false, motivo: 'reconectar', error: e?.message || 'No se pudo renovar el acceso a TikTok.' });
  }
  if (!cuenta?.token) return json({ ok: false, motivo: 'reconectar', error: 'TikTok no está conectado.' });

  const r = b.accion === 'videos'
    ? await videosTikTok({ fetchFn: fetch, token: cuenta.token, max: 10 })
    : await creadorTikTok({ fetchFn: fetch, token: cuenta.token });
  if (!r.ok) {
    const reconectar = r.token_vencido || r.sin_permiso;
    return json({ ok: false, motivo: reconectar ? 'reconectar' : 'tiktok',
      error: r.sin_permiso ? 'Falta el permiso nuevo de TikTok: reconecta la cuenta en Equipo IA.' : r.error });
  }
  return json(r);
});
