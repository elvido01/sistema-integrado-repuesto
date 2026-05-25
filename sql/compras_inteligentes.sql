-- ============================================================
-- Compras Inteligentes — presupuesto de caja para compras
-- ============================================================
-- RPC que estima cuánto efectivo hay disponible para comprar,
-- a partir de datos reales: ritmo de ventas reciente, cuentas
-- por cobrar (facturas) y cuentas por pagar (compras).
-- El usuario puede ajustar el monto en la UI antes de comprar.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_presupuesto_compras(
  p_tenant_id UUID,
  p_dias      INT DEFAULT 15,
  p_colchon   NUMERIC DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_ventas_recientes NUMERIC := 0;  -- ingresos por ventas en los últimos p_dias (ritmo de caja)
  v_cxc_pendiente    NUMERIC := 0;  -- cuentas por cobrar (lo que te deben)
  v_cxp_pendiente    NUMERIC := 0;  -- cuentas por pagar acumulada (lo que debes a suplidores)
  v_ratio            NUMERIC := 0;
  v_salud            TEXT;
  v_factor           NUMERIC;       -- porción de las ventas reinvertible en inventario
  v_presupuesto      NUMERIC := 0;
BEGIN
  -- Ritmo de ventas (ingresos) en los últimos p_dias días
  SELECT COALESCE(SUM(fd.cantidad * fd.precio), 0) INTO v_ventas_recientes
  FROM public.facturas_detalle fd
  JOIN public.facturas f ON f.id = fd.factura_id
  WHERE f.tenant_id = p_tenant_id
    AND f.estado <> 'Anulada'
    AND f.fecha >= CURRENT_DATE - p_dias;

  -- Cuentas por cobrar (informativo)
  SELECT COALESCE(SUM(monto_pendiente), 0) INTO v_cxc_pendiente
  FROM public.facturas
  WHERE tenant_id = p_tenant_id AND estado <> 'Anulada' AND monto_pendiente > 0;

  -- Cuentas por pagar acumulada a suplidores (contexto / advertencia)
  SELECT COALESCE(SUM(monto_pendiente), 0) INTO v_cxp_pendiente
  FROM public.compras
  WHERE tenant_id = p_tenant_id AND monto_pendiente > 0;

  -- Salud de caja por la relación deuda/ventas; ajusta cuán conservador comprar.
  v_ratio := CASE WHEN v_ventas_recientes > 0 THEN v_cxp_pendiente / v_ventas_recientes ELSE 99 END;
  IF v_ratio > 1 THEN
    v_salud := 'tension';  v_factor := 0.30;   -- deuda alta -> compra muy conservador
  ELSIF v_ratio > 0.6 THEN
    v_salud := 'ajustada'; v_factor := 0.45;
  ELSE
    v_salud := 'sana';     v_factor := 0.60;
  END IF;

  -- Presupuesto = porción REINVERTIBLE de las ventas recientes (NO resta la deuda acumulada
  -- completa, que es un saldo histórico, no un gasto de estos 15 días).
  v_presupuesto := GREATEST(0, ROUND(v_ventas_recientes * v_factor - p_colchon, 2));

  RETURN json_build_object(
    'presupuesto_sugerido', v_presupuesto,
    'ventas_recientes',     ROUND(v_ventas_recientes, 2),
    'cxc_pendiente',        ROUND(v_cxc_pendiente, 2),
    'cxp_pendiente',        ROUND(v_cxp_pendiente, 2),
    'factor_reinversion',   v_factor,
    'colchon',              ROUND(p_colchon, 2),
    'dias',                 p_dias,
    'salud_caja',           v_salud
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_presupuesto_compras(UUID, INT, NUMERIC) TO authenticated, service_role;

-- ────────────────────────────────────────────────
-- RPC: get_productos_movimiento — rotación/existencia de una lista
-- ────────────────────────────────────────────────
-- Para analizar y priorizar (urgencia) los productos que YA están
-- en una orden de compra. SQL puro, sin costo.
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_productos_movimiento(p_ids UUID[])
RETURNS TABLE(
  producto_id UUID,
  existencia  NUMERIC,
  ventas_30d  NUMERIC,
  ventas_90d  NUMERIC,
  costo       NUMERIC,
  precio      NUMERIC,
  margen_pct  NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    public.get_stock_actual(p.id)::NUMERIC,
    COALESCE((SELECT SUM(fd.cantidad) FROM public.facturas_detalle fd
      JOIN public.facturas f ON f.id = fd.factura_id
      WHERE fd.producto_id = p.id AND f.fecha >= NOW() - INTERVAL '30 days'
        AND f.estado <> 'Anulada'), 0)::NUMERIC,
    COALESCE((SELECT SUM(fd.cantidad) FROM public.facturas_detalle fd
      JOIN public.facturas f ON f.id = fd.factura_id
      WHERE fd.producto_id = p.id AND f.fecha >= NOW() - INTERVAL '90 days'
        AND f.estado <> 'Anulada'), 0)::NUMERIC,
    COALESCE(p.costo, 0)::NUMERIC,
    COALESCE(p.precio, 0)::NUMERIC,
    CASE WHEN p.precio > 0 AND p.costo > 0 AND p.precio > p.costo
         THEN ROUND(((p.precio - p.costo) / p.precio * 100)::NUMERIC, 1) ELSE 0 END
  FROM public.productos p
  WHERE p.id = ANY(p_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_productos_movimiento(UUID[]) TO authenticated, service_role;

SELECT 'rpcs creadas' AS check, count(*) AS n FROM pg_proc
WHERE proname IN ('get_presupuesto_compras','get_productos_movimiento');
