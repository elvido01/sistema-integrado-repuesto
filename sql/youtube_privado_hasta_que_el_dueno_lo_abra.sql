-- YouTube publica en privado hasta que Google apruebe la auditoría. El dueño
-- (29/09/2026): "quiero que cuando se publique aparezca el link del video
-- para yo ir directamente y ponerlo público, y así quede en el sistema como
-- publicado".
--
--  * hermes_publication_targets.privacidad: lo que dijo YouTube al subir
--    (private / unlisted / public). La anota publicar-promociones; el mismo
--    publicador vuelve a mirar cada 5 minutos los que siguen privados y la
--    cambia cuando el dueño lo pone público en YouTube Studio.
--  * promo_panel: un destino publicado pero privado sale como PRIVADO, con
--    su privacidad, para que la pantalla dé el enlace a YouTube Studio.
--  * La cuenta de YouTube conectada queda habilitada para publicar: orden
--    del dueño. Sube en privado (youtubeShort lo pide así por defecto).

ALTER TABLE public.hermes_publication_targets ADD COLUMN IF NOT EXISTS privacidad text;

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

-- Habilitar la cuenta: DECISIÓN DEL DUEÑO. Sube en privado.
UPDATE public.social_accounts
   SET publicacion_habilitada = true,
       verificado_at = now(),
       verificacion_detalle = 'Habilitada por orden del dueño 29/09/2026: sube en PRIVADO hasta la auditoría de Google; el dueño la pone pública en YouTube Studio.'
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND platform = 'youtube' AND status = 'connected';

SELECT public.registrar_migracion('youtube_privado_hasta_que_el_dueno_lo_abra.sql');

-- ===== VERIFICACION =====
SELECT platform, status, publicacion_habilitada, account_name,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_name = 'hermes_publication_targets' AND column_name = 'privacidad') AS columna
FROM public.social_accounts
WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND platform = 'youtube';
