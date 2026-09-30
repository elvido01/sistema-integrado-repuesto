-- =====================================================================
-- Hermes sabe que esta en promocion
-- ---------------------------------------------------------------------
-- (2026-09-30) La casa publica una promocion al dia (Equipo IA). El que
-- escribe "precio de la banda?" casi siempre la vio. Hermes contestaba sin
-- saberlo, y el vendedor tenia que ir a buscar el arte para mandarlo.
--
-- Esto devuelve lo publicado en los ultimos 7 dias: producto, precio que
-- salio en el arte y la imagen (publica, bucket ai-marketing). Lo usa
-- hermes-sugerir para decirlo en la respuesta y para que la extension
-- ofrezca "Mandar arte" en un toque.
--
-- Solo lee. Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.hermes_promociones_activas()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
BEGIN
  IF v_tenant IS NULL THEN RETURN '[]'::json; END IF;

  RETURN COALESCE((
    SELECT json_agg(x ORDER BY x.publicada DESC)
    FROM (
      SELECT j.publication_bundle_id AS bundle_id,
             j.producto_id,
             max(p.codigo)                AS codigo,
             max(p.descripcion)           AS descripcion,
             max(j.precio_mostrado)       AS precio,
             -- El arte (imagen): los trabajos de video del mismo bundle no traen image_url.
             max(j.image_url) FILTER (WHERE j.media_type = 'image' OR j.image_url IS NOT NULL) AS imagen_url,
             min(t.published_at)          AS publicada
        FROM public.hermes_publication_jobs j
        JOIN public.hermes_publication_targets t
          ON t.job_id = j.id AND t.status = 'published' AND t.published_at IS NOT NULL
        LEFT JOIN public.productos p ON p.id = j.producto_id
       WHERE j.tenant_id = v_tenant
         AND j.producto_id IS NOT NULL
         AND t.published_at > now() - interval '7 days'
       GROUP BY j.publication_bundle_id, j.producto_id
    ) x
  ), '[]'::json);
END $$;

REVOKE EXECUTE ON FUNCTION public.hermes_promociones_activas() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.hermes_promociones_activas() TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('hermes_conoce_las_promociones.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'hermes_promociones_activas')
            THEN 'OK  hermes_promociones_activas' ELSE '*** FALLO ***' END AS fn;
