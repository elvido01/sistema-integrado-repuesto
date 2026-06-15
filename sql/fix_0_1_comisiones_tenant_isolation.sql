-- ============================================================
-- Fix 0.1 — calcular_comisiones_vendedor: defensa en profundidad
-- ============================================================
-- Auditoria 2026-06-15 (docs/architecture-analysis/AUDIT-2026-06-15.md R-01)
--
-- Estado actual: la funcion es SECURITY INVOKER, por lo que RLS sobre
-- public.facturas la protege de leer cross-tenant. Pero NO valida que
-- p_vendedor_id pertenezca al tenant del caller, lo que podria devolver
-- 0 filas silenciosamente y confundir al usuario, ademas de exponer el
-- riesgo si alguien la marca como SECURITY DEFINER mas adelante.
--
-- Fix:
--   1. Agregar filtro explicito f.tenant_id = get_user_tenant() (defensa)
--   2. Validar al inicio que p_vendedor_id pertenece al tenant actual
--      y lanzar excepcion clara si no
--   3. Mantener signature, comportamiento y campos retornados
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
DECLARE
  v_tenant_id uuid;
  v_vendedor_tenant uuid;
BEGIN
  v_tenant_id := public.get_user_tenant();

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No se puede determinar el tenant del usuario actual';
  END IF;

  -- Validar que el vendedor pertenece al tenant del caller.
  -- Si el vendedor no existe o es de otro tenant, mensaje claro.
  SELECT v.tenant_id INTO v_vendedor_tenant
  FROM public.vendedores v
  WHERE v.id = p_vendedor_id;

  IF v_vendedor_tenant IS NULL THEN
    RAISE EXCEPTION 'Vendedor % no encontrado', p_vendedor_id;
  END IF;

  IF v_vendedor_tenant <> v_tenant_id THEN
    RAISE EXCEPTION 'Vendedor % no pertenece al tenant actual', p_vendedor_id;
  END IF;

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
  LEFT JOIN public.clientes c ON f.cliente_id = c.id
  WHERE
    f.tenant_id = v_tenant_id                            -- defensa en profundidad
    AND f.vendedor_id = p_vendedor_id
    AND f.fecha::date >= p_fecha_desde
    AND f.fecha::date <= p_fecha_hasta
    AND COALESCE(f.estado, 'EMITIDA') <> 'ANULADA';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.calcular_comisiones_vendedor(uuid, date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'fix_0_1 calcular_comisiones_vendedor con aislamiento por tenant listo' AS status;
