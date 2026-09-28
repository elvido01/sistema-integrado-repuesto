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

const WORKER = 'motoflow-publicador-v1';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { 'content-type': 'application/json' } });

async function cuentaDe(sb: any, tenantId: string, platform: string) {
  // limit(1) y no maybeSingle(): con dos cuentas de la misma red, maybeSingle
  // revienta en vez de publicar.
  const { data: cuentas } = await sb
    .from('social_accounts')
    .select('id, external_account_id, publicacion_habilitada')
    .eq('tenant_id', tenantId)
    .eq('platform', platform)
    .order('connected_at', { ascending: false })
    .limit(1);
  const c = cuentas?.[0];
  if (!c?.id) return null;
  const { data: sec } = await sb
    .from('social_account_secrets')
    .select('access_token')
    .eq('account_id', c.id)
    .maybeSingle();
  if (!sec?.access_token) return null;
  return { external_account_id: c.external_account_id, token: sec.access_token, habilitada: c.publicacion_habilitada };
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

  const { data: trabajos, error } = await sb.rpc('promo_reclamar', { p_worker: WORKER, p_limite: 5 });
  if (error) {
    console.error('[publicador] no se pudo reclamar:', error.message);
    return json({ ok: false, error: error.message }, 500);
  }
  if (!Array.isArray(trabajos) || trabajos.length === 0) {
    return json({ ok: true, trabajos: 0 });
  }

  const informe = [];
  for (const job of trabajos) {
    const plataforma = job.channels?.[0];
    const cuenta = plataforma ? await cuentaDe(sb, job.tenant_id, plataforma) : null;
    const cfg = job.channel_config || {};
    const texto = job.textos?.[plataforma] || job.caption || '';

    for (const destino of job.destinos || []) {
      // La historia va con la imagen vertical y el feed con la cuadrada. El
      // trabajo tiene una sola media_url; las dos piezas viajan aparte.
      const imagen = destino.placement === 'story'
        ? (cfg.imagen_historia || job.media_url)
        : (cfg.imagen_feed || job.media_url);

      let r;
      if (!cuenta) {
        r = { ok: false, error: `No hay cuenta de ${plataforma} conectada con token.` };
      } else if (cuenta.habilitada === false) {
        // Se apagó entre que se programó y ahora (p. ej. el token venció en
        // otro destino): no se insiste contra una cuenta muerta.
        r = { ok: false, error: `La cuenta de ${plataforma} está marcada como no habilitada. Reconectar.` };
      } else {
        r = await publicarDestino({ fetchFn: fetch, destino, cuenta, media: { imagen }, texto });
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
      informe.push({ job: job.id, destino: `${destino.platform}:${destino.placement}`, ok: r.ok, error: resultado.error, rep });
    }
  }

  return json({ ok: true, trabajos: trabajos.length, informe });
});
