CREATE OR REPLACE FUNCTION get_stats_dashboard()
RETURNS TABLE(stock_bajo BIGINT, ventas_hoy NUMERIC, clientes_activos BIGINT, productos_total BIGINT)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM productos WHERE stock <= 5) AS stock_bajo,
        (SELECT SUM(total) FROM ventas WHERE DATE(fecha) = CURRENT_DATE) AS ventas_hoy,
        (SELECT COUNT(*) FROM clientes WHERE activo = TRUE) AS clientes_activos,
        (SELECT COUNT(*) FROM productos) AS productos_total;
END;
$$;