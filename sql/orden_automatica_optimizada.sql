-- =====================================================================
-- Orden Automática: optimización de rendimiento (timeout 8s con
-- suplidores grandes — error 57014 al presionar ORDEN AUTOMÁTICA).
-- La versión anterior hacía 6 subconsultas correlacionadas POR PRODUCTO
-- (stock, ventas 15/30/90/180d, en camino) escaneando facturas_detalle
-- completo cada vez. Esta versión calcula los agregados por bucket en
-- UN solo pase con GROUP BY + FILTER. La lógica de negocio es idéntica:
-- buckets por grupo de equivalentes, punto de reorden y stock objetivo
-- dinámicos por lead time, resta de lo en camino y borradores.
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_facturas_detalle_producto
  ON public.facturas_detalle (producto_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_detalle_producto
  ON public.ordenes_compra_detalle (producto_id);

CREATE OR REPLACE FUNCTION public.get_productos_para_orden_automatica(p_suplidor_id uuid)
RETURNS TABLE(id uuid, codigo text, descripcion text, existencia numeric, min_stock numeric, max_stock numeric, precio numeric, costo numeric, itbis_pct numeric, ventas_90d numeric, cantidad_sugerida integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_lt           JSON;
  v_cob_reorden  NUMERIC := 15.0;
  v_cob_objetivo NUMERIC := 22.0;
BEGIN
  -- Calibracion por suplidor (lead time + ciclo de compra reales)
  BEGIN
    v_lt := public.get_suplidor_lead_time(p_suplidor_id);
    v_cob_reorden  := COALESCE((v_lt->>'cobertura_reorden')::NUMERIC, 15.0);
    v_cob_objetivo := COALESCE((v_lt->>'cobertura_objetivo')::NUMERIC, 22.0);
  EXCEPTION WHEN OTHERS THEN
    v_cob_reorden := 15.0; v_cob_objetivo := 22.0;
  END;

  RETURN QUERY
  WITH productos_suplidor AS (
    SELECT
      p.id,
      p.codigo,
      p.descripcion,
      p.suplidor_id,
      public.get_stock_actual(p.id)::NUMERIC AS existencia,
      COALESCE(p.min_stock, 0)::NUMERIC AS min_stock,
      COALESCE(p.max_stock, 0)::NUMERIC AS max_stock,
      COALESCE(p.precio, 0)::NUMERIC AS precio,
      COALESCE(
        NULLIF(p.costo, 0),
        (
          SELECT NULLIF(pr.costo, 0)
          FROM public.presentaciones pr
          WHERE pr.producto_id = p.id
          LIMIT 1
        ),
        NULLIF(p.precio, 0),
        0
      )::NUMERIC AS costo,
      COALESCE(p.itbis_pct, 0)::NUMERIC AS itbis_pct,
      gm.grupo_id
    FROM public.productos p
    LEFT JOIN public.producto_grupo_miembros gm ON gm.producto_id = p.id
    WHERE p.suplidor_id = p_suplidor_id
      AND COALESCE(p.activo, true) = true
      AND NOT public.producto_en_suplidor_virtual(p.id)
  ),
  grupo_base AS (
    SELECT
      ps.*,
      COALESCE(ps.grupo_id::TEXT, ps.id::TEXT) AS bucket_id
    FROM productos_suplidor ps
  ),
  -- Miembros de esos buckets en TODO el catálogo (incluye equivalentes
  -- de otros suplidores, igual que la versión anterior)
  miembros AS (
    SELECT px.id AS producto_id,
           COALESCE(gmx.grupo_id::TEXT, px.id::TEXT) AS bucket_id
    FROM public.productos px
    LEFT JOIN public.producto_grupo_miembros gmx ON gmx.producto_id = px.id
    WHERE COALESCE(px.activo, true) = true
      AND COALESCE(gmx.grupo_id::TEXT, px.id::TEXT) IN (SELECT gb.bucket_id FROM grupo_base gb)
  ),
  stock_bucket_agg AS (
    SELECT mi.bucket_id, SUM(public.get_stock_actual(mi.producto_id))::NUMERIC AS stock_bucket
    FROM miembros mi
    GROUP BY mi.bucket_id
  ),
  ventas_bucket_agg AS (
    SELECT mi.bucket_id,
      COALESCE(SUM(fd.cantidad) FILTER (WHERE f.fecha >= NOW() - INTERVAL '15 days'), 0)::NUMERIC AS v15,
      COALESCE(SUM(fd.cantidad) FILTER (WHERE f.fecha >= NOW() - INTERVAL '30 days'), 0)::NUMERIC AS v30,
      COALESCE(SUM(fd.cantidad) FILTER (WHERE f.fecha >= NOW() - INTERVAL '90 days'), 0)::NUMERIC AS v90,
      COALESCE(SUM(fd.cantidad), 0)::NUMERIC AS v180
    FROM miembros mi
    JOIN public.facturas_detalle fd ON fd.producto_id = mi.producto_id
    JOIN public.facturas f ON f.id = fd.factura_id
    WHERE COALESCE(f.estado, '') <> 'Anulada'
      AND f.fecha >= NOW() - INTERVAL '180 days'
    GROUP BY mi.bucket_id
  ),
  camino_bucket_agg AS (
    SELECT mi.bucket_id,
      SUM(COALESCE(ocd.cantidad_pendiente, GREATEST(COALESCE(ocd.cantidad, 0) - COALESCE(ocd.cantidad_recibida, 0), 0)))::NUMERIC AS en_camino
    FROM miembros mi
    JOIN public.ordenes_compra_detalle ocd ON ocd.producto_id = mi.producto_id
    JOIN public.ordenes_compra oc ON oc.id = ocd.orden_compra_id
    WHERE COALESCE(oc.estado, 'Pendiente') IN ('Enviada', 'Parcial')
      AND COALESCE(ocd.estado_linea, 'pendiente') IN ('pendiente', 'parcial')
    GROUP BY mi.bucket_id
  ),
  borrador_prod_agg AS (
    SELECT ocd.producto_id, SUM(ocd.cantidad)::NUMERIC AS en_borrador
    FROM public.ordenes_compra_detalle ocd
    JOIN public.ordenes_compra oc ON oc.id = ocd.orden_compra_id
    WHERE oc.suplidor_id = p_suplidor_id
      AND COALESCE(oc.estado, 'Pendiente') = 'Pendiente'
    GROUP BY ocd.producto_id
  ),
  metricas AS (
    SELECT
      gb.*,
      COALESCE(sb.stock_bucket, 0) AS stock_bucket,
      COALESCE(vb.v15, 0) AS ventas_15d_bucket,
      COALESCE(vb.v30, 0) AS ventas_30d_bucket,
      COALESCE(vb.v90, 0) AS ventas_90d_bucket,
      COALESCE(vb.v180, 0) AS ventas_180d_bucket,
      COALESCE(cb.en_camino, 0) AS cantidad_en_camino_bucket,
      COALESCE(bp.en_borrador, 0) AS cantidad_borrador_producto
    FROM grupo_base gb
    LEFT JOIN stock_bucket_agg sb ON sb.bucket_id = gb.bucket_id
    LEFT JOIN ventas_bucket_agg vb ON vb.bucket_id = gb.bucket_id
    LEFT JOIN camino_bucket_agg cb ON cb.bucket_id = gb.bucket_id
    LEFT JOIN borrador_prod_agg bp ON bp.producto_id = gb.id
  ),
  calculado AS (
    SELECT
      m.*,
      GREATEST(m.ventas_15d_bucket / 15.0, m.ventas_30d_bucket / 30.0, m.ventas_90d_bucket / 90.0, m.ventas_180d_bucket / 180.0) AS demanda_diaria,
      GREATEST(
        m.min_stock,
        CEIL(GREATEST(m.ventas_15d_bucket / 15.0, m.ventas_30d_bucket / 30.0, m.ventas_90d_bucket / 90.0, m.ventas_180d_bucket / 180.0) * v_cob_reorden),
        CASE WHEN m.ventas_180d_bucket > 0 AND m.stock_bucket <= 0 THEN 1 ELSE 0 END
      ) AS punto_reorden,
      CASE
        WHEN m.ventas_30d_bucket <= 0
          AND m.ventas_180d_bucket > 0
          AND m.stock_bucket <= 0
        THEN GREATEST(1, m.min_stock)
        ELSE GREATEST(
          CASE WHEN m.max_stock > 0 THEN m.max_stock ELSE 0 END,
          CEIL(GREATEST(m.ventas_15d_bucket / 15.0, m.ventas_30d_bucket / 30.0, m.ventas_90d_bucket / 90.0, m.ventas_180d_bucket / 180.0) * v_cob_objetivo),
          CASE WHEN m.ventas_180d_bucket > 0 AND m.stock_bucket <= 0 THEN 1 ELSE 0 END,
          m.min_stock + 1
        )
      END AS stock_objetivo
    FROM metricas m
    WHERE GREATEST(m.ventas_15d_bucket, m.ventas_30d_bucket, m.ventas_90d_bucket, m.ventas_180d_bucket) > 0
  )
  SELECT
    c.id,
    c.codigo,
    c.descripcion,
    c.existencia,
    c.min_stock,
    c.max_stock,
    c.precio,
    c.costo,
    c.itbis_pct,
    c.ventas_90d_bucket AS ventas_90d,
    GREATEST(0, CEIL(c.stock_objetivo - c.stock_bucket - c.cantidad_en_camino_bucket - c.cantidad_borrador_producto))::INT AS cantidad_sugerida
  FROM calculado c
  WHERE c.stock_bucket + c.cantidad_en_camino_bucket + c.cantidad_borrador_producto <= c.punto_reorden
    AND c.stock_objetivo - c.stock_bucket - c.cantidad_en_camino_bucket - c.cantidad_borrador_producto > 0
  ORDER BY
    (c.punto_reorden - (c.stock_bucket + c.cantidad_en_camino_bucket + c.cantidad_borrador_producto)) DESC,
    c.ventas_15d_bucket DESC,
    c.ventas_30d_bucket DESC,
    c.codigo ASC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_productos_para_orden_automatica(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('orden_automatica_optimizada.sql');
  END IF;
END $$;

SELECT 'Orden automática optimizada (sin timeout) lista' AS status;
