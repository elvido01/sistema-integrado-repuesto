-- =====================================================================
-- Dashboard móvil: cuentas bancarias de la financiera (cross-tenant)
-- ---------------------------------------------------------------------
-- La app móvil se usa desde Caminero, que NO tiene cuentas bancarias
-- propias (están en MotoPréstamos). Un usuario de Caminero no puede
-- leerlas por RLS, así que este RPC SECURITY DEFINER —igual que
-- get_san_financiera_externa— resuelve la financiera y devuelve sus
-- cuentas activas con el saldo calculado.
--
-- SOLO gerenciales (admin/gerente/manager/owner/superadmin): el saldo de
-- las cuentas no es dato para un vendedor. Si no lo es, devuelve vacío y
-- la tarjeta no aparece.
--
-- El saldo se calcula desde las TABLAS BASE (no desde la vista
-- cuentas_bancarias_saldos, que es security_invoker y devolvería vacío
-- para otro tenant).
-- Idempotente / re-ejecutable.
-- =====================================================================

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

  -- ---- Gate gerencial (mismo criterio que el móvil) -----------------
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

  -- ---- Resolver la financiera (verbatim del RPC de recibos/SAN) -----
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
    RETURN jsonb_build_object('tenant_id', NULL, 'nombre', NULL, 'cuentas', '[]'::jsonb);
  END IF;

  SELECT COALESCE(ce.razon_social, ce.nombre)
    INTO v_fin_nombre
  FROM public.config_empresa ce WHERE ce.tenant_id = v_fin_tenant LIMIT 1;

  -- ---- Cuentas activas con saldo (desde tablas base) ----------------
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

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('dashboard_cuentas_financiera_externa.sql');
  END IF;
END $$;

SELECT 'get_cuentas_financiera_externa' AS objeto,
  to_regprocedure('public.get_cuentas_financiera_externa()')::text AS existe;
