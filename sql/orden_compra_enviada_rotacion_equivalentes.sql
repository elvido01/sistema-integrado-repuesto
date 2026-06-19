-- ============================================================
-- Orden de Compra: pedido enviado + rotacion por equivalentes
-- ============================================================
-- Objetivo:
-- - Separar orden sugerida/editable de pedido confirmado al suplidor.
-- - Mantener cantidades pedidas/recibidas/pendientes por linea.
-- - Hacer la orden automatica menos conservadora:
--   * reponer cuando stock+en_camino <= punto_reorden
--   * usar ventas recientes 15/30/90 dias y memoria de baja rotacion a 180 dias
--   * descontar pedidos en camino del grupo equivalente completo
--   * sugerir 1 unidad defensiva si se vendio en 180 dias y no hay existencia
-- ============================================================

ALTER TABLE public.ordenes_compra
  ADD COLUMN IF NOT EXISTS fecha_enviada TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_recibida TIMESTAMPTZ;

ALTER TABLE public.ordenes_compra_detalle
  ADD COLUMN IF NOT EXISTS cantidad_pedida NUMERIC,
  ADD COLUMN IF NOT EXISTS cantidad_recibida NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cantidad_pendiente NUMERIC,
  ADD COLUMN IF NOT EXISTS estado_linea TEXT NOT NULL DEFAULT 'pendiente';

UPDATE public.ordenes_compra_detalle
SET
  cantidad_pedida = COALESCE(cantidad_pedida, cantidad, 0),
  cantidad_recibida = COALESCE(cantidad_recibida, 0),
  cantidad_pendiente = COALESCE(cantidad_pendiente, GREATEST(COALESCE(cantidad, 0) - COALESCE(cantidad_recibida, 0), 0)),
  estado_linea = CASE
    WHEN COALESCE(cantidad_recibida, 0) <= 0 THEN 'pendiente'
    WHEN COALESCE(cantidad_recibida, 0) >= COALESCE(cantidad, 0) THEN 'recibida'
    ELSE 'parcial'
  END
WHERE cantidad_pedida IS NULL
   OR cantidad_pendiente IS NULL;

ALTER TABLE public.ordenes_compra_detalle
  DROP CONSTRAINT IF EXISTS chk_ordenes_compra_detalle_estado_linea;

ALTER TABLE public.ordenes_compra_detalle
  ADD CONSTRAINT chk_ordenes_compra_detalle_estado_linea
  CHECK (estado_linea IN ('pendiente', 'parcial', 'recibida', 'cancelada'));

ALTER TABLE public.ordenes_compra
  DROP CONSTRAINT IF EXISTS chk_ordenes_compra_estado;

ALTER TABLE public.ordenes_compra
  ADD CONSTRAINT chk_ordenes_compra_estado
  CHECK (estado IN ('Pendiente', 'Enviada', 'Parcial', 'Recibida', 'Anulada'));

CREATE INDEX IF NOT EXISTS idx_oc_estado_suplidor ON public.ordenes_compra(estado, suplidor_id);
CREATE INDEX IF NOT EXISTS idx_ocd_producto_estado ON public.ordenes_compra_detalle(producto_id, estado_linea);

