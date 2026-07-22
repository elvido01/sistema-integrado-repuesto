-- =====================================================================
-- Dashboard movil: cobros diarios de financiera externa
-- ---------------------------------------------------------------------
-- Caminero Motors puede tener la financiera MotoPrestamos Los Naranjos en
-- otro tenant. Por RLS, el usuario de Caminero no debe leer tablas de otro
-- tenant directamente; esta RPC SECURITY DEFINER devuelve solo el total
-- diario agregado de la financiera configurada.
--
-- Fuente principal: recibos_ingreso (registrar_pago_prestamo ya crea RI).
-- Respaldo: prestamo_pagos si por algun motivo no hay RI del dia.
-- Usa created_at en horario America/Santo_Domingo, igual que el dashboard web.
-- Si por algun registro viejo no hay match por created_at, cae a fecha.
-- Re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_financiera_externa_recibos_dia(p_fecha date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_fecha date := COALESCE(p_fecha, (now() AT TIME ZONE 'America/Santo_Domingo')::date);
  v_fin_tenant uuid;
  v_fin_nombre text;
  v_total_recibos numeric := 0;
  v_total_prestamos numeric := 0;
  v_inicio_dia timestamptz;
  v_fin_dia timestamptz;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant';
  END IF;

  v_inicio_dia := v_fecha::timestamp AT TIME ZONE 'America/Santo_Domingo';
  v_fin_dia := (v_fecha + 1)::timestamp AT TIME ZONE 'America/Santo_Domingo';

  SELECT ce.tenant_id
    INTO v_fin_tenant
  FROM public.config_empresa ce
  CROSS JOIN LATERAL (
    SELECT lower(translate(
      COALESCE(ce.nombre, '') || ' ' || COALESCE(ce.razon_social, ''),
      'áàäâãéèëêíìïîóòöôõúùüûñÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑ',
      'aaaaaeeeeiiiiooooouuuunAAAAAEEEEIIIIOOOOOUUUUN'
    )) AS txt
  ) n
  WHERE ce.tenant_id IS NOT NULL
    AND ce.tenant_id <> v_tenant
    AND (
      n.txt LIKE '%naranjo%'
      OR n.txt LIKE '%motoprestamo%'
      OR n.txt LIKE '%moto prestamo%'
      OR COALESCE(ce.feat_financiera, false) = true
    )
  ORDER BY
    CASE WHEN n.txt LIKE '%naranjo%' THEN 0 ELSE 1 END,
    CASE WHEN n.txt LIKE '%motoprestamo%' OR n.txt LIKE '%moto prestamo%' THEN 0 ELSE 1 END,
    CASE WHEN COALESCE(ce.feat_financiera, false) THEN 0 ELSE 1 END,
    ce.nombre NULLS LAST
  LIMIT 1;

  IF v_fin_tenant IS NULL THEN
    RETURN jsonb_build_object(
      'tenant_id', NULL,
      'nombre', NULL,
      'fecha', v_fecha,
      'total_recibos_dia', 0,
      'source', 'none'
    );
  END IF;

  SELECT COALESCE(ce.razon_social, ce.nombre, 'MotoPrestamos Los Naranjos')
    INTO v_fin_nombre
  FROM public.config_empresa ce
  WHERE ce.tenant_id = v_fin_tenant
  LIMIT 1;

  SELECT COALESCE(SUM(ri.monto_pagado), 0)
    INTO v_total_recibos
  FROM public.recibos_ingreso ri
  WHERE ri.tenant_id = v_fin_tenant
    AND ri.created_at >= v_inicio_dia
    AND ri.created_at < v_fin_dia
    AND COALESCE(ri.anulado, false) = false;

  IF v_total_recibos <= 0 THEN
    SELECT COALESCE(SUM(ri.monto_pagado), 0)
      INTO v_total_recibos
    FROM public.recibos_ingreso ri
    WHERE ri.tenant_id = v_fin_tenant
      AND ri.fecha = v_fecha
      AND COALESCE(ri.anulado, false) = false;
  END IF;

  IF v_total_recibos <= 0 AND to_regclass('public.prestamo_pagos') IS NOT NULL THEN
    SELECT COALESCE(SUM(pp.total_pagado), 0)
      INTO v_total_prestamos
    FROM public.prestamo_pagos pp
    WHERE pp.tenant_id = v_fin_tenant
      AND pp.created_at >= v_inicio_dia
      AND pp.created_at < v_fin_dia
      AND COALESCE(pp.anulado, false) = false;
  END IF;

  IF v_total_recibos <= 0 AND v_total_prestamos <= 0 AND to_regclass('public.prestamo_pagos') IS NOT NULL THEN
    SELECT COALESCE(SUM(pp.total_pagado), 0)
      INTO v_total_prestamos
    FROM public.prestamo_pagos pp
    WHERE pp.tenant_id = v_fin_tenant
      AND pp.fecha = v_fecha
      AND COALESCE(pp.anulado, false) = false;
  END IF;

  RETURN jsonb_build_object(
    'tenant_id', v_fin_tenant,
    'nombre', COALESCE(v_fin_nombre, 'MotoPrestamos Los Naranjos'),
    'fecha', v_fecha,
    'total_recibos_dia', CASE WHEN v_total_recibos > 0 THEN v_total_recibos ELSE v_total_prestamos END,
    'source', CASE WHEN v_total_recibos > 0 THEN 'recibos_ingreso' WHEN v_total_prestamos > 0 THEN 'prestamo_pagos' ELSE 'none' END,
    'range_start', v_inicio_dia,
    'range_end', v_fin_dia
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_financiera_externa_recibos_dia(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_financiera_externa_recibos_dia(date) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'get_financiera_externa_recibos_dia listo' AS status;
