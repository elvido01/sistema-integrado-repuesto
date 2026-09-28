-- ============================================================
-- LA PROMOCIÓN TRAE SUS NÚMEROS
-- ============================================================
-- Paso 4 del flujo lineal del Equipo IA (decisión del dueño, 28/09/2026):
--
--   1 elijo el producto → 2 apruebo o edito la imagen → 3 publico o programo
--   → 4 veo el historial CON EL RESULTADO REAL
--
-- El historial ya existía (`promo_panel`): estado por red, enlace, error. Lo
-- que no traía era cuánta gente lo vio.
--
-- >>> DE DÓNDE SALEN LOS NÚMEROS <<<
-- Todas las métricas las mete Metricool (social_post_metrics.origen =
-- 'metricool'), desde fuera del repo. Y Metricool da de alta los posts por su
-- cuenta: los `metricool_analytics` son posts que encontró mirando las
-- cuentas, aunque no se programaran con él. Guarda el MISMO id que nuestro
-- publicador (Facebook 'pagina_post', Instagram el id numérico del medio).
-- Comprobado el 28/09: el post de Facebook del 13/09 y el de Instagram del
-- 06/09 que sacó nuestro publicador tienen su fila en social_posts con ese id
-- exacto, y dos tomas de métricas cada uno.
--
-- Así que no hace falta escribir nada: basta con UNIR cada destino con su post
-- medido. Escribir aquí sería meterse en la tabla que llena una sincronización
-- que no vemos, con un índice único por (empresa, red, id): un choque le podía
-- romper la carga a Metricool a cambio de nada.
--
-- >>> CÓMO SE UNE <<<
-- Por (empresa, red, id del post). Si el destino no trae id, por el enlace,
-- PERO NUNCA EN HISTORIAS: en Facebook todas las historias de la página tienen
-- el mismo enlace (/stories/<pagina>), y unir por él le pega a una historia los
-- números de otra cualquiera.
--
-- Las historias, además, no traen métricas: Metricool las registra con cero
-- tomas. La pantalla lo dice en vez de enseñar un cero que parece un fracaso.
--
-- La unión va en su propia función para poder PROBARLA sola contra un post
-- que se sabe que tiene números (ver VERIFICACION).
-- ============================================================

