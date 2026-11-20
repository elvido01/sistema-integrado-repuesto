-- =====================================================================
-- Venta de CONTADO a un cliente que retiene (20/11/2026)
-- ---------------------------------------------------------------------
-- Pedido del dueño: AMSTAR le paga a Oscar Aristy de CONTADO. Antes (regla
-- 13/11) una venta con retención obligaba a crédito, porque la caja contaba
-- el total y al cajero le entra el neto: lo retenido (ITBIS/ISR) lo paga el
-- cliente a la DGII.
--
-- Ahora la factura es de contado de verdad (e-CF, 607 y ticket dicen
-- contado) y lleva anotado en una columna lo que el cliente se quedó:
--   facturas.retenido_no_cobrado = lo que de verdad faltó por cobrar
--     = LEAST(itbis_retenido + isr_retenido, total − (recibido − cambio))
--   Se calcula al GRABAR (ventas nuevas o editadas desde hoy) y solo con lo
--   recibido anotado; las filas viejas quedan en 0 (columna nueva).
--   Si el cajero cobró completo, queda 0 y todo sigue igual que antes.
-- La llena un disparador (cualquiera que grabe: web, app, servidor), así
-- que hay UN solo dato. Lo restan las cuentas de DINERO de contado:
--   cierre de caja (web), get_caja_excedente_dashboard, rodar_ancla_caja,
--   get_flujo_neto_dashboard (ingresos), get_caja_disponible,
--   get_gestion_empresarial_ia y get_ingresos_dealer_mes (cobrado de contado).
-- De paso: get_caja_disponible filtraba estado <> 'Anulada' y el sistema
-- escribe ANULADA (las anuladas contaban como caja disponible).
-- NO lo restan las de VENTAS (metas, calidad de ventas, libro de
-- transacciones): la venta fue por el total.
-- Las ventas viejas quedan en 0: los cierres pasados no cambian.
-- =====================================================================

BEGIN;

ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS retenido_no_cobrado numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public._factura_retenido_no_cobrado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog'
AS $f$
DECLARE v_ret numeric := COALESCE(NEW.itbis_retenido, 0) + COALESCE(NEW.isr_retenido, 0);
BEGIN
  NEW.retenido_no_cobrado := CASE
    WHEN upper(COALESCE(NEW.forma_pago, '')) NOT IN ('CONTADO', 'EFECTIVO') THEN 0
    WHEN v_ret <= 0 THEN 0
    WHEN COALESCE(NEW.monto_recibido, 0) <= 0 THEN 0
    ELSE round(GREATEST(0, LEAST(v_ret,
                                 COALESCE(NEW.total, 0) - (COALESCE(NEW.monto_recibido, 0) - COALESCE(NEW.cambio, 0)),
                                 COALESCE(NEW.total, 0))), 2)
  END;
  RETURN NEW;
END $f$;

DROP TRIGGER IF EXISTS trg_factura_retenido_no_cobrado ON public.facturas;
CREATE TRIGGER trg_factura_retenido_no_cobrado
  BEFORE INSERT OR UPDATE OF forma_pago, total, itbis_retenido, isr_retenido, monto_recibido, cambio
  ON public.facturas
  FOR EACH ROW EXECUTE FUNCTION public._factura_retenido_no_cobrado();

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
    + COALESCE((SELECT SUM(total - COALESCE(retenido_no_cobrado, 0)) FROM public.facturas
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
      COALESCE((SELECT SUM(total - COALESCE(retenido_no_cobrado, 0)) FROM public.facturas
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

CREATE OR REPLACE FUNCTION public.rodar_ancla_caja()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant      uuid := public.get_user_tenant();
  v_seed        numeric := 0;
  v_anchor_date date := DATE '1970-01-01';
  v_corte       date := date_trunc('month', (now() AT TIME ZONE 'America/Santo_Domingo')::date)::date;
  v_anchor_ts   timestamptz;
  v_corte_ts    timestamptz;
  v_fold        numeric := 0;
  v_nuevo_saldo numeric := 0;
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

  IF v_anchor_date >= v_corte THEN
    RETURN json_build_object('rodada', false, 'anchor', v_anchor_date, 'saldo_inicial', ROUND(v_seed, 2));
  END IF;

  v_anchor_ts := (v_anchor_date::timestamp AT TIME ZONE 'America/Santo_Domingo');
  v_corte_ts  := (v_corte::timestamp     AT TIME ZONE 'America/Santo_Domingo');

  v_fold :=
      COALESCE((SELECT SUM(total - COALESCE(retenido_no_cobrado, 0)) FROM public.facturas
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts AND created_at < v_corte_ts
          AND forma_pago ILIKE 'contado' AND COALESCE(estado, '') <> 'ANULADA'), 0)
    + COALESCE((SELECT SUM(monto_pagado) FROM public.recibos_ingreso
        WHERE tenant_id = v_tenant AND fecha >= v_anchor_date AND fecha < v_corte
          AND COALESCE(anulado, false) = false), 0)
    - COALESCE((SELECT SUM(monto) FROM public.compromisos
        WHERE tenant_id = v_tenant AND fecha_pago >= v_anchor_ts AND fecha_pago < v_corte_ts
          AND activo = false), 0)
    - COALESCE((SELECT SUM(monto_pagado) FROM public.pagos_suplidores
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts AND created_at < v_corte_ts
          AND COALESCE(anulado, false) = false), 0)
    - COALESCE((SELECT SUM(total_compra) FROM public.compras
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts AND created_at < v_corte_ts
          AND forma_pago ILIKE 'contado' AND COALESCE(estado, '') <> 'ANULADA'), 0)
    - COALESCE((SELECT SUM(monto) FROM public.gastos_diarios
        WHERE tenant_id = v_tenant AND fecha >= v_anchor_date AND fecha < v_corte
          AND COALESCE(anulado, false) = false), 0);

  v_nuevo_saldo := v_seed + v_fold;

  UPDATE public.config_empresa
     SET saldo_inicial_caja   = v_nuevo_saldo,
         caja_historial_desde = v_corte
   WHERE tenant_id = v_tenant;

  RETURN json_build_object(
    'rodada',        true,
    'anchor',        v_corte,
    'saldo_inicial', ROUND(v_nuevo_saldo, 2),
    'congelado',     ROUND(v_fold, 2)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_flujo_neto_dashboard(p_fecha_referencia date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant       uuid := public.get_user_tenant();
  v_hoy          date := COALESCE(p_fecha_referencia, (now() AT TIME ZONE 'America/Santo_Domingo')::date);
  v_mes_ini      date := date_trunc('month', v_hoy)::date;
  v_anchor       date := DATE '1970-01-01';
  v_es_terceros  boolean := false;
  v_ini_act      date;                 -- inicio de EGRESOS (respeta el ancla)
  v_ini_ing      date;                 -- inicio de INGRESOS (mes completo si terceros)
  v_dia_act      int;
  v_dias_en_mes  int  := extract(day from (date_trunc('month', v_hoy) + interval '1 month - 1 day'))::int;
  v_dia          int  := (v_hoy - date_trunc('month', v_hoy)::date) + 1;
  v_mes_ant_ini  date := (date_trunc('month', v_hoy) - interval '1 month')::date;
  v_mes_ant_fin  date := LEAST(
                           ((date_trunc('month', v_hoy) - interval '1 month')::date + (v_dia - 1)),
                           (date_trunc('month', v_hoy) - interval '1 day')::date
                         );
  v_meta         numeric := 0;
  v_meta_ventas  numeric := 0;
  v_ventas_mes   numeric := 0;
  v_result       json;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant del usuario';
  END IF;

  -- El flujo puede tener su propia ancla; si no, usa la de la caja.
  SELECT COALESCE(meta_flujo_neto_mensual, 0),
         COALESCE(meta_ventas, 0),
         COALESCE(flujo_historial_desde, caja_historial_desde, DATE '1970-01-01'),
         (COALESCE(financiamiento_tipo, 'propio') = 'terceros')
    INTO v_meta, v_meta_ventas, v_anchor, v_es_terceros
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
  v_anchor := LEAST(v_anchor, v_hoy);

  -- Egresos: respetan el ancla (deja fuera la deuda vieja pre-cuadre).
  v_ini_act := GREATEST(v_mes_ini, v_anchor);
  -- Ingresos: mes completo en terceros (el volumen cobrado del mes); en el
  -- resto siguen el ancla igual que los egresos (sin cambios).
  v_ini_ing := CASE WHEN v_es_terceros THEN v_mes_ini ELSE v_ini_act END;
  v_dia_act := (v_hoy - v_ini_ing) + 1;
  IF v_dia_act < 1 THEN v_dia_act := 1; END IF;

  -- Ventas del período para la franja de METAS (volumen, no flujo).
  SELECT COALESCE(SUM(f.total), 0)
    INTO v_ventas_mes
  FROM public.facturas f
  WHERE f.tenant_id = v_tenant
    AND (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date >= v_ini_ing
    AND (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date <= v_hoy
    AND COALESCE(f.estado, '') <> 'ANULADA';

  WITH movimientos AS (
    SELECT (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date AS dia,
           (f.total - COALESCE(f.retenido_no_cobrado, 0))::numeric AS ingreso, 0::numeric AS egreso,
           'ingreso_venta_contado'::text AS categoria
    FROM public.facturas f
    WHERE f.tenant_id = v_tenant
      AND (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date >= v_mes_ant_ini
      AND (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date <= v_hoy
      AND f.forma_pago ILIKE 'contado'
      AND COALESCE(f.estado, '') <> 'ANULADA'

    UNION ALL
    SELECT r.fecha::date, r.monto_pagado::numeric, 0, 'ingreso_cobro_cliente'
    FROM public.recibos_ingreso r
    WHERE r.tenant_id = v_tenant
      AND r.fecha >= v_mes_ant_ini AND r.fecha <= v_hoy
      AND COALESCE(r.anulado, false) = false

    UNION ALL
    SELECT g.fecha::date, 0, g.monto::numeric, 'gasto_operativo'
    FROM public.gastos_diarios g
    WHERE g.tenant_id = v_tenant
      AND g.fecha >= v_mes_ant_ini AND g.fecha <= v_hoy
      AND COALESCE(g.anulado, false) = false

    UNION ALL
    SELECT c.fecha, 0, public.compromiso_efectivo_pendiente(c.id, c.monto)::numeric, 'compromiso_fijo'
    FROM public.compromisos c
    WHERE c.tenant_id = v_tenant
      AND c.activo = false
      AND c.fecha_pago IS NOT NULL
      AND c.fecha >= v_mes_ant_ini
      AND c.fecha <= v_hoy

    UNION ALL
    SELECT ps.fecha::date, 0, ps.monto_pagado::numeric, 'pago_suplidor'
    FROM public.pagos_suplidores ps
    WHERE ps.tenant_id = v_tenant
      AND ps.fecha >= v_mes_ant_ini AND ps.fecha <= v_hoy
      AND COALESCE(ps.anulado, false) = false

    UNION ALL
    SELECT co.fecha::date, 0, co.total_compra::numeric, 'compra_contado'
    FROM public.compras co
    WHERE co.tenant_id = v_tenant
      AND co.fecha >= v_mes_ant_ini AND co.fecha <= v_hoy
      AND co.forma_pago ILIKE 'contado'
      AND COALESCE(co.estado, '') <> 'ANULADA'

    UNION ALL
    SELECT pc.fecha_pago::date, 0, pc.total_comision::numeric, 'pago_comision'
    FROM public.pagos_comisiones pc
    WHERE pc.tenant_id = v_tenant
      AND pc.fecha_pago >= v_mes_ant_ini AND pc.fecha_pago <= v_hoy
      AND UPPER(COALESCE(pc.forma_pago,'EFECTIVO')) = 'TRANSFERENCIA'
      AND COALESCE(pc.anulado, false) = false
  ),
  dia_neto AS (
    SELECT dia,
           SUM(ingreso)          AS ingreso,
           SUM(egreso)           AS egreso,
           SUM(ingreso - egreso) AS neto
    FROM movimientos
    GROUP BY dia
  ),
  agg AS (
    SELECT
      -- INGRESOS: desde v_ini_ing (mes completo si terceros)
      COALESCE(SUM(ingreso) FILTER (WHERE categoria = 'ingreso_venta_contado' AND dia >= v_ini_ing), 0) AS act_venta_contado,
      COALESCE(SUM(ingreso) FILTER (WHERE categoria = 'ingreso_cobro_cliente' AND dia >= v_ini_ing), 0) AS act_cobro_cliente,
      -- EGRESOS: desde el ancla (deja fuera la deuda vieja)
      COALESCE(SUM(egreso)  FILTER (WHERE categoria = 'gasto_operativo' AND dia >= v_ini_act), 0) AS act_gastos,
      COALESCE(SUM(egreso)  FILTER (WHERE categoria = 'compromiso_fijo' AND dia >= v_ini_act), 0) AS act_compromisos,
      COALESCE(SUM(egreso)  FILTER (WHERE categoria = 'pago_suplidor'   AND dia >= v_ini_act), 0) AS act_suplidores,
      COALESCE(SUM(egreso)  FILTER (WHERE categoria = 'compra_contado'  AND dia >= v_ini_act), 0) AS act_compras,
      COALESCE(SUM(egreso)  FILTER (WHERE categoria = 'pago_comision'   AND dia >= v_ini_act), 0) AS act_comisiones,
      COALESCE(SUM(ingreso - egreso) FILTER (WHERE dia = v_hoy), 0)                               AS flujo_hoy,
      COALESCE(SUM(ingreso - egreso) FILTER (WHERE dia >= v_mes_ant_ini AND dia <= v_mes_ant_fin), 0) AS ant_flujo,
      COUNT(*) FILTER (WHERE dia >= v_mes_ant_ini AND dia <= v_mes_ant_fin)                       AS ant_movs
    FROM movimientos
  ),
  serie_actual AS (
    -- Ingresos desde v_ini_ing, egresos desde v_ini_act (mismo criterio del total)
    SELECT json_agg(json_build_object('dia', dia_mes, 'valor', ROUND(acum, 2)) ORDER BY dia_mes) AS data
    FROM (
      SELECT ((g.d)::date - v_mes_ini) + 1 AS dia_mes,
             SUM(
               (CASE WHEN (g.d)::date >= v_ini_ing THEN COALESCE(dn.ingreso, 0) ELSE 0 END)
             - (CASE WHEN (g.d)::date >= v_ini_act THEN COALESCE(dn.egreso, 0)  ELSE 0 END)
             ) OVER (ORDER BY g.d) AS acum
      FROM generate_series(v_ini_ing, v_hoy, interval '1 day') g(d)
      LEFT JOIN dia_neto dn ON dn.dia = (g.d)::date
    ) s
  ),
  serie_anterior AS (
    SELECT json_agg(json_build_object('dia', dia_mes, 'valor', ROUND(acum, 2)) ORDER BY dia_mes) AS data
    FROM (
      SELECT ((g.d)::date - v_mes_ant_ini) + 1 AS dia_mes,
             SUM(dn.neto) OVER (ORDER BY g.d) AS acum
      FROM generate_series(v_mes_ant_ini, v_mes_ant_fin, interval '1 day') g(d)
      LEFT JOIN dia_neto dn ON dn.dia = (g.d)::date
    ) s
  )
  SELECT json_build_object(
    'periodo_actual', json_build_object(
      'fecha_inicio',            v_ini_ing,
      'fecha_fin',               v_hoy,
      'dias_transcurridos',      v_dia_act,
      'dias_en_mes',             v_dias_en_mes,
      'ingreso_venta_contado',   ROUND(a.act_venta_contado, 2),
      'ingreso_cobro_cliente',   ROUND(a.act_cobro_cliente, 2),
      'ingresos_cobrados',       ROUND(a.act_venta_contado + a.act_cobro_cliente, 2),
      'gastos_diarios',          ROUND(a.act_gastos, 2),
      'compromisos_fijos_pagados', ROUND(a.act_compromisos, 2),
      'pagos_suplidores',        ROUND(a.act_suplidores, 2),
      'compras_contado',         ROUND(a.act_compras, 2),
      'pagos_comisiones',        ROUND(a.act_comisiones, 2),
      'total_egresos',           ROUND(a.act_gastos + a.act_compromisos + a.act_suplidores + a.act_compras + a.act_comisiones, 2),
      'flujo_neto',              ROUND((a.act_venta_contado + a.act_cobro_cliente)
                                       - (a.act_gastos + a.act_compromisos + a.act_suplidores + a.act_compras + a.act_comisiones), 2),
      'flujo_hoy',               ROUND(a.flujo_hoy, 2),
      'promedio_diario',         ROUND(((a.act_venta_contado + a.act_cobro_cliente)
                                        - (a.act_gastos + a.act_compromisos + a.act_suplidores + a.act_compras + a.act_comisiones))
                                       / NULLIF(v_dia_act, 0), 2)
    ),
    'periodo_anterior', json_build_object(
      'fecha_inicio', v_mes_ant_ini,
      'fecha_fin',    v_mes_ant_fin,
      'flujo_neto',   ROUND(a.ant_flujo, 2),
      'tiene_datos',  (a.ant_movs > 0)
    ),
    'comparacion', json_build_object(
      'diferencia', ROUND(((a.act_venta_contado + a.act_cobro_cliente)
                           - (a.act_gastos + a.act_compromisos + a.act_suplidores + a.act_compras + a.act_comisiones))
                          - a.ant_flujo, 2),
      'variacion_porcentual',
        CASE WHEN a.ant_flujo <> 0
             THEN ROUND(((((a.act_venta_contado + a.act_cobro_cliente)
                           - (a.act_gastos + a.act_compromisos + a.act_suplidores + a.act_compras + a.act_comisiones))
                          - a.ant_flujo) / abs(a.ant_flujo)) * 100, 2)
             ELSE NULL END
    ),
    'metas', json_build_object(
      'meta_mensual',    ROUND(v_meta, 2),
      'proyeccion',      ROUND(((a.act_venta_contado + a.act_cobro_cliente)
                                - (a.act_gastos + a.act_compromisos + a.act_suplidores + a.act_compras + a.act_comisiones))
                               / NULLIF(v_dia_act, 0) * v_dias_en_mes, 2),
      'porcentaje_meta', NULL,
      'meta_ventas',       ROUND(v_meta_ventas, 2),
      'ventas_mes',        ROUND(v_ventas_mes, 2),
      'proyeccion_ventas', ROUND((v_ventas_mes / NULLIF(v_dia_act, 0)) * v_dias_en_mes, 2),
      'porcentaje_meta_ventas',
        CASE WHEN v_meta_ventas > 0
             THEN ROUND((v_ventas_mes / v_meta_ventas) * 100, 2)
             ELSE NULL END
    ),
    'series', json_build_object(
      'mes_actual',   COALESCE((SELECT data FROM serie_actual),   '[]'::json),
      'mes_anterior', COALESCE((SELECT data FROM serie_anterior), '[]'::json)
    )
  )
  INTO v_result
  FROM agg a;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_caja_disponible(p_tenant_id uuid DEFAULT NULL::uuid, p_hasta timestamp with time zone DEFAULT now())
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_tenant         UUID;
  v_desde          TIMESTAMPTZ;
  v_ventas_contado NUMERIC := 0;
  v_recibos        NUMERIC := 0;
  v_pagos          NUMERIC := 0;
  v_compromisos    NUMERIC := 0;
  v_disponible     NUMERIC;
BEGIN
  v_tenant := COALESCE(p_tenant_id, public.get_user_tenant());
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin tenant'; END IF;

  -- Ventana de cálculo: últimos 30 días
  v_desde := p_hasta - INTERVAL '30 days';

  -- 1. Ventas al contado (cash entrante directo de operación)
  SELECT COALESCE(SUM(total - COALESCE(retenido_no_cobrado, 0)), 0) INTO v_ventas_contado
  FROM public.facturas
  WHERE tenant_id = v_tenant
    AND upper(COALESCE(estado, '')) <> 'ANULADA'
    AND UPPER(COALESCE(forma_pago, '')) = 'CONTADO'
    AND fecha::timestamptz BETWEEN v_desde AND p_hasta;

  -- 2. Cobranzas de crédito (recibos de ingreso)
  SELECT COALESCE(SUM(monto_pagado), 0) INTO v_recibos
  FROM public.recibos_ingreso
  WHERE tenant_id = v_tenant
    AND COALESCE(anulado, false) = false
    AND fecha::timestamptz BETWEEN v_desde AND p_hasta;

  -- 3. Pagos a suplidores (cash saliente)
  SELECT COALESCE(SUM(monto_pagado), 0) INTO v_pagos
  FROM public.pagos_suplidores
  WHERE tenant_id = v_tenant
    AND COALESCE(anulado, false) = false
    AND fecha::timestamptz BETWEEN v_desde AND p_hasta;

  -- 4. Compromisos pagados (gastos fijos)
  BEGIN
    SELECT COALESCE(SUM(monto_pagado), 0) INTO v_compromisos
    FROM public.compromisos
    WHERE tenant_id = v_tenant
      AND COALESCE(estado, '') ILIKE '%pag%'
      AND COALESCE(fecha_pago, fecha)::timestamptz BETWEEN v_desde AND p_hasta;
  EXCEPTION WHEN OTHERS THEN
    v_compromisos := 0;  -- si la tabla/columna no existe, ignorar
  END;

  v_disponible := v_ventas_contado + v_recibos - v_pagos - v_compromisos;

  RETURN json_build_object(
    'caja_disponible',     ROUND(v_disponible, 2),
    'ventas_contado_30d',  ROUND(v_ventas_contado, 2),
    'recibos_30d',         ROUND(v_recibos, 2),
    'pagos_suplidores_30d', ROUND(v_pagos, 2),
    'compromisos_30d',     ROUND(v_compromisos, 2),
    'ventana_desde',       v_desde,
    'ventana_hasta',       p_hasta,
    'metodo',              'flujo_operacional_30d'
  );
END; $function$;

CREATE OR REPLACE FUNCTION public.get_ingresos_dealer_mes()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant  uuid := public.get_user_tenant();
  v_dealer  uuid;
  v_nombre  text;
  v_ini     date;
  v_fin     date;
  v_contado     numeric := 0;  v_contado_n int := 0;
  v_recibos     numeric := 0;  v_recibos_n int := 0;
  v_gastos      numeric := 0;
  v_terceros    numeric := 0;
  v_compromisos numeric := 0;
  v_suplidores  numeric := 0;
  v_compras     numeric := 0;
  v_comisiones  numeric := 0;
BEGIN
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  -- El dealer que financia SUS ventas con esta empresa. Por el enlace de
  -- config_empresa, nunca por nombre.
  SELECT ce.tenant_id, ce.nombre INTO v_dealer, v_nombre
  FROM public.config_empresa ce
  WHERE ce.financiera_tenant_id = v_tenant
    AND COALESCE(ce.financiamiento_tipo, 'propio') = 'terceros'
    AND ce.tenant_id <> v_tenant
  LIMIT 1;

  IF v_dealer IS NULL THEN RETURN NULL; END IF;

  v_ini := date_trunc('month', (now() AT TIME ZONE 'America/Santo_Domingo')::date)::date;
  v_fin := (v_ini + interval '1 month')::date;   -- exclusivo

  -- ---------- lo que cobró ----------
  -- Contado: la factura ya trae el dinero, no deja recibo aparte.
  SELECT COUNT(*), COALESCE(SUM(fa.total - COALESCE(fa.retenido_no_cobrado, 0)), 0) INTO v_contado_n, v_contado
  FROM public.facturas fa
  WHERE fa.tenant_id = v_dealer
    AND (fa.fecha AT TIME ZONE 'America/Santo_Domingo')::date >= v_ini
    AND (fa.fecha AT TIME ZONE 'America/Santo_Domingo')::date <  v_fin
    AND fa.forma_pago ILIKE '%contado%'
    AND COALESCE(fa.estado, '') <> 'ANULADA';

  -- Recibos: la inicial de las financiadas y los abonos posteriores.
  SELECT COUNT(*), COALESCE(SUM(ri.monto_pagado), 0) INTO v_recibos_n, v_recibos
  FROM public.recibos_ingreso ri
  WHERE ri.tenant_id = v_dealer
    AND ri.fecha >= v_ini AND ri.fecha < v_fin
    AND COALESCE(ri.anulado, false) = false;

  -- ---------- lo que pagó ----------
  -- Gasto de verdad: sin lo que se le entrega a terceros.
  SELECT COALESCE(SUM(g.monto), 0) INTO v_gastos
  FROM public.gastos_diarios g
  WHERE g.tenant_id = v_dealer
    AND g.fecha >= v_ini AND g.fecha < v_fin
    AND COALESCE(g.anulado, false) = false
    AND COALESCE(g.es_tercero, false) = false;

  -- GPS, seguro, placa...: salió el dinero, pero no es gasto de la empresa.
  SELECT COALESCE(SUM(g.monto), 0) INTO v_terceros
  FROM public.gastos_diarios g
  WHERE g.tenant_id = v_dealer
    AND g.fecha >= v_ini AND g.fecha < v_fin
    AND COALESCE(g.anulado, false) = false
    AND COALESCE(g.es_tercero, false) = true;

  SELECT COALESCE(SUM(public.compromiso_efectivo_pendiente(c.id, c.monto)), 0) INTO v_compromisos
  FROM public.compromisos c
  WHERE c.tenant_id = v_dealer
    AND c.activo = false
    AND c.fecha_pago IS NOT NULL
    AND c.fecha >= v_ini AND c.fecha < v_fin;

  SELECT COALESCE(SUM(ps.monto_pagado), 0) INTO v_suplidores
  FROM public.pagos_suplidores ps
  WHERE ps.tenant_id = v_dealer
    AND ps.fecha >= v_ini AND ps.fecha < v_fin
    AND COALESCE(ps.anulado, false) = false;

  SELECT COALESCE(SUM(co.total_compra), 0) INTO v_compras
  FROM public.compras co
  WHERE co.tenant_id = v_dealer
    AND co.fecha >= v_ini AND co.fecha < v_fin
    AND co.forma_pago ILIKE '%contado%'
    AND COALESCE(co.estado, '') <> 'ANULADA';

  SELECT COALESCE(SUM(pc.total_comision), 0) INTO v_comisiones
  FROM public.pagos_comisiones pc
  WHERE pc.tenant_id = v_dealer
    AND pc.fecha_pago >= v_ini AND pc.fecha_pago < v_fin
    AND UPPER(COALESCE(pc.forma_pago, 'EFECTIVO')) = 'TRANSFERENCIA'
    AND COALESCE(pc.anulado, false) = false;

  RETURN json_build_object(
    'dealer_nombre',  COALESCE(v_nombre, 'Dealer'),
    'desde',          v_ini,
    'hasta',          (v_fin - 1),
    'contado',        ROUND(v_contado, 2),
    'contado_cant',   v_contado_n,
    'recibos',        ROUND(v_recibos, 2),
    'recibos_cant',   v_recibos_n,
    'total',          ROUND(v_contado + v_recibos, 2),
    'gastos',         ROUND(v_gastos, 2),
    'terceros',       ROUND(v_terceros, 2),
    'compromisos',    ROUND(v_compromisos, 2),
    'suplidores',     ROUND(v_suplidores, 2),
    'compras',        ROUND(v_compras, 2),
    'comisiones',     ROUND(v_comisiones, 2),
    'egresos',        ROUND(v_gastos + v_terceros + v_compromisos + v_suplidores + v_compras + v_comisiones, 2),
    'neto',           ROUND(v_contado + v_recibos
                            - (v_gastos + v_terceros + v_compromisos + v_suplidores + v_compras + v_comisiones), 2)
  );
END $function$;

CREATE OR REPLACE FUNCTION public.get_gestion_empresarial_ia(p_meses integer DEFAULT 6)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_hoy      date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_mes_ini  date := date_trunc('month', (now() AT TIME ZONE 'America/Santo_Domingo')::date)::date;
  v_mes_fin  date;
  v_n        int  := GREATEST(COALESCE(p_meses, 6), 1);
  v_grupo      uuid[];
  v_dealer     uuid;
  v_dealer_nom text;
  v_financiera uuid;
  v_gasto_d  numeric := 0;
  v_margen   numeric;
  v_ventas   numeric := 0;
  v_costo    numeric := 0;
  v_tasa     numeric := 1;
  -- posición
  v_bancos      numeric := 0;
  v_caja_dop    numeric := 0;
  v_caja_usd    numeric := 0;
  v_motos_cant  int := 0;
  v_motos_valor numeric := 0;
  v_cartera     numeric := 0;
  v_cartera_int numeric := 0;
  v_cartera_mora numeric := 0;
  v_cartera_json json;
  v_cartera_n   int := 0;
  v_cxc         numeric := 0;
  v_cxc_n       int := 0;
  v_cxp         numeric := 0;
  v_cxp_n       int := 0;
  v_inter       numeric := 0;
  v_comp        numeric := 0;
  v_personales  numeric := 0;
  v_personales_n int := 0;
  v_comp_n      int := 0;
  v_ventas_mes  numeric := 0;
  -- INGRESOS DEL MES: lo que entro a la caja, por empresa.
  v_dealer_id   uuid;
  v_fin_id      uuid;
  v_contado     numeric := 0;   v_contado_n   int := 0;
  v_iniciales   numeric := 0;   v_iniciales_n int := 0;
  v_abonos      numeric := 0;   v_abonos_n    int := 0;
  v_recibos     numeric := 0;   v_recibos_n   int := 0;
  v_result   json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  v_mes_fin := (v_mes_ini + interval '1 month - 1 day')::date;

  -- EL GRUPO: las empresas que en la vida real son una sola.
  SELECT ce.tenant_id, ce.nombre INTO v_dealer, v_dealer_nom
  FROM public.config_empresa ce
  WHERE ce.financiera_tenant_id = v_tenant
    AND COALESCE(ce.financiamiento_tipo, 'propio') = 'terceros'
  LIMIT 1;

  SELECT ce.financiera_tenant_id INTO v_financiera
  FROM public.config_empresa ce
  WHERE ce.tenant_id = v_tenant
    AND COALESCE(ce.financiamiento_tipo, 'propio') = 'terceros'
    AND ce.financiera_tenant_id IS NOT NULL
  LIMIT 1;

  v_grupo := ARRAY[v_tenant];
  IF v_dealer IS NOT NULL AND NOT (v_dealer = ANY(v_grupo)) THEN v_grupo := v_grupo || v_dealer; END IF;
  IF v_financiera IS NOT NULL AND NOT (v_financiera = ANY(v_grupo)) THEN v_grupo := v_grupo || v_financiera; END IF;

  -- Tasa del día, para las cuentas en dólares
  SELECT t.tasa INTO v_tasa FROM public.tasas_cambio t
   WHERE t.tenant_id = ANY(v_grupo) ORDER BY t.fecha DESC LIMIT 1;
  v_tasa := COALESCE(NULLIF(v_tasa, 0), 1);

  -- Gasto operativo por día — de TODO el grupo (real, 90 días)
  SELECT COALESCE(SUM(monto), 0) / 90.0 INTO v_gasto_d
  FROM public.gastos_diarios
  WHERE tenant_id = ANY(v_grupo)
    AND fecha >= (v_hoy - 90) AND fecha <= v_hoy
    AND COALESCE(anulado, false) = false;

  -- Margen bruto de los últimos 90 días (quien factura es el dealer)
  SELECT COALESCE(SUM(d.importe), 0),
         COALESCE(SUM(COALESCE(d.costo_unitario, 0) * d.cantidad), 0)
    INTO v_ventas, v_costo
  FROM public.facturas f
  JOIN public.facturas_detalle d ON d.factura_id = f.id
  WHERE f.tenant_id = ANY(v_grupo)
    AND f.fecha >= (v_hoy - 90)
    AND COALESCE(f.estado, '') <> 'ANULADA';
  v_margen := CASE WHEN v_ventas > 0 AND v_costo > 0 AND v_costo < v_ventas
                   THEN (v_ventas - v_costo) / v_ventas ELSE NULL END;

  -- Ventas del MES en curso: contra qué se compara la facturación necesaria.
  SELECT COALESCE(SUM(f.total), 0) INTO v_ventas_mes
  FROM public.facturas f
  WHERE f.tenant_id = ANY(v_grupo)
    AND f.fecha >= v_mes_ini AND f.fecha < (v_mes_fin + 1)
    AND COALESCE(f.estado, '') <> 'ANULADA';

  -- ============ LO QUE TENEMOS ============
  -- Caja y bancos: saldo inicial + movimientos. Los dólares a la tasa del día.
  SELECT COALESCE(SUM(
           (c.saldo_inicial + COALESCE(m.neto, 0))
           * CASE WHEN upper(COALESCE(c.moneda, 'DOP')) = 'USD' THEN v_tasa ELSE 1 END), 0),
         COALESCE(SUM(c.saldo_inicial + COALESCE(m.neto, 0))
           FILTER (WHERE upper(COALESCE(c.moneda, 'DOP')) <> 'USD'), 0),
         COALESCE(SUM(c.saldo_inicial + COALESCE(m.neto, 0))
           FILTER (WHERE upper(COALESCE(c.moneda, 'DOP')) = 'USD'), 0)
    INTO v_bancos, v_caja_dop, v_caja_usd
  FROM public.cuentas_bancarias c
  LEFT JOIN LATERAL (
    SELECT SUM(CASE WHEN mb.tipo = 'ENTRADA' THEN mb.monto ELSE -mb.monto END) AS neto
    FROM public.movimientos_bancarios mb WHERE mb.cuenta_id = c.id
  ) m ON true
  WHERE c.tenant_id = ANY(v_grupo) AND COALESCE(c.activo, true);

  -- Motocicletas en inventario (el dealer serializa cada unidad por chasis)
  SELECT COUNT(*), COALESCE(SUM(COALESCE(p.costo, 0)), 0)
    INTO v_motos_cant, v_motos_valor
  FROM public.productos p
  WHERE p.tenant_id = ANY(v_grupo)
    AND COALESCE(p.activo, true)
    AND p.chasis IS NOT NULL AND btrim(p.chasis) <> ''
    AND public.get_stock_actual(p.id) > 0;

  -- Cartera: CAPITAL COLOCADO en préstamos vivos. No es el saldo pendiente
  -- exacto (eso exige recorrer la amortización de cada préstamo), por eso la
  -- pantalla lo dice con esas palabras y no lo llama "por cobrar".
  -- La cartera sale del MISMO resumen que muestra el módulo de cartera:
  -- reescribir aquí su fórmula (interés corriente, mora prorrateada, reparto
  -- capital/interés) garantizaría que un día digan números distintos.
  v_cartera_json := public.gestion_cartera_resumen();
  v_cartera      := COALESCE((v_cartera_json->>'capital')::numeric, 0);
  v_cartera_int  := COALESCE((v_cartera_json->>'interes')::numeric, 0);
  v_cartera_mora := COALESCE((v_cartera_json->>'mora')::numeric, 0);
  v_cartera_n    := COALESCE((v_cartera_json->>'prestamos')::int, 0);

  -- POR COBRAR: de las FACTURAS que quedan sin cobrar, no del balance del
  -- cliente. El balance no distingue una venta fiada de una financiada, y en
  -- la financiada el préstamo ya cuenta ese dinero: sumar los dos lo duplica.
  SELECT COALESCE(SUM(fa.monto_pendiente), 0), COUNT(*) INTO v_cxc, v_cxc_n
  FROM public.facturas fa
  WHERE fa.tenant_id = ANY(v_grupo)
    AND COALESCE(fa.monto_pendiente, 0) > 0
    AND COALESCE(fa.estado, '') <> 'ANULADA'
    -- Las que se convirtieron en préstamo las cuenta la cartera. El vínculo
    -- es exacto: el préstamo guarda "[FT:<id>]" en sus notas.
    AND NOT EXISTS (
      SELECT 1 FROM public.prestamos pp
      WHERE pp.tenant_id = ANY(v_grupo)
        AND pp.estado = 'activo'
        AND pp.notas LIKE '%[FT:' || fa.id::text || '%')
    -- Y si el "cliente" fuera otra empresa del grupo, tampoco cuenta.
    AND NOT EXISTS (
      SELECT 1 FROM public.clientes cl
      JOIN public.config_empresa ce2 ON ce2.tenant_id = ANY(v_grupo)
      WHERE cl.id = fa.cliente_id
        AND NULLIF(btrim(COALESCE(cl.rnc, '')), '') = NULLIF(btrim(COALESCE(ce2.rnc, '')), '')
        AND cl.tenant_id <> ce2.tenant_id);

  -- ============ LO QUE DEBEMOS ============
  -- Suplidores REALES: se dejan fuera las compras a una empresa del grupo.
  SELECT COUNT(*), COALESCE(SUM(co.monto_pendiente), 0) INTO v_cxp_n, v_cxp
  FROM public.compras co
  LEFT JOIN public.proveedores pv ON pv.id = co.suplidor_id
  WHERE co.tenant_id = ANY(v_grupo)
    AND co.estado = 'PENDIENTE'
    AND co.forma_pago ILIKE '%credito%'
    AND COALESCE(co.monto_pendiente, 0) > 0
    AND (pv.empresa_grupo_tenant_id IS NULL OR NOT (pv.empresa_grupo_tenant_id = ANY(v_grupo)));

  -- Lo eliminado, para poder mostrarlo y que nadie crea que se perdió.
  SELECT COALESCE(SUM(co.monto_pendiente), 0) INTO v_inter
  FROM public.compras co
  JOIN public.proveedores pv ON pv.id = co.suplidor_id
  WHERE co.tenant_id = ANY(v_grupo)
    AND co.estado = 'PENDIENTE'
    AND co.forma_pago ILIKE '%credito%'
    AND COALESCE(co.monto_pendiente, 0) > 0
    AND pv.empresa_grupo_tenant_id = ANY(v_grupo);

  -- Compromisos VIVOS (no la proyección a 6 meses: eso es carga futura,
  -- no deuda contraída).
  SELECT COUNT(*), COALESCE(SUM(c.monto), 0) INTO v_comp_n, v_comp
  FROM public.compromisos c
  WHERE c.tenant_id = ANY(v_grupo) AND COALESCE(c.activo, true);

  -- DEUDAS PERSONALES (módulo SAN). Es plata que hay que devolver, así que
  -- pesa en la posición igual que un suplidor. Sin esto el panel ignoraba la
  -- deuda más grande del grupo.
  SELECT COUNT(*), COALESCE(SUM(d.monto), 0) INTO v_personales_n, v_personales
  FROM public.san_deudas d
  WHERE d.tenant_id = ANY(v_grupo) AND COALESCE(d.activo, true);

  -- ---- INGRESOS DEL MES ----
  -- El dealer vende (contado, y la inicial de las financiadas) y la
  -- financiera cobra las cuotas. Quien es quien sale del enlace de
  -- config_empresa, nunca del nombre.
  v_dealer_id := COALESCE(v_dealer, v_tenant);
  v_fin_id    := COALESCE(v_financiera, v_tenant);

  SELECT COUNT(*), COALESCE(SUM(fa.total - COALESCE(fa.retenido_no_cobrado, 0)), 0) INTO v_contado_n, v_contado
  FROM public.facturas fa
  WHERE fa.tenant_id = v_dealer_id
    AND fa.fecha >= v_mes_ini AND fa.fecha < (v_mes_fin + 1)
    AND fa.forma_pago ILIKE '%contado%'
    AND COALESCE(fa.estado, '') <> 'ANULADA';

  -- Una factura de contado no deja recibo de ingreso, asi que estas dos
  -- lineas no se pisan. Iniciales = el abono del dia de la venta; el resto
  -- son abonos posteriores a facturas a credito, que tambien es plata que
  -- entro.
  SELECT COUNT(*)            FILTER (WHERE ri.concepto ILIKE '%momento de la venta%'),
         COALESCE(SUM(ri.monto_pagado) FILTER (WHERE ri.concepto ILIKE '%momento de la venta%'), 0),
         COUNT(*)            FILTER (WHERE COALESCE(ri.concepto, '') NOT ILIKE '%momento de la venta%'),
         COALESCE(SUM(ri.monto_pagado) FILTER (WHERE COALESCE(ri.concepto, '') NOT ILIKE '%momento de la venta%'), 0)
    INTO v_iniciales_n, v_iniciales, v_abonos_n, v_abonos
  FROM public.recibos_ingreso ri
  WHERE ri.tenant_id = v_dealer_id
    AND ri.fecha >= v_mes_ini AND ri.fecha < (v_mes_fin + 1)
    AND COALESCE(ri.anulado, false) = false;

  -- Si el grupo es una sola empresa, esto seria contar los mismos recibos
  -- dos veces.
  IF v_fin_id IS DISTINCT FROM v_dealer_id THEN
    SELECT COUNT(*), COALESCE(SUM(ri.monto_pagado), 0) INTO v_recibos_n, v_recibos
    FROM public.recibos_ingreso ri
    WHERE ri.tenant_id = v_fin_id
      AND ri.fecha >= v_mes_ini AND ri.fecha < (v_mes_fin + 1)
      AND COALESCE(ri.anulado, false) = false;
  END IF;

  WITH meses AS (
    SELECT (v_mes_ini + (n || ' month')::interval)::date AS mes
    FROM generate_series(0, v_n - 1) n
  ),
  comp_activos AS (
    SELECT c.monto,
           date_trunc('month', c.fecha)::date AS mes_origen,
           COALESCE(c.recurrente, false) AS repite
    FROM public.compromisos c
    WHERE c.tenant_id = ANY(v_grupo)
      AND COALESCE(c.activo, true) = true
      AND NOT EXISTS (SELECT 1 FROM public.nominas n WHERE n.compromiso_id = c.id)
      AND COALESCE(c.tipo, '') <> 'nomina'
  ),
  compromisos_mes AS (
    SELECT m.mes, COALESCE(SUM(ca.monto), 0) AS monto, COUNT(ca.monto) AS cant
    FROM meses m
    LEFT JOIN comp_activos ca
      ON (ca.repite AND m.mes >= CASE
            WHEN ca.mes_origen <= (v_mes_ini + interval '1 month')::date THEN v_mes_ini
            ELSE ca.mes_origen END)
      OR (NOT ca.repite AND m.mes = ca.mes_origen)
    GROUP BY m.mes
  ),
  emp AS (
    SELECT e.frecuencia_pago,
           COALESCE(e.dia_pago_semanal, 6)::smallint AS dow,
           (e.sueldo_mensual
              - CASE WHEN e.cotiza_tss
                     THEN round(LEAST(e.sueldo_mensual, 464460) * 0.0287, 2)
                        + round(LEAST(e.sueldo_mensual, 232230) * 0.0304, 2)
                        + public.nomina_isr_mensual(
                            e.sueldo_mensual
                            - round(LEAST(e.sueldo_mensual, 464460) * 0.0287, 2)
                            - round(LEAST(e.sueldo_mensual, 232230) * 0.0304, 2))
                     ELSE 0 END) AS neto_mes
    FROM public.empleados e
    WHERE e.tenant_id = ANY(v_grupo) AND e.activo = true
  ),
  nomina_monto AS (
    SELECT m.mes,
           COALESCE(SUM(
             CASE WHEN e.frecuencia_pago = 'semanal'
                  THEN round(e.neto_mes / 4.0, 2)
                       * public.nomina_pagos_en_periodo(
                           m.mes, (m.mes + interval '1 month - 1 day')::date, e.dow)
                  ELSE e.neto_mes END), 0) AS monto
    FROM meses m LEFT JOIN emp e ON true
    GROUP BY m.mes
  ),
  nomina_dias AS (
    SELECT m.mes, count(*) AS cant
    FROM meses m
    CROSS JOIN LATERAL (
      SELECT DISTINCT e.frecuencia_pago, d::date AS fecha
      FROM public.empleados e
      CROSS JOIN generate_series(m.mes::timestamp,
                                 (m.mes + interval '1 month - 1 day')::timestamp,
                                 interval '1 day') d
      WHERE e.tenant_id = ANY(v_grupo) AND e.activo = true
        AND ((e.frecuencia_pago = 'semanal'
              AND extract(dow FROM d)::int = COALESCE(e.dia_pago_semanal, 6))
          OR (e.frecuencia_pago = 'quincenal'
              AND extract(day FROM d)::int IN (
                    15, LEAST(30, extract(day FROM (m.mes + interval '1 month - 1 day'))::int)))
          OR (e.frecuencia_pago = 'mensual'
              AND d::date = (m.mes + interval '1 month - 1 day')::date))
    ) pagos
    GROUP BY m.mes
  ),
  cxp AS (
    -- También aquí fuera lo de entre empresas del grupo.
    SELECT (co.fecha + COALESCE(co.dias_credito, 0))::date AS vence,
           COALESCE(co.total_compra, 0) AS total,
           COALESCE(co.monto_pagado, 0) AS pagado,
           COALESCE(co.monto_pendiente, 0) AS pendiente
    FROM public.compras co
    LEFT JOIN public.proveedores pv ON pv.id = co.suplidor_id
    WHERE co.tenant_id = ANY(v_grupo)
      AND co.forma_pago ILIKE '%credito%'
      AND COALESCE(co.estado, '') <> 'ANULADA'
      AND COALESCE(co.total_compra, 0) > 0
      AND NOT COALESCE(co.es_saldo_inicial, false)
      AND (pv.empresa_grupo_tenant_id IS NULL OR NOT (pv.empresa_grupo_tenant_id = ANY(v_grupo)))
  ),
  cumplimiento AS (
    SELECT
      COALESCE(SUM(x.total), 0)  AS suplidores_debia,
      COALESCE(SUM(x.pagado), 0) AS suplidores_pagado,
      COUNT(*)                   AS suplidores_cuotas,
      -- la carga real del mes: los fijos + la nomina. Es la misma fila de
      -- este mes en "mes por mes", asi que los dos paneles no pueden diferir.
      ((SELECT COALESCE(SUM(cm.monto), 0) FROM compromisos_mes cm WHERE cm.mes = v_mes_ini)
       + (SELECT COALESCE(SUM(nm.monto), 0) FROM nomina_monto nm WHERE nm.mes = v_mes_ini)) AS compromisos_debia,
      -- la meta del mes menos lo que sigue pendiente. Contar las filas con
      -- fecha_pago daba 292,400 y dejaba un "falta" de 373,564 que no es
      -- real: nueve de los fijos no dejan fila en el mes en curso —su
      -- proxima fecha ya es del mes siguiente— y aun asi este mes no los
      -- debe. Lo firme es lo PENDIENTE: las filas del mes sin fecha_pago,
      -- las mismas que se ven en el modulo de compromisos.
      GREATEST(((SELECT COALESCE(SUM(cm.monto), 0) FROM compromisos_mes cm WHERE cm.mes = v_mes_ini)
       + (SELECT COALESCE(SUM(nm.monto), 0) FROM nomina_monto nm WHERE nm.mes = v_mes_ini))
        - (SELECT COALESCE(SUM(c.monto), 0) FROM public.compromisos c
            WHERE c.tenant_id = ANY(v_grupo) AND c.fecha BETWEEN v_mes_ini AND v_mes_fin
              AND c.fecha_pago IS NULL
              AND NOT EXISTS (SELECT 1 FROM public.nominas nx
                               WHERE nx.compromiso_id = c.id AND nx.estado = 'anulada')), 0) AS compromisos_pagado,
      ((SELECT COALESCE(SUM(cm.cant), 0) FROM compromisos_mes cm WHERE cm.mes = v_mes_ini)
       + (SELECT COALESCE(SUM(nd.cant), 0) FROM nomina_dias nd WHERE nd.mes = v_mes_ini))::int AS compromisos_cant
    FROM cxp x WHERE x.vence BETWEEN v_mes_ini AND v_mes_fin
  ),
  suplidores_mes AS (
    -- la fila del mes = lo que vence, completo: el mismo numero que
    -- "se debia pagar" del cumplimiento. Cuanto de eso ya se cubrio se
    -- ve arriba, en Estado actual.
    SELECT m.mes,
           COALESCE(SUM(x.total), 0) AS monto,
           COUNT(x.total) AS cant
    FROM meses m
    LEFT JOIN cxp x ON date_trunc('month', x.vence)::date = m.mes
    GROUP BY m.mes
  ),
  -- Lo que la cartera debe recaudar en cada mes. Caminero vende la moto y
  -- MotoPrestamos la financia: la cuota entra COMPLETA, capital + interes.
  -- No deja margen porque el margen ya lo dejo la venta cuando se hizo, asi
  -- que baja peso a peso lo que hay que facturar.
  -- Solo cuotas con saldo, y de prestamos sin castigar: los castigados se
  -- castigaron justamente porque no se espera cobrarlos.
  cobros_mes AS (
    SELECT m.mes,
           COALESCE(SUM(GREATEST(
             COALESCE(q.capital, 0) + COALESCE(q.interes, 0)
             - COALESCE(q.capital_pagado, 0) - COALESCE(q.interes_pagado, 0), 0)), 0) AS monto,
           COUNT(q.id) AS cant
    FROM meses m
    LEFT JOIN public.prestamo_cuotas q
           ON date_trunc('month', q.fecha_vencimiento)::date = m.mes
          AND q.tenant_id = ANY(v_grupo)
          AND COALESCE(q.capital, 0) + COALESCE(q.interes, 0)
              > COALESCE(q.capital_pagado, 0) + COALESCE(q.interes_pagado, 0)
          AND EXISTS (SELECT 1 FROM public.prestamos pp
                       WHERE pp.id = q.prestamo_id
                         AND COALESCE(pp.estado, '') <> 'castigado')
    GROUP BY m.mes
  ),
  filas AS (
    SELECT m.mes,
      -- misma formula todos los meses, el actual incluido: "se debia pagar"
      -- de arriba sale de estos mismos CTEs.
      COALESCE(cm.monto, 0) + COALESCE(nm.monto, 0) AS compromisos,
      COALESCE(cm.cant, 0)  + COALESCE(nd.cant, 0)  AS compromisos_cant,
      COALESCE(sm.monto, 0) AS suplidores,
      COALESCE(sm.cant, 0)  AS suplidores_cant,
      ROUND(v_gasto_d * EXTRACT(day FROM (m.mes + interval '1 month - 1 day'))::numeric, 2) AS gastos,
      COALESCE(cb.monto, 0) AS cobros,
      COALESCE(cb.cant, 0)  AS cobros_cant
    FROM meses m
    LEFT JOIN compromisos_mes cm ON cm.mes = m.mes
    LEFT JOIN nomina_monto    nm ON nm.mes = m.mes
    LEFT JOIN nomina_dias     nd ON nd.mes = m.mes
    LEFT JOIN suplidores_mes  sm ON sm.mes = m.mes
    LEFT JOIN cobros_mes      cb ON cb.mes = m.mes
  ),
  hist AS (
    SELECT date_trunc('month', g.fecha)::date AS mes,
           SUM(g.monto) AS monto, COUNT(*) AS cant
    FROM public.gastos_diarios g
    WHERE g.tenant_id = ANY(v_grupo)
      AND g.fecha >= (v_mes_ini - interval '6 months')::date
      AND g.fecha < v_mes_ini
      AND COALESCE(g.anulado, false) = false
    GROUP BY 1
  )
  SELECT json_build_object(
    'generado',        v_hoy,
    'gasto_diario',    ROUND(v_gasto_d, 2),
    'margen_pct',      CASE WHEN v_margen IS NULL THEN NULL ELSE ROUND(v_margen * 100, 2) END,
    'suplidores_de',   v_dealer_nom,
    'empresas_grupo',  array_length(v_grupo, 1),
    'tasa_usd',        v_tasa,
    'ventas_mes',      ROUND(v_ventas_mes, 2),

    -- INGRESOS DEL MES: la plata que entro, contra lo que el mes pide. Es la
    -- otra cara de "Estado actual": alli se ve cuanto se debe, aqui con que
    -- se esta pagando.
    'ingresos_mes', (
      SELECT json_build_object(
        'mes',            to_char(v_mes_ini, 'YYYY-MM'),
        'dealer_nombre',  COALESCE((SELECT ce.nombre FROM public.config_empresa ce
                                     WHERE ce.tenant_id = v_dealer_id LIMIT 1), 'Ventas'),
        'contado',        ROUND(v_contado, 2),
        'contado_cant',   v_contado_n,
        'iniciales',      ROUND(v_iniciales, 2),
        'iniciales_cant', v_iniciales_n,
        'abonos',         ROUND(v_abonos, 2),
        'abonos_cant',    v_abonos_n,
        'dealer_total',   ROUND(v_contado + v_iniciales + v_abonos, 2),
        'fin_nombre',     COALESCE((SELECT ce.nombre FROM public.config_empresa ce
                                     WHERE ce.tenant_id = v_fin_id LIMIT 1), 'Cobros'),
        'recibos',        ROUND(v_recibos, 2),
        'recibos_cant',   v_recibos_n,
        'total',          ROUND(v_contado + v_iniciales + v_abonos + v_recibos, 2),
        'meta',           ROUND(c.compromisos_debia + c.suplidores_debia, 2),
        'falta',          ROUND(GREATEST(c.compromisos_debia + c.suplidores_debia
                                         - (v_contado + v_iniciales + v_abonos + v_recibos), 0), 2),
        'pct',            CASE WHEN (c.compromisos_debia + c.suplidores_debia) > 0
                               THEN ROUND((v_contado + v_iniciales + v_abonos + v_recibos) * 100
                                          / (c.compromisos_debia + c.suplidores_debia), 1) END
      ) FROM cumplimiento c
    ),
    'suplidores_fuera_ventana', (
      SELECT ROUND(COALESCE(SUM(pendiente), 0), 2) FROM cxp
       WHERE pendiente > 0
         AND (vence < v_mes_ini OR vence >= (v_mes_ini + (v_n || ' month')::interval)::date)
    ),

    -- POSICIÓN: lo que tenemos contra lo que debemos. Es lo único de esta
    -- pantalla que no se puede deducir de la tabla de abajo.
    'posicion', json_build_object(
      'caja_bancos',      ROUND(v_bancos, 2),
      'caja_dop',         ROUND(v_caja_dop, 2),
      'caja_usd',         ROUND(v_caja_usd, 2),
      'motos_unidades',   v_motos_cant,
      'motos_valor',      ROUND(v_motos_valor, 2),
      'cartera_cantidad', v_cartera_n,
      'cartera_capital',  ROUND(v_cartera, 2),
      'cartera_interes',  ROUND(v_cartera_int, 2),
      'cartera_mora',     ROUND(v_cartera_mora, 2),
      'cartera_total',    ROUND(v_cartera + v_cartera_int + v_cartera_mora, 2),
      'por_cobrar',       ROUND(v_cxc, 2),
      'por_cobrar_cant',  v_cxc_n,
      'activos',          ROUND(v_bancos + v_motos_valor + v_cartera + v_cartera_int + v_cartera_mora + v_cxc, 2),
      'suplidores',       ROUND(v_cxp, 2),
      'suplidores_cuotas', v_cxp_n,
      'compromisos',      ROUND(v_comp, 2),
      'compromisos_cant', v_comp_n,
      'intercompania',    ROUND(v_inter, 2),
      'deudas_personales',      ROUND(v_personales, 2),
      'deudas_personales_cant', v_personales_n,
      'pasivos',          ROUND(v_cxp + v_comp + v_personales, 2),
      'neta',             ROUND(v_bancos + v_motos_valor + v_cartera + v_cartera_int + v_cartera_mora + v_cxc - v_cxp - v_comp - v_personales, 2)
    ),

    'estado_actual', (
      SELECT json_build_object(
        'mes',                to_char(v_mes_ini, 'YYYY-MM'),
        'compromisos_debia',  ROUND(c.compromisos_debia, 2),
        'compromisos_pagado', ROUND(c.compromisos_pagado, 2),
        'compromisos_cant',   c.compromisos_cant,
        'compromisos_pct',    CASE WHEN c.compromisos_debia > 0
                                   THEN ROUND(c.compromisos_pagado * 100 / c.compromisos_debia, 1) END,
        'suplidores_debia',   ROUND(c.suplidores_debia, 2),
        'suplidores_pagado',  ROUND(c.suplidores_pagado, 2),
        'suplidores_cant',    c.suplidores_cuotas,
        'suplidores_pct',     CASE WHEN c.suplidores_debia > 0
                                   THEN ROUND(c.suplidores_pagado * 100 / c.suplidores_debia, 1) END,
        'total_debia',        ROUND(c.compromisos_debia + c.suplidores_debia, 2),
        'total_pagado',       ROUND(c.compromisos_pagado + c.suplidores_pagado, 2),
        'total_pct',          CASE WHEN (c.compromisos_debia + c.suplidores_debia) > 0
                                   THEN ROUND((c.compromisos_pagado + c.suplidores_pagado) * 100
                                              / (c.compromisos_debia + c.suplidores_debia), 1) END,
        -- Vencida = paso la fecha y TODAVIA SE DEBE. Con "total > pagado"
        -- entraban 7 facturas de TERUEL ya saldadas: en dolares se pagaron
        -- completas, pero a una tasa mas baja que la de la compra, asi que
        -- costaron menos pesos. Esa diferencia es ganancia cambiaria, no
        -- deuda. Es el mismo criterio del detalle que abre con doble clic.
        'cuotas_vencidas_cant',  (SELECT COUNT(*) FROM cxp WHERE vence < v_hoy AND pendiente > 0),
        'cuotas_vencidas_monto', (SELECT ROUND(COALESCE(SUM(pendiente), 0), 2)
                                    FROM cxp WHERE vence < v_hoy AND pendiente > 0)
      ) FROM cumplimiento c
    ),
    'meses', COALESCE((
      SELECT json_agg(json_build_object(
        'mes',              to_char(f.mes, 'YYYY-MM'),
        'compromisos',      ROUND(f.compromisos, 2),
        'compromisos_cant', f.compromisos_cant,
        'suplidores',       ROUND(f.suplidores, 2),
        'suplidores_cant',  f.suplidores_cant,
        'gastos',           f.gastos,
        'total_cubrir',     ROUND(f.compromisos + f.suplidores + f.gastos, 2),
        'cobros',           ROUND(f.cobros, 2),
        'cobros_cant',      f.cobros_cant,
        -- los cobros entran completos; solo lo que sobra hay que venderlo, y
        -- de cada venta queda su margen.
        'facturacion_necesaria',
          CASE WHEN (f.compromisos + f.suplidores + f.gastos - f.cobros) <= 0 THEN 0
               WHEN v_margen IS NULL
                 THEN ROUND(f.compromisos + f.suplidores + f.gastos - f.cobros, 2)
               ELSE ROUND((f.compromisos + f.suplidores + f.gastos - f.cobros) / v_margen, 2) END
      ) ORDER BY f.mes) FROM filas f
    ), '[]'::json),
    'totales', (
      SELECT json_build_object(
        'compromisos',  ROUND(COALESCE(SUM(compromisos), 0), 2),
        'suplidores',   ROUND(COALESCE(SUM(suplidores), 0), 2),
        'gastos',       ROUND(COALESCE(SUM(gastos), 0), 2),
        'total_cubrir', ROUND(COALESCE(SUM(compromisos + suplidores + gastos), 0), 2),
        'cobros',       ROUND(COALESCE(SUM(cobros), 0), 2),
        'falta_cubrir', ROUND(GREATEST(COALESCE(SUM(compromisos + suplidores + gastos - cobros), 0), 0), 2),
        'facturacion_necesaria',
          CASE WHEN COALESCE(SUM(compromisos + suplidores + gastos - cobros), 0) <= 0 THEN 0
               WHEN v_margen IS NULL
                 THEN ROUND(COALESCE(SUM(compromisos + suplidores + gastos - cobros), 0), 2)
               ELSE ROUND(COALESCE(SUM(compromisos + suplidores + gastos - cobros), 0) / v_margen, 2) END
      ) FROM filas
    ),
    'historial_gastos', COALESCE((
      SELECT json_agg(json_build_object(
        'mes', to_char(h.mes, 'YYYY-MM'), 'monto', ROUND(h.monto, 2), 'cant', h.cant
      ) ORDER BY h.mes) FROM hist h
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

COMMIT;

SELECT public.registrar_migracion('contado_con_retencion.sql');
