-- =====================================================================
-- Dashboard móvil: tarjeta SAN de la financiera (cross-tenant)
-- ---------------------------------------------------------------------
-- Caminero Motors y MotoPréstamos Los Naranjos son de los mismos dueños.
-- MotoPréstamos NO tiene app móvil; la app se usa solo desde Caminero.
-- Los SAN viven en el tenant de MotoPréstamos, así que un usuario de
-- Caminero no los puede leer por RLS. Este RPC SECURITY DEFINER —igual
-- que get_financiera_externa_recibos_dia— resuelve la financiera y
-- devuelve sus SAN activos + los días pendientes hasta hoy.
--
-- SOLO para administradores de Caminero: los SAN llevan nombres de
-- personas, no es dato para cualquier vendedor. Si el que llama no es
-- admin, devuelve vacío y la tarjeta simplemente no aparece.
--
-- Devuelve la MISMA forma que consume construirResumenSan() en el móvil:
--   { tenant_id, nombre, sanes:[...], pendientes:[...] }
-- Re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_san_financiera_externa()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant     uuid := public.get_user_tenant();
  v_fin_tenant uuid;
  v_fin_nombre text;
  v_es_admin   boolean := false;
  v_hoy        date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_sanes      jsonb := '[]'::jsonb;
  v_pendientes jsonb := '[]'::jsonb;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant';
  END IF;

  -- ---- Gate de administrador (mismo criterio que el móvil) ----------
  SELECT (
      COALESCE(p.is_superadmin, false)
      OR lower(COALESCE(p.role, '')) ~ '(admin|gerente|manager|owner|dueñ|dueno)'
    )
    INTO v_es_admin
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF NOT COALESCE(v_es_admin, false) THEN
    RETURN jsonb_build_object('tenant_id', NULL, 'nombre', NULL,
                              'sanes', '[]'::jsonb, 'pendientes', '[]'::jsonb);
  END IF;

  -- ---- Resolver el tenant de la financiera --------------------------
  -- Verbatim del RPC de recibos, para que ambos apunten a la misma
  -- empresa aunque cambie el nombre/razón social.
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
    RETURN jsonb_build_object('tenant_id', NULL, 'nombre', NULL,
                              'sanes', '[]'::jsonb, 'pendientes', '[]'::jsonb);
  END IF;

  SELECT COALESCE(ce.razon_social, ce.nombre, 'MotoPréstamos Los Naranjos')
    INTO v_fin_nombre
  FROM public.config_empresa ce
  WHERE ce.tenant_id = v_fin_tenant
  LIMIT 1;

  -- ---- SAN activos de la financiera ---------------------------------
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id',             s.id,
           'nombre',         s.nombre,
           'monto_objetivo', s.monto_objetivo,
           'monto_ahorrado', s.monto_ahorrado,
           'pago_diario',    s.pago_diario,
           'fecha_fin',      s.fecha_fin,
           'dias',           s.dias
         ) ORDER BY s.created_at DESC), '[]'::jsonb)
    INTO v_sanes
  FROM public.san s
  WHERE s.tenant_id = v_fin_tenant
    AND s.estado = 'Activo';

  -- ---- Días NO pagados hasta hoy (para el estado del día) -----------
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'san_id',           sp.san_id,
           'fecha_programada', sp.fecha_programada,
           'saldo_pendiente',  sp.saldo_pendiente
         )), '[]'::jsonb)
    INTO v_pendientes
  FROM public.san_pagos sp
  JOIN public.san s ON s.id = sp.san_id
  WHERE s.tenant_id = v_fin_tenant
    AND s.estado = 'Activo'
    AND sp.estado <> 'Pagado'
    AND sp.fecha_programada <= v_hoy;

  RETURN jsonb_build_object(
    'tenant_id',  v_fin_tenant,
    'nombre',     v_fin_nombre,
    'sanes',      v_sanes,
    'pendientes', v_pendientes
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_san_financiera_externa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_san_financiera_externa() TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('dashboard_san_financiera_externa.sql');
  END IF;
END $$;

SELECT 'get_san_financiera_externa listo' AS status;
