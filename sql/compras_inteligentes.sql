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
  v_cxp_pendiente    NUMERIC := 0;  -- cuentas por pagar (lo que debes a suplidores)
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

  -- Cuentas por pagar a suplidores (el dolor del usuario)
  SELECT COALESCE(SUM(monto_pendiente), 0) INTO v_cxp_pendiente
  FROM public.compras
  WHERE tenant_id = p_tenant_id AND monto_pendiente > 0;

  -- Presupuesto conservador: ritmo de ventas reciente menos lo que debes, menos colchón.
  v_presupuesto := GREATEST(0, v_ventas_recientes - v_cxp_pendiente - p_colchon);

  RETURN json_build_object(
    'presupuesto_sugerido', ROUND(v_presupuesto, 2),
    'ventas_recientes',     ROUND(v_ventas_recientes, 2),
    'cxc_pendiente',        ROUND(v_cxc_pendiente, 2),
    'cxp_pendiente',        ROUND(v_cxp_pendiente, 2),
    'colchon',              ROUND(p_colchon, 2),
    'dias',                 p_dias,
    'salud_caja',           CASE
                              WHEN v_cxp_pendiente > v_ventas_recientes THEN 'tension'
                              WHEN v_cxp_pendiente > v_ventas_recientes * 0.6 THEN 'ajustada'
                              ELSE 'sana' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_presupuesto_compras(UUID, INT, NUMERIC) TO authenticated, service_role;

SELECT 'rpc creada' AS check, proname FROM pg_proc WHERE proname = 'get_presupuesto_compras';
