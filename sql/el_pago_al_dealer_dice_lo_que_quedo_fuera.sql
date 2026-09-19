-- =====================================================================
-- EL PAGO AL DEALER DICE CUANTO SE QUEDO FUERA, Y POR QUE
-- =====================================================================
-- Tercera pieza de la reparacion del 19/09/2026, detras de
-- el_financiamiento_nace_enganchado.sql y los_pagos_perdidos_llegan_al_dealer.sql.
-- Aquellas arreglaron el dinero; esta arregla el SILENCIO, que es lo que
-- dejo que el hueco creciera un mes sin que nadie lo viera.
--
-- >>> QUE ESTABA MAL <<<
-- La RPC contestaba dos cosas y ninguna servia para avisar:
--   · Cuando sincronizaba A MEDIAS devolvia ok:true a secas. PS-000006:
--     pago de RD$59,000, recibo de RD$49,516.67, y la pantalla dijo
--     "Registrado tambien en el dealer" tan contenta. Nadie podia saber que
--     faltaban RD$9,483.33 porque la RPC no decia cuanto se habia pagado.
--   · Cuando no sincronizaba NADA devolvia ok:false con un 'motivo' en
--     texto. PS-000008 y PS-000009 murieron ahi, callados.
--
-- Y ese ok:false tiene dos lecturas OPUESTAS que el texto no distingue:
--   a) Se le esta pagando a un suplidor cualquiera algo que no es
--      financiamiento. Es lo normal y no hay que decir nada.
--   b) Se le esta pagando al dealer cuotas de un financiamiento que
--      perdieron su enganche. Es un fallo y hay que gritarlo.
-- Sin separarlas, la pantalla solo puede elegir entre molestar siempre o
-- callar siempre. Callaba.
--
-- >>> QUE CAMBIA <<<
-- · Cada respuesta trae ahora un 'codigo' fijo para que la pantalla decida
--   sin leer textos: no_es_de_esta_empresa, anulado, sin_dealer,
--   no_aplica, financiamiento_sin_enganche, clientes_distintos,
--   ya_estaba, ok.
-- · 'no_aplica' es el caso (a): el pago no toca ni una CxP nacida de un
--   financiamiento. La pantalla se calla.
-- · 'financiamiento_sin_enganche' es el caso (b): SI hay CxP de
--   financiamiento en el pago (su referencia lo dice) pero ninguna tiene
--   factura del dealer. La pantalla avisa en rojo.
-- · Toda respuesta con ok:true trae 'pagado' (el total del pago), 'total'
--   (lo que le entro al dealer) y 'fuera' (la resta). Con eso la pantalla
--   puede decir "se pagaron 59,000 pero al dealer le entraron 49,516.67".
--
-- >>> LO QUE NO CAMBIA <<<
-- El filtro: siguen entrando SOLO las CxP con factura del dealer
-- enganchada. Ese filtro no es el defecto, es lo que evita que un pago de
-- repuestos le baje una factura de financiamiento a nadie. Tampoco cambia
-- la firma (uuid, text): cambiarla crearia una sobrecarga y la llamada
-- reventaria con "is not unique".
--
-- Se conserva el DROP TABLE IF EXISTS _abonos que se puso el 19/09 para
-- poder sincronizar varios pagos en una misma transaccion.
-- =====================================================================

SELECT public.registrar_migracion('el_pago_al_dealer_dice_lo_que_quedo_fuera.sql');

