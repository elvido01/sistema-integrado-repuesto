-- =====================================================================
-- "LINK EN LA BIO": LA PÁGINA PÚBLICA DE PROMOCIONES
-- ---------------------------------------------------------------------
-- (2026-10-04) Idea sacada del video de herramientas de redes (Metricool
-- tiene una "mini landing para tu perfil de Instagram"). La nuestra sale
-- sola de lo que ya se publicó: repuestos-morla.pages.dev/promos?red=tiktok
-- (public/promos.html). Cada promoción con su foto, precio, "disponible",
-- el código de descuento de ESA red y un botón de WhatsApp con el mensaje ya
-- escrito ("Hola, vi la promo T105 de…"). Quien ve un reel queda a un toque
-- de escribir, y se sabe de qué red vino.
--
-- Lo que se enseña es lo que ya salió en redes: promociones publicadas en
-- los últimos 14 días, con existencia > 0 (no se anuncia lo que no hay), sin
-- decir CUÁNTAS quedan (eso lo verían los competidores) y sin costo.
-- La página entra sin sesión (anon): solo puede leer esto y anotar clics.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.promo_clics (
  id          bigserial PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  producto_id uuid,
  red         text NOT NULL,
  accion      text NOT NULL CHECK (accion IN ('ver', 'whatsapp', 'video', 'mapa')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS promo_clics_tenant_idx ON public.promo_clics (tenant_id, created_at DESC);
ALTER TABLE public.promo_clics ENABLE ROW LEVEL SECURITY;   -- sin políticas: solo por las funciones


CREATE OR REPLACE FUNCTION public.promos_publicas(p_tenant uuid DEFAULT '00000000-0000-0000-0000-000000000001')
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH pub AS (
    -- Lo último publicado de cada pieza en 14 días.
    SELECT DISTINCT ON (j.producto_id)
           j.producto_id, j.publication_bundle_id AS bundle,
           COALESCE(j.completed_at, j.updated_at, j.created_at) AS publicado,
           j.channel_config
      FROM public.hermes_publication_jobs j
     WHERE j.tenant_id = p_tenant
       AND j.producto_id IS NOT NULL
       AND j.status IN ('published', 'partially_published')
       AND j.created_at > now() - interval '14 days'
     ORDER BY j.producto_id, j.created_at DESC
  ), media AS (
    -- La imagen del feed y el reel de esa promoción (vienen en cualquiera de
    -- sus trabajos, uno por red).
    SELECT p.producto_id,
           (SELECT j2.channel_config ->> 'imagen_feed' FROM public.hermes_publication_jobs j2
             WHERE j2.publication_bundle_id = p.bundle AND COALESCE(j2.channel_config ->> 'imagen_feed', '') <> '' LIMIT 1) AS imagen,
           (SELECT j2.channel_config ->> 'video' FROM public.hermes_publication_jobs j2
             WHERE j2.publication_bundle_id = p.bundle AND COALESCE(j2.channel_config ->> 'video', '') <> '' LIMIT 1) AS video
      FROM pub p
  )
  SELECT jsonb_build_object(
    'empresa', (SELECT jsonb_build_object('nombre', c.nombre, 'telefono', c.telefono,
                        'direccion', NULLIF(btrim(COALESCE(c.direccion1, c.direccion, '')), ''), 'logo', c.logo_url)
                  FROM public.config_empresa c WHERE c.tenant_id = p_tenant LIMIT 1),
    'promos', COALESCE((
      SELECT jsonb_agg(x ORDER BY x.publicado DESC)
        FROM (
          SELECT pr.id AS producto_id, pr.descripcion, round(pr.precio, 2) AS precio,
                 COALESCE(m.imagen, pr.imagen_url) AS imagen, m.video, p.publicado,
                 pc.numero AS codigo_numero, pc.pct AS codigo_pct, pc.vence_at AS codigo_vence
            FROM pub p
            JOIN public.productos pr ON pr.id = p.producto_id AND pr.tenant_id = p_tenant
            LEFT JOIN media m ON m.producto_id = p.producto_id
            LEFT JOIN public.promo_codigos pc ON pc.bundle_id = p.bundle AND pc.vence_at > now()
           WHERE COALESCE(pr.activo, true)
             AND pr.precio > 0
             AND COALESCE(public.get_stock_actual(pr.id), 0) > 0
           LIMIT 24
        ) x), '[]'::jsonb)
  );
$function$;

-- Un clic en la página. Sin sesión, así que se valida todo y no se devuelve nada.
CREATE OR REPLACE FUNCTION public.promos_publicas_clic(p_tenant uuid, p_producto uuid, p_red text, p_accion text)
 RETURNS void
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_accion NOT IN ('ver', 'whatsapp', 'video', 'mapa') THEN RETURN; END IF;
  IF p_producto IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.productos WHERE id = p_producto AND tenant_id = p_tenant) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.config_empresa WHERE tenant_id = p_tenant) THEN RETURN; END IF;
  INSERT INTO public.promo_clics (tenant_id, producto_id, red, accion)
  VALUES (p_tenant, p_producto,
          CASE WHEN lower(p_red) IN ('tiktok', 'instagram', 'facebook', 'youtube', 'whatsapp') THEN lower(p_red) ELSE 'otro' END,
          p_accion);
END $function$;

REVOKE ALL ON FUNCTION public.promos_publicas(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.promos_publicas_clic(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promos_publicas(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promos_publicas_clic(uuid, uuid, text, text) TO anon, authenticated;


-- Para Equipo IA: cuánta gente entró desde cada red y cuántos tocaron WhatsApp.
CREATE OR REPLACE FUNCTION public.equipo_promos_clics(p_dias integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v jsonb;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN RAISE EXCEPTION 'Este módulo es del dueño.'; END IF;
  SELECT COALESCE(jsonb_object_agg(red, d), '{}'::jsonb) INTO v FROM (
    SELECT red, jsonb_build_object(
             'visitas', count(*) FILTER (WHERE accion = 'ver'),
             'whatsapp', count(*) FILTER (WHERE accion = 'whatsapp'),
             'videos', count(*) FILTER (WHERE accion = 'video')) AS d
      FROM public.promo_clics
     WHERE tenant_id = v_tenant AND created_at > now() - make_interval(days => GREATEST(1, p_dias))
     GROUP BY red) t;
  RETURN v;
END $function$;
REVOKE ALL ON FUNCTION public.equipo_promos_clics(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_promos_clics(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('promos_link_en_bio.sql');
