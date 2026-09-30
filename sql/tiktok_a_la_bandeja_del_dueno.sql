-- TikTok (30/09/2026): el video va como BORRADOR a la bandeja de TikTok del
-- dueño (video.upload) y lo publica él desde el teléfono. La publicación
-- directa sin auditoría exige poner la cuenta entera en privado: descartada.
-- El publicador anota privacidad='inbox'; aquí eso se muestra como
-- "EN TU TIKTOK". Si TikTok informa PUBLISH_COMPLETE, el publicador pasa la
-- privacidad a 'public' y el destino sale PUBLICADO.
--
-- Solo cambia cómo se MUESTRA el historial. No habilita la cuenta de TikTok:
-- eso lo decide el dueño cuando la app pase la revisión.

CREATE OR REPLACE FUNCTION public.promo_panel(p_limite integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tenant uuid;
begin
  v_tenant := public.get_user_tenant();
  if v_tenant is null then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(p order by p->>'creada' desc)
    from (
      select jsonb_build_object(
        'bundle_id', b.publication_bundle_id,
        'titulo', max(b.title),
        'creada', max(b.created_at),
        'programada', max(b.scheduled_for),
        'precio', max(b.precio_mostrado),
        'existencia_confirmada', bool_and(b.existencia_confirmada),
        'aprobada', bool_and(b.approval_status = 'approved'),
        'estado', case
          when bool_and(b.status = 'published') then 'PUBLICADO'
          when bool_or(b.status = 'partially_published') then 'PARCIAL'
          when bool_or(b.status = 'failed') then 'FALLO'
          when bool_or(b.status in ('queued','processing')) then 'PUBLICANDO'
          when bool_or(b.status = 'scheduled') then 'PROGRAMADO'
          when bool_and(b.approval_status = 'approved') then 'APROBADO'
          else 'BORRADOR' end,
        'destinos', (
          select jsonb_agg(jsonb_build_object(
            'id', t.id, 'platform', t.platform, 'placement', t.placement,
            'estado', case
              when t.bloqueo_motivo is not null then 'SIN AUTORIZAR'
              -- Subido pero nadie lo ve todavía: el dueño lo abre en Studio.
              when t.status = 'published' and t.privacidad in ('private', 'unlisted') then 'PRIVADO'
              -- TikTok: borrador en la bandeja; el dueño lo publica desde el teléfono.
              when t.status = 'published' and t.privacidad = 'inbox' then 'EN TU TIKTOK'
              when t.status = 'published' then 'PUBLICADO'
              when t.status = 'failed' then 'FALLO'
              when t.status = 'awaiting_confirmation' then 'SIN CONFIRMAR'
              when t.status in ('queued','processing') then 'PUBLICANDO'
              when t.status = 'scheduled' then 'PROGRAMADO'
              else 'BORRADOR' end,
            'privacidad', t.privacidad,
            'bloqueo_motivo', t.bloqueo_motivo,
            'external_post_id', t.external_post_id,
            'external_url', t.external_url,
            'error', t.error_message,
            'intentos', t.attempt_count,
            'publicado_en', t.published_at,
            -- Solo se buscan números de lo que ya salió.
            'metricas', case when t.status = 'published'
                             then public.promo_metricas_destino(t.id) end)
            order by t.platform, t.placement)
          from public.hermes_publication_targets t
          join public.hermes_publication_jobs jj on jj.id = t.job_id
          where jj.publication_bundle_id = b.publication_bundle_id)
      ) p
      from public.hermes_publication_jobs b
      where b.tenant_id = v_tenant and b.publication_bundle_id is not null
      group by b.publication_bundle_id
      order by max(b.created_at) desc
      limit greatest(1, coalesce(p_limite, 3))
    ) q
  ), '[]'::jsonb);
end;
$function$;

SELECT public.registrar_migracion('tiktok_a_la_bandeja_del_dueno.sql');

-- ===== VERIFICACION =====
SELECT position('EN TU TIKTOK' in pg_get_functiondef('public.promo_panel(integer)'::regprocedure)) > 0 AS panel_con_tiktok;
