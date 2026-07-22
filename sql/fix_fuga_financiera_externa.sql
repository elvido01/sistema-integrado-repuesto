-- =====================================================================
-- SEGURIDAD: fuga de datos entre empresas en las tarjetas de "financiera
-- externa" del dashboard movil
-- ---------------------------------------------------------------------
-- Reportado 2026-07-21: usuarios de REPUESTOS MORLA veian datos de
-- MotoPrestamos / Inversiones / Odalys en su dashboard (recibos del dia,
-- cuentas bancarias con sus saldos, y el SAN).
--
-- Causa: tres RPC SECURITY DEFINER resolvian "la financiera" adivinando por
-- NOMBRE (LIKE '%naranjo%' / '%motoprestamo%' / feat_financiera) sobre TODAS
-- las empresas, excluyendo solo la propia, y sin comprobar QUIEN pregunta:
--   * get_financiera_externa_recibos_dia  — sin ningun gate
--   * get_cuentas_financiera_externa      — gate "es gerencial", de cualquier empresa
--   * get_san_financiera_externa          — gate "es admin", de cualquier empresa
-- Como REPUESTOS MORLA tiene razon social 'MPN Y CAMINERO MOTORS' y el
-- criterio agarraba la primera coincidencia, le asignaba INVERSIONES LOS
-- NARANJOS. Es el MISMO bug que ya se corrigio en
-- get_caminero_finanzas_resumen_movil (ver sql/dashboard_movil_caminero_finanzas.sql).
--
-- Arreglo: se elimina el adivinar por nombre. La financiera vinculada sale
-- de config_empresa.financiera_tenant_id — el campo que existe para eso y
-- que CAMINERO MOTORS ya tiene apuntando a MotoPrestamos (766fe3d6). Quien
-- no lo tenga configurado no ve NADA de otra empresa.
--
-- Efecto: Caminero sigue viendo su financiera igual; Morla y el resto dejan
-- de ver datos ajenos. Los gates de rol (gerencial/admin) se conservan.
--
-- SEGUNDO ARREGLO (mismo dia): la tarjeta "Recibos financiera" del movil
-- sumaba por created_at, asi que el dia de la corrida del backup mostraba
-- TODO lo migrado como cobrado hoy — Caminero veia RD$603,622.79 (102
-- recibos del 17, 18 y 20) cuando lo real del dia eran RD$64,000 (7). Ahora
-- suma por la FECHA del cobro, igual que la caja web y la Lista de
-- Transacciones.
-- Re-ejecutable.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper unico: la financiera vinculada al tenant que pregunta
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.financiera_vinculada_tenant()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ce.financiera_tenant_id
  FROM public.config_empresa ce
  WHERE ce.tenant_id = public.get_user_tenant()
    AND ce.financiera_tenant_id IS NOT NULL
    AND ce.financiera_tenant_id <> ce.tenant_id
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.financiera_vinculada_tenant() IS
  'Tenant de la financiera vinculada (config_empresa.financiera_tenant_id) o NULL. '
  'NUNCA resolver la financiera por nombre: ver sql/fix_fuga_financiera_externa.sql';

REVOKE EXECUTE ON FUNCTION public.financiera_vinculada_tenant() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.financiera_vinculada_tenant() TO authenticated;

