-- =====================================================================
-- Historial de una cuenta bancaria COMPARTIDA
-- ---------------------------------------------------------------------
-- La cuenta 004110544 vive en MotoPrestamos pero Caminero tambien la usa.
-- Caminero ya ve su SALDO (get_cuentas_financiera_externa), pero al abrir
-- "Movimientos" no veia nada: los movimientos tienen tenant_id de la dueña
-- y el RLS de movimientos_bancarios los oculta.
--
-- Este RPC devuelve el historial de una cuenta que el que llama PUEDE ver:
-- la suya o la de su financiera vinculada (mismo criterio que
-- registrar_movimiento_bancario_compartido). Asi el historial se ve igual
-- en las dos empresas.
--
-- Requiere sql/fix_fuga_financiera_externa.sql (financiera_vinculada_tenant)
-- y sql/cuenta_compartida_dealer_financiera.sql.
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_movimientos_cuenta(
  p_cuenta_id uuid,
  p_desde     date DEFAULT NULL
)
RETURNS TABLE (
  id          uuid,
  fecha       date,
  tipo        text,
  monto       numeric,
  concepto    text,
  referencia  text,
  origen_tipo text,
  created_at  timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := public.get_user_tenant();
  v_fin    uuid := public.financiera_vinculada_tenant();
  v_owner  uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;

  SELECT tenant_id INTO v_owner FROM public.cuentas_bancarias WHERE cuentas_bancarias.id = p_cuenta_id;
  IF v_owner IS NULL THEN RETURN; END IF;

  -- Solo la cuenta propia o la de la financiera vinculada.
  IF v_owner <> v_caller AND v_owner IS DISTINCT FROM v_fin THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT m.id, m.fecha, m.tipo, m.monto, m.concepto, m.referencia,
         m.origen_tipo, m.created_at
  FROM public.movimientos_bancarios m
  WHERE m.cuenta_id = p_cuenta_id
    AND (p_desde IS NULL OR m.fecha >= p_desde)
  ORDER BY m.fecha DESC, m.created_at DESC
  LIMIT 200;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_movimientos_cuenta(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_movimientos_cuenta(uuid, date) TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('movimientos_cuenta_compartida.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

SELECT 'get_movimientos_cuenta' AS objeto,
       to_regprocedure('public.get_movimientos_cuenta(uuid,date)')::text AS existe;
