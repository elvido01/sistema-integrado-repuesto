// ════════════════════════════════════════════════════════════════════════
//  youtube-prueba-privada — subir UN Short en PRIVADO, para comprobar el
//  camino entero sin habilitar la publicación
// ════════════════════════════════════════════════════════════════════════
//  El 29/09/2026 el dueño pidió escribir la subida real a YouTube y probarla
//  con un video privado. El publicador de promociones NO sirve para eso: no
//  toca una cuenta con `publicacion_habilitada = false`, y habilitarla para
//  probar abriría la puerta a que una promoción real saliera a YouTube.
//
//  Esto recorre el MISMO camino que el publicador (cuentaSocial.mjs para la
//  cuenta y el acceso renovado, youtube.mjs para la subida) con tres
//  candados:
//    · solo con la llave de servicio (nadie desde el navegador),
//    · solo videos de NUESTRO almacenamiento (no baja cualquier cosa),
//    · SIEMPRE privado: la privacidad no se acepta del cuerpo.
//  No escribe en promociones ni cambia la cuenta. La respuesta nunca lleva
//  tokens: solo el id y el enlace del video.
//
//  POST { "tenant_id"?: uuid, "video_url": "https://<ref>.supabase.co/storage/...", "texto"?: string }
// ════════════════════════════════════════════════════════════════════════

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { cuentaConAcceso } from '../_shared/cuentaSocial.mjs';
import { youtubeShort } from '../_shared/youtube.mjs';

const MORLA = '00000000-0000-0000-0000-000000000001';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Solo POST.' }, 405);

  // La plataforma ya verificó la FIRMA del JWT antes de dejarlo pasar
  // (verify_jwt); aquí solo se mira que el rol sea el de servicio. Comparar la
  // llave como texto no sirve: dentro de la función puede venir en otro
  // formato que la que usa quien llama.
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
  const video = String(cuerpo.video_url || '');
  if (!video.startsWith(`${base}/storage/`)) {
    return json({ ok: false, error: 'El video tiene que estar en el almacenamiento de MotoFlow.' }, 400);
  }

  const sb = createClient(base, llave, { auth: { autoRefreshToken: false, persistSession: false } });
  const tenantId = cuerpo.tenant_id || MORLA;

  let cuenta;
  try {
    cuenta = await cuentaConAcceso({ sb, fetchFn: fetch, tenantId, platform: 'youtube', env: (k: string) => Deno.env.get(k) });
  } catch (e) {
    return json({ ok: false, paso: 'acceso', error: e?.message || String(e), token_vencido: !!e?.token_vencido });
  }
  if (!cuenta) return json({ ok: false, paso: 'cuenta', error: 'No hay cuenta de YouTube conectada con permiso guardado.' });

  const r = await youtubeShort({
    fetchFn: fetch,
    token: cuenta.token,
    media: { video },
    texto: String(cuerpo.texto || 'Prueba privada de MotoFlow'),
    privacidad: 'private',            // fijo: esta función jamás publica en público
  });

  return json({
    ok: r.ok,
    canal: cuenta.external_account_id,
    video_id: r.external_post_id || null,
    url: r.external_url || null,
    privacidad: r.privacidad || null,
    paso: r.paso || null,
    error: r.ok ? null : r.error,
    http: r.http || null,
  });
});
