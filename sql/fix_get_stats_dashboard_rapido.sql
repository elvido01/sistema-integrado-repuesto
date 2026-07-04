-- =====================================================================
-- FIX: get_stats_dashboard rapido + dia en hora local RD
-- ---------------------------------------------------------------------
-- Sintoma reportado (2026-07-04): "Ventas del Dia" en 0 a las 6:26 pm.
-- Diagnostico: NO era la hora de corte de cobranza (esa solo la usa la
-- extension de WhatsApp). Las 4 tarjetas (ventas, inventario critico,
-- clientes, catalogo) salen de ESTE RPC, y estaban TODAS en 0 porque el
-- RPC completo fallaba por timeout:
--
--   1. LENTITUD: el conteo de "stock bajo" llamaba get_stock_actual(id)
--      producto POR producto (un SUM de inventario_movimientos por cada
--      uno). Con miles de productos (Repuestos Morla) pasa el statement
--      timeout -> el RPC da error -> el dashboard se queda con los 0
--      iniciales. Fix: UNA sola agregacion con GROUP BY.
--
--   2. CORTE DEL DIA: "ventas de hoy" comparaba fecha::date con
--      CURRENT_DATE, que es el dia UTC. En RD (UTC-4) eso movia el
--      cambio de dia a las 8:00 pm: una venta de las 9:00 pm contaba
--      para "manana". Fix: rango del dia en America/Santo_Domingo
--      (ademas es sargable: usa indice sobre fecha en vez de castear
--      cada fila).
--
-- Re-ejecutable. Correr en el proyecto de PRODUCCION.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_stats_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tenant_id uuid;
    v_hoy date;
    v_ini timestamptz;
    v_stock_bajo_count integer;
    v_ventas_hoy numeric;
    v_clientes_activos_count integer;
    v_productos_total_count integer;
BEGIN
    v_tenant_id := public.get_user_tenant();

    -- Dia "hoy" en hora local de Republica Dominicana
    v_hoy := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
    v_ini := v_hoy::timestamp AT TIME ZONE 'America/Santo_Domingo';

    -- Inventario critico: una sola pasada por inventario_movimientos
    -- (antes: get_stock_actual por producto = timeout con catalogos grandes)
    SELECT COUNT(*)
    INTO v_stock_bajo_count
    FROM productos p
    LEFT JOIN (
        SELECT im.producto_id, SUM(im.cantidad) AS stock
        FROM inventario_movimientos im
        JOIN productos p2 ON p2.id = im.producto_id
        WHERE p2.tenant_id = v_tenant_id AND p2.activo = true
        GROUP BY im.producto_id
    ) s ON s.producto_id = p.id
    WHERE p.activo = true
      AND p.tenant_id = v_tenant_id
      AND COALESCE(s.stock, 0) <= COALESCE(p.min_stock, 0);

    -- Ventas de HOY (dia local RD, rango sargable sobre fecha timestamptz)
    SELECT COALESCE(SUM(total), 0)
    INTO v_ventas_hoy
    FROM facturas
    WHERE tenant_id = v_tenant_id
      AND estado <> 'ANULADA'
      AND fecha >= v_ini
      AND fecha < v_ini + interval '1 day';

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

-- Indice para que el rango de "hoy" no escanee todas las facturas del tenant
CREATE INDEX IF NOT EXISTS idx_facturas_tenant_fecha ON public.facturas (tenant_id, fecha);

NOTIFY pgrst, 'reload schema';

SELECT 'get_stats_dashboard rapido + dia local RD listo' AS status;