CREATE OR REPLACE FUNCTION public.confirmar_orden_compra_enviada(p_orden_id UUID)
RETURNS public.ordenes_compra
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_orden public.ordenes_compra;
BEGIN
  UPDATE public.ordenes_compra_detalle
  SET
    cantidad_pedida = COALESCE(cantidad_pedida, cantidad, 0),
    cantidad_pendiente = GREATEST(COALESCE(cantidad_pedida, cantidad, 0) - COALESCE(cantidad_recibida, 0), 0),
    estado_linea = CASE
      WHEN COALESCE(cantidad_recibida, 0) <= 0 THEN 'pendiente'
      WHEN COALESCE(cantidad_recibida, 0) >= COALESCE(cantidad_pedida, cantidad, 0) THEN 'recibida'
      ELSE 'parcial'
    END
  WHERE orden_compra_id = p_orden_id;

  UPDATE public.ordenes_compra
  SET
    estado = 'Enviada',
    fecha_enviada = COALESCE(fecha_enviada, NOW()),
    updated_at = NOW()
  WHERE id = p_orden_id
    AND estado IN ('Pendiente', 'Parcial', 'Enviada')
  RETURNING * INTO v_orden;

  IF v_orden.id IS NULL THEN
    RAISE EXCEPTION 'No se pudo confirmar la orden %', p_orden_id;
  END IF;

  RETURN v_orden;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_orden_compra_enviada(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recalcular_estado_recepcion_orden(p_orden_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total INT;
  v_pendientes INT;
  v_recibidas INT;
  v_estado TEXT;
BEGIN
  UPDATE public.ordenes_compra_detalle
  SET
    cantidad_pedida = COALESCE(cantidad_pedida, cantidad, 0),
    cantidad_pendiente = GREATEST(COALESCE(cantidad_pedida, cantidad, 0) - COALESCE(cantidad_recibida, 0), 0),
    estado_linea = CASE
      WHEN COALESCE(cantidad_recibida, 0) <= 0 THEN 'pendiente'
      WHEN COALESCE(cantidad_recibida, 0) >= COALESCE(cantidad_pedida, cantidad, 0) THEN 'recibida'
      ELSE 'parcial'
    END
  WHERE orden_compra_id = p_orden_id
    AND estado_linea <> 'cancelada';

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE COALESCE(cantidad_pendiente, cantidad, 0) > 0 AND estado_linea <> 'cancelada'),
    COUNT(*) FILTER (WHERE COALESCE(cantidad_recibida, 0) > 0)
  INTO v_total, v_pendientes, v_recibidas
  FROM public.ordenes_compra_detalle
  WHERE orden_compra_id = p_orden_id
    AND estado_linea <> 'cancelada';

  IF COALESCE(v_total, 0) = 0 THEN
    v_estado := 'Anulada';
  ELSIF COALESCE(v_pendientes, 0) = 0 THEN
    v_estado := 'Recibida';
  ELSIF COALESCE(v_recibidas, 0) > 0 THEN
    v_estado := 'Parcial';
  ELSE
    v_estado := 'Enviada';
  END IF;

  UPDATE public.ordenes_compra
  SET
    estado = v_estado,
    fecha_recibida = CASE WHEN v_estado = 'Recibida' THEN COALESCE(fecha_recibida, NOW()) ELSE fecha_recibida END,
    updated_at = NOW()
  WHERE id = p_orden_id;

  RETURN v_estado;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalcular_estado_recepcion_orden(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cancelar_linea_orden_compra_no_suplida(p_detalle_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_orden_id UUID;
  v_estado TEXT;
BEGIN
  SELECT orden_compra_id
  INTO v_orden_id
  FROM public.ordenes_compra_detalle
  WHERE id = p_detalle_id;

  IF v_orden_id IS NULL THEN
    RAISE EXCEPTION 'No se encontro la linea de orden %', p_detalle_id;
  END IF;

  UPDATE public.ordenes_compra_detalle
  SET
    cantidad_pedida = COALESCE(cantidad_pedida, cantidad, 0),
    cantidad_recibida = COALESCE(cantidad_recibida, 0),
    cantidad_pendiente = 0,
    estado_linea = 'cancelada'
  WHERE id = p_detalle_id
    AND COALESCE(estado_linea, 'pendiente') IN ('pendiente', 'parcial');

  v_estado := public.recalcular_estado_recepcion_orden(v_orden_id);
  RETURN v_estado;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancelar_linea_orden_compra_no_suplida(UUID) TO authenticated, service_role;

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
BEGIN
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
        CEIL(GREATEST(m.ventas_15d_bucket / 15.0, m.ventas_30d_bucket / 30.0, m.ventas_90d_bucket / 90.0, m.ventas_180d_bucket / 180.0) * 15.0),
        CASE WHEN m.ventas_180d_bucket > 0 AND m.stock_bucket <= 0 THEN 1 ELSE 0 END
      ) AS punto_reorden,
      CASE
        WHEN m.ventas_30d_bucket <= 0
          AND m.ventas_180d_bucket > 0
          AND m.stock_bucket <= 0
        THEN GREATEST(1, m.min_stock)
        ELSE GREATEST(
          CASE WHEN m.max_stock > 0 THEN m.max_stock ELSE 0 END,
          CEIL(GREATEST(m.ventas_15d_bucket / 15.0, m.ventas_30d_bucket / 30.0, m.ventas_90d_bucket / 90.0, m.ventas_180d_bucket / 180.0) * 22.0),
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

SELECT 'orden_compra enviada + rotacion equivalente lista' AS status;
