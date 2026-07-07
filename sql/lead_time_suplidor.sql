-- ============================================================
-- LEAD TIME REAL POR SUPLIDOR (auto-calibrado con el historial)
-- ============================================================
-- Pedido 2026-07-07: la formula de la Orden Automatica usaba dias
-- FIJOS para todos los suplidores (reorden a 15 dias de venta,
-- objetivo 22 dias). Pero hay suplidores que entregan en 3-4 dias y
-- visitan cada semana: el sistema compraba cobertura de mas.
--
-- Ahora el sistema se calibra SOLO con las fechas que ya guarda:
--   lead  = mediana de dias entre la orden y la llegada de la compra
--           (via compras.id_orden_origen; si no hay vinculo, la orden
--           mas reciente del suplidor antes de la compra, max 21d)
--   ciclo = mediana de dias entre compras sucesivas al suplidor
--           (= cada cuanto te visita / le compras)
--
--   cobertura de reorden  = lead + 3 dias de colchon   (antes 15)
--   cobertura objetivo    = lead + ciclo + 2 dias      (antes 22)
--   (con topes: reorden 5..21, objetivo 8..30; sin historia: 7 y 7
--    -> reorden 10, objetivo 16, mas conservador que el viejo 15/22)
--
-- Se recalcula EN CADA llamada -> se va ajustando solo con cada
-- compra nueva. get_suplidor_lead_time tambien se expone para que la
-- pantalla muestre la calibracion del suplidor.
-- Re-ejecutable. Correr en PRODUCCION.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_suplidor_lead_time(p_suplidor_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant       UUID;
  v_lead_raw     NUMERIC;
  v_ciclo_raw    NUMERIC;
  v_lead         INT;
  v_ciclo        INT;
  v_muestras_l   INT := 0;
  v_muestras_c   INT := 0;
  v_cob_reorden  INT;
  v_cob_objetivo INT;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.proveedores WHERE id = p_suplidor_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Suplidor no encontrado'; END IF;

  -- LEAD: dias orden -> compra (ultimo año)
  WITH directas AS (
    SELECT (c.fecha - oc.fecha_orden) AS dias
    FROM public.compras c
    JOIN public.ordenes_compra oc ON oc.id = c.id_orden_origen
    WHERE c.tenant_id = v_tenant AND c.suplidor_id = p_suplidor_id
      AND COALESCE(c.estado,'') NOT ILIKE '%anul%'
      AND c.fecha >= CURRENT_DATE - 365
      AND (c.fecha - oc.fecha_orden) BETWEEN 0 AND 30
  ),
  aproximadas AS (
    SELECT (c.fecha - oc.fecha_orden) AS dias
    FROM public.compras c
    JOIN LATERAL (
      SELECT o.fecha_orden
      FROM public.ordenes_compra o
      WHERE o.tenant_id = v_tenant AND o.suplidor_id = p_suplidor_id
        AND o.fecha_orden <= c.fecha AND o.fecha_orden >= c.fecha - 21
      ORDER BY o.fecha_orden DESC
      LIMIT 1
    ) oc ON true
    WHERE c.tenant_id = v_tenant AND c.suplidor_id = p_suplidor_id
      AND c.id_orden_origen IS NULL
      AND COALESCE(c.estado,'') NOT ILIKE '%anul%'
      AND c.fecha >= CURRENT_DATE - 365
  ),
  todas AS (SELECT dias FROM directas UNION ALL SELECT dias FROM aproximadas)
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY dias), COUNT(*)
    INTO v_lead_raw, v_muestras_l
  FROM todas;

  -- CICLO: dias entre compras sucesivas (ultimo año)
  WITH fechas AS (
    SELECT DISTINCT fecha FROM public.compras
    WHERE tenant_id = v_tenant AND suplidor_id = p_suplidor_id
      AND COALESCE(estado,'') NOT ILIKE '%anul%'
      AND fecha >= CURRENT_DATE - 365
  ),
  difs AS (
    SELECT (fecha - LAG(fecha) OVER (ORDER BY fecha)) AS d FROM fechas
  )
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY d), COUNT(*)
    INTO v_ciclo_raw, v_muestras_c
  FROM difs WHERE d BETWEEN 1 AND 60;

  v_lead  := LEAST(21, GREATEST(1, COALESCE(ROUND(v_lead_raw), 7)))::INT;
  v_ciclo := LEAST(30, GREATEST(3, COALESCE(ROUND(v_ciclo_raw), 7)))::INT;
  v_cob_reorden  := LEAST(21, GREATEST(5, v_lead + 3));
  v_cob_objetivo := LEAST(30, GREATEST(8, v_lead + v_ciclo + 2));

  RETURN json_build_object(
    'suplidor_id',        p_suplidor_id,
    'lead_dias',          v_lead,
    'ciclo_dias',         v_ciclo,
    'cobertura_reorden',  v_cob_reorden,
    'cobertura_objetivo', v_cob_objetivo,
    'muestras_lead',      v_muestras_l,
    'muestras_ciclo',     v_muestras_c,
    'calibrado',          (v_muestras_l >= 2 OR v_muestras_c >= 2)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_suplidor_lead_time(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_suplidor_lead_time(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Orden Automatica v1: coberturas dinamicas en vez de 15/22 fijos
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_productos_para_orden_automatica(p_suplidor_id UUID)
RETURNS TABLE(
  id UUID,
  codigo TEXT,
  descripcion TEXT,
  existencia NUMERIC,
  min_stock NUMERIC,
  max_stock NUMERIC,
  precio NUMERIC,
  costo NUMERIC,
  itbis_pct NUMERIC,
  ventas_90d NUMERIC,
  cantidad_sugerida INT
) AS $$
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
  metricas AS (
    SELECT
      gb.*,
      COALESCE((
        SELECT SUM(public.get_stock_actual(px.id))
        FROM public.productos px
        LEFT JOIN public.producto_grupo_miembros gmx ON gmx.producto_id = px.id
        WHERE COALESCE(gmx.grupo_id::TEXT, px.id::TEXT) = gb.bucket_id
          AND COALESCE(px.activo, true) = true
      ), 0)::NUMERIC AS stock_bucket,
      COALESCE((
        SELECT SUM(fd.cantidad)
        FROM public.facturas_detalle fd
        JOIN public.facturas f ON f.id = fd.factura_id
        JOIN public.productos px ON px.id = fd.producto_id
        LEFT JOIN public.producto_grupo_miembros gmx ON gmx.producto_id = px.id
        WHERE COALESCE(gmx.grupo_id::TEXT, px.id::TEXT) = gb.bucket_id
          AND COALESCE(f.estado, '') <> 'Anulada'
          AND f.fecha >= NOW() - INTERVAL '15 days'
      ), 0)::NUMERIC AS ventas_15d_bucket,
      COALESCE((
        SELECT SUM(fd.cantidad)
        FROM public.facturas_detalle fd
        JOIN public.facturas f ON f.id = fd.factura_id
        JOIN public.productos px ON px.id = fd.producto_id
        LEFT JOIN public.producto_grupo_miembros gmx ON gmx.producto_id = px.id
        WHERE COALESCE(gmx.grupo_id::TEXT, px.id::TEXT) = gb.bucket_id
          AND COALESCE(f.estado, '') <> 'Anulada'
          AND f.fecha >= NOW() - INTERVAL '30 days'
      ), 0)::NUMERIC AS ventas_30d_bucket,
      COALESCE((
        SELECT SUM(fd.cantidad)
        FROM public.facturas_detalle fd
        JOIN public.facturas f ON f.id = fd.factura_id
        JOIN public.productos px ON px.id = fd.producto_id
        LEFT JOIN public.producto_grupo_miembros gmx ON gmx.producto_id = px.id
        WHERE COALESCE(gmx.grupo_id::TEXT, px.id::TEXT) = gb.bucket_id
          AND COALESCE(f.estado, '') <> 'Anulada'
          AND f.fecha >= NOW() - INTERVAL '90 days'
      ), 0)::NUMERIC AS ventas_90d_bucket,
      COALESCE((
        SELECT SUM(fd.cantidad)
        FROM public.facturas_detalle fd
        JOIN public.facturas f ON f.id = fd.factura_id
        JOIN public.productos px ON px.id = fd.producto_id
        LEFT JOIN public.producto_grupo_miembros gmx ON gmx.producto_id = px.id
        WHERE COALESCE(gmx.grupo_id::TEXT, px.id::TEXT) = gb.bucket_id
          AND COALESCE(f.estado, '') <> 'Anulada'
          AND f.fecha >= NOW() - INTERVAL '180 days'
      ), 0)::NUMERIC AS ventas_180d_bucket,
      COALESCE((
        SELECT SUM(COALESCE(ocd.cantidad_pendiente, GREATEST(COALESCE(ocd.cantidad, 0) - COALESCE(ocd.cantidad_recibida, 0), 0)))
        FROM public.ordenes_compra_detalle ocd
        JOIN public.ordenes_compra oc ON oc.id = ocd.orden_compra_id
        JOIN public.productos px ON px.id = ocd.producto_id
        LEFT JOIN public.producto_grupo_miembros gmx ON gmx.producto_id = px.id
        WHERE COALESCE(gmx.grupo_id::TEXT, px.id::TEXT) = gb.bucket_id
          AND COALESCE(oc.estado, 'Pendiente') IN ('Enviada', 'Parcial')
          AND COALESCE(ocd.estado_linea, 'pendiente') IN ('pendiente', 'parcial')
      ), 0)::NUMERIC AS cantidad_en_camino_bucket,
      COALESCE((
        SELECT SUM(ocd.cantidad)
        FROM public.ordenes_compra_detalle ocd
        JOIN public.ordenes_compra oc ON oc.id = ocd.orden_compra_id
        WHERE ocd.producto_id = gb.id
          AND oc.suplidor_id = p_suplidor_id
          AND COALESCE(oc.estado, 'Pendiente') = 'Pendiente'
      ), 0)::NUMERIC AS cantidad_borrador_producto
    FROM grupo_base gb
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
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.get_productos_para_orden_automatica(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regproc('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('lead_time_suplidor.sql');
  END IF;
END $$;

SELECT 'Lead time auto-calibrado por suplidor listo' AS status;
