-- Función de Stock Automático v2 - Ciclo Quincenal
-- Actualizada: 2026-03-05
-- Cambios: 
--   - Ciclo de compra quincenal (15 días) en lugar de 7 días
--   - Sin mínimos artificiales: si no hay ventas → 0/0
--   - Factor de seguridad ajustado a 1.3 (30% buffer)

CREATE OR REPLACE FUNCTION public.calcular_stock_automatico(producto_uuid UUID)
RETURNS JSON AS $$
DECLARE
  total_vendido NUMERIC := 0;
  dias_periodo INT := 90;
  ventas_diarias NUMERIC := 0;
  ciclo_compra INT := 15;  -- Compra quincenal
  factor_seguridad NUMERIC := 1.3;  -- 30% buffer de seguridad
  min_calculado INT := 0;
  max_calculado INT := 0;
BEGIN
  SELECT COALESCE(SUM(fd.cantidad), 0)
  INTO total_vendido
  FROM public.facturas_detalle fd
  JOIN public.facturas f ON f.id = fd.factura_id
  WHERE fd.producto_id = producto_uuid
    AND f.fecha >= NOW() - INTERVAL '90 days';

  ventas_diarias := total_vendido / dias_periodo;

  IF total_vendido = 0 THEN
    min_calculado := 0;
    max_calculado := 0;
  ELSE
    -- Mínimo: ventas de medio ciclo × seguridad (punto de reorden)
    min_calculado := GREATEST(1, CEIL(ventas_diarias * (ciclo_compra::numeric / 2) * factor_seguridad));
    -- Máximo: ventas de ciclo completo × seguridad (cantidad target)
    max_calculado := GREATEST(min_calculado + 1, CEIL(ventas_diarias * ciclo_compra * factor_seguridad));
  END IF;

  RETURN json_build_object(
    'min_stock', min_calculado,
    'max_stock', max_calculado,
    'ventas_diarias', ROUND(ventas_diarias, 2),
    'total_vendido_90d', total_vendido,
    'ciclo_compra_dias', ciclo_compra
  );
END;
$$ LANGUAGE plpgsql;

-- Función de Orden Automática Mejorada
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
  SELECT
    p.id,
    p.codigo,
    p.descripcion,
    get_stock_actual(p.id) AS existencia,
    p.min_stock,
    p.max_stock,
    p.precio,
    COALESCE(
      (SELECT pr.costo FROM presentaciones pr WHERE pr.producto_id = p.id LIMIT 1),
      p.precio
    ) AS costo,
    p.itbis_pct,
    COALESCE(
      (SELECT SUM(fd.cantidad) 
       FROM facturas_detalle fd 
       JOIN facturas f ON f.id = fd.factura_id 
       WHERE fd.producto_id = p.id 
         AND f.fecha >= NOW() - INTERVAL '90 days'),
      0
    ) AS ventas_90d,
    GREATEST(1, CEIL(p.max_stock - get_stock_actual(p.id)))::INT AS cantidad_sugerida
  FROM
    productos p
  WHERE
    p.suplidor_id = p_suplidor_id
    AND p.activo = true
    AND p.min_stock > 0
    AND get_stock_actual(p.id) < p.min_stock
  ORDER BY
    get_stock_actual(p.id) ASC,
    COALESCE(
      (SELECT SUM(fd.cantidad) 
       FROM facturas_detalle fd 
       JOIN facturas f ON f.id = fd.factura_id 
       WHERE fd.producto_id = p.id 
         AND f.fecha >= NOW() - INTERVAL '90 days'),
      0
    ) DESC;
END;
$$ LANGUAGE plpgsql;
