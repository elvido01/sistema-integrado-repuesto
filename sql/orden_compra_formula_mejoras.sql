-- Mejora de formula para Orden Automatica
-- - No sugiere productos bloqueados en Suplidor Virtual.
-- - Resta cantidades ya pedidas en ordenes no cerradas.
-- - Usa costo real del producto antes de caer a presentaciones/precio.
-- - Evita sugerencias artificiales cuando max_stock esta vacio o menor que min_stock.
-- - Compra conservadora para ventas lentas: target por rotacion real de 30/90 dias.

DROP FUNCTION IF EXISTS public.get_productos_para_orden_automatica(UUID);

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
  WITH base AS (
    SELECT
      p.id,
      p.codigo,
      p.descripcion,
      public.get_stock_actual(p.id) AS existencia,
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
      COALESCE((
        SELECT SUM(fd.cantidad)
        FROM public.facturas_detalle fd
        JOIN public.facturas f ON f.id = fd.factura_id
        WHERE fd.producto_id = p.id
          AND f.fecha >= NOW() - INTERVAL '90 days'
      ), 0)::NUMERIC AS ventas_90d,
      COALESCE((
        SELECT SUM(fd.cantidad)
        FROM public.facturas_detalle fd
        JOIN public.facturas f ON f.id = fd.factura_id
        WHERE fd.producto_id = p.id
          AND f.fecha >= NOW() - INTERVAL '30 days'
      ), 0)::NUMERIC AS ventas_30d,
      COALESCE((
        SELECT SUM(ocd.cantidad)
        FROM public.ordenes_compra_detalle ocd
        JOIN public.ordenes_compra oc ON oc.id = ocd.orden_compra_id
        WHERE ocd.producto_id = p.id
          AND oc.suplidor_id = p_suplidor_id
          AND COALESCE(oc.estado, 'Pendiente') NOT IN (
            'Recibida',
            'Anulada',
            'Cancelada',
            'Cancelado',
            'Cerrada',
            'Cerrado'
          )
      ), 0)::NUMERIC AS cantidad_pendiente
    FROM public.productos p
    WHERE p.suplidor_id = p_suplidor_id
      AND COALESCE(p.activo, true) = true
      AND COALESCE(p.min_stock, 0) > 0
      AND NOT public.producto_en_suplidor_virtual(p.id)
  ),
  calculado AS (
    SELECT
      b.*,
      CASE
        WHEN b.ventas_90d <= 0 THEN 0
        WHEN b.ventas_30d <= 0 THEN 0
        ELSE LEAST(b.ventas_30d / 30.0, b.ventas_90d / 90.0)
      END AS demanda_diaria_conservadora,
      CASE
        WHEN b.max_stock > b.min_stock THEN b.max_stock
        ELSE b.min_stock
      END AS stock_objetivo_configurado
    FROM base b
  ),
  final AS (
    SELECT
      c.*,
      LEAST(
        c.stock_objetivo_configurado,
        GREATEST(1, CEIL(c.demanda_diaria_conservadora * 30 * 1.15))
      ) AS stock_objetivo,
      LEAST(
        c.min_stock,
        GREATEST(1, CEIL(c.demanda_diaria_conservadora * 15 * 1.10))
      ) AS punto_reorden
    FROM calculado c
    WHERE c.demanda_diaria_conservadora > 0
  )
  SELECT
    f.id,
    f.codigo,
    f.descripcion,
    f.existencia,
    f.min_stock,
    f.max_stock,
    f.precio,
    f.costo,
    f.itbis_pct,
    f.ventas_90d,
    GREATEST(0, CEIL(f.stock_objetivo - f.existencia - f.cantidad_pendiente))::INT AS cantidad_sugerida
  FROM final f
  WHERE f.existencia + f.cantidad_pendiente < f.punto_reorden
    AND f.stock_objetivo - f.existencia - f.cantidad_pendiente > 0
  ORDER BY
    (f.punto_reorden - (f.existencia + f.cantidad_pendiente)) DESC,
    f.ventas_90d DESC,
    f.codigo ASC;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.get_productos_para_orden_automatica(UUID) TO authenticated;