CREATE OR REPLACE FUNCTION public.sincronizar_pago_a_dealer(
  p_pago_id uuid,
  p_forma   text DEFAULT 'Efectivo'
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fin      uuid := public.get_user_tenant();
  v_dealer   uuid;
  v_pago     record;
  v_cliente  uuid;
  v_clientes int;
  v_total    numeric := 0;
  v_numero   text;
  v_recibo   uuid;
  v_next     bigint;
  r          record;
  v_pend     numeric;
  v_lineas   int := 0;
  v_fin_lin  int := 0;
  v_monto_ri numeric;
BEGIN
  IF v_fin IS NULL THEN RAISE EXCEPTION 'Sin empresa'; END IF;

  SELECT * INTO v_pago FROM public.pagos_suplidores
  WHERE id = p_pago_id AND tenant_id = v_fin;
  IF v_pago.id IS NULL THEN
    RETURN json_build_object('ok', false, 'codigo', 'no_es_de_esta_empresa',
      'motivo', 'Ese pago no es de esta empresa');
  END IF;
  IF COALESCE(v_pago.anulado, false) THEN
    RETURN json_build_object('ok', false, 'codigo', 'anulado',
      'motivo', 'El pago esta anulado');
  END IF;

  -- El dealer es la empresa que apunta a esta como su financiera. Mismo
  -- modelo de confianza que registrar_movimiento_bancario_compartido: no se
  -- puede escribir en una empresa que no esta vinculada.
  SELECT ce.tenant_id INTO v_dealer
  FROM public.config_empresa ce
  WHERE ce.financiera_tenant_id = v_fin AND ce.tenant_id <> v_fin
  LIMIT 1;
  IF v_dealer IS NULL THEN
    RETURN json_build_object('ok', false, 'codigo', 'sin_dealer',
      'motivo', 'Esta empresa no es la financiera de ningun dealer');
  END IF;

  -- Ya sincronizado: se devuelve lo que hay en vez de duplicar el ingreso.
  SELECT id, numero, monto_pagado INTO v_recibo, v_numero, v_monto_ri
  FROM public.recibos_ingreso
  WHERE tenant_id = v_dealer
    AND origen = 'pago_suplidor:' || v_pago.numero
    AND COALESCE(anulado, false) = false
  LIMIT 1;
  IF v_recibo IS NOT NULL THEN
    RETURN json_build_object('ok', true, 'codigo', 'ya_estaba', 'ya_estaba', true,
      'recibo', v_numero, 'pagado', v_pago.monto_pagado,
      'total', v_monto_ri,
      'fuera', round(COALESCE(v_pago.monto_pagado, 0) - COALESCE(v_monto_ri, 0), 2));
  END IF;

  -- Lo pagado, junto por factura del dealer. Solo entran las CxP que tienen
  -- factura enganchada: un pago a este mismo suplidor por algo que no sea
  -- financiamiento no le corresponde a ninguna factura y se queda fuera.
  DROP TABLE IF EXISTS _abonos;
  CREATE TEMP TABLE _abonos ON COMMIT DROP AS
  SELECT c.factura_dealer_id AS factura_id,
         round(SUM(d.monto_abonado), 2) AS monto
  FROM public.pagos_suplidores_detalle d
  JOIN public.compras c ON c.id = d.compra_id AND c.tenant_id = v_fin
  JOIN public.facturas f ON f.id = c.factura_dealer_id AND f.tenant_id = v_dealer
  WHERE d.pago_id = p_pago_id
    AND c.factura_dealer_id IS NOT NULL
  GROUP BY c.factura_dealer_id;

  SELECT COALESCE(SUM(monto), 0), count(*) INTO v_total, v_lineas FROM _abonos;
  IF v_lineas = 0 THEN
    -- ¿Es que no habia nada del dealer, o es que se le perdio el enganche?
    -- No es lo mismo y la pantalla tiene que poder distinguirlo.
    SELECT count(*) INTO v_fin_lin
    FROM public.pagos_suplidores_detalle d
    JOIN public.compras c ON c.id = d.compra_id AND c.tenant_id = v_fin
    WHERE d.pago_id = p_pago_id
      AND c.referencia ~ 'Financiamiento factura #[0-9]+';

    IF v_fin_lin > 0 THEN
      RETURN json_build_object('ok', false, 'codigo', 'financiamiento_sin_enganche',
        'motivo', format('Este pago toca %s cuenta(s) de financiamiento del dealer, pero ninguna tiene su factura enganchada: el dinero no le llego a nadie', v_fin_lin),
        'pagado', v_pago.monto_pagado, 'total', 0, 'fuera', v_pago.monto_pagado);
    END IF;

    RETURN json_build_object('ok', false, 'codigo', 'no_aplica',
      'motivo', 'Ninguna de las cuentas por pagar de este pago viene de una factura del dealer',
      'pagado', v_pago.monto_pagado, 'total', 0, 'fuera', 0);
  END IF;

  -- Todas las facturas tienen que ser del MISMO cliente: es el cliente
  -- "financiera" que creo el financiamiento. Si salieran dos, el recibo
  -- estaria mezclando deudas de dos personas distintas.
  -- array_agg y no min(): en Postgres no hay min(uuid).
  SELECT count(DISTINCT f.cliente_id), (array_agg(DISTINCT f.cliente_id))[1]
    INTO v_clientes, v_cliente
  FROM _abonos a JOIN public.facturas f ON f.id = a.factura_id;
  IF v_clientes <> 1 THEN
    RETURN json_build_object('ok', false, 'codigo', 'clientes_distintos', 'motivo',
      format('Las facturas son de %s clientes distintos: no se puede hacer un solo recibo', v_clientes));
  END IF;

  -- Numeracion del DEALER. get_next_recibo_ingreso_numero() no sirve aqui:
  -- lee get_user_tenant(), que es la financiera, y daria un numero de la
  -- empresa equivocada.
  SELECT COALESCE(MAX(CASE
           WHEN numero ~ '^\d+$'  THEN numero::bigint
           WHEN numero ~ '^RI-'   THEN REPLACE(numero, 'RI-', '')::bigint
           ELSE 0 END), 0) + 1
    INTO v_next
  FROM public.recibos_ingreso WHERE tenant_id = v_dealer;
  v_numero := 'RI-' || LPAD(v_next::text, 6, '0');

  INSERT INTO public.recibos_ingreso (
    tenant_id, numero, cliente_id, fecha, monto_pagado, concepto, formas_pago, usuario_id, origen
  ) VALUES (
    v_dealer, v_numero, v_cliente, v_pago.fecha, v_total,
    format('Pago de la financiera (%s)', v_pago.numero),
    jsonb_build_array(jsonb_build_object(
      'id', 1, 'forma', COALESCE(NULLIF(btrim(p_forma), ''), 'Efectivo'),
      'monto', v_total, 'referencia', v_pago.numero)),
    auth.uid(),
    'pago_suplidor:' || v_pago.numero
  ) RETURNING id INTO v_recibo;

  FOR r IN SELECT factura_id, monto FROM _abonos LOOP
    INSERT INTO public.recibos_ingreso_detalle (tenant_id, recibo_id, factura_id, monto_abonado)
    VALUES (v_dealer, v_recibo, r.factura_id, r.monto);

    UPDATE public.facturas
       SET monto_pendiente = GREATEST(0, monto_pendiente - r.monto)
     WHERE id = r.factura_id AND tenant_id = v_dealer
    RETURNING monto_pendiente INTO v_pend;

    IF COALESCE(v_pend, 0) <= 0.01 THEN
      UPDATE public.facturas SET estado = 'PAGADA', monto_pendiente = 0
       WHERE id = r.factura_id AND tenant_id = v_dealer;
    END IF;
  END LOOP;

  -- El balance del cliente, igual que lo deja un recibo normal.
  UPDATE public.clientes
     SET balance = (SELECT COALESCE(SUM(monto_pendiente), 0) FROM public.facturas
                     WHERE cliente_id = v_cliente AND estado = 'PENDIENTE' AND tenant_id = v_dealer)
   WHERE id = v_cliente AND tenant_id = v_dealer;

  RETURN json_build_object(
    'ok', true, 'codigo', 'ok', 'recibo', v_numero, 'total', v_total,
    'facturas', v_lineas, 'dealer', v_dealer, 'fecha', v_pago.fecha,
    -- Lo que se pago y lo que de verdad le entro al dealer. La resta es lo
    -- que la pantalla tiene que cantar: sin esto, un pago a medias se veia
    -- exactamente igual que uno completo.
    'pagado', v_pago.monto_pagado,
    'fuera', round(COALESCE(v_pago.monto_pagado, 0) - v_total, 2)
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.sincronizar_pago_a_dealer(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sincronizar_pago_a_dealer(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $prueba$
DECLARE
  res  json;
  v_id uuid;
BEGIN
  -- Se prueba EJECUTANDOLA, no leyendola. PS-000006 ya tiene su recibo, asi
  -- que la RPC sale por 'ya_estaba' y no escribe nada.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', 'ebb94ffc-9c5c-419a-889d-a354964f57bc', 'role', 'authenticated')::text, true);

  SELECT id INTO v_id FROM public.pagos_suplidores
   WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4' AND numero = 'PS-000006';

  res := public.sincronizar_pago_a_dealer(v_id, 'Efectivo');

  IF res->>'codigo' IS NULL THEN
    RAISE EXCEPTION 'La RPC no devolvio codigo: %', res::text;
  END IF;
  IF res->>'codigo' <> 'ya_estaba' THEN
    RAISE EXCEPTION 'PS-000006 ya tiene recibo y la RPC contesto %', res::text;
  END IF;
  IF (res->>'pagado')::numeric <> 59000 THEN
    RAISE EXCEPTION 'La RPC no devuelve lo pagado (%)', res::text;
  END IF;
  IF (res->>'fuera')::numeric <> 0 THEN
    RAISE EXCEPTION 'PS-000006 esta completo y la RPC dice que quedo fuera % ', res->>'fuera';
  END IF;
END $prueba$;

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  CASE WHEN position('financiamiento_sin_enganche' in
         pg_get_functiondef('public.sincronizar_pago_a_dealer(uuid,text)'::regprocedure)) > 0
       THEN 'OK  distingue el fallo del pago normal' ELSE 'FALLO' END AS avisa,
  CASE WHEN position('''fuera''' in
         pg_get_functiondef('public.sincronizar_pago_a_dealer(uuid,text)'::regprocedure)) > 0
       THEN 'OK  dice cuanto quedo fuera' ELSE 'FALLO' END AS cuantifica;