CREATE OR REPLACE FUNCTION public.promo_metricas_destino(p_target_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT jsonb_build_object(
           'vistas',       m.views,
           'alcance',      m.reach,
           'impresiones',  m.impressions,
           'me_gusta',     m.likes,
           'comentarios',  m.comments,
           'compartidos',  m.shares,
           'guardados',    m.saves,
           'clics',        m.clicks,
           'medido_en',    m.captured_at)
    FROM public.hermes_publication_targets t
    JOIN public.social_posts sp
      ON sp.tenant_id = t.tenant_id
     AND sp.platform  = t.platform
     AND (sp.external_post_id = t.external_post_id
          OR (t.placement <> 'story'
              AND t.external_url IS NOT NULL
              AND (sp.external_url = t.external_url OR sp.external_post_id = t.external_url)))
    JOIN LATERAL (
      SELECT x.* FROM public.social_post_metrics x
       WHERE x.post_id = sp.id
       ORDER BY x.captured_at DESC, x.id DESC
       LIMIT 1
    ) m ON true
   WHERE t.id = p_target_id
   ORDER BY m.captured_at DESC
   LIMIT 1
$fn$;

-- Solo la usa promo_panel (SECURITY DEFINER). Nadie de fuera la necesita.
REVOKE ALL ON FUNCTION public.promo_metricas_destino(uuid) FROM PUBLIC, anon, authenticated;


-- promo_panel: MISMA firma (p_limite integer) y mismo cuerpo que el de
-- producción del 28/09; solo se le añade 'metricas' a cada destino.
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
              when t.status = 'published' then 'PUBLICADO'
              when t.status = 'failed' then 'FALLO'
              when t.status = 'awaiting_confirmation' then 'SIN CONFIRMAR'
              when t.status in ('queued','processing') then 'PUBLICANDO'
              when t.status = 'scheduled' then 'PROGRAMADO'
              else 'BORRADOR' end,
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

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('la_promocion_trae_sus_numeros.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Tres casos, contra destinos REALES que sacó el publicador:
--   1. Un feed de Facebook que se sabe medido  → tiene que traer números.
--   2. Un feed de Instagram que se sabe medido → tiene que traer números.
--   3. Una historia de Facebook                → NO puede traer los de otra.
-- Y promo_panel sigue teniendo una sola versión (una sobrecarga nueva haría
-- que la llamada de la pantalla reventara con "is not unique").
DO $prueba$
DECLARE
  v_fb    uuid;
  v_ig    uuid;
  v_hist  uuid;
  v_m     jsonb;
  v_n     int;
BEGIN
  SELECT id INTO v_fb FROM public.hermes_publication_targets
   WHERE platform = 'facebook' AND placement = 'feed' AND status = 'published'
     AND external_post_id = '100771345587204_1407043078284161' LIMIT 1;
  SELECT id INTO v_ig FROM public.hermes_publication_targets
   WHERE platform = 'instagram' AND placement = 'feed' AND status = 'published'
     AND external_post_id = '18116571874938100' LIMIT 1;
  SELECT id INTO v_hist FROM public.hermes_publication_targets
   WHERE platform = 'facebook' AND placement = 'story' AND status = 'published'
     AND external_post_id = '1407041098284359' LIMIT 1;

  IF v_fb IS NULL OR v_ig IS NULL OR v_hist IS NULL THEN
    RAISE EXCEPTION 'NO ESTÁN LOS DESTINOS DE PRUEBA (fb=%, ig=%, historia=%): la prueba no puede probar nada.', v_fb, v_ig, v_hist;
  END IF;

  v_m := public.promo_metricas_destino(v_fb);
  IF v_m IS NULL OR v_m ->> 'medido_en' IS NULL THEN
    RAISE EXCEPTION 'EL FEED DE FACEBOOK NO TRAE NÚMEROS, y se sabe que los tiene: %', v_m;
  END IF;

  v_m := public.promo_metricas_destino(v_ig);
  IF v_m IS NULL OR v_m ->> 'medido_en' IS NULL THEN
    RAISE EXCEPTION 'EL FEED DE INSTAGRAM NO TRAE NÚMEROS, y se sabe que los tiene: %', v_m;
  END IF;

  -- La historia: o no trae nada, o trae los SUYOS. Nunca los de otra.
  v_m := public.promo_metricas_destino(v_hist);
  IF v_m IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.social_posts sp
        WHERE sp.platform = 'facebook' AND sp.external_post_id = '1407041098284359'
          AND EXISTS (SELECT 1 FROM public.social_post_metrics x WHERE x.post_id = sp.id)) THEN
    RAISE EXCEPTION 'LA HISTORIA TRAE NÚMEROS DE OTRA: %', v_m;
  END IF;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'promo_panel';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'HAY % VERSIONES DE promo_panel: la pantalla va a reventar con "is not unique".', v_n;
  END IF;

  RAISE NOTICE 'Los feeds traen sus números, la historia no se roba los de otra, y promo_panel sigue siendo una.';
END $prueba$;

SELECT jsonb_build_object(
  'feed_facebook',  public.promo_metricas_destino((SELECT id FROM public.hermes_publication_targets
                      WHERE external_post_id = '100771345587204_1407043078284161' AND placement = 'feed' LIMIT 1)),
  'feed_instagram', public.promo_metricas_destino((SELECT id FROM public.hermes_publication_targets
                      WHERE external_post_id = '18116571874938100' AND placement = 'feed' LIMIT 1)),
  'historia_fb',    public.promo_metricas_destino((SELECT id FROM public.hermes_publication_targets
                      WHERE external_post_id = '1407041098284359' AND placement = 'story' LIMIT 1))
) AS r;
