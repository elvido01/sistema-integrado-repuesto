-- ============================================================
-- Fix: calcular_comisiones_vendedor — incluir ventas a generico
-- ============================================================
-- Bugs encontrados en la RPC original:
--   1) INNER JOIN clientes excluia ventas sin cliente_id (CLIENTE
--      GENERICO con id null o dummy). En Repuestos Caminero esto
--      filtraba la mayoria de las ventas.
--   2) Filtro estado IN ('PAGADA', 'PENDIENTE') excluia el estado
--      'EMITIDA' que es como queda una factura recien grabada.
--
-- Fix:
--   - LEFT JOIN clientes (no excluye sin cliente).
--   - COALESCE para mostrar manual_cliente_nombre o 'CLIENTE GENERICO'
--     cuando el cliente no existe en la tabla.
--   - Filtro de estado: excluir solo 'ANULADA' (cualquier otro estado
--     activo cuenta para comision).
-- ============================================================

CREATE OR REPLACE FUNCTION public.calcular_comisiones_vendedor(
  p_vendedor_id uuid,
  p_fecha_desde date,
  p_fecha_hasta date
)
RETURNS TABLE(
  factura_id     uuid,
  factura_numero text,
  fecha          date,
  cliente_nombre text,
  monto_factura  numeric,
  monto_itbis    numeric,
  subtotal       numeric,
  forma_pago     text
)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    f.id                                              AS factura_id,
    f.numero::text                                    AS factura_numero,
    f.fecha::date                                     AS fecha,
    COALESCE(c.nombre, f.manual_cliente_nombre, 'CLIENTE GENERICO')::text AS cliente_nombre,
    f.total                                           AS monto_factura,
    f.itbis                                           AS monto_itbis,
    f.subtotal                                        AS subtotal,
    f.forma_pago::text                                AS forma_pago
  FROM public.facturas f
  LEFT JOIN public.clientes c ON f.cliente_id = c.id   -- LEFT en vez de INNER
  WHERE
    f.vendedor_id = p_vendedor_id
    AND f.fecha::date >= p_fecha_desde
    AND f.fecha::date <= p_fecha_hasta
    AND COALESCE(f.estado, 'EMITIDA') <> 'ANULADA';    -- excluir solo anuladas
END;
$function$;

GRANT EXECUTE ON FUNCTION public.calcular_comisiones_vendedor(uuid, date, date) TO authenticated;
