// ════════════════════════════════════════════════════════════════════════
//  publicar-promociones — lo programado en Equipo IA sale a su hora
// ════════════════════════════════════════════════════════════════════════
//  La llama el cron cada minuto (public.promo_publicador_llamar). En cada
//  ronda:
//
//   1. promo_reclamar se lleva, CON CANDADO, las promociones que ya tocan.
//      Dos rondas a la vez nunca se llevan la misma.
//   2. Por cada destino (feed, historia) llama al adaptador de su red con el
//      token de la empresa, leído AQUÍ, del lado servidor. El navegador nunca
//      lo ve.
//   3. promo_reportar anota lo que contestó la red DESTINO POR DESTINO, apenas
//      sale cada uno. Si esto se corta a la mitad, lo que ya salió queda
//      escrito y un reintento no lo repite.
//
//  La ronda no lee nada del cuerpo de la petición: solo publica lo que en la
//  base ya está aprobado y ya tocaba. Llamarla de más no publica nada que no
//  tocara, ni lo publica dos veces.
// ════════════════════════════════════════════════════════════════════════

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { publicarDestino } from '../_shared/adaptadores.mjs';
import { cuentaConAcceso } from '../_shared/cuentaSocial.mjs';
import { privacidadVideoYoutube } from '../_shared/youtube.mjs';
import { estadoEnvioTikTok } from '../_shared/tiktok.mjs';
import { medirDestino } from '../_shared/metricas.mjs';
import { textoConCodigo } from '../_shared/codigoPromo.mjs';

// ── LOS NÚMEROS ─────────────────────────────────────────────────────────
// Metricool dejó de traerlos el 28/09/2026: MotoFlow mide lo que publicó.
// Cada 30 minutos (minutos :07 y :37, para no caer en la misma ronda que el
// vigilante de :00/:05…), las publicaciones de los últimos 14 días. Las
// historias de Instagram, solo sus primeras 24 h: después la API ya no da nada.
// Una fila por publicación y por DÍA en social_post_metrics (origen
// 'motoflow_api'): se actualiza durante el día, no se apila cada media hora.
async function medirPublicaciones(sb: any) {
  const min = new Date().getUTCMinutes();
  if (min !== 7 && min !== 37) return 0;
  const hace14 = new Date(Date.now() - 14 * 864e5).toISOString();
  const hace1 = new Date(Date.now() - 864e5).toISOString();
  const { data: destinos, error } = await sb.from('hermes_publication_targets')
    .select('id, tenant_id, platform, placement, external_post_id, published_at')
    .eq('status', 'published')
    .in('platform', ['facebook', 'instagram', 'youtube'])
    .not('external_post_id', 'is', null)
    .gte('published_at', hace14)
    .order('published_at', { ascending: false })
    .limit(60);
  if (error || !destinos?.length) return 0;

  const tokens = new Map();
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
  let medidos = 0;
  for (const d of destinos) {
    if (d.platform === 'facebook' && d.placement === 'story') continue;   // la API no da números
    if (d.platform === 'instagram' && d.placement === 'story' && d.published_at < hace1) continue;
    const clave = `${d.tenant_id}:${d.platform}`;
    if (!tokens.has(clave)) tokens.set(clave, await cuentaDe(sb, d.tenant_id, d.platform));
    const cuenta = tokens.get(clave);
    if (!cuenta?.token) continue;

    const { data: post } = await sb.from('social_posts').select('id')
      .eq('tenant_id', d.tenant_id).eq('platform', d.platform).eq('external_post_id', d.external_post_id)
      .limit(1).maybeSingle();
    if (!post?.id) continue;

    let m;
    try {
      m = await medirDestino({ fetchFn: fetch, token: cuenta.token, platform: d.platform, placement: d.placement, id: d.external_post_id });
    } catch (e) {
      console.error('[medidor]', d.platform, d.external_post_id, e?.message || e);
      continue;
    }
    if (!m?.ok) { if (m) console.error('[medidor]', d.platform, d.external_post_id, m.error); continue; }

    const fila = {
      tenant_id: d.tenant_id, post_id: post.id, captured_at: new Date().toISOString(),
      snapshot_date: hoy, origen: 'motoflow_api',
      views: m.views ?? null, likes: m.likes ?? null, comments: m.comments ?? null,
      shares: m.shares ?? null, saves: m.saves ?? null, reach: m.reach ?? null,
      impressions: m.impressions ?? null, raw_data: m.raw ?? null,
    };
    const { data: ya } = await sb.from('social_post_metrics').select('id')
      .eq('post_id', post.id).eq('origen', 'motoflow_api').eq('snapshot_date', hoy).limit(1).maybeSingle();
    const { error: e2 } = ya?.id
      ? await sb.from('social_post_metrics').update(fila).eq('id', ya.id).select('id')
      : await sb.from('social_post_metrics').insert(fila).select('id');
    if (e2) console.error('[medidor] no se guardó', d.external_post_id, e2.message);
    else medidos += 1;
  }
  return medidos;
}

// Cada cuántos minutos se vuelve a preguntar por los Shorts privados. Cada
// pregunta cuesta 1 unidad de las 10.000 diarias.
//
// Va por el reloj y no por last_checked_at: otra parte del sistema toca esa
// columna cada minuto, y con "si hace más de 5 minutos" no se preguntaba
// nunca (29/09: el dueño lo puso público y seguía PRIVADO).
const VIGILAR_CADA_MIN = 5;

/**
 * Los Shorts que siguen privados: si el dueño ya los puso públicos en YouTube
 * Studio, se anota y el historial pasa de PRIVADO a PUBLICADO solo.
 */
async function vigilarPrivadosYoutube(sb: any) {
  if (new Date().getUTCMinutes() % VIGILAR_CADA_MIN !== 0) return 0;
  const { data: privados, error } = await sb.from('hermes_publication_targets')
    .select('id, tenant_id, external_post_id')
    .eq('platform', 'youtube').eq('status', 'published')
    .in('privacidad', ['private', 'unlisted'])
    .not('external_post_id', 'is', null)
    .order('published_at', { ascending: false })
    .limit(10);
  // Sin Shorts privados igual se mira la bandeja de TikTok.
  if (error || !privados?.length) return await vigilarBandejaTikTok(sb);
  const tokens = new Map();
  for (const t of privados) {
    if (!tokens.has(t.tenant_id)) tokens.set(t.tenant_id, await cuentaDe(sb, t.tenant_id, 'youtube'));
    const cuenta = tokens.get(t.tenant_id);
    if (!cuenta?.token) continue;
    const v = await privacidadVideoYoutube({ fetchFn: fetch, token: cuenta.token, id: t.external_post_id });
    if (!v.ok) { console.error('[publicador] no se pudo mirar el Short', t.external_post_id, v.error); continue; }
    if (v.privacidad === 'private' || v.privacidad === 'unlisted') continue;
    const { error: e } = await sb.from('hermes_publication_targets')
      .update({ privacidad: v.privacidad }).eq('id', t.id).select('id');
    if (e) console.error('[publicador] no se anotó la privacidad del Short', t.external_post_id, e.message);
  }
  return privados.length + await vigilarBandejaTikTok(sb);
}

/**
 * Los videos que esperan en la bandeja de TikTok del dueño. Si TikTok dice
 * que ya se publicó (PUBLISH_COMPLETE), se anota y el historial pasa a
 * PUBLICADO. Si TikTok no lo informa para los borradores, el historial se
 * queda en "EN TU TIKTOK" y el dueño lo ve igual en su perfil.
 */
async function vigilarBandejaTikTok(sb: any) {
  const { data: enBandeja, error } = await sb.from('hermes_publication_targets')
    .select('id, tenant_id, external_post_id')
    .eq('platform', 'tiktok').eq('status', 'published').eq('privacidad', 'inbox')
    .not('external_post_id', 'is', null)
    .order('published_at', { ascending: false })
    .limit(10);
  if (error || !enBandeja?.length) return 0;
  const tokens = new Map();
  for (const t of enBandeja) {
    if (!tokens.has(t.tenant_id)) tokens.set(t.tenant_id, await cuentaDe(sb, t.tenant_id, 'tiktok'));
    const cuenta = tokens.get(t.tenant_id);
    if (!cuenta?.token) continue;
    const v = await estadoEnvioTikTok({ fetchFn: fetch, token: cuenta.token, publishId: t.external_post_id });
    if (!v.ok) { console.error('[publicador] no se pudo mirar el envío a TikTok', t.external_post_id, v.error); continue; }
    if (v.estado !== 'PUBLISH_COMPLETE') continue;
    const { error: e } = await sb.from('hermes_publication_targets')
      .update({ privacidad: 'public' }).eq('id', t.id).select('id');
    if (e) console.error('[publicador] no se anotó que TikTok ya lo publicó', t.external_post_id, e.message);
  }
  return enBandeja.length;
}

const WORKER = 'motoflow-publicador-v1';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { 'content-type': 'application/json' } });

// La cuenta y su acceso se leen en _shared/cuentaSocial.mjs (solo cuentas
// conectadas; YouTube renueva su acceso de una hora). El token no sale de aquí.
async function cuentaDe(sb: any, tenantId: string, platform: string) {
  try {
    return await cuentaConAcceso({ sb, fetchFn: fetch, tenantId, platform, env: (k: string) => Deno.env.get(k) });
  } catch (e) {
    // Renovar el acceso falló: la ronda sigue con las demás redes.
    return { error: e?.message || String(e), token_vencido: !!e?.token_vencido };
  }
}

/** Anotar lo que pasó. Si falla, se reintenta: lo que ya salió TIENE que quedar escrito. */
async function reportar(sb: any, jobId: string, resultado: any) {
  let ultimo = null;
  for (let intento = 0; intento < 3; intento += 1) {
    const { data, error } = await sb.rpc('promo_reportar', {
      p_job_id: jobId, p_worker: WORKER, p_resultados: [resultado],
    });
    if (!error) return data;
    ultimo = error.message;
    await new Promise((r) => setTimeout(r, 1000 * (intento + 1)));
  }
  // Lo publicado y no anotado es lo peor que puede pasar aquí: queda en el
  // registro de la función con su id, para poder reconstruirlo a mano.
  console.error('[publicador] NO SE PUDO ANOTAR', JSON.stringify({ jobId, resultado, error: ultimo }));
  return { ok: false, error: ultimo };
}

Deno.serve(async () => {
  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Antes de publicar lo nuevo, se mira si el dueño ya abrió lo privado.
  const vigilados = await vigilarPrivadosYoutube(sb);
  const medidos = await medirPublicaciones(sb);

  const { data: trabajos, error } = await sb.rpc('promo_reclamar', { p_worker: WORKER, p_limite: 5 });
  if (error) {
    console.error('[publicador] no se pudo reclamar:', error.message);
    return json({ ok: false, error: error.message }, 500);
  }
  if (!Array.isArray(trabajos) || trabajos.length === 0) {
    return json({ ok: true, trabajos: 0, vigilados, medidos });
  }

  const informe = [];
  for (const job of trabajos) {
    const plataforma = job.channels?.[0];
    const cuenta = plataforma ? await cuentaDe(sb, job.tenant_id, plataforma) : null;
    const cfg = job.channel_config || {};
    // (04/10/2026) El codigo de descuento de la promocion va al final del
    // texto (T101, I101...): es lo que dice en caja de que red vino la venta.
    // Si no se puede leer, se publica igual sin codigo.
    const { data: codigo, error: eCod } = await sb.rpc('promo_codigo_de_trabajo', { p_job_id: job.id });
    if (eCod) console.error('[publicador] sin codigo de promocion:', eCod.message);
    const texto = textoConCodigo(job.textos?.[plataforma] || job.caption || '', codigo);

    for (const destino of job.destinos || []) {
      // La historia va con la imagen vertical y el feed con la cuadrada. El
      // trabajo tiene una sola media_url; las dos piezas viajan aparte.
      const imagen = destino.placement === 'story'
        ? (cfg.imagen_historia || job.media_url)
        : (cfg.imagen_feed || job.media_url);

      // El video (TikTok, YouTube) viaja en channel_config.video; si el
      // trabajo es de video, también en media_url.
      const video = cfg.video || (job.media_type === 'video' ? job.media_url : null);

      let r;
      if (cuenta?.error) {
        r = { ok: false, error: cuenta.error, token_vencido: cuenta.token_vencido };
      } else if (!cuenta) {
        r = { ok: false, error: `No hay cuenta de ${plataforma} conectada con token.` };
      } else if (cuenta.habilitada === false) {
        // Se apagó entre que se programó y ahora (p. ej. el token venció en
        // otro destino): no se insiste contra una cuenta muerta.
        r = { ok: false, error: `La cuenta de ${plataforma} está marcada como no habilitada. Reconectar.` };
      } else {
        r = await publicarDestino({ fetchFn: fetch, destino, cuenta, media: { imagen, video }, texto });
      }

      const resultado = {
        platform: destino.platform,
        placement: destino.placement,
        status: r.ok ? 'published' : 'failed',
        platform_post_id: r.external_post_id || null,
        platform_post_url: r.external_url || null,
        error: r.ok ? null : (r.error || 'sin detalle'),
        published_at: r.ok ? new Date().toISOString() : null,
        token_vencido: !!r.token_vencido,
      };
      const rep = await reportar(sb, job.id, resultado);
      // YouTube sube privado hasta la auditoría de Google: se anota, para que
      // la pantalla diga PRIVADO y lleve al dueño a YouTube Studio.
      if (r.ok && r.privacidad) {
        const { error: ePriv } = await sb.from('hermes_publication_targets')
          .update({ privacidad: r.privacidad })
          .eq('job_id', job.id).eq('platform', destino.platform).eq('placement', destino.placement)
          .select('id');
        if (ePriv) console.error('[publicador] no se anotó la privacidad:', ePriv.message);
      }
      informe.push({ job: job.id, destino: `${destino.platform}:${destino.placement}`, ok: r.ok, error: resultado.error, rep });
    }
  }

  return json({ ok: true, trabajos: trabajos.length, informe });
});
