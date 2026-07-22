-- =====================================================================
-- CUENTA BANCARIA COMPARTIDA entre el dealer y su financiera vinculada
-- ---------------------------------------------------------------------
-- Caso (2026-07-21): la cuenta 004110544 del Banco Popular es UNA sola
-- cuenta física de MotoPréstamos Los Naranjos, pero Caminero Motors la usa
-- también. Se quiere:
--   1) que la cuenta viva en Naranjos con su número real 004110544;
--   2) que CAMINERO pueda MANDAR dinero a esa cuenta cuando vende por
--      transferencia, y RETIRAR cuando paga un suplidor por transferencia,
--      aunque la cuenta sea de otro tenant.
--
-- El dealer ya tiene config_empresa.financiera_tenant_id apuntando a la
-- financiera (mismo campo que usa el resto del cruce). Sobre eso se apoya
-- todo: un tenant solo puede tocar SU cuenta o la de SU financiera vinculada
-- — nunca la de una empresa cualquiera.
--
-- Requiere sql/fix_fuga_financiera_externa.sql (helper financiera_vinculada_tenant).
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Número real de la cuenta (idempotente)
-- ---------------------------------------------------------------------
UPDATE public.cuentas_bancarias
   SET numero_cuenta = '004110544'
 WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'  -- MotoPréstamos Los Naranjos
   AND banco = 'BANCO POPULAR'
   AND COALESCE(numero_cuenta, '') IN ('', '000000004', '0000004', '4');

-- ---------------------------------------------------------------------
-- 1) Cuentas SELECCIONABLES: las propias + las de la financiera vinculada
--    Alimenta el selector de cuenta (ventas, pago a suplidor, etc.). Sin
--    saldo ni gate de rol: cualquiera que factura o paga puede elegirla.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cuentas_seleccionables(p_moneda text DEFAULT NULL)
RETURNS TABLE (
  id            uuid,
  banco         text,
  alias         text,
  numero_cuenta text,
  moneda        text,
  externa       boolean,     -- true = es de la financiera vinculada
  empresa       text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH yo AS (SELECT public.get_user_tenant() AS t),
       fin AS (SELECT public.financiera_vinculada_tenant() AS t)
  SELECT c.id, c.banco, c.alias, c.numero_cuenta, c.moneda,
         (c.tenant_id <> (SELECT t FROM yo)) AS externa,
         ce.nombre AS empresa
  FROM public.cuentas_bancarias c
  JOIN public.config_empresa ce ON ce.tenant_id = c.tenant_id
  WHERE c.activo = true
    AND (p_moneda IS NULL OR c.moneda = p_moneda)
    AND (
      c.tenant_id = (SELECT t FROM yo)
      OR c.tenant_id = (SELECT t FROM fin)
    )
  ORDER BY (c.tenant_id <> (SELECT t FROM yo)), c.orden, c.banco;
$$;

REVOKE EXECUTE ON FUNCTION public.get_cuentas_seleccionables(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_cuentas_seleccionables(text) TO authenticated;

-- ---------------------------------------------------------------------
-- 2) Registrar un movimiento en una cuenta PROPIA o de la financiera
--    vinculada. El movimiento se guarda con el tenant DUEÑO de la cuenta
--    (así el saldo de esa cuenta lo refleja para su dueño) pero el concepto
--    deja rastro de qué empresa lo originó. Idempotente por documento.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_movimiento_bancario_compartido(
  p_cuenta_id   uuid,
  p_tipo        text,
  p_monto       numeric,
  p_concepto    text DEFAULT NULL,
  p_referencia  text DEFAULT NULL,
  p_origen_tipo text DEFAULT 'ajuste',
  p_origen_id   uuid DEFAULT NULL,
  p_fecha       date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := public.get_user_tenant();
  v_fin    uuid := public.financiera_vinculada_tenant();
  v_owner  uuid;
  v_dealer text;
  v_id     uuid;
  v_fecha  date := COALESCE(p_fecha, (now() AT TIME ZONE 'America/Santo_Domingo')::date);
BEGIN
  IF p_cuenta_id IS NULL THEN RETURN NULL; END IF;
  IF v_caller IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF p_tipo NOT IN ('ENTRADA','SALIDA') THEN
    RAISE EXCEPTION 'tipo debe ser ENTRADA o SALIDA (%)', p_tipo;
  END IF;

  SELECT tenant_id INTO v_owner FROM public.cuentas_bancarias WHERE id = p_cuenta_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Cuenta no encontrada'; END IF;

  -- Solo la cuenta propia o la de la financiera vinculada.
  IF v_owner <> v_caller AND v_owner IS DISTINCT FROM v_fin THEN
    RAISE EXCEPTION 'No puede registrar en una cuenta que no es suya ni de su financiera vinculada';
  END IF;

  -- Si el dinero entra/sale desde OTRA empresa, dejar el rastro en el concepto.
  IF v_owner <> v_caller THEN
    SELECT nombre INTO v_dealer FROM public.config_empresa WHERE tenant_id = v_caller;
    p_concepto := COALESCE(p_concepto, '') || ' · vía ' || COALESCE(v_dealer, 'otra empresa');
  END IF;

  IF p_origen_id IS NOT NULL THEN
    INSERT INTO public.movimientos_bancarios
      (tenant_id, cuenta_id, fecha, tipo, monto, concepto, referencia, origen_tipo, origen_id, usuario_id)
    VALUES
      (v_owner, p_cuenta_id, v_fecha, p_tipo, ABS(p_monto), p_concepto, p_referencia,
       COALESCE(p_origen_tipo, 'ajuste'), p_origen_id, auth.uid())
    ON CONFLICT (tenant_id, origen_tipo, origen_id) WHERE origen_id IS NOT NULL
    DO UPDATE SET
      cuenta_id  = EXCLUDED.cuenta_id,
      fecha      = EXCLUDED.fecha,
      tipo       = EXCLUDED.tipo,
      monto      = EXCLUDED.monto,
      concepto   = EXCLUDED.concepto,
      referencia = EXCLUDED.referencia
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.movimientos_bancarios
      (tenant_id, cuenta_id, fecha, tipo, monto, concepto, referencia, origen_tipo, origen_id, usuario_id)
    VALUES
      (v_owner, p_cuenta_id, v_fecha, p_tipo, ABS(p_monto), p_concepto, p_referencia,
       COALESCE(p_origen_tipo, 'ajuste'), NULL, auth.uid())
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.registrar_movimiento_bancario_compartido(uuid,text,numeric,text,text,text,uuid,date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_movimiento_bancario_compartido(uuid,text,numeric,text,text,text,uuid,date) TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('cuenta_compartida_dealer_financiera.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Verificación
SELECT 'get_cuentas_seleccionables' AS objeto, to_regprocedure('public.get_cuentas_seleccionables(text)')::text AS existe
UNION ALL SELECT 'registrar_movimiento_bancario_compartido',
  to_regprocedure('public.registrar_movimiento_bancario_compartido(uuid,text,numeric,text,text,text,uuid,date)')::text
UNION ALL SELECT 'cuenta_004_numero',
  (SELECT numero_cuenta FROM public.cuentas_bancarias
   WHERE tenant_id='766fe3d6-6885-4f2b-b2cc-1a91db696fb4' AND banco='BANCO POPULAR' LIMIT 1);
