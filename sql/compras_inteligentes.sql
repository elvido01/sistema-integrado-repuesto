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

SELECT 'rpc creada' AS check, proname FROM pg_proc WHERE proname = 'get_presupuesto_compras';
