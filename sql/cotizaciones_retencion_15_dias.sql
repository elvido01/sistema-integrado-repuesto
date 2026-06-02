-- Cotizaciones - visibilidad y limpieza a 15 dias
-- Elimina cotizaciones pendientes vencidas de la bandeja operativa.

CREATE OR REPLACE FUNCTION public.purge_expired_cotizaciones(p_days INTEGER DEFAULT 15)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  WITH expired AS (
    SELECT id
    FROM public.cotizaciones
    WHERE tenant_id = public.get_user_tenant()
      AND estado = 'Pendiente'
      AND fecha_cotizacion <= (CURRENT_DATE - GREATEST(p_days, 1))
  ),
  deleted_details AS (
    DELETE FROM public.cotizaciones_detalle d
    USING expired e
    WHERE d.cotizacion_id = e.id
    RETURNING d.id
  ),
  deleted_quotes AS (
    DELETE FROM public.cotizaciones c
    USING expired e
    WHERE c.id = e.id
    RETURNING c.id
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted_quotes;

  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_expired_cotizaciones(INTEGER) TO authenticated, service_role;
