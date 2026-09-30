-- El Estado de WhatsApp en Equipo IA (30/09/2026). WhatsApp no tiene API
-- para publicar Estados: el dueño los publica a mano desde WhatsApp Web. Pidió
-- dos cosas: que la imagen aprobada esté SIEMPRE en una carpeta fija de la PC
-- (C:\RepuestosMorla\Publicaciones\Pendientes) y que "WhatsApp · estado"
-- salga en el historial como las demás redes, para ver que se publicó.
--
-- Va en su propia tabla y NO en hermes_publication_targets: el publicador
-- automático no tiene nada que hacer con él, y un destino que nadie publica
-- dejaría la promoción "a medias" para siempre.
--
--  * promo_estados_whatsapp: una fila por promoción que lo pidió.
--  * promo_whatsapp_pedir: la pantalla la crea al lanzar la promoción.
--  * promo_whatsapp_publicado: el botón "Ya lo publiqué".
--  * scripts/estados-whatsapp-pc.mjs (en la PC) descarga lo pendiente a la
--    carpeta, anota descargado_en/archivo, y al publicarse lo mueve a
--    Publicados y anota movido_en.

CREATE TABLE IF NOT EXISTS public.promo_estados_whatsapp (
  bundle_id      uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  titulo         text,
  imagen_url     text,
  video_url      text,
  estado         text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'publicado')),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  publicado_en   timestamptz,
  publicado_por  uuid,
  descargado_en  timestamptz,
  archivo        text,
  movido_en      timestamptz,
  error          text
);
ALTER TABLE public.promo_estados_whatsapp ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS promo_estados_whatsapp_leer ON public.promo_estados_whatsapp;
CREATE POLICY promo_estados_whatsapp_leer ON public.promo_estados_whatsapp
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());

CREATE OR REPLACE FUNCTION public.promo_whatsapp_pedir(p_bundle_id uuid, p_titulo text, p_imagen text, p_video text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$
DECLARE
  v_tenant uuid := public.get_user_tenant();
BEGIN
  IF NOT public.equipo_ia_permitido() THEN RAISE EXCEPTION 'Este módulo es del dueño.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hermes_publication_jobs
                  WHERE publication_bundle_id = p_bundle_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'Esa promoción no es de esta empresa.';
  END IF;
  IF coalesce(p_imagen, '') = '' AND coalesce(p_video, '') = '' THEN
    RAISE EXCEPTION 'Para el Estado de WhatsApp hace falta la imagen de historia o el video.';
  END IF;
  INSERT INTO public.promo_estados_whatsapp (bundle_id, tenant_id, titulo, imagen_url, video_url)
  VALUES (p_bundle_id, v_tenant, p_titulo, nullif(p_imagen, ''), nullif(p_video, ''))
  ON CONFLICT (bundle_id) DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END $f$;

CREATE OR REPLACE FUNCTION public.promo_whatsapp_publicado(p_bundle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$
DECLARE
  v_n int;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN RAISE EXCEPTION 'Este módulo es del dueño.'; END IF;
  UPDATE public.promo_estados_whatsapp
     SET estado = 'publicado', publicado_en = coalesce(publicado_en, now()), publicado_por = auth.uid()
   WHERE bundle_id = p_bundle_id AND tenant_id = public.get_user_tenant();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'Esa promoción no tiene Estado de WhatsApp pendiente.'; END IF;
  RETURN jsonb_build_object('ok', true);
END $f$;

REVOKE ALL ON FUNCTION public.promo_whatsapp_pedir(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.promo_whatsapp_publicado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promo_whatsapp_pedir(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promo_whatsapp_publicado(uuid) TO authenticated;

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
        -- El Estado de WhatsApp lo publica el dueño a mano: va aparte.
        'whatsapp_estado', (
          select jsonb_build_object('estado', upper(w.estado), 'publicado_en', w.publicado_en,
                                    'archivo', w.archivo, 'descargado_en', w.descargado_en)
          from public.promo_estados_whatsapp w
          where w.bundle_id = b.publication_bundle_id),
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

SELECT public.registrar_migracion('estado_de_whatsapp_en_equipo_ia.sql');

-- ===== VERIFICACION =====
SELECT (SELECT count(*) FROM information_schema.tables WHERE table_name = 'promo_estados_whatsapp') AS tabla,
       position('whatsapp_estado' in pg_get_functiondef('public.promo_panel(integer)'::regprocedure)) > 0 AS panel,
       (SELECT count(*) FROM pg_proc WHERE proname IN ('promo_whatsapp_pedir', 'promo_whatsapp_publicado')) AS funciones;
