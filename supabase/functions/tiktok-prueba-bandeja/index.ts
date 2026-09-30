// ════════════════════════════════════════════════════════════════════════
//  tiktok-prueba-bandeja — mandar UN video como borrador a la bandeja de
//  TikTok del dueño, para comprobar el camino entero sin habilitar la red
// ════════════════════════════════════════════════════════════════════════
//  30/09/2026, con la app en Sandbox. Igual que youtube-prueba-privada: el
//  publicador de promociones no toca una cuenta con
//  `publicacion_habilitada = false`, y habilitarla para probar abriría la
//  puerta a que una promoción real saliera a TikTok.
//
//  Recorre el MISMO camino que el publicador (cuentaSocial.mjs para la cuenta
//  y el acceso renovado, tiktok.mjs para el envío) con candados:
//    · solo con la llave de servicio (nadie desde el navegador),
//    · solo videos de NUESTRO almacenamiento,
//    · solo a la BANDEJA: es un borrador que el dueño publica o descarta.
//  No escribe en promociones ni cambia la cuenta. La respuesta nunca lleva
//  tokens: solo el publish_id y el estado que devuelve TikTok.
//
//  POST { "tenant_id"?: uuid, "video_url": "https://<ref>.supabase.co/storage/..." }
// ════════════════════════════════════════════════════════════════════════

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { cuentaConAcceso } from '../_shared/cuentaSocial.mjs';
import { tiktokBandeja, estadoEnvioTikTok } from '../_shared/tiktok.mjs';

const MORLA = '00000000-0000-0000-0000-000000000001';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Solo POST.' }, 405);

  // Mismo candado que youtube-prueba-privada: la firma la verificó la
  // plataforma; aquí solo se mira que el rol sea el de servicio.
  const pedida = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  let rol = '';
  try {
    const carga = pedida.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    rol = JSON.parse(atob(carga + '='.repeat((4 - (carga.length % 4)) % 4)))?.role || '';
  } catch { /* no es un JWT */ }
  if (rol !== 'service_role') return json({ ok: false, error: 'Solo con la llave de servicio.' }, 403);
  const llave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  let cuerpo: any = {};
  try { cuerpo = await req.json(); } catch { /* vacío */ }

  const base = Deno.env.get('SUPABASE_URL') || '';

  // Solo preguntar en qué quedó un envío anterior, sin mandar otro video.
  if (cuerpo.publish_id) {
    const sbC = createClient(base, llave, { auth: { autoRefreshToken: false, persistSession: false } });
    let c;
    try {
      c = await cuentaConAcceso({ sb: sbC, fetchFn: fetch, tenantId: cuerpo.tenant_id || MORLA, platform: 'tiktok', env: (k: string) => Deno.env.get(k) });
    } catch (e) {
      return json({ ok: false, paso: 'acceso', error: e?.message || String(e) });
    }
    if (!c) return json({ ok: false, paso: 'cuenta', error: 'No hay cuenta de TikTok conectada.' });
    const s = await estadoEnvioTikTok({ fetchFn: fetch, token: c.token, publishId: String(cuerpo.publish_id) });
    return json({ ok: s.ok, estado: s.estado || null, motivo: s.motivo || null, error: s.ok ? null : s.error });
  }

  const video = String(cuerpo.video_url || '');
  if (!video.startsWith(`${base}/storage/`)) {
    return json({ ok: false, error: 'El video tiene que estar en el almacenamiento de MotoFlow.' }, 400);
  }

  const sb = createClient(base, llave, { auth: { autoRefreshToken: false, persistSession: false } });
  const tenantId = cuerpo.tenant_id || MORLA;

  let cuenta;
  try {
    cuenta = await cuentaConAcceso({ sb, fetchFn: fetch, tenantId, platform: 'tiktok', env: (k: string) => Deno.env.get(k) });
  } catch (e) {
    return json({ ok: false, paso: 'acceso', error: e?.message || String(e), token_vencido: !!e?.token_vencido });
  }
  if (!cuenta) return json({ ok: false, paso: 'cuenta', error: 'No hay cuenta de TikTok conectada con permiso guardado.' });

  const r = await tiktokBandeja({ fetchFn: fetch, token: cuenta.token, media: { video } });

  // Unos segundos para que TikTok procese y diga en qué quedó.
  let estado = null;
  if (r.ok) {
    await new Promise((ok) => setTimeout(ok, 8000));
    estado = await estadoEnvioTikTok({ fetchFn: fetch, token: cuenta.token, publishId: r.external_post_id });
  }

  return json({
    ok: r.ok,
    publish_id: r.external_post_id || null,
    estado: estado?.estado || null,
    motivo: estado?.motivo || null,
    paso: r.paso || null,
    error: r.ok ? null : r.error,
    http: r.http || null,
  });
});
