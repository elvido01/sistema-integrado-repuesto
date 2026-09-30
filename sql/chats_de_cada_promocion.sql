-- =====================================================================
-- ¿Cuántos preguntaron por cada promoción?
-- ---------------------------------------------------------------------
-- (2026-09-30) Equipo IA ya muestra de cada promoción las vistas (métricas),
-- los comentarios y las ventas del producto. Faltaba el paso del medio: la
-- gente que escribió por ella. Sin eso no se distingue "la vieron y nadie
-- preguntó" de "preguntaron y no se cerró".
--
-- Cuenta CONVERSACIONES (no mensajes) de los 7 días después de publicar
-- donde el cliente:
--   a) comentó en la publicación misma (Facebook/Instagram), o
--   b) escribió por cualquier canal nombrando el TIPO de pieza: la primera
--      palabra de la descripción ("banda", "aceite", "amortiguador"), con su
--      plural. Es la misma regla con que Hermes detecta la promoción
--      (_shared/promoDeLaPregunta.mjs). "platina" o "bajaj" no bastan: están
--      en casi todas las promociones.
--
-- WhatsApp cuenta lo que copió el espejo (los chats que se abrieron).
-- Solo lee. Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.promo_chats_de_promociones(p_bundle_ids uuid[])
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
BEGIN
  IF v_tenant IS NULL OR p_bundle_ids IS NULL THEN RETURN '[]'::json; END IF;

  RETURN COALESCE((
    WITH b AS (
      SELECT j.publication_bundle_id AS bid,
             (array_agg(j.producto_id) FILTER (WHERE j.producto_id IS NOT NULL))[1] AS pid,
             min(t.published_at) AS desde,
             array_agg(DISTINCT t.external_post_id) FILTER (WHERE t.external_post_id IS NOT NULL) AS posts
        FROM public.hermes_publication_jobs j
        JOIN public.hermes_publication_targets t
          ON t.job_id = j.id AND t.status = 'published' AND t.published_at IS NOT NULL
       WHERE j.tenant_id = v_tenant
         AND j.publication_bundle_id = ANY (p_bundle_ids)
       GROUP BY j.publication_bundle_id
    ),
    f AS (
      SELECT b.*,
             (SELECT w FROM regexp_split_to_table(translate(lower(p.descripcion), 'áéíóúñ', 'aeioun'), '[^a-z0-9]+') w
               WHERE length(w) >= 4 LIMIT 1) AS fam
        FROM b JOIN public.productos p ON p.id = b.pid
    ),
    hits AS (
      SELECT DISTINCT f.bid, m.conversation_id, m.platform
        FROM f
        JOIN public.sales_messages m
          ON m.tenant_id = v_tenant
         AND m.sender_type = 'user'
         AND m.created_at >= f.desde
         AND m.created_at <  f.desde + interval '7 days'
       WHERE (f.fam IS NOT NULL
              AND translate(lower(COALESCE(m.message_text, '')), 'áéíóúñ', 'aeioun') ~ ('\m' || f.fam || '(s|es)?\M'))
          OR (m.message_type = 'comment'
              AND COALESCE(m.raw_data->'media'->>'id', m.raw_data->'feed'->>'post_id') = ANY (f.posts))
    ),
    por AS (
      SELECT bid, platform, count(DISTINCT conversation_id) AS n FROM hits GROUP BY bid, platform
    )
    SELECT json_agg(json_build_object(
             'bundle_id', f.bid,
             'chats', COALESCE((SELECT count(DISTINCT h.conversation_id) FROM hits h WHERE h.bid = f.bid), 0),
             'por_canal', COALESCE((SELECT json_object_agg(por.platform, por.n) FROM por WHERE por.bid = f.bid), '{}'::json)))
      FROM f
  ), '[]'::json);
END $$;

REVOKE EXECUTE ON FUNCTION public.promo_chats_de_promociones(uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.promo_chats_de_promociones(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('chats_de_cada_promocion.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'promo_chats_de_promociones')
            THEN 'OK  promo_chats_de_promociones' ELSE '*** FALLO ***' END AS fn;
