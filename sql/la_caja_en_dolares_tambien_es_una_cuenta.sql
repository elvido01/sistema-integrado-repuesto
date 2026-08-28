-- =====================================================================
-- La caja en dólares también es una cuenta
-- ---------------------------------------------------------------------
-- (2026-08-28) PS-000020: CAMINERO MOTORS le pagó US$4,650.66 a TERUEL en
-- EFECTIVO, con los dólares de la CAJA CHICA — Dólares. La caja siguió
-- marcando US$4,651.00. El dinero salió y el saldo no se movió.
--
-- Y al ir a corregirlo, la caja en dólares ni aparecía en la lista: el
-- selector traía moneda="DOP" clavado. No había forma de decirlo.
--
-- >>> LA REGLA, Y POR QUE NO ES "EFECTIVO NO TOCA CUENTAS" <<<
-- El efectivo en PESOS lo controla el cierre de caja: la caja del día ya le
-- resta los pagos a suplidor en efectivo (fix_caja_dia_pagos_efectivo.sql).
-- Restarlo además de una cuenta lo contaría dos veces.
--
-- Los DÓLARES no están en ningún cierre —el cierre es en pesos—. La caja en
-- dólares es el único sitio donde viven, así que sacar dólares de ella SÍ es
-- una salida de cuenta aunque la forma de pago diga "Efectivo".
--
-- La misma regla está en src/lib/saleDeLaCuenta.js. Si se cambia una hay que
-- cambiar la otra: si no dicen lo mismo, crear un pago y corregirlo dejan
-- saldos distintos, y nadie mira los dos el mismo día.
--
-- >>> Y LA CONVERSION <<<
-- Las formas de pago se digitan siempre en RD$. A una cuenta en dólares no
-- se le pueden restar pesos: se convierte a la tasa que quedó guardada EN EL
-- PAGO (no la de hoy — el saldo de una caja no cambia porque cambie la tasa).
-- Sin tasa guardada no se mueve nada y se dice por qué.
--
-- Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.corregir_forma_pago_suplidor(
  p_pago_id     uuid,
  p_formas_pago jsonb,
  p_cuenta_id   uuid DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_pago     record;
  v_suma     numeric := 0;
  v_pesos    numeric := 0;   -- lo que sale de la cuenta, en RD$
  v_monto    numeric := 0;   -- lo mismo, ya en la moneda de la cuenta
  v_moneda   text;
  v_cuenta   text;
  v_prov     text;
  v_borrados int := 0;
  v_mov      uuid;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin empresa'; END IF;

  SELECT * INTO v_pago FROM public.pagos_suplidores
  WHERE id = p_pago_id AND tenant_id = v_tenant;
  IF v_pago.id IS NULL THEN
    RETURN json_build_object('ok', false, 'motivo', 'Ese pago no es de esta empresa');
  END IF;
  IF COALESCE(v_pago.anulado, false) THEN
    RETURN json_build_object('ok', false, 'motivo', 'El pago esta anulado: no hay nada que corregir');
  END IF;

  IF jsonb_typeof(p_formas_pago) <> 'array' OR jsonb_array_length(p_formas_pago) = 0 THEN
    RETURN json_build_object('ok', false, 'motivo', 'Hace falta al menos una forma de pago');
  END IF;

  -- Las formas tienen que sumar lo que se pago. Si no, el pago quedaria
  -- diciendo una cosa y el detalle otra, que es peor que el error original.
  SELECT COALESCE(SUM((f ->> 'monto')::numeric), 0) INTO v_suma
  FROM jsonb_array_elements(p_formas_pago) f;

  IF abs(v_suma - COALESCE(v_pago.monto_pagado, 0)) > 0.01 THEN
    RETURN json_build_object('ok', false, 'motivo',
      format('Las formas suman %s y el pago fue de %s', v_suma, v_pago.monto_pagado));
  END IF;

  IF p_cuenta_id IS NOT NULL THEN
    SELECT c.moneda, c.banco || COALESCE(' — ' || c.alias, '')
      INTO v_moneda, v_cuenta
    FROM public.cuentas_bancarias c WHERE c.id = p_cuenta_id;
    IF v_moneda IS NULL THEN
      RETURN json_build_object('ok', false, 'motivo', 'Esa cuenta no existe');
    END IF;
  END IF;

  -- >>> LO QUE SALE DE LA CUENTA <<<
  -- Transferencia y cheque, siempre. Efectivo, solo si la cuenta no es en
  -- pesos: los dolares en mano salen de la caja en dolares, los pesos en
  -- mano los resta el cierre de caja.
  SELECT COALESCE(SUM((f ->> 'monto')::numeric), 0) INTO v_pesos
  FROM jsonb_array_elements(p_formas_pago) f
  WHERE f ->> 'forma' IN ('Transferencia', 'Cheque')
     OR (f ->> 'forma' = 'Efectivo' AND v_moneda IS NOT NULL AND v_moneda <> 'DOP');

  IF v_pesos > 0 AND p_cuenta_id IS NULL THEN
    RETURN json_build_object('ok', false, 'motivo', 'Dime de que cuenta sale la transferencia o el cheque');
  END IF;

  -- A una cuenta en divisa no se le restan pesos: le dejaria el saldo
  -- inventado, que es peor que no moverla.
  IF v_pesos > 0 AND v_moneda <> 'DOP' THEN
    IF COALESCE(v_pago.tasa_cambio, 0) <= 0 THEN
      RETURN json_build_object('ok', false, 'motivo',
        format('La cuenta esta en %s y el pago no tiene tasa guardada: no se sabe cuanto salio de ella', v_moneda));
    END IF;
    v_monto := round(v_pesos / v_pago.tasa_cambio, 2);
  ELSE
    v_monto := v_pesos;
  END IF;

  -- Fuera el movimiento viejo, este donde este: puede haber quedado en una
  -- cuenta distinta de la que se elige ahora, y dejarlo duplicaria la salida.
  -- Solo se tocan cuentas propias o de la financiera vinculada.
  DELETE FROM public.movimientos_bancarios mb
   WHERE mb.referencia = v_pago.numero
     AND mb.origen_tipo = 'pago_suplidor'
     AND mb.cuenta_id IN (
       SELECT c.id FROM public.cuentas_bancarias c
       WHERE c.tenant_id = v_tenant
          OR c.tenant_id IS NOT DISTINCT FROM public.financiera_vinculada_tenant());
  GET DIAGNOSTICS v_borrados = ROW_COUNT;

  UPDATE public.pagos_suplidores
     SET formas_pago = p_formas_pago
   WHERE id = p_pago_id AND tenant_id = v_tenant;

  IF v_monto > 0 THEN
    SELECT nombre INTO v_prov FROM public.proveedores WHERE id = v_pago.suplidor_id;
    v_mov := public.registrar_movimiento_bancario_compartido(
      p_cuenta_id  => p_cuenta_id,
      p_tipo       => 'SALIDA',
      p_monto      => v_monto,
      p_concepto   => format('Pago suplidor %s (%s)', COALESCE(v_prov, ''), v_pago.numero),
      p_referencia => v_pago.numero,
      p_origen_tipo=> 'pago_suplidor',
      p_origen_id  => NULL,
      p_fecha      => v_pago.fecha
    );
  END IF;

  RETURN json_build_object(
    'ok', true,
    'numero', v_pago.numero,
    'movimientos_borrados', v_borrados,
    'movimiento_nuevo', v_mov,
    'monto_banco', v_pesos,          -- se mantiene por compatibilidad
    'monto_cuenta', v_monto,
    'moneda_cuenta', v_moneda,
    'cuenta', v_cuenta
  );
END $fn$;

REVOKE EXECUTE ON FUNCTION public.corregir_forma_pago_suplidor(uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.corregir_forma_pago_suplidor(uuid, jsonb, uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- La lista, ahora diciendo si el pago fue en dolares
-- ---------------------------------------------------------------------
-- Sin la tasa la pantalla no puede decidir si el efectivo salio de una caja
-- en dolares, y ese es justo el pago que hay que poder corregir.
CREATE OR REPLACE FUNCTION public.get_pagos_suplidores_recientes(p_limit int DEFAULT 25)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_out    json;
BEGIN
  IF v_tenant IS NULL THEN RETURN '[]'::json; END IF;

  SELECT COALESCE(json_agg(x ORDER BY x.created_at DESC), '[]'::json) INTO v_out
  FROM (
    SELECT ps.id, ps.numero, ps.fecha, ps.monto_pagado, ps.formas_pago,
           ps.anulado, ps.created_at, ps.total_usd, ps.tasa_cambio,
           pr.nombre AS suplidor,
           m.cuenta_id,
           cb.banco || ' — ' || COALESCE(cb.alias, '') AS cuenta_nombre,
           cb.moneda AS cuenta_moneda
    FROM public.pagos_suplidores ps
    LEFT JOIN public.proveedores pr ON pr.id = ps.suplidor_id
    LEFT JOIN LATERAL (
      SELECT mb.cuenta_id FROM public.movimientos_bancarios mb
      WHERE mb.referencia = ps.numero AND mb.origen_tipo = 'pago_suplidor'
      LIMIT 1
    ) m ON true
    LEFT JOIN public.cuentas_bancarias cb ON cb.id = m.cuenta_id
    WHERE ps.tenant_id = v_tenant
    ORDER BY ps.created_at DESC
    LIMIT GREATEST(1, LEAST(p_limit, 100))
  ) x;

  RETURN v_out;
END $fn$;

REVOKE EXECUTE ON FUNCTION public.get_pagos_suplidores_recientes(int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_pagos_suplidores_recientes(int) TO authenticated;

-- ---------------------------------------------------------------------
-- El centinela: pagos en divisa que no movieron ninguna caja
-- ---------------------------------------------------------------------
-- Este error no se ve nunca solo: el saldo queda alto y nadie sabe de cuando
-- viene. Que salga listado es lo unico que lo hace corregible.
CREATE OR REPLACE VIEW public.v_pagos_divisa_sin_salida AS
SELECT ps.tenant_id, ps.id, ps.numero, ps.fecha, pr.nombre AS suplidor,
       ps.total_usd, ps.tasa_cambio, ps.monto_pagado,
       (SELECT string_agg(f ->> 'forma', ' / ')
          FROM jsonb_array_elements(ps.formas_pago) f) AS formas
FROM public.pagos_suplidores ps
LEFT JOIN public.proveedores pr ON pr.id = ps.suplidor_id
WHERE COALESCE(ps.anulado, false) = false
  AND COALESCE(ps.total_usd, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.movimientos_bancarios mb
    WHERE mb.referencia = ps.numero AND mb.origen_tipo = 'pago_suplidor');

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('la_caja_en_dolares_tambien_es_una_cuenta.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT json_build_object(
  'pagos_en_dolares_sin_caja', (
    SELECT COALESCE(json_agg(json_build_object(
             'numero', v.numero, 'fecha', v.fecha, 'suplidor', v.suplidor,
             'usd', v.total_usd, 'formas', v.formas)), '[]'::json)
    FROM public.v_pagos_divisa_sin_salida v),
  'devuelve_la_tasa', (
    SELECT count(*) FROM information_schema.routines
    WHERE routine_name = 'get_pagos_suplidores_recientes')
) AS r;
