-- =====================================================================
-- CxP del dealer en la financiera: DIVIDIDA POR CUOTAS
-- ---------------------------------------------------------------------
-- Antes: al procesar un financiamiento de terceros, la financiera quedaba
-- con UNA sola cuenta por pagar al dealer por todo el capital y con
-- dias_credito = 0 → vencia el mismo dia y salia ATRASADA desde el primer
-- momento (ej. CAMINERO MOTORS RD$184,600 y RD$137,600 en el movil).
--
-- Ahora: la deuda se divide por el CAPITAL y la FECHA de cada cuota. Una
-- CxP por cuota, venciendo el dia que el cliente paga esa cuota, mas una
-- linea aparte por el ADICIONAL (que no se financia pero si se cobra).
-- La financiera le paga al dealer a medida que cobra.
--
--   FIN-000003-01  vence 16-ago  15,383.33
--   FIN-000003-02  vence 16-sep  15,383.33
--   ...
--   FIN-000004-AD  vence 31-jul   3,000.00
--
-- La suma de las lineas es identica al total anterior, asi que la CxC del
-- dealer sigue cuadrando 1:1 con la CxP de la financiera.
--
-- Cobrarle al cliente NO salda estas lineas: se pagan a mano desde Pago a
-- Suplidores cuando la transferencia al dealer ocurre de verdad.
--
-- Incluye el arreglo de los financiamientos YA creados (se dividen los que
-- no tengan ningun pago aplicado).
-- Idempotente / re-ejecutable.
-- Base: sql/adicional_cargo_financiamiento.sql (version canonica).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.procesar_financiamiento_terceros(
  p_factura_id          uuid,
  p_solicitud_id        uuid,
  p_financiera_tenant_id uuid
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dealer        uuid := public.get_user_tenant();
  v_fin           uuid := p_financiera_tenant_id;
  v_cfg_tipo      text;
  v_cfg_fin       uuid;
  v_dealer_nombre text;
  v_fin_nombre    text;
  sol             record;
  fac             record;
  v_inicial       numeric;
  v_capital       numeric;
  v_metodo        text;
  v_origen        text;
  buyer_codigo    text;
  buyer_nombre    text;
  v_cli_fin       uuid;
  v_cli_dealerfin uuid;
  v_prov          uuid;
  v_prestamo_id   uuid;
  v_numero        text;
  v_seq           int;
  v_aseq          bigint;
  v_ad_numero     text;
  v_cuotas        json;
  c               jsonb;
  cq              record;            -- cuota ya persistida (para la CxP)
  v_compra_num    text;
  v_cseq          int;
  v_plazo         int;
  v_lineas        int := 0;
  v_fecha1        date;
  v_mora          numeric := 0;
  v_adj           numeric := 0;   -- cuota ajustada (redondeo del operador)
  v_adic          numeric := 0;   -- ADICIONAL (completivo del inicial)
  v_cap           numeric;
  v_int           numeric;
  v_cuota_m       numeric;
BEGIN
  IF v_dealer IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF v_fin IS NULL THEN RAISE EXCEPTION 'financiera_tenant_id es requerido'; END IF;

  SELECT financiamiento_tipo, financiera_tenant_id
    INTO v_cfg_tipo, v_cfg_fin
  FROM public.config_empresa WHERE tenant_id = v_dealer;
  IF COALESCE(v_cfg_tipo,'propio') <> 'terceros' OR v_cfg_fin IS DISTINCT FROM v_fin THEN
    RAISE EXCEPTION 'La empresa no esta configurada para financiamiento de terceros con esa financiera';
  END IF;

  SELECT * INTO sol FROM public.solicitudes_compras WHERE id = p_solicitud_id AND tenant_id = v_dealer;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  SELECT * INTO fac FROM public.facturas WHERE id = p_factura_id AND tenant_id = v_dealer;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;

  v_inicial := round(COALESCE(sol.inicial, 0), 2);
  v_adic    := round(COALESCE(sol.adicional, 0), 2);
  -- Capital = financiamiento de la solicitud (contado + extras - inicial -
  -- adicional). El ADICIONAL no se financia: se cobra aparte (cargo AD-).
  v_capital := round(COALESCE(NULLIF(sol.financiamiento, 0), COALESCE(fac.total, 0) - v_inicial), 2);
  IF v_capital <= 0 THEN
    RETURN json_build_object('ok', false, 'motivo', 'capital <= 0; no se crea financiamiento');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.prestamos
    WHERE tenant_id = v_fin AND notas LIKE '%[FT:' || p_factura_id::text || ']%'
  ) THEN
    RETURN json_build_object('ok', true, 'motivo', 'ya procesado', 'factura_id', p_factura_id);
  END IF;

  SELECT nombre INTO v_dealer_nombre FROM public.config_empresa WHERE tenant_id = v_dealer;
  SELECT nombre INTO v_fin_nombre    FROM public.config_empresa WHERE tenant_id = v_fin;
  v_dealer_nombre := COALESCE(v_dealer_nombre, 'DEALER');
  v_fin_nombre    := COALESCE(v_fin_nombre, 'FINANCIERA');

  buyer_codigo := NULLIF(btrim(COALESCE(sol.cliente_rnc, '')), '');
  buyer_nombre := COALESCE(NULLIF(btrim(COALESCE(sol.cliente_nombre, '')), ''), 'CLIENTE');

  SELECT COALESCE(mora_pct, 0) INTO v_mora
  FROM public.clientes
  WHERE tenant_id = v_dealer
    AND (id = sol.cliente_id OR codigo = buyer_codigo OR rnc = buyer_codigo)
  ORDER BY (id = sol.cliente_id) DESC
  LIMIT 1;
  v_mora := COALESCE(v_mora, 0);
  v_metodo := CASE WHEN sol.tipo_financiamiento = 'frances' THEN 'frances' ELSE 'simple' END;
  v_fecha1 := COALESCE(sol.fecha_vencimiento, (current_date + interval '1 month')::date);
  v_adj    := round(COALESCE(sol.cuota_ajustada, 0), 2);
  v_plazo  := GREATEST(COALESCE(sol.tiempo_meses, 1), 1);
  v_origen := 'Origen: factura #' || fac.numero || ' (' || v_dealer_nombre || ') | Comprador: ' || buyer_nombre
              || ' [FT:' || p_factura_id::text || ']';

  -- ================= FINANCIERA =================
  SELECT id INTO v_cli_fin FROM public.clientes
   WHERE tenant_id = v_fin
     AND (codigo = buyer_codigo OR rnc = buyer_codigo)
   LIMIT 1;
  IF v_cli_fin IS NULL THEN
    BEGIN
      INSERT INTO public.clientes (tenant_id, codigo, nombre, rnc, autorizar_credito, limite_credito, mora_pct, activo)
      VALUES (v_fin, buyer_codigo, buyer_nombre, buyer_codigo, true, COALESCE(sol.total_pagares,0), v_mora, true)
      RETURNING id INTO v_cli_fin;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_cli_fin FROM public.clientes
       WHERE tenant_id = v_fin
         AND (codigo = buyer_codigo OR rnc = buyer_codigo)
       LIMIT 1;
    END;
  END IF;
  IF v_cli_fin IS NULL THEN
    RAISE EXCEPTION 'No se pudo crear/encontrar el cliente comprador en la financiera (codigo=%, nombre=%)', buyer_codigo, buyer_nombre;
  END IF;

  -- Prestamo + cuotas (secuencia a prueba de números legacy)
  SELECT COALESCE(MAX(t.n), 0) + 1 INTO v_seq
  FROM (
    SELECT substring(numero from 4)::bigint AS n
    FROM public.prestamos
    WHERE tenant_id = v_fin AND numero ~ '^PT-\d+$'
  ) t
  WHERE t.n < 9000000;
  v_numero := 'PT-' || lpad(v_seq::text, 7, '0');

  INSERT INTO public.prestamos (
    tenant_id, numero, cliente_id, tipo, metodo_interes, monto_capital,
    tasa_interes, plazo_cuotas, frecuencia, mora_pct, fecha_primera_cuota, garantia, notas
  ) VALUES (
    v_fin, v_numero, v_cli_fin, 'financiamiento', v_metodo, v_capital,
    COALESCE(sol.tasa_interes,0), v_plazo,
    COALESCE(sol.frecuencia,'mensual'), v_mora, v_fecha1,
    NULLIF(btrim(COALESCE(sol.chasis,'')),''), v_origen
  ) RETURNING id INTO v_prestamo_id;

  v_cuotas := public.calc_amortizacion(
    v_capital, COALESCE(sol.tasa_interes,0), v_plazo,
    v_metodo, COALESCE(sol.frecuencia,'mensual'), v_fecha1
  );
  FOR c IN SELECT * FROM jsonb_array_elements(v_cuotas::jsonb) LOOP
    v_cap := (c->>'capital')::numeric;
    IF v_adj > 0 THEN
      v_cuota_m := v_adj;
      v_int     := round(v_adj - v_cap, 2);
    ELSE
      v_cuota_m := (c->>'monto_cuota')::numeric;
      v_int     := (c->>'interes')::numeric;
    END IF;
    INSERT INTO public.prestamo_cuotas (
      tenant_id, prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_cuota
    ) VALUES (
      v_fin, v_prestamo_id, (c->>'numero_cuota')::int, (c->>'fecha_vencimiento')::date,
      v_cap, v_int, v_cuota_m
    );
  END LOOP;

  -- ADICIONAL (completivo del inicial): partida cobrable AD- en la
  -- financiera, vence en la fecha pactada (15/30 días).
  IF v_adic > 0 THEN
    SELECT COALESCE(MAX((regexp_replace(numero, '\D','','g'))::bigint), 0) + 1
      INTO v_aseq
    FROM public.prestamo_cargos
    WHERE tenant_id = v_fin AND numero ~ '^A[BD]-\d+$';
    v_ad_numero := 'AD-' || lpad(v_aseq::text, 7, '0');

    INSERT INTO public.prestamo_cargos (
      tenant_id, numero, cliente_id, prestamo_id, tipo, concepto, fecha, monto
    ) VALUES (
      v_fin, v_ad_numero, v_cli_fin, v_prestamo_id,
      'ADICIONAL', 'Completivo del inicial - factura #' || fac.numero || ' (' || v_dealer_nombre || ')',
      COALESCE(sol.adicional_fecha, v_fecha1), v_adic
    );
  END IF;

  -- Proveedor dealer + CxP DIVIDIDA POR CUOTAS
  SELECT id INTO v_prov FROM public.proveedores
   WHERE tenant_id = v_fin AND nombre ILIKE v_dealer_nombre LIMIT 1;
  IF v_prov IS NULL THEN
    INSERT INTO public.proveedores (tenant_id, nombre, activo)
    VALUES (v_fin, v_dealer_nombre, true) RETURNING id INTO v_prov;
  END IF;

  -- La secuencia lee el PREFIJO (FIN-000003-07 cuenta como 3), asi el
  -- proximo financiamiento toma el numero siguiente y no se solapa.
  SELECT COALESCE(MAX(substring(numero from '^FIN-(\d+)')::bigint), 0) + 1
    INTO v_cseq
  FROM public.compras
  WHERE tenant_id = v_fin AND numero ~ '^FIN-\d+';
  v_compra_num := 'FIN-' || lpad(v_cseq::text, 6, '0');

  -- Una CxP por cuota: el CAPITAL de esa cuota, venciendo el dia que el
  -- cliente la paga. dias_credito lleva el vencimiento (el modulo de CxP y
  -- el movil calculan vence = fecha + dias_credito).
  FOR cq IN
    SELECT numero_cuota, fecha_vencimiento, capital
    FROM public.prestamo_cuotas
    WHERE prestamo_id = v_prestamo_id
    ORDER BY numero_cuota
  LOOP
    INSERT INTO public.compras (
      tenant_id, numero, fecha, suplidor_id, referencia,
      total_exento, total_gravado, itbis_total, total_compra,
      forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, itbis_incluido, actualizar_precios
    ) VALUES (
      v_fin, v_compra_num || '-' || lpad(cq.numero_cuota::text, 2, '0'), current_date, v_prov,
      'Financiamiento factura #' || fac.numero || ' - comprador ' || buyer_nombre
        || ' | cuota ' || cq.numero_cuota || '/' || v_plazo,
      cq.capital, 0, 0, cq.capital,
      'CREDITO', GREATEST(0, cq.fecha_vencimiento - current_date), 0, cq.capital,
      'PENDIENTE', false, false
    );
    v_lineas := v_lineas + 1;
  END LOOP;

  -- El ADICIONAL tambien se le debe al dealer, con su propia fecha.
  IF v_adic > 0 THEN
    INSERT INTO public.compras (
      tenant_id, numero, fecha, suplidor_id, referencia,
      total_exento, total_gravado, itbis_total, total_compra,
      forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, itbis_incluido, actualizar_precios
    ) VALUES (
      v_fin, v_compra_num || '-AD', current_date, v_prov,
      'Financiamiento factura #' || fac.numero || ' - comprador ' || buyer_nombre || ' | adicional',
      v_adic, 0, 0, v_adic,
      'CREDITO',
      GREATEST(0, COALESCE(sol.adicional_fecha, v_fecha1) - current_date), 0, v_adic,
      'PENDIENTE', false, false
    );
    v_lineas := v_lineas + 1;
  END IF;

  -- ================= DEALER =================
  SELECT id INTO v_cli_dealerfin FROM public.clientes
   WHERE tenant_id = v_dealer AND nombre ILIKE v_fin_nombre LIMIT 1;
  IF v_cli_dealerfin IS NULL THEN
    BEGIN
      INSERT INTO public.clientes (tenant_id, codigo, nombre, autorizar_credito, limite_credito, activo)
      VALUES (v_dealer, 'FIN-' || left(replace(v_fin::text,'-',''), 10), v_fin_nombre, true, 0, true)
      RETURNING id INTO v_cli_dealerfin;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_cli_dealerfin FROM public.clientes
       WHERE tenant_id = v_dealer
         AND (nombre ILIKE v_fin_nombre OR codigo = 'FIN-' || left(replace(v_fin::text,'-',''), 10))
       LIMIT 1;
    END;
  END IF;
  IF v_cli_dealerfin IS NULL THEN
    RAISE EXCEPTION 'No se pudo crear/encontrar el cliente financiera en el dealer (%, %)', v_fin_nombre, v_dealer;
  END IF;

  UPDATE public.facturas
     SET cliente_id = v_cli_dealerfin,
         manual_cliente_nombre = buyer_nombre
   WHERE id = p_factura_id AND tenant_id = v_dealer;

  UPDATE public.facturas_detalle
     SET descripcion = COALESCE(descripcion,'') || ' | COMPRADOR: ' || buyer_nombre
                       || CASE WHEN buyer_codigo IS NOT NULL THEN ' (' || buyer_codigo || ')' ELSE '' END
   WHERE factura_id = p_factura_id;

  RETURN json_build_object(
    'ok', true,
    'prestamo_numero', v_numero,
    'capital', v_capital,
    'cuota_ajustada', v_adj,
    'adicional', v_adic,
    'adicional_numero', v_ad_numero,
    'cxp_numero', v_compra_num,
    'cxp_lineas', v_lineas,
    'cliente_financiera', v_cli_fin,
    'cxc_a', v_fin_nombre,
    'comprador', buyer_nombre
  );
