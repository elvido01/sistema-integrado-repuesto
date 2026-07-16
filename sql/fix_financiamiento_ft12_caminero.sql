-- =====================================================================
-- FIX: financiamiento de FT-12 (Caminero Motors) no llegó a MotoPréstamos
-- ---------------------------------------------------------------------
-- El 16/07/2026 Caminero facturó FT-12 (RD$280,000, inicial 100,000,
-- solicitud #17 ERNESTINA SANTANA) pero el préstamo NUNCA se creó en
-- MotoPréstamos Los Naranjos: no hay préstamo con el marcador [FT:...],
-- la CxC sigue a nombre del comprador y no existe la CxP.
--
-- Causa probable: la versión de procesar_financiamiento_terceros en prod
-- quedó vieja (ninguna versión está en schema_migraciones) y falló al
-- ejecutarse; el error solo se mostró en un toast pasajero.
--
-- Este script (re-ejecutable, idempotente):
--   1) Actualiza el RPC a la última versión (con cuota ajustada).
--   2) EJECUTA el financiamiento de FT-12 impersonando al cajero de
--      Caminero (el RPC deriva el tenant del usuario; en el SQL editor
--      no hay JWT, así que seteamos el claim 'sub' manualmente).
--   3) Verifica: préstamo + cuotas + CxP en la financiera y CxC
--      reasignada en Caminero.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) RPC última versión (idéntico a financiamiento_terceros_cuota_ajustada.sql)
-- ------------------------------------------------------------
ALTER TABLE public.solicitudes_compras
  ADD COLUMN IF NOT EXISTS cuota_ajustada numeric;

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
  v_adj           numeric := 0;   -- cuota ajustada (redondeo del operador)
  v_cap           numeric;
  v_int           numeric;
  v_cuota_m       numeric;
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
  v_adj    := round(COALESCE(sol.cuota_ajustada, 0), 2);  -- cuota redondeada (si la pusieron)
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
    v_cap := (c->>'capital')::numeric;
    IF v_adj > 0 THEN
      -- Cuota ajustada: la cuota es la redondeada, el interes absorbe el ajuste
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
  -- La CxC queda a nombre de la FINANCIERA; el comprador real se preserva
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
-- 2) EJECUTAR el financiamiento pendiente de FT-12
--    El RPC saca el tenant del usuario; en el SQL editor no hay JWT,
--    así que impersonamos al cajero de Caminero (perfil b39506c3).
-- ------------------------------------------------------------
SELECT set_config('request.jwt.claims',
  '{"sub":"6d7e711c-935d-442b-8f45-cf308863f414","role":"authenticated"}', false);

SELECT public.procesar_financiamiento_terceros(
  'd16b4b53-bf1c-45c9-976b-17298a4c3ff5',  -- FT-12 Caminero
  '8718d907-3032-41a5-8db8-283900bba2e1',  -- Solicitud #17 (ERNESTINA)
  '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'   -- MotoPréstamos Los Naranjos
) AS resultado_financiamiento;

-- limpiar la impersonación
SELECT set_config('request.jwt.claims', '', false);

-- ------------------------------------------------------------
-- 3) VERIFICACIÓN
-- ------------------------------------------------------------
-- 3a) Préstamo creado en MotoPréstamos
SELECT p.numero, c.nombre AS cliente, p.monto_capital, p.plazo_cuotas,
       p.tasa_interes, p.frecuencia, p.garantia
FROM public.prestamos p
JOIN public.clientes c ON c.id = p.cliente_id
WHERE p.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND p.notas LIKE '%[FT:d16b4b53-bf1c-45c9-976b-17298a4c3ff5]%';

-- 3b) Cuotas generadas
SELECT count(*) AS cuotas, min(fecha_vencimiento) AS primera, max(fecha_vencimiento) AS ultima,
       sum(capital) AS capital_total, sum(monto_cuota) AS total_a_pagar
FROM public.prestamo_cuotas pc
WHERE pc.prestamo_id IN (
  SELECT id FROM public.prestamos
  WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
    AND notas LIKE '%[FT:d16b4b53-bf1c-45c9-976b-17298a4c3ff5]%'
);

-- 3c) CxP de MotoPréstamos hacia Caminero
SELECT numero, referencia, total_compra, monto_pendiente, estado
FROM public.compras
WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND referencia ILIKE '%factura #12%';

-- 3d) CxC de Caminero reasignada a la financiera (comprador preservado)
SELECT f.numero, c.nombre AS cxc_a_nombre_de, f.manual_cliente_nombre AS comprador_real,
       f.monto_pendiente
FROM public.facturas f
JOIN public.clientes c ON c.id = f.cliente_id
WHERE f.id = 'd16b4b53-bf1c-45c9-976b-17298a4c3ff5';

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('financiamiento_terceros_cuota_ajustada.sql');
    PERFORM public.registrar_migracion('fix_financiamiento_ft12_caminero.sql');
  END IF;
END $$;

SELECT 'Financiamiento FT-12 procesado — revisa las 4 verificaciones de arriba' AS status;
