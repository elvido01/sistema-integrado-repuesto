-- =====================================================================
-- RPC: procesar_financiamiento_terceros
-- ---------------------------------------------------------------------
-- Al grabar una factura a credito en el dealer (ej. Caminero Motors) cuyo
-- pedido vino de una solicitud financiada y la empresa tiene
-- financiamiento_tipo='terceros', orquesta TODO en una transaccion:
--
--   En la FINANCIERA (ej. MotoPrestamos Los Naranjos):
--     1. Cliente comprador (crea/encuentra por cedula/RNC).
--     2. Prestamo (capital = total factura - inicial) con tasa/cuotas/
--        frecuencia/metodo de la solicitud + tabla de cuotas.
--     3. Cuenta por Pagar a Caminero: compra PENDIENTE al proveedor
--        "Caminero Motors" por el capital (unico pago).
--
--   En el DEALER (Caminero):
--     La CUENTA POR COBRAR se reasigna a la FINANCIERA (MotoPrestamos), que es
--     quien le paga al dealer. El COMPRADOR real (Angel) NO aparece en la CxC;
--     se preserva en manual_cliente_nombre + descripcion de la linea para el
--     historico/datos de la venta.
--
-- Seguridad: SECURITY DEFINER (escribe en el tenant de la financiera).
-- Autorizacion estricta: el que llama debe ser un tenant con
-- financiamiento_tipo='terceros' y financiera_tenant_id = p_financiera.
-- Re-ejecutable (idempotencia basica por factura: no recrea si ya hay
-- un prestamo originado por esa factura).
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
  v_cuotas        json;
  c               jsonb;
  v_compra_num    text;
  v_cseq          int;
  v_fecha1        date;
  v_mora          numeric := 0;
BEGIN
  IF v_dealer IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF v_fin IS NULL THEN RAISE EXCEPTION 'financiera_tenant_id es requerido'; END IF;

  -- Autorizacion: el dealer debe estar configurado como terceros con esta financiera
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
  v_capital := round(COALESCE(fac.total, 0) - v_inicial, 2);
  IF v_capital <= 0 THEN
    RETURN json_build_object('ok', false, 'motivo', 'capital <= 0; no se crea financiamiento');
  END IF;

  -- Idempotencia: si ya existe un prestamo originado por esta factura, no repetir
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

  -- Mora % del cliente comprador (capturada en el catalogo del dealer)
  SELECT COALESCE(mora_pct, 0) INTO v_mora
  FROM public.clientes
  WHERE tenant_id = v_dealer
    AND (id = sol.cliente_id OR codigo = buyer_codigo OR rnc = buyer_codigo)
  ORDER BY (id = sol.cliente_id) DESC
  LIMIT 1;
  v_mora := COALESCE(v_mora, 0);
  v_metodo := CASE WHEN sol.tipo_financiamiento = 'frances' THEN 'frances' ELSE 'simple' END;
  v_fecha1 := COALESCE(sol.fecha_vencimiento, (current_date + interval '1 month')::date);
  v_origen := 'Origen: factura #' || fac.numero || ' (' || v_dealer_nombre || ') | Comprador: ' || buyer_nombre
              || ' [FT:' || p_factura_id::text || ']';

  -- ================= FINANCIERA =================
  -- 1) Cliente comprador (robusto a duplicados: si choca por unique, re-selecciona)
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

  -- 2) Prestamo + cuotas
  SELECT COALESCE(MAX((regexp_replace(numero, '\D','','g'))::int), 0) + 1
    INTO v_seq FROM public.prestamos WHERE tenant_id = v_fin;
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
    INSERT INTO public.prestamo_cuotas (
      tenant_id, prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_cuota
    ) VALUES (
      v_fin, v_prestamo_id, (c->>'numero_cuota')::int, (c->>'fecha_vencimiento')::date,
      (c->>'capital')::numeric, (c->>'interes')::numeric, (c->>'monto_cuota')::numeric
    );
  END LOOP;

  -- 3) Proveedor "Caminero" + Cuenta por Pagar (compra pendiente, unico pago)
  SELECT id INTO v_prov FROM public.proveedores
   WHERE tenant_id = v_fin AND nombre ILIKE v_dealer_nombre LIMIT 1;
  IF v_prov IS NULL THEN
    INSERT INTO public.proveedores (tenant_id, nombre, activo)
    VALUES (v_fin, v_dealer_nombre, true) RETURNING id INTO v_prov;
  END IF;

  SELECT COALESCE(MAX((regexp_replace(numero, '\D','','g'))::int), 0) + 1
    INTO v_cseq FROM public.compras WHERE tenant_id = v_fin;
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

  -- ================= DEALER (Caminero) =================
  -- La CUENTA POR COBRAR queda a nombre de la FINANCIERA (MotoPrestamos), que es
  -- quien le paga al dealer. El COMPRADOR real (Angel) se preserva en la venta:
  -- manual_cliente_nombre + en la descripcion de la linea (chasis ya esta).
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

  -- Reasignar la CxC a la financiera; el comprador real queda en manual_cliente_nombre
  UPDATE public.facturas
     SET cliente_id = v_cli_dealerfin,
         manual_cliente_nombre = buyer_nombre
   WHERE id = p_factura_id AND tenant_id = v_dealer;

  -- Comprador + cedula en la descripcion de la linea (para el recibo/historico)
  UPDATE public.facturas_detalle
     SET descripcion = COALESCE(descripcion,'') || ' | COMPRADOR: ' || buyer_nombre
                       || CASE WHEN buyer_codigo IS NOT NULL THEN ' (' || buyer_codigo || ')' ELSE '' END
   WHERE factura_id = p_factura_id;

  RETURN json_build_object(
    'ok', true,
    'prestamo_numero', v_numero,
    'capital', v_capital,
    'cxp_numero', v_compra_num,
    'cliente_financiera', v_cli_fin,
    'cxc_a', v_fin_nombre,
    'comprador', buyer_nombre
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.procesar_financiamiento_terceros(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.procesar_financiamiento_terceros(uuid,uuid,uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'procesar_financiamiento_terceros listo' AS status;