END;
$$;

-- =====================================================================
-- ARREGLO DE LOS FINANCIAMIENTOS YA CREADOS
-- ---------------------------------------------------------------------
-- Divide toda CxP 'FIN-nnnnnn' (sin sufijo) que no tenga ningun pago
-- aplicado. El prestamo se ubica por el numero de factura que ambos
-- guardan en su texto. El sobrante entre el total de la CxP y la suma de
-- capitales es el ADICIONAL: se emite como linea -AD con la fecha del
-- cargo AD- del prestamo.
-- Re-ejecutable: al dividirse, el original desaparece y ya no reaparece.
-- =====================================================================
DO $fix$
DECLARE
  r          record;
  cq         record;
  v_prest    uuid;
  v_plazo    int;
  v_sumacap  numeric;
  v_resto    numeric;
  v_adfecha  date;
  v_partidas int := 0;
  v_docs     int := 0;
BEGIN
  FOR r IN
    SELECT c.id, c.tenant_id, c.numero, c.fecha, c.suplidor_id, c.referencia, c.total_compra,
           substring(c.referencia from 'factura #(\d+)') AS fac_num
    FROM public.compras c
    WHERE c.numero ~ '^FIN-\d+$'
      AND COALESCE(c.monto_pagado, 0) = 0
      AND COALESCE(c.estado, 'PENDIENTE') = 'PENDIENTE'
  LOOP
    IF r.fac_num IS NULL THEN
      RAISE NOTICE 'Sin numero de factura en la referencia, se deja igual: %', r.numero;
      CONTINUE;
    END IF;

    SELECT p.id, p.plazo_cuotas INTO v_prest, v_plazo
    FROM public.prestamos p
    WHERE p.tenant_id = r.tenant_id
      AND substring(p.notas from 'factura #(\d+)') = r.fac_num
    ORDER BY p.created_at DESC
    LIMIT 1;

    IF v_prest IS NULL THEN
      RAISE NOTICE 'Sin prestamo para la factura #% (CxP %), se deja igual', r.fac_num, r.numero;
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(capital), 0), COUNT(*)
      INTO v_sumacap, v_plazo
    FROM public.prestamo_cuotas WHERE prestamo_id = v_prest;
    IF v_plazo = 0 THEN
      RAISE NOTICE 'Prestamo sin cuotas para la factura #%, se deja igual', r.fac_num;
      CONTINUE;
    END IF;

    FOR cq IN
      SELECT numero_cuota, fecha_vencimiento, capital
      FROM public.prestamo_cuotas WHERE prestamo_id = v_prest ORDER BY numero_cuota
    LOOP
      INSERT INTO public.compras (
        tenant_id, numero, fecha, suplidor_id, referencia,
        total_exento, total_gravado, itbis_total, total_compra,
        forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, itbis_incluido, actualizar_precios
      ) VALUES (
        r.tenant_id, r.numero || '-' || lpad(cq.numero_cuota::text, 2, '0'), r.fecha, r.suplidor_id,
        r.referencia || ' | cuota ' || cq.numero_cuota || '/' || v_plazo,
        cq.capital, 0, 0, cq.capital,
        'CREDITO', GREATEST(0, cq.fecha_vencimiento - r.fecha), 0, cq.capital,
        'PENDIENTE', false, false
      );
      v_partidas := v_partidas + 1;
    END LOOP;

    -- Sobrante = ADICIONAL (se cobra pero no se financia)
    v_resto := round(COALESCE(r.total_compra, 0) - v_sumacap, 2);
    IF v_resto > 0 THEN
      SELECT MIN(fecha) INTO v_adfecha
      FROM public.prestamo_cargos
      WHERE prestamo_id = v_prest AND numero ~ '^AD-';
      IF v_adfecha IS NULL THEN
        SELECT MIN(fecha_vencimiento) INTO v_adfecha
        FROM public.prestamo_cuotas WHERE prestamo_id = v_prest;
      END IF;

      INSERT INTO public.compras (
        tenant_id, numero, fecha, suplidor_id, referencia,
        total_exento, total_gravado, itbis_total, total_compra,
        forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, itbis_incluido, actualizar_precios
      ) VALUES (
        r.tenant_id, r.numero || '-AD', r.fecha, r.suplidor_id,
        r.referencia || ' | adicional',
        v_resto, 0, 0, v_resto,
        'CREDITO', GREATEST(0, v_adfecha - r.fecha), 0, v_resto,
        'PENDIENTE', false, false
      );
      v_partidas := v_partidas + 1;
    END IF;

    DELETE FROM public.compras WHERE id = r.id;
    v_docs := v_docs + 1;
    RAISE NOTICE 'CxP % (factura #%, RD$ %) dividida en % partidas',
      r.numero, r.fac_num, r.total_compra, v_plazo + CASE WHEN v_resto > 0 THEN 1 ELSE 0 END;
  END LOOP;

  RAISE NOTICE 'Listo: % financiamientos divididos en % cuentas por pagar', v_docs, v_partidas;
END $fix$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('cxp_financiamiento_por_cuotas.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Verificacion: como quedo la CxP del dealer en la financiera
SELECT c.numero, c.fecha + c.dias_credito AS vence, c.total_compra, c.monto_pendiente, c.estado,
       left(c.referencia, 60) AS referencia
FROM public.compras c
WHERE c.numero ~ '^FIN-'
ORDER BY c.numero;
