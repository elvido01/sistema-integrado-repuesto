-- ============================================================
-- Fix 0.6 — Validar tenant en RPCs sensibles (Fase 0)
-- ============================================================
-- Auditoria 2026-06-15 (R-07 y R-08).
--
-- Dos RPCs SECURITY DEFINER que NO validan tenant del caller:
--   1) get_presupuesto_compras(p_tenant_id UUID, ...) — recibe tenant
--      pero no valida que coincida con el del usuario autenticado.
--      Frontend podria enviar otro tenant y leer su presupuesto.
--   2) get_productos_paginados(...) — sin parametro tenant. SECURITY
--      DEFINER bypassa RLS de productos, podria leer cross-tenant.
--
-- Fix:
--   - get_presupuesto_compras: si get_user_tenant() retorna un tenant
--     (usuario authenticated), validar p_tenant_id == get_user_tenant().
--     Si NULL (service_role sin sesion), permitir — uso de cron / edge.
--   - get_productos_paginados: agregar filtro p.tenant_id = get_user_tenant()
--     en el WHERE. Si get_user_tenant() es NULL, retorna 0 filas.
--
-- Idempotente. No cambia signature.
-- ============================================================

-- 1) get_presupuesto_compras
CREATE OR REPLACE FUNCTION public.get_presupuesto_compras(
  p_tenant_id UUID,
  p_dias      INT DEFAULT 15,
  p_colchon   NUMERIC DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_tenant    UUID;
  v_ventas_recientes NUMERIC := 0;
  v_cxc_pendiente    NUMERIC := 0;
  v_cxp_pendiente    NUMERIC := 0;
  v_ratio            NUMERIC := 0;
  v_salud            TEXT;
  v_factor           NUMERIC;
  v_presupuesto      NUMERIC := 0;
BEGIN
  -- Fase 0.6: validar tenant solo si el caller es usuario authenticated.
  -- service_role (cron, edge functions) no tiene sesion -> get_user_tenant() = NULL.
  v_caller_tenant := public.get_user_tenant();
  IF v_caller_tenant IS NOT NULL AND v_caller_tenant <> p_tenant_id THEN
    RAISE EXCEPTION 'Acceso denegado: p_tenant_id (%) no coincide con tenant del usuario (%)',
      p_tenant_id, v_caller_tenant USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Ritmo de ventas (ingresos) en los ultimos p_dias dias
  SELECT COALESCE(SUM(fd.cantidad * fd.precio), 0) INTO v_ventas_recientes
  FROM public.facturas_detalle fd
  JOIN public.facturas f ON f.id = fd.factura_id
  WHERE f.tenant_id = p_tenant_id
    AND f.estado <> 'Anulada'
    AND f.fecha >= CURRENT_DATE - p_dias;

  -- Cuentas por cobrar
  SELECT COALESCE(SUM(monto_pendiente), 0) INTO v_cxc_pendiente
  FROM public.facturas
  WHERE tenant_id = p_tenant_id AND estado <> 'Anulada' AND monto_pendiente > 0;

  -- Cuentas por pagar acumulada a suplidores
  SELECT COALESCE(SUM(monto_pendiente), 0) INTO v_cxp_pendiente
  FROM public.compras
  WHERE tenant_id = p_tenant_id AND monto_pendiente > 0;

  -- Salud de caja
  v_ratio := CASE WHEN v_ventas_recientes > 0 THEN v_cxp_pendiente / v_ventas_recientes ELSE 99 END;
  IF v_ratio > 1 THEN
    v_salud := 'tension';  v_factor := 0.30;
  ELSIF v_ratio > 0.6 THEN
    v_salud := 'ajustada'; v_factor := 0.45;
  ELSE
    v_salud := 'sana';     v_factor := 0.60;
  END IF;

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

-- 2) get_productos_paginados — agregar filtro explicito tenant.
-- NO cambia signature ni return type (importante: hay 4+ callers en frontend).
CREATE OR REPLACE FUNCTION public.get_productos_paginados(
  p_limit integer,
  p_offset integer,
  p_search_term text,
  p_marca_filter text,
  p_modelo_filter text,
  p_include_zero_stock boolean DEFAULT true
)
RETURNS TABLE(
  id uuid,
  codigo text,
  referencia text,
  descripcion text,
  ubicacion text,
  costo numeric,
  precio numeric,
  itbis_pct numeric,
  marca_nombre text,
  modelo_nombre text,
  existencia numeric,
  presentaciones json,
  min_stock numeric,
  total_count bigint
) AS $$
DECLARE
  v_tenant UUID;
BEGIN
  -- Fase 0.6: filtro defensivo. Si no hay tenant (sin sesion), retorna 0 filas.
  v_tenant := public.get_user_tenant();
  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH filtered_products AS (
    SELECT
      p.id AS prod_id,
      p.codigo,
      p.referencia,
      p.descripcion,
      p.ubicacion,
      p.costo,
      p.precio,
      p.itbis_pct,
      ma.nombre AS marca_nombre_val,
      get_nombres_modelos(p.modelos_ids) AS modelo_nombre_val,
      p.min_stock,
      p.modelos_ids
    FROM productos p
    LEFT JOIN marcas ma ON ma.id = p.marca_id
    WHERE
      p.tenant_id = v_tenant                            -- FILTRO EXPLICITO POR TENANT
      AND p.activo = true
      AND (p_include_zero_stock OR get_stock_actual(p.id) > 0)
      AND (
        p_search_term IS NULL OR p_search_term = '' OR
        p.codigo      ILIKE '%'||p_search_term||'%' OR
        p.referencia  ILIKE '%'||p_search_term||'%' OR
        p.descripcion ILIKE '%'||p_search_term||'%' OR
        p.ubicacion   ILIKE '%'||p_search_term||'%'
      )
      AND (p_marca_filter IS NULL OR p_marca_filter = '' OR ma.nombre ILIKE '%'||p_marca_filter||'%')
      AND (
        p_modelo_filter IS NULL OR p_modelo_filter = '' OR
        EXISTS (
          SELECT 1
          FROM unnest(p.modelos_ids) AS mid
          JOIN modelos mo ON mo.id = mid
          WHERE mo.nombre ILIKE '%'||p_modelo_filter||'%'
        )
      )
  ),
  counted_products AS (
    SELECT fp.*, COUNT(*) OVER() AS total_count
    FROM filtered_products fp
  )
  SELECT
    cp.prod_id AS id,
    cp.codigo,
    cp.referencia,
    cp.descripcion,
    cp.ubicacion,
    cp.costo,
    cp.precio,
    cp.itbis_pct,
    cp.marca_nombre_val AS marca_nombre,
    cp.modelo_nombre_val AS modelo_nombre,
    get_stock_actual(cp.prod_id) AS existencia,
    (
      SELECT json_agg(json_build_object(
          'id', pr.id,
          'tipo', pr.tipo,
          'cantidad', pr.cantidad,
          'costo', pr.costo,
          'precio1', pr.precio1,
          'precio2', pr.precio2,
          'precio3', pr.precio3
      ))
      FROM presentaciones pr
      WHERE pr.producto_id = cp.prod_id
    ) AS presentaciones,
    cp.min_stock,
    cp.total_count
  FROM counted_products cp
  ORDER BY cp.descripcion ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public';

GRANT EXECUTE ON FUNCTION public.get_productos_paginados(integer, integer, text, text, text, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'fix_0_6 get_presupuesto_compras + get_productos_paginados con validacion de tenant listo' AS status;