-- ---------------------------------------------------------------------
-- 1) Recibos del dia de la financiera
-- ---------------------------------------------------------------------
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

  -- Solo la financiera EXPLICITAMENTE vinculada a esta empresa.
  v_fin_tenant := public.financiera_vinculada_tenant();

  IF v_fin_tenant IS NULL THEN
    RETURN jsonb_build_object(
      'tenant_id', NULL,
      'nombre', NULL,
      'fecha', v_fecha,
      'total_recibos_dia', 0,
      'source', 'none'
    );
  END IF;

  SELECT COALESCE(ce.razon_social, ce.nombre)
    INTO v_fin_nombre
  FROM public.config_empresa ce
  WHERE ce.tenant_id = v_fin_tenant
  LIMIT 1;

  -- Por la FECHA del cobro, nunca por created_at: la migracion diaria del
  -- SiiF inserta de golpe los recibos de varios dias y por created_at la
  -- tarjeta mostraba TODO lo migrado como cobrado hoy (2026-07-21:
  -- RD$603,622.79 de 102 recibos, cuando lo real del dia eran RD$64,000 de
  -- 7). Mismo criterio que sql/caja_recibos_por_fecha_real.sql y que la
  -- Lista de Transacciones.
  SELECT COALESCE(SUM(ri.monto_pagado), 0)
    INTO v_total_recibos
  FROM public.recibos_ingreso ri
  WHERE ri.tenant_id = v_fin_tenant
    AND ri.fecha = v_fecha
    AND COALESCE(ri.anulado, false) = false;

  IF v_total_recibos <= 0 AND to_regclass('public.prestamo_pagos') IS NOT NULL THEN
    SELECT COALESCE(SUM(pp.total_pagado), 0)
      INTO v_total_prestamos
    FROM public.prestamo_pagos pp
    WHERE pp.tenant_id = v_fin_tenant
      AND pp.fecha = v_fecha
      AND COALESCE(pp.anulado, false) = false;
  END IF;

  RETURN jsonb_build_object(
    'tenant_id', v_fin_tenant,
    'nombre', v_fin_nombre,
    'fecha', v_fecha,
    'total_recibos_dia', CASE WHEN v_total_recibos > 0 THEN v_total_recibos ELSE v_total_prestamos END,
    'source', CASE WHEN v_total_recibos > 0 THEN 'recibos_ingreso' WHEN v_total_prestamos > 0 THEN 'prestamo_pagos' ELSE 'none' END,
    'range_start', v_inicio_dia,
    'range_end', v_fin_dia
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_financiera_externa_recibos_dia(date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_financiera_externa_recibos_dia(date) TO authenticated;

-- ---------------------------------------------------------------------
-- 2) Cuentas bancarias de la financiera (solo gerenciales)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cuentas_financiera_externa()
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
  v_cuentas    jsonb := '[]'::jsonb;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant';
  END IF;

  SELECT (
      COALESCE(p.is_superadmin, false)
      OR lower(COALESCE(p.role, '')) ~ '(admin|gerente|manager|owner|dueñ|dueno)'
    )
    INTO v_es_admin
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF NOT COALESCE(v_es_admin, false) THEN
    RETURN jsonb_build_object('tenant_id', NULL, 'nombre', NULL, 'cuentas', '[]'::jsonb);
  END IF;

  v_fin_tenant := public.financiera_vinculada_tenant();

  IF v_fin_tenant IS NULL THEN
    RETURN jsonb_build_object('tenant_id', NULL, 'nombre', NULL, 'cuentas', '[]'::jsonb);
  END IF;

  SELECT COALESCE(ce.razon_social, ce.nombre)
    INTO v_fin_nombre
  FROM public.config_empresa ce WHERE ce.tenant_id = v_fin_tenant LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id',     q.id,
           'nombre', q.banco || COALESCE(' — ' || q.alias, ''),
           'saldo',  q.saldo,
           'moneda', q.moneda
         ) ORDER BY q.orden, q.banco), '[]'::jsonb)
    INTO v_cuentas
  FROM (
    SELECT c.id, c.banco, c.alias, c.moneda, c.orden,
           c.saldo_inicial
             + COALESCE(SUM(CASE WHEN m.tipo = 'ENTRADA' THEN m.monto
                                 WHEN m.tipo = 'SALIDA'  THEN -m.monto ELSE 0 END), 0) AS saldo
    FROM public.cuentas_bancarias c
    LEFT JOIN public.movimientos_bancarios m ON m.cuenta_id = c.id
    WHERE c.tenant_id = v_fin_tenant AND c.activo = true
    GROUP BY c.id
  ) q;

  RETURN jsonb_build_object('tenant_id', v_fin_tenant, 'nombre', v_fin_nombre, 'cuentas', v_cuentas);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_cuentas_financiera_externa() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_cuentas_financiera_externa() TO authenticated;

-- ---------------------------------------------------------------------
-- 3) SAN de la financiera (solo administradores)
-- ---------------------------------------------------------------------
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

  v_fin_tenant := public.financiera_vinculada_tenant();

  IF v_fin_tenant IS NULL THEN
    RETURN jsonb_build_object('tenant_id', NULL, 'nombre', NULL,
                              'sanes', '[]'::jsonb, 'pendientes', '[]'::jsonb);
  END IF;

  SELECT COALESCE(ce.razon_social, ce.nombre)
    INTO v_fin_nombre
  FROM public.config_empresa ce
  WHERE ce.tenant_id = v_fin_tenant
  LIMIT 1;

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
GRANT  EXECUTE ON FUNCTION public.get_san_financiera_externa() TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_fuga_financiera_externa.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Verificacion: que empresas tienen financiera vinculada (las unicas que
-- pueden ver datos de otra). Debe salir SOLO Caminero Motors.
SELECT ce.nombre AS empresa,
       fin.nombre AS financiera_que_ve
FROM public.config_empresa ce
JOIN public.config_empresa fin ON fin.tenant_id = ce.financiera_tenant_id
WHERE ce.financiera_tenant_id IS NOT NULL
ORDER BY ce.nombre;
