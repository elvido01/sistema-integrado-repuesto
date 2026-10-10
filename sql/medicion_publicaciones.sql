-- =====================================================================
-- MEDICIÓN DE EFECTIVIDAD DE LAS PUBLICACIONES (por ahora solo Morla)
-- =====================================================================
-- (10/10/2026) El dueño sube el presupuesto de IA a US$20/mes "porque las
-- publicaciones son fundamentales" y quiere saber cuáles venden para
-- dedicarles el esfuerzo. Hoy no se podía: de 458 ventas en 30 días, las 458
-- dicen "tienda"; 9 de las 11 promociones salieron SIN descuento (decisión
-- del 04/10) y sin descuento no hay código que el cliente diga.
--
-- Medición que no depende del cliente ni del cajero: por cada promoción
-- (publication_bundle), las ventas de ESA pieza 7 días antes vs 7 días
-- después de publicarla, junto a su costo de IA y su alcance (Metricool).
-- Si aún no pasan 7 días, se compara por día (promedio diario).
--
-- Interruptor por empresa: config_empresa.feat_medicion_publicaciones
-- (encendido solo en Repuestos Morla). Sin él la función no devuelve nada.
-- Costo de IA: estimado por formato con los promedios reales medidos el
-- 10/10 (pieza imagen = cuadrada + vertical US$0.163; reel US$0.21).
-- =====================================================================

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS feat_medicion_publicaciones boolean NOT NULL DEFAULT false;

UPDATE public.config_empresa SET feat_medicion_publicaciones = true
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001';

CREATE OR REPLACE FUNCTION public.efectividad_publicaciones(p_dias integer DEFAULT 60)
RETURNS TABLE (
  bundle_id          uuid,
  producto_id        uuid,
  codigo             text,
  descripcion        text,
  publicado_at       timestamptz,
  formato            text,
  redes              text[],
  con_descuento      boolean,
  codigo_promo       integer,
  costo_ia_usd       numeric,
  alcance            bigint,
  vistas             bigint,
  interacciones      bigint,
  clics              bigint,
  dias_despues       numeric,
  uds_antes          numeric,
  uds_despues        numeric,
  ventas_antes       numeric,
  ventas_despues     numeric,
  uds_dia_antes      numeric,
  uds_dia_despues    numeric,
  ventas_con_codigo  bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH emp AS (
    SELECT get_user_tenant() AS t
     WHERE EXISTS (SELECT 1 FROM config_empresa c
                    WHERE c.tenant_id = get_user_tenant() AND c.feat_medicion_publicaciones)
  ),
  b AS (
    SELECT j.publication_bundle_id                                   AS bundle_id,
           (array_agg(j.producto_id))[1]                             AS producto_id,
           min(coalesce(j.completed_at, j.scheduled_for, j.created_at)) AS publicado_at,
           CASE WHEN bool_or(j.media_type = 'video') THEN 'reel' ELSE 'imagen' END AS formato,
           array_agg(DISTINCT ch ORDER BY ch) FILTER (WHERE ch IS NOT NULL) AS redes,
           NOT bool_or(coalesce((j.channel_config->>'sin_descuento')::boolean, false)) AS con_descuento,
           array_agg(DISTINCT j.id)                                  AS jobs
      FROM hermes_publication_jobs j
      LEFT JOIN LATERAL unnest(j.channels) ch ON true
     WHERE j.tenant_id = (SELECT t FROM emp)
       AND j.status = 'published'
       AND j.publication_bundle_id IS NOT NULL
       AND j.producto_id IS NOT NULL
       AND j.created_at > now() - make_interval(days => p_dias)
     GROUP BY j.publication_bundle_id
  ),
  met AS (   -- última foto de métricas de cada post de la promoción
    SELECT b.bundle_id,
           sum(m.reach)       AS alcance,
           sum(m.views)       AS vistas,
           sum(coalesce(m.likes,0) + coalesce(m.comments,0) + coalesce(m.shares,0) + coalesce(m.saves,0)) AS interacciones,
           sum(m.clicks)      AS clics
      FROM b
      JOIN social_posts sp ON sp.publication_job_id = ANY (b.jobs)
      JOIN LATERAL (SELECT * FROM social_post_metrics x WHERE x.post_id = sp.id
                     ORDER BY x.snapshot_date DESC NULLS LAST, x.captured_at DESC LIMIT 1) m ON true
     GROUP BY b.bundle_id
  ),
  ven AS (
    SELECT b.bundle_id,
           sum(d.cantidad) FILTER (WHERE f.fecha <  b.publicado_at)              AS uds_antes,
           sum(d.cantidad) FILTER (WHERE f.fecha >= b.publicado_at)              AS uds_despues,
           sum(d.importe)  FILTER (WHERE f.fecha <  b.publicado_at)              AS ventas_antes,
           sum(d.importe)  FILTER (WHERE f.fecha >= b.publicado_at)              AS ventas_despues
      FROM b
      JOIN facturas_detalle d ON d.producto_id = b.producto_id AND d.tenant_id = (SELECT t FROM emp)
      JOIN facturas f ON f.id = d.factura_id
     WHERE f.estado IS DISTINCT FROM 'ANULADA'
       AND f.fecha >= b.publicado_at - interval '7 days'
       AND f.fecha <  b.publicado_at + interval '7 days'
     GROUP BY b.bundle_id
  )
  SELECT b.bundle_id, b.producto_id, p.codigo, p.descripcion, b.publicado_at, b.formato, b.redes,
         b.con_descuento,
         pc.numero                                                            AS codigo_promo,
         (CASE b.formato WHEN 'reel' THEN 0.21 ELSE 0.163 END)::numeric        AS costo_ia_usd,
         coalesce(met.alcance, 0)::bigint                                     AS alcance,
         coalesce(met.vistas, 0)::bigint                                      AS vistas,
         coalesce(met.interacciones, 0)::bigint                               AS interacciones,
         coalesce(met.clics, 0)::bigint                                       AS clics,
         round(least(7, extract(epoch FROM now() - b.publicado_at) / 86400)::numeric, 1) AS dias_despues,
         coalesce(ven.uds_antes, 0)                                           AS uds_antes,
         coalesce(ven.uds_despues, 0)                                         AS uds_despues,
         round(coalesce(ven.ventas_antes, 0), 2)                              AS ventas_antes,
         round(coalesce(ven.ventas_despues, 0), 2)                            AS ventas_despues,
         round(coalesce(ven.uds_antes, 0) / 7.0, 2)                           AS uds_dia_antes,
         round(coalesce(ven.uds_despues, 0)
               / greatest(1, least(7, extract(epoch FROM now() - b.publicado_at) / 86400))::numeric, 2) AS uds_dia_despues,
         (SELECT count(*) FROM facturas f2
           WHERE f2.promo_codigo_id = pc.id AND f2.estado IS DISTINCT FROM 'ANULADA') AS ventas_con_codigo
    FROM b
    JOIN productos p ON p.id = b.producto_id
    LEFT JOIN promo_codigos pc ON pc.bundle_id = b.bundle_id
    LEFT JOIN met ON met.bundle_id = b.bundle_id
    LEFT JOIN ven ON ven.bundle_id = b.bundle_id
   ORDER BY b.publicado_at DESC;
$$;

REVOKE ALL ON FUNCTION public.efectividad_publicaciones(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.efectividad_publicaciones(integer) TO authenticated, service_role;

SELECT public.registrar_migracion('medicion_publicaciones.sql');
