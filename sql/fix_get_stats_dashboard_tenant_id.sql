-- ============================================================
-- FIX: get_stats_dashboard aislado por tenant
-- ============================================================
-- Evita que "Ventas del Dia", clientes, productos e inventario critico
-- muestren datos globales mientras la caja actual usa tenant_id.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_stats_dashboard();

CREATE OR REPLACE FUNCTION public.get_stats_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tenant_id uuid;
    v_stock_bajo_count integer;
    v_ventas_hoy numeric;
    v_clientes_activos_count integer;
    v_productos_total_count integer;
BEGIN
    v_tenant_id := public.get_user_tenant();

    SELECT COUNT(*)
    INTO v_stock_bajo_count
    FROM productos p
    WHERE p.activo = true
      AND p.tenant_id = v_tenant_id
      AND get_stock_actual(p.id) <= COALESCE(p.min_stock, 0);

    SELECT COALESCE(SUM(total), 0)
    INTO v_ventas_hoy
    FROM facturas
    WHERE fecha::date = CURRENT_DATE
      AND estado <> 'ANULADA'
      AND tenant_id = v_tenant_id;

    SELECT COUNT(*)
    INTO v_clientes_activos_count
    FROM clientes
    WHERE activo = true
      AND tenant_id = v_tenant_id;

    SELECT COUNT(*)
    INTO v_productos_total_count
    FROM productos
    WHERE activo = true
      AND tenant_id = v_tenant_id;

    RETURN jsonb_build_object(
        'stockBajo', v_stock_bajo_count,
        'ventasHoy', v_ventas_hoy,
        'clientesActivos', v_clientes_activos_count,
        'productosTotal', v_productos_total_count
    );
END;
$function$;
