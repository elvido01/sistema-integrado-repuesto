CREATE OR REPLACE FUNCTION public.get_stats_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_stock_bajo_count integer;
    v_ventas_hoy numeric;
    v_clientes_activos_count integer;
    v_productos_total_count integer;
BEGIN
    -- Contar productos con stock bajo o agotado
    -- Se consideran activos los que tienen activo = true
    SELECT COUNT(*)
    INTO v_stock_bajo_count
    FROM productos p
    WHERE p.activo = true AND get_stock_actual(p.id) <= COALESCE(p.min_stock, 0);

    -- Calcular ventas totales del día de hoy
    -- Se ajusta para usar la fecha actual en UTC y se elimina el filtro de 'activo' que no existe
    SELECT COALESCE(SUM(total), 0)
    INTO v_ventas_hoy
    FROM facturas
    WHERE fecha >= (now() at time zone 'utc')::date;

    -- Contar clientes activos
    SELECT COUNT(*)
    INTO v_clientes_activos_count
    FROM clientes
    WHERE activo = true;

    -- Contar total de productos activos
    SELECT COUNT(*)
    INTO v_productos_total_count
    FROM productos
    WHERE activo = true;

    -- Retornar todos los stats en un solo objeto JSON con llaves camelCase para el frontend
    RETURN jsonb_build_object(
        'stockBajo', v_stock_bajo_count,
        'ventasHoy', v_ventas_hoy,
        'clientesActivos', v_clientes_activos_count,
        'productosTotal', v_productos_total_count
    );
END;
$$;