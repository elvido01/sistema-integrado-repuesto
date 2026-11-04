-- =====================================================================
-- Comision pagada por TRANSFERENCIA sale del banco, no de la caja (04/11/2026)
-- ---------------------------------------------------------------------
-- La pantalla decia "Transferencia (descuenta de la caja actual)" y el
-- tablero la restaba de la Caja Actual. Una transferencia no sale de la
-- gaveta: sale de una cuenta bancaria.
--
-- Ahora:
--   * pagar_comision pide la cuenta (p_cuenta_bancaria_id) cuando es
--     TRANSFERENCIA, la guarda en el pago y registra la SALIDA en
--     movimientos_bancarios (origen 'comision', idempotente por el pago);
--   * get_caja_excedente_dashboard ya no la resta (copiada de PRODUCCION
--     04/11, solo se quito esa resta);
--   * EFECTIVO no cambia: sigue siendo gasto diario y sale de la caja.
--
-- Unico pago por transferencia hasta hoy: Morla PC de julio (antes de su
-- caja_historial_desde 20/08), asi que ninguna caja cambia de numero.
--
-- La funcion cambia de argumentos: se borra la vieja primero para no dejar
-- dos versiones (la llamada reventaria con "is not unique").
-- =====================================================================
BEGIN;

ALTER TABLE public.pagos_comisiones
  ADD COLUMN IF NOT EXISTS cuenta_bancaria_id uuid REFERENCES public.cuentas_bancarias(id);

-- El banco tiene que aceptar el origen nuevo
ALTER TABLE public.movimientos_bancarios
  DROP CONSTRAINT IF EXISTS movimientos_bancarios_origen_tipo_check;
