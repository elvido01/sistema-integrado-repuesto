-- =====================================================================
-- Poder corregir la forma de pago de un pago a suplidor, sin SQL
-- ---------------------------------------------------------------------
-- (2026-08-20) Hoy PS-000001 se digito como EFECTIVO siendo una salida de
-- la cuenta de Odalys. Hubo que arreglarlo escribiendo SQL a mano contra
-- produccion, que es como se arreglan las cosas exactamente una vez: la
-- segunda ya nadie se acuerda de que habia que tocar tambien el movimiento
-- bancario, y queda un pago corregido a medias.
--
-- >>> LO QUE SE PUEDE CORREGIR, Y LO QUE NO <<<
-- Solo la FORMA DE PAGO y la CUENTA. Nada mas.
--
-- El monto y las compras a las que se aplico NO se tocan aqui, y no es una
-- limitacion por pereza: cambiar el monto obliga a rehacer el detalle y los
-- balances del suplidor, y ese es un pago distinto, no una correccion. Para
-- eso esta anular y volver a hacerlo.
--
-- Equivocarse de forma de pago, en cambio, no cambia cuanto se pago ni a
-- quien: solo de donde salio. Por eso se puede arreglar sin deshacer nada.
--
-- >>> LO QUE HACE, EN ORDEN <<<
--   1. Comprueba que el pago es de esta empresa y no esta anulado.
--   2. Comprueba que las formas suman EXACTAMENTE lo que se pago.
--   3. Borra el movimiento bancario viejo del pago, si lo habia.
--   4. Escribe las formas nuevas.
--   5. Crea el movimiento nuevo si la forma nueva sale de una cuenta.
--
-- Los pasos 3 y 5 juntos son el motivo de que esto sea un RPC y no dos
-- pantallas: dejar el movimiento viejo y crear el nuevo duplicaria la
-- salida, y hacerlo desde el navegador deja la puerta abierta a que una de
-- las dos llamadas falle y nadie lo note.
--
-- Idempotente. Se puede correr varias veces sobre el mismo pago.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.corregir_forma_pago_suplidor(
  p_pago_id     uuid,
  p_formas_pago jsonb,
  p_cuenta_id   uuid DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_pago     record;
  v_suma     numeric := 0;
  v_banco    numeric := 0;
  v_prov     text;
  v_ref      text;
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
  SELECT COALESCE(SUM((f ->> 'monto')::numeric), 0),
         COALESCE(SUM(CASE WHEN f ->> 'forma' IN ('Transferencia','Cheque')
                           THEN (f ->> 'monto')::numeric ELSE 0 END), 0)
    INTO v_suma, v_banco
  FROM jsonb_array_elements(p_formas_pago) f;

  IF abs(v_suma - COALESCE(v_pago.monto_pagado, 0)) > 0.01 THEN
    RETURN json_build_object('ok', false, 'motivo',
      format('Las formas suman %s y el pago fue de %s', v_suma, v_pago.monto_pagado));
  END IF;

  IF v_banco > 0 AND p_cuenta_id IS NULL THEN
    RETURN json_build_object('ok', false, 'motivo', 'Dime de que cuenta sale la transferencia o el cheque');
  END IF;

  -- 3) Fuera el movimiento viejo. Se reconoce por referencia + origen,
  --    que es como lo escribe la pantalla (origen_id va NULL).
  DELETE FROM public.movimientos_bancarios
   WHERE tenant_id IN (v_tenant, (SELECT tenant_id FROM public.cuentas_bancarias WHERE id = p_cuenta_id))
     AND referencia = v_pago.numero
     AND origen_tipo = 'pago_suplidor';
  GET DIAGNOSTICS v_borrados = ROW_COUNT;

  -- 4) Las formas nuevas.
  UPDATE public.pagos_suplidores
     SET formas_pago = p_formas_pago
   WHERE id = p_pago_id AND tenant_id = v_tenant;

  -- 5) El movimiento nuevo, por el RPC compartido: la cuenta puede ser la de
  --    la financiera vinculada, igual que al crear el pago.
  IF v_banco > 0 THEN
    SELECT nombre INTO v_prov FROM public.proveedores WHERE id = v_pago.suplidor_id;
    v_mov := public.registrar_movimiento_bancario_compartido(
      p_cuenta_id  => p_cuenta_id,
      p_tipo       => 'SALIDA',
      p_monto      => v_banco,
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
    'monto_banco', v_banco
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.corregir_forma_pago_suplidor(uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.corregir_forma_pago_suplidor(uuid, jsonb, uuid) TO authenticated;

-- ------------------------------------------------------------
-- LA LISTA PARA ELEGIR CUAL CORREGIR
-- ------------------------------------------------------------
-- Con la cuenta de donde salio, si salio de alguna: sin eso hay que
-- adivinar cual de los pagos "Transferencia" es el que esta mal.
CREATE OR REPLACE FUNCTION public.get_pagos_suplidores_recientes(p_limit int DEFAULT 25)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_out    json;
BEGIN
  IF v_tenant IS NULL THEN RETURN '[]'::json; END IF;

  SELECT COALESCE(json_agg(x ORDER BY x.created_at DESC), '[]'::json) INTO v_out
  FROM (
    SELECT ps.id, ps.numero, ps.fecha, ps.monto_pagado, ps.formas_pago,
           ps.anulado, ps.created_at,
           pr.nombre AS suplidor,
           m.cuenta_id,
           cb.banco || ' — ' || COALESCE(cb.alias, '') AS cuenta_nombre
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
END $$;

REVOKE EXECUTE ON FUNCTION public.get_pagos_suplidores_recientes(int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_pagos_suplidores_recientes(int) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('corregir_forma_pago_suplidor.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname = 'public' AND p.proname = 'corregir_forma_pago_suplidor')
       THEN 'OK  se puede corregir la forma de pago'
       ELSE 'FALLO: no existe' END AS corregir,
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname = 'public' AND p.proname = 'get_pagos_suplidores_recientes')
       THEN 'OK  hay lista para elegir'
       ELSE 'FALLO: no existe' END AS listar;
