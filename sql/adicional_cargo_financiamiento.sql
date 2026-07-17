-- =====================================================================
-- ADICIONAL como cargo cobrable (AD-) en el financiamiento
-- ---------------------------------------------------------------------
-- Caso FERNANDO DE LEON (solicitud #18, factura #13, 16/07/2026): el
-- sistema viejo muestra la línea AD-0000393 "ADICIONAL" RD$3,000 (vence
-- 31/07) en el Recibo de Pago — balance 198,210. MotoFlow creó el
-- préstamo PT-0026579 perfecto (capital 134,600 SIN financiar el
-- adicional ✓) pero NO creó la partida cobrable del adicional → balance
-- 195,210. El adicional se resta del financiamiento pero SÍ se cobra,
-- como partida aparte junto al primer pago.
--
-- Mecanismo: prestamo_cargos (Otras Transacciones) — el Recibo de Pago ya
-- muestra y cobra los cargos pendientes (get_prestamos_cliente canónico).
-- Se usa prefijo AD- (como el sistema viejo) compartiendo la secuencia
-- numérica con los AB-.
--
-- Este script (re-ejecutable):
--   1. procesar_financiamiento_terceros: + cargo AD- si sol.adicional > 0
--      (vence en sol.adicional_fecha; fallback: 1ra cuota).
--   2. procesar_financiamiento_propio: ídem + secuencia PT a prueba de
--      legacy + capital desde sol.financiamiento (consistente con terceros).
--   3. Data fix: crea el AD- faltante de FERNANDO (PT-0026579, RD$3,000,
--      vence 31/07/2026 como en el sistema viejo) y corrige la fecha del
--      adicional en la solicitud #18 (decía 08/07, ya pasada).
-- =====================================================================

-- ------------------------------------------------------------
-- 1) TERCEROS (versión canónica de fix_financiamiento_ft12_caminero.sql
--    + bloque del cargo ADICIONAL)
-- ------------------------------------------------------------
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
  v_compra_num    text;
  v_cseq          int;
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
    COALESCE(sol.tasa_interes,0), GREATEST(COALESCE(sol.tiempo_meses,1),1),
    COALESCE(sol.frecuencia,'mensual'), v_mora, v_fecha1,
    NULLIF(btrim(COALESCE(sol.chasis,'')),''), v_origen
  ) RETURNING id INTO v_prestamo_id;

  v_cuotas := public.calc_amortizacion(
    v_capital, COALESCE(sol.tasa_interes,0), GREATEST(COALESCE(sol.tiempo_meses,1),1),
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
  -- financiera, vence en la fecha pactada (15/30 días). Aparece en el
  -- Recibo de Pago como en el sistema viejo (AD-xxxxxxx "ADICIONAL").
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

  -- Proveedor dealer + CxP (compra pendiente, único pago)
  SELECT id INTO v_prov FROM public.proveedores
   WHERE tenant_id = v_fin AND nombre ILIKE v_dealer_nombre LIMIT 1;
  IF v_prov IS NULL THEN
    INSERT INTO public.proveedores (tenant_id, nombre, activo)
    VALUES (v_fin, v_dealer_nombre, true) RETURNING id INTO v_prov;
  END IF;

  SELECT COALESCE(MAX(substring(numero from 5)::bigint), 0) + 1
    INTO v_cseq
  FROM public.compras
  WHERE tenant_id = v_fin AND numero ~ '^FIN-\d+$';
  v_compra_num := 'FIN-' || lpad(v_cseq::text, 6, '0');

  INSERT INTO public.compras (
    tenant_id, numero, fecha, suplidor_id, referencia,
    total_exento, total_gravado, itbis_total, total_compra,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, itbis_incluido, actualizar_precios
  ) VALUES (
    v_fin, v_compra_num, current_date, v_prov,
    'Financiamiento factura #' || fac.numero || ' - comprador ' || buyer_nombre,
    v_capital, 0, 0, v_capital,
    'CREDITO', 0, 0, v_capital, 'PENDIENTE', false, false
  );

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
    'cliente_financiera', v_cli_fin,
    'cxc_a', v_fin_nombre,
    'comprador', buyer_nombre
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.procesar_financiamiento_terceros(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.procesar_financiamiento_terceros(uuid,uuid,uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 2) PROPIO (misma empresa vende y financia) — + cargo ADICIONAL,
--    secuencia PT a prueba de legacy y capital desde sol.financiamiento
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.procesar_financiamiento_propio(
  p_factura_id   uuid,
  p_solicitud_id uuid
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant      uuid := public.get_user_tenant();
  v_cfg_tipo    text;
  v_cfg_fin     boolean;
  sol           record;
  fac           record;
  v_inicial     numeric;
  v_capital     numeric;
  v_metodo      text;
  v_origen      text;
  buyer_codigo  text;
  buyer_nombre  text;
  v_cli         uuid;
  v_prestamo_id uuid;
  v_numero      text;
  v_seq         int;
  v_aseq        bigint;
  v_ad_numero   text;
  v_cuotas      json;
  c             jsonb;
  v_fecha1      date;
  v_mora        numeric := 0;
  v_adj         numeric := 0;
  v_adic        numeric := 0;
  v_cap         numeric;
  v_int         numeric;
  v_cuota_m     numeric;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;

  SELECT financiamiento_tipo, COALESCE(feat_financiera, false)
    INTO v_cfg_tipo, v_cfg_fin
  FROM public.config_empresa WHERE tenant_id = v_tenant;
  IF COALESCE(v_cfg_tipo, 'propio') <> 'propio' OR NOT v_cfg_fin THEN
    RAISE EXCEPTION 'La empresa no esta configurada para financiamiento propio (financiamiento_tipo=propio + feat_financiera)';
  END IF;

  SELECT * INTO sol FROM public.solicitudes_compras WHERE id = p_solicitud_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  SELECT * INTO fac FROM public.facturas WHERE id = p_factura_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;

  v_inicial := round(COALESCE(sol.inicial, 0), 2);
  v_adic    := round(COALESCE(sol.adicional, 0), 2);
  v_capital := round(COALESCE(NULLIF(sol.financiamiento, 0), COALESCE(fac.total, 0) - v_inicial), 2);
  IF v_capital <= 0 THEN
    RETURN json_build_object('ok', false, 'motivo', 'capital <= 0; no se crea financiamiento');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.prestamos
    WHERE tenant_id = v_tenant AND notas LIKE '%[FT:' || p_factura_id::text || ']%'
  ) THEN
    RETURN json_build_object('ok', true, 'motivo', 'ya procesado', 'factura_id', p_factura_id);
  END IF;

  buyer_codigo := NULLIF(btrim(COALESCE(sol.cliente_rnc, '')), '');
  buyer_nombre := COALESCE(NULLIF(btrim(COALESCE(sol.cliente_nombre, '')), ''), 'CLIENTE');

  SELECT id INTO v_cli FROM public.clientes
   WHERE tenant_id = v_tenant AND id = sol.cliente_id LIMIT 1;
  IF v_cli IS NULL AND buyer_codigo IS NOT NULL THEN
    SELECT id INTO v_cli FROM public.clientes
     WHERE tenant_id = v_tenant AND (codigo = buyer_codigo OR rnc = buyer_codigo)
     LIMIT 1;
  END IF;
  IF v_cli IS NULL THEN
    BEGIN
      INSERT INTO public.clientes (tenant_id, codigo, nombre, rnc, autorizar_credito, limite_credito, mora_pct, activo)
      VALUES (v_tenant, buyer_codigo, buyer_nombre, buyer_codigo, true, COALESCE(sol.total_pagares, 0), 0, true)
      RETURNING id INTO v_cli;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_cli FROM public.clientes
       WHERE tenant_id = v_tenant AND (codigo = buyer_codigo OR rnc = buyer_codigo)
       LIMIT 1;
    END;
  END IF;
  IF v_cli IS NULL THEN
    RAISE EXCEPTION 'No se pudo crear/encontrar el cliente comprador (codigo=%, nombre=%)', buyer_codigo, buyer_nombre;
  END IF;

  SELECT COALESCE(mora_pct, 0) INTO v_mora
  FROM public.clientes WHERE id = v_cli;
  v_mora := COALESCE(v_mora, 0);

  v_metodo := CASE WHEN sol.tipo_financiamiento = 'frances' THEN 'frances' ELSE 'simple' END;
  v_fecha1 := COALESCE(sol.fecha_vencimiento, (current_date + interval '1 month')::date);
  v_adj    := round(COALESCE(sol.cuota_ajustada, 0), 2);
  v_origen := 'Origen: factura #' || fac.numero || ' (financiamiento propio) | Comprador: ' || buyer_nombre
              || ' [FT:' || p_factura_id::text || ']';

  -- Prestamo + cuotas (secuencia a prueba de números legacy)
  SELECT COALESCE(MAX(t.n), 0) + 1 INTO v_seq
  FROM (
    SELECT substring(numero from 4)::bigint AS n
    FROM public.prestamos
    WHERE tenant_id = v_tenant AND numero ~ '^PT-\d+$'
  ) t
  WHERE t.n < 9000000;
  v_numero := 'PT-' || lpad(v_seq::text, 7, '0');

  INSERT INTO public.prestamos (
    tenant_id, numero, cliente_id, tipo, metodo_interes, monto_capital,
    tasa_interes, plazo_cuotas, frecuencia, mora_pct, fecha_primera_cuota, garantia, notas
  ) VALUES (
    v_tenant, v_numero, v_cli, 'financiamiento', v_metodo, v_capital,
    COALESCE(sol.tasa_interes, 0), GREATEST(COALESCE(sol.tiempo_meses, 1), 1),
    COALESCE(sol.frecuencia, 'mensual'), v_mora, v_fecha1,
    NULLIF(btrim(COALESCE(sol.chasis, '')), ''), v_origen
  ) RETURNING id INTO v_prestamo_id;

  v_cuotas := public.calc_amortizacion(
    v_capital, COALESCE(sol.tasa_interes, 0), GREATEST(COALESCE(sol.tiempo_meses, 1), 1),
    v_metodo, COALESCE(sol.frecuencia, 'mensual'), v_fecha1
  );
  FOR c IN SELECT * FROM jsonb_array_elements(v_cuotas::jsonb) LOOP
    v_cap := (c->>'capital')::numeric;
    IF v_adj > 0 THEN
      -- Cuota ajustada: la cuota es la redondeada, el interés absorbe el ajuste
      v_cuota_m := v_adj;
      v_int     := round(v_adj - v_cap, 2);
    ELSE
      v_cuota_m := (c->>'monto_cuota')::numeric;
      v_int     := (c->>'interes')::numeric;
    END IF;
    INSERT INTO public.prestamo_cuotas (
      tenant_id, prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_cuota
    ) VALUES (
      v_tenant, v_prestamo_id, (c->>'numero_cuota')::int, (c->>'fecha_vencimiento')::date,
      v_cap, v_int, v_cuota_m
    );
  END LOOP;

  -- ADICIONAL (completivo del inicial): partida cobrable AD-
  IF v_adic > 0 THEN
    SELECT COALESCE(MAX((regexp_replace(numero, '\D','','g'))::bigint), 0) + 1
      INTO v_aseq
    FROM public.prestamo_cargos
    WHERE tenant_id = v_tenant AND numero ~ '^A[BD]-\d+$';
    v_ad_numero := 'AD-' || lpad(v_aseq::text, 7, '0');

    INSERT INTO public.prestamo_cargos (
      tenant_id, numero, cliente_id, prestamo_id, tipo, concepto, fecha, monto
    ) VALUES (
      v_tenant, v_ad_numero, v_cli, v_prestamo_id,
      'ADICIONAL', 'Completivo del inicial - factura #' || fac.numero,
      COALESCE(sol.adicional_fecha, v_fecha1), v_adic
    );
  END IF;

  UPDATE public.facturas
     SET monto_pendiente = 0,
         estado = 'PAGADA'
   WHERE id = p_factura_id AND tenant_id = v_tenant;

  UPDATE public.facturas_detalle
     SET descripcion = COALESCE(descripcion, '') || ' | FINANCIADO: ' || v_numero
   WHERE factura_id = p_factura_id;

  RETURN json_build_object(
    'ok', true,
    'prestamo_numero', v_numero,
    'capital', v_capital,
    'cuota_ajustada', v_adj,
    'adicional', v_adic,
    'adicional_numero', v_ad_numero,
    'cliente_id', v_cli,
    'comprador', buyer_nombre
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.procesar_financiamiento_propio(uuid,uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.procesar_financiamiento_propio(uuid,uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3) DATA FIX: el ADICIONAL faltante de FERNANDO (PT-0026579)
--    RD$3,000, vence 31/07/2026 (igual que AD-0000393 del sistema viejo)
-- ------------------------------------------------------------
DO $$
DECLARE
  v_fin  uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';  -- MotoPréstamos Los Naranjos
  v_cam  uuid := 'b39506c3-27dc-467d-830b-096731b83113';  -- Caminero Motors
  v_p    record;
  v_aseq bigint;
BEGIN
  SELECT id, cliente_id INTO v_p
  FROM public.prestamos
  WHERE tenant_id = v_fin AND numero = 'PT-0026579';

  IF v_p.id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.prestamo_cargos
    WHERE tenant_id = v_fin AND prestamo_id = v_p.id
      AND tipo = 'ADICIONAL' AND anulado = false
  ) THEN
    SELECT COALESCE(MAX((regexp_replace(numero, '\D','','g'))::bigint), 0) + 1
      INTO v_aseq
    FROM public.prestamo_cargos
    WHERE tenant_id = v_fin AND numero ~ '^A[BD]-\d+$';

    INSERT INTO public.prestamo_cargos (
      tenant_id, numero, cliente_id, prestamo_id, tipo, concepto, fecha, monto
    ) VALUES (
      v_fin, 'AD-' || lpad(v_aseq::text, 7, '0'), v_p.cliente_id, v_p.id,
      'ADICIONAL', 'Completivo del inicial - factura #13 (CAMINERO MOTORS)',
      DATE '2026-07-31', 3000
    );
  END IF;

  -- La fecha del adicional en la solicitud #18 quedó 08/07 (ya pasada);
  -- el plazo real pactado es 31/07 (como en el sistema viejo).
  UPDATE public.solicitudes_compras
     SET adicional_fecha = DATE '2026-07-31'
   WHERE tenant_id = v_cam AND numero = 18
     AND adicional_fecha = DATE '2026-07-08';
END $$;

-- ------------------------------------------------------------
-- 4) VERIFICACIÓN
-- ------------------------------------------------------------
SELECT pc.numero, pc.tipo, pc.concepto, pc.fecha AS vence, pc.monto,
       p.numero AS prestamo, c.nombre AS cliente
FROM public.prestamo_cargos pc
JOIN public.prestamos p ON p.id = pc.prestamo_id
JOIN public.clientes c ON c.id = pc.cliente_id
WHERE pc.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND pc.tipo = 'ADICIONAL';

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('adicional_cargo_financiamiento.sql');
  END IF;
END $$;

SELECT 'ADICIONAL como cargo AD- en financiamiento terceros/propio + data fix Fernando' AS status;