DO $c$
DECLARE r record;
BEGIN
  -- el CHECK de origen_tipo puede tener otro nombre: se busca por contenido
  FOR r IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.movimientos_bancarios'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) LIKE '%origen_tipo%'
  LOOP
    EXECUTE format('ALTER TABLE public.movimientos_bancarios DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $c$;
ALTER TABLE public.movimientos_bancarios
  ADD CONSTRAINT movimientos_bancarios_origen_tipo_check
  CHECK (origen_tipo = ANY (ARRAY['venta'::text, 'recibo'::text, 'cierre_caja'::text, 'pago_suplidor'::text,
    'compromiso'::text, 'san'::text, 'san_completado'::text, 'ingreso'::text, 'retiro'::text, 'desembolso'::text,
    'gasto'::text, 'ajuste'::text, 'transferencia_interna'::text, 'efectivo_caja'::text,
    'comision'::text]));

DROP FUNCTION IF EXISTS public.pagar_comision(uuid, date, date, numeric, numeric, numeric, text, text, text, text, uuid[]);

CREATE OR REPLACE FUNCTION public.pagar_comision(p_vendedor_id uuid, p_periodo_desde date, p_periodo_hasta date, p_total_ventas numeric, p_porcentaje numeric, p_total_comision numeric, p_forma_pago text DEFAULT 'EFECTIVO'::text, p_banco text DEFAULT NULL::text, p_referencia text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_factura_ids uuid[] DEFAULT NULL::uuid[], p_cuenta_bancaria_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_rol      text;
  v_forma    text := UPPER(COALESCE(NULLIF(btrim(p_forma_pago),''), 'EFECTIVO'));
  v_monto    numeric := round(COALESCE(p_total_comision, 0), 2);
  v_vend_nom text;
  v_pago_id  uuid;
  v_numero   text;
  v_seq      int;
  v_gasto_id uuid;
  v_facturas int := 0;
  v_hoy      date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_mov_id   uuid;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF v_monto <= 0 THEN RAISE EXCEPTION 'El monto de la comision debe ser mayor que cero'; END IF;
  IF v_forma NOT IN ('EFECTIVO','TRANSFERENCIA') THEN
    RAISE EXCEPTION 'Forma de pago invalida: use EFECTIVO o TRANSFERENCIA';
  END IF;
  -- La transferencia sale de una cuenta: sin cuenta no hay de donde descontarla.
  IF v_forma = 'TRANSFERENCIA' AND p_cuenta_bancaria_id IS NULL THEN
    RAISE EXCEPTION 'Elija la cuenta bancaria de donde sale la transferencia';
  END IF;

  -- Solo roles administrativos pagan comisiones
  SELECT role INTO v_rol FROM public.profiles WHERE id = auth.uid();
  IF COALESCE(v_rol,'') NOT IN ('admin','owner','manager','gerente') THEN
    RAISE EXCEPTION 'Solo un administrador o gerente puede pagar comisiones';
  END IF;

  SELECT nombre INTO v_vend_nom FROM public.vendedores
   WHERE id = p_vendedor_id AND tenant_id = v_tenant;
  IF v_vend_nom IS NULL THEN RAISE EXCEPTION 'Vendedor no encontrado en este tenant'; END IF;

  -- Numero PC-xxxxxxx por tenant
  SELECT COALESCE(MAX((regexp_replace(numero, '\D','','g'))::int), 0) + 1
    INTO v_seq FROM public.pagos_comisiones
   WHERE tenant_id = v_tenant AND numero IS NOT NULL;
  v_numero := 'PC-' || lpad(v_seq::text, 7, '0');

  INSERT INTO public.pagos_comisiones (
    tenant_id, numero, vendedor_id, fecha_pago, periodo_desde, periodo_hasta,
    total_ventas, porcentaje_comision, total_comision,
    forma_pago, banco, referencia, notas, usuario_id, cuenta_bancaria_id
  ) VALUES (
    v_tenant, v_numero, p_vendedor_id, v_hoy, p_periodo_desde, p_periodo_hasta,
    round(COALESCE(p_total_ventas,0),2), COALESCE(p_porcentaje,0), v_monto,
    v_forma, NULLIF(btrim(COALESCE(p_banco,'')),''), NULLIF(btrim(COALESCE(p_referencia,'')),''),
    NULLIF(btrim(COALESCE(p_notas,'')),''), auth.uid(),
    CASE WHEN v_forma = 'TRANSFERENCIA' THEN p_cuenta_bancaria_id END
  ) RETURNING id INTO v_pago_id;

  -- CANDADO: registrar las facturas comisionadas (solo las aun libres)
  IF p_factura_ids IS NOT NULL AND array_length(p_factura_ids, 1) > 0 THEN
    INSERT INTO public.pagos_comisiones_facturas (pago_comision_id, factura_id, tenant_id)
    SELECT v_pago_id, f.id, v_tenant
    FROM public.facturas f
    WHERE f.id = ANY(p_factura_ids)
      AND f.tenant_id = v_tenant
      AND NOT EXISTS (
        SELECT 1 FROM public.pagos_comisiones_facturas pcf
        JOIN public.pagos_comisiones pc ON pc.id = pcf.pago_comision_id
        WHERE pcf.factura_id = f.id AND COALESCE(pc.anulado, false) = false
      );
    GET DIAGNOSTICS v_facturas = ROW_COUNT;
  END IF;

  -- EFECTIVO: sale de la caja fisica -> gasto diario tipo COMISIONES
  -- (con eso la Caja del Dia, la Caja Actual y el Flujo Neto lo descuentan solos)
  IF v_forma = 'EFECTIVO' THEN
    INSERT INTO public.gastos_diarios (tenant_id, fecha, tipo_gasto, monto, descripcion, usuario_id)
    VALUES (
      v_tenant, v_hoy, 'COMISIONES', v_monto,
      'Pago comision ' || v_vend_nom || ' (' || v_numero || ') periodo '
        || to_char(p_periodo_desde, 'DD/MM/YYYY') || ' - ' || to_char(p_periodo_hasta, 'DD/MM/YYYY'),
      auth.uid()
    ) RETURNING id INTO v_gasto_id;

    UPDATE public.pagos_comisiones SET gasto_diario_id = v_gasto_id WHERE id = v_pago_id;
  END IF;
  -- TRANSFERENCIA: no toca la caja (ni la del dia ni la actual). Sale de la
  -- cuenta elegida; el flujo neto la sigue contando como egreso del negocio.
  -- La funcion compartida valida que la cuenta sea de la empresa o de su
  -- financiera vinculada, y no duplica si se reintenta (origen = el pago).
  IF v_forma = 'TRANSFERENCIA' THEN
    v_mov_id := public.registrar_movimiento_bancario_compartido(
      p_cuenta_bancaria_id, 'SALIDA', v_monto,
      'Pago comision ' || v_vend_nom || ' (' || v_numero || ')',
      NULLIF(btrim(COALESCE(p_referencia,'')),''),
      'comision', v_pago_id, v_hoy);
  END IF;

  RETURN json_build_object(
    'pago_id', v_pago_id,
    'numero', v_numero,
    'vendedor', v_vend_nom,
    'monto', v_monto,
    'forma_pago', v_forma,
    'facturas_bloqueadas', v_facturas,
    'gasto_diario_id', v_gasto_id,
    'movimiento_bancario_id', v_mov_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.pagar_comision(uuid, date, date, numeric, numeric, numeric, text, text, text, text, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pagar_comision(uuid, date, date, numeric, numeric, numeric, text, text, text, text, uuid[], uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_caja_excedente_dashboard()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant      uuid := public.get_user_tenant();
  v_seed        numeric := 0;
  v_anchor_date date := DATE '1970-01-01';
  v_anchor_ts   timestamptz;
  v_today       date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_today_ts    timestamptz;
  v_mes_ini     date := date_trunc('month', (now() AT TIME ZONE 'America/Santo_Domingo')::date)::date;
  v_excedente   numeric := 0;
  v_caja_hoy    numeric := 0;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant del usuario';
  END IF;

  SELECT COALESCE(saldo_inicial_caja, 0),
         COALESCE(caja_historial_desde, DATE '1970-01-01')
    INTO v_seed, v_anchor_date
  FROM public.config_empresa
  WHERE tenant_id = v_tenant
  LIMIT 1;

  -- >>> EL ANCLA NUNCA PUEDE SER DE MAÑANA <<<
  -- (2026-08-19) A REPUESTOS MORLA se le quedo `caja_historial_desde` en
  -- 2026-08-20 estando a 19, tecleada por error. El campo aceptaba fechas
  -- que todavia no han llegado y nada avisaba de lo que eso provocaba.
  --
  -- El resultado fue un dashboard entero en cero: el periodo quedaba
  -- "20/08 → 19/08", un rango al reves donde no cabe ni un movimiento. Y no
  -- decia que estuviera roto — decia "Sin movimientos registrados en este
  -- periodo", que es exactamente lo que uno leeria si el negocio no hubiera
  -- vendido nada. Ese dia se habian facturado RD$9,838.25.
  --
  -- Ignorar lo anterior a una fecha que todavia no llego no significa nada.
  -- Se recorta a hoy: con un ancla mala se ve el dia de hoy, que es poco
  -- pero es verdad, en vez de un cero que miente.
  v_anchor_date := LEAST(v_anchor_date, v_today);

  v_anchor_ts := (v_anchor_date::timestamp AT TIME ZONE 'America/Santo_Domingo');
  v_today_ts  := (v_today::timestamp     AT TIME ZONE 'America/Santo_Domingo');

  -- ---------- EXCEDENTE (efectivo + banco acumulado; NO se toca) ----------
  v_excedente := v_seed
    + COALESCE((SELECT SUM(total) FROM public.facturas
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND forma_pago ILIKE 'contado' AND COALESCE(estado, '') <> 'ANULADA'), 0)
    + COALESCE((SELECT SUM(monto_pagado) FROM public.recibos_ingreso
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND COALESCE(anulado, false) = false), 0)
    - COALESCE((SELECT SUM(public.compromiso_efectivo_pendiente(id, monto)) FROM public.compromisos
        WHERE tenant_id = v_tenant AND fecha_pago >= v_anchor_ts
          AND activo = false), 0)
    - COALESCE((SELECT SUM(monto_pagado) FROM public.pagos_suplidores
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND COALESCE(anulado, false) = false), 0)
    -- compra de contado: solo lo que salio de la gaveta. Las lineas de
    -- "Monto Pagado" dicen de donde salio; sin lineas se asume efectivo,
    -- que es como se venia tratando.
    - COALESCE((
        SELECT SUM(
          CASE WHEN jsonb_typeof(COALESCE(co.pagos, '[]'::jsonb)) = 'array'
                AND jsonb_array_length(COALESCE(co.pagos, '[]'::jsonb)) > 0
               THEN COALESCE((SELECT SUM((f->>'monto')::numeric)
                              FROM jsonb_array_elements(co.pagos) f
                              WHERE COALESCE(f->>'tipo', '01') = '01'
                                 OR lower(COALESCE(f->>'forma','')) LIKE '%efectivo%'), 0)
               ELSE COALESCE(co.total_compra, 0) END)
        FROM public.compras co
        WHERE co.tenant_id = v_tenant AND co.created_at >= v_anchor_ts
          AND co.forma_pago ILIKE 'contado' AND COALESCE(co.estado, '') <> 'ANULADA'
      ), 0)
    - COALESCE((SELECT SUM(monto) FROM public.gastos_diarios
        WHERE tenant_id = v_tenant AND fecha >= v_anchor_date
          AND COALESCE(anulado, false) = false
          AND cuenta_bancaria_id IS NULL
          AND COALESCE(afecta_caja, true) = true), 0)
    -- (04/11/2026) La comision pagada por TRANSFERENCIA ya no se resta aqui:
    -- sale de la cuenta bancaria (movimientos_bancarios, origen 'comision'),
    -- no de la caja. La de EFECTIVO sigue entrando como gasto diario.
    - COALESCE((SELECT SUM(monto_capital) FROM public.prestamos
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND desembolso IS NOT NULL), 0)
    -- (24/10/2026) efectivo movido de la caja a una cuenta (compra de dólares, depósito)
    - COALESCE((SELECT SUM(monto_caja) FROM public.caja_depositos
        WHERE tenant_id = v_tenant AND fecha >= v_anchor_date AND NOT anulado), 0);

  -- ---------- CAJA DE HOY (efectivo físico del día = "Efectivo en Caja") ----------
  v_caja_hoy :=
      COALESCE((SELECT SUM(total) FROM public.facturas
        WHERE tenant_id = v_tenant AND created_at >= v_today_ts
          AND forma_pago ILIKE 'contado' AND COALESCE(estado, '') <> 'ANULADA'), 0)
    -- recibos: SOLO la porción en efectivo y por FECHA real (igual que el cierre)
    + COALESCE((
        SELECT SUM(
          CASE
            WHEN jsonb_typeof(COALESCE(ri.formas_pago, '[]'::jsonb)) = 'array'
                 AND jsonb_array_length(COALESCE(ri.formas_pago, '[]'::jsonb)) > 0
            THEN COALESCE((
                   SELECT SUM((f->>'monto')::numeric)
                   FROM jsonb_array_elements(COALESCE(ri.formas_pago, '[]'::jsonb)) f
                   WHERE lower(COALESCE(f->>'forma','')) LIKE '%efectivo%'
                 ), 0)
            ELSE COALESCE(ri.monto_pagado, 0)
          END
        )
        FROM public.recibos_ingreso ri
        WHERE ri.tenant_id = v_tenant
          AND ri.fecha = v_today
          AND COALESCE(ri.anulado, false) = false
      ), 0)
    - COALESCE((SELECT SUM(monto) FROM public.gastos_diarios
        WHERE tenant_id = v_tenant AND fecha = v_today
          AND COALESCE(anulado, false) = false
          AND cuenta_bancaria_id IS NULL
          AND COALESCE(afecta_caja, true) = true), 0)
    -- LO QUE FALTABA: la compra de contado pagada en efectivo sale de la
    -- gaveta el mismo dia. Sin esto el cierre pedia un efectivo que ya no
    -- estaba: OC-0007, 31/07, RD$50,000.
    - COALESCE((
        SELECT SUM(
          CASE WHEN jsonb_typeof(COALESCE(co.pagos, '[]'::jsonb)) = 'array'
                AND jsonb_array_length(COALESCE(co.pagos, '[]'::jsonb)) > 0
               THEN COALESCE((SELECT SUM((f->>'monto')::numeric)
                              FROM jsonb_array_elements(co.pagos) f
                              WHERE COALESCE(f->>'tipo', '01') = '01'
                                 OR lower(COALESCE(f->>'forma','')) LIKE '%efectivo%'), 0)
               ELSE COALESCE(co.total_compra, 0) END)
        FROM public.compras co
        WHERE co.tenant_id = v_tenant AND co.created_at >= v_today_ts
          AND co.forma_pago ILIKE 'contado' AND COALESCE(co.estado, '') <> 'ANULADA'
      ), 0)
    - COALESCE((
        SELECT SUM((f->>'monto')::numeric)
        FROM public.pagos_suplidores ps,
             jsonb_array_elements(COALESCE(ps.formas_pago, '[]'::jsonb)) f
        WHERE ps.tenant_id = v_tenant
          AND ps.created_at >= v_today_ts
          AND COALESCE(ps.anulado, false) = false
          AND (f->>'forma') ILIKE '%efectivo%'
      ), 0)
    - COALESCE((SELECT SUM(public.compromiso_efectivo_pendiente(id, monto)) FROM public.compromisos
        WHERE tenant_id = v_tenant AND activo = false
          AND fecha_pago >= v_today_ts
          AND COALESCE(forma_pago, 'Efectivo') ILIKE '%efectivo%'), 0)
    - COALESCE((SELECT SUM(monto_capital) FROM public.prestamos
        WHERE tenant_id = v_tenant AND created_at >= v_today_ts
          AND desembolso ILIKE 'efectivo'), 0)
    -- (24/10/2026) efectivo movido hoy de la caja a una cuenta
    - COALESCE((SELECT SUM(monto_caja) FROM public.caja_depositos
        WHERE tenant_id = v_tenant AND fecha = v_today AND NOT anulado), 0);

  RETURN json_build_object(
    'excedente',     ROUND(v_excedente, 2),
    'caja_hoy',      ROUND(v_caja_hoy, 2),
    'saldo_inicial', ROUND(v_seed, 2),
    'anchor',        v_anchor_date,
    'debe_rodar',    (v_anchor_date < v_mes_ini)
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('comision_transferencia_sale_del_banco.sql');

COMMIT;

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  (SELECT count(*) FROM pg_proc WHERE proname = 'pagar_comision')                                  AS versiones_de_pagar_comision_1,
  (SELECT pg_get_functiondef(oid) LIKE '%p_cuenta_bancaria_id%' FROM pg_proc WHERE proname = 'pagar_comision') AS pide_la_cuenta,
  (SELECT pg_get_functiondef(oid) NOT LIKE '%pagos_comisiones%' FROM pg_proc WHERE proname = 'get_caja_excedente_dashboard') AS caja_ya_no_la_resta;
