-- =====================================================================
-- RPC: procesar_financiamiento_propio
-- ---------------------------------------------------------------------
-- Para empresas que VENDEN y FINANCIAN ellas mismas (ej. MOTO PRESTAMOS
-- ODALYS, INVERSIONES LOS NARANJOS): al grabar una factura a credito
-- cuyo pedido vino de una solicitud financiada y la empresa tiene
-- financiamiento_tipo='propio' + feat_financiera=true, se crea TODO en
-- el MISMO tenant:
--
--   1. Prestamo (capital = total factura - inicial) con tasa/cuotas/
--      frecuencia/metodo de la solicitud + tabla de cuotas
--      (public.calc_amortizacion).
--   2. La FACTURA queda saldada (monto_pendiente=0, estado='PAGADA'):
--      la deuda del cliente vive en el PRESTAMO (cuotas + intereses +
--      mora), no en la CxC de la factura — asi no se duplica la deuda
--      en cobranza. La inicial ya entro como recibo de ingreso normal.
--
-- Es el gemelo de procesar_financiamiento_terceros pero sin CxP al
-- dealer ni reasignacion de CxC (misma empresa). Idempotente por
-- factura: marca [FT:<factura_id>] en las notas del prestamo.
--
-- Seguridad: SECURITY DEFINER pero todo ocurre dentro del tenant del
-- que llama (get_user_tenant); autorizacion estricta por config.
-- =====================================================================

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
  v_cuotas      json;
  c             jsonb;
  v_fecha1      date;
  v_mora        numeric := 0;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;

  -- Autorizacion: empresa configurada como financiamiento propio + modulo financiera
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
  v_capital := round(COALESCE(fac.total, 0) - v_inicial, 2);
  IF v_capital <= 0 THEN
    RETURN json_build_object('ok', false, 'motivo', 'capital <= 0; no se crea financiamiento');
  END IF;

  -- Idempotencia: si ya existe un prestamo originado por esta factura, no repetir
  IF EXISTS (
    SELECT 1 FROM public.prestamos
    WHERE tenant_id = v_tenant AND notas LIKE '%[FT:' || p_factura_id::text || ']%'
  ) THEN
    RETURN json_build_object('ok', true, 'motivo', 'ya procesado', 'factura_id', p_factura_id);
  END IF;

  buyer_codigo := NULLIF(btrim(COALESCE(sol.cliente_rnc, '')), '');
  buyer_nombre := COALESCE(NULLIF(btrim(COALESCE(sol.cliente_nombre, '')), ''), 'CLIENTE');

  -- Cliente comprador: la solicitud y la factura son del MISMO tenant, asi que
  -- normalmente ya existe. Prioridad: cliente de la solicitud -> por cedula/RNC
  -- -> crear (mismo fallback robusto a duplicados que el flujo de terceros).
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

  -- Mora % del cliente (respeta lo capturado en su ficha)
  SELECT COALESCE(mora_pct, 0) INTO v_mora
  FROM public.clientes WHERE id = v_cli;
  v_mora := COALESCE(v_mora, 0);

  v_metodo := CASE WHEN sol.tipo_financiamiento = 'frances' THEN 'frances' ELSE 'simple' END;
  v_fecha1 := COALESCE(sol.fecha_vencimiento, (current_date + interval '1 month')::date);
  v_origen := 'Origen: factura #' || fac.numero || ' (financiamiento propio) | Comprador: ' || buyer_nombre
              || ' [FT:' || p_factura_id::text || ']';

  -- Prestamo + cuotas
  SELECT COALESCE(MAX((regexp_replace(numero, '\D','','g'))::int), 0) + 1
    INTO v_seq FROM public.prestamos WHERE tenant_id = v_tenant;
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
    INSERT INTO public.prestamo_cuotas (
      tenant_id, prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_cuota
    ) VALUES (
      v_tenant, v_prestamo_id, (c->>'numero_cuota')::int, (c->>'fecha_vencimiento')::date,
      (c->>'capital')::numeric, (c->>'interes')::numeric, (c->>'monto_cuota')::numeric
    );
  END LOOP;

  -- La deuda pasa al prestamo: la factura queda saldada para que la CxC no
  -- duplique el cobro (la inicial ya entro como recibo de ingreso aparte).
  UPDATE public.facturas
     SET monto_pendiente = 0,
         estado = 'PAGADA'
   WHERE id = p_factura_id AND tenant_id = v_tenant;

  -- Referencia cruzada en la linea de la factura (historico/recibo)
  UPDATE public.facturas_detalle
     SET descripcion = COALESCE(descripcion, '') || ' | FINANCIADO: ' || v_numero
   WHERE factura_id = p_factura_id;

  RETURN json_build_object(
    'ok', true,
    'prestamo_numero', v_numero,
    'capital', v_capital,
    'cliente_id', v_cli,
    'comprador', buyer_nombre
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.procesar_financiamiento_propio(uuid,uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.procesar_financiamiento_propio(uuid,uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'procesar_financiamiento_propio listo' AS status;
