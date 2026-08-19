-- =====================================================================
-- Un ancla en el futuro no puede dejar el Dashboard en blanco
-- ---------------------------------------------------------------------
-- (2026-08-19) El Dashboard entero se quedo en cero: ingresos 0, egresos 0,
-- flujo neto 0. Ese mismo dia se habian facturado RD$9,838.25.
--
-- Lo que paso: "Historial Caja Desde" quedo en 2026-08-20 — mañana —
-- tecleada por error. La causa da igual y por eso no se apunta a nadie: el
-- campo aceptaba cualquier fecha, incluida una que todavia no ha llegado, y
-- ninguna pantalla decia que eso rompiera nada.
--
-- (Ese campo y "Saldo Inicial Caja" son independientes: cada uno hace lo
-- suyo. Aqui no se toca esa separacion, solo se le pone tope al primero.)
--
-- Con esa fecha, get_flujo_neto_dashboard calculaba
--
--     v_ini_act := GREATEST(v_mes_ini, v_anchor)   -->  2026-08-20
--
-- y despues filtraba `>= 2026-08-20 AND <= 2026-08-19`: un rango al reves,
-- donde no cabe ningun movimiento. De ahi los ceros.
--
-- >>> LO PEOR NO FUE EL CERO, FUE COMO LO CONTABA <<<
-- La tarjeta decia "Sin movimientos registrados en este periodo". Eso es
-- exactamente lo que uno leeria si el negocio no hubiera vendido nada en
-- todo el mes. Un dashboard que se rompe tiene que verse roto; si se
-- disfraza de negocio parado, se toman decisiones con el disfraz.
--
-- >>> QUE SE HACE <<<
-- Las dos funciones que leen el ancla la recortan a hoy. Ignorar lo
-- anterior a una fecha que todavia no llego no significa nada, asi que con
-- un ancla mala se ve el dia de hoy — poco, pero verdad — en vez de un cero.
--
-- La pantalla ademas deja de aceptar fechas futuras (ver el mismo commit),
-- que es donde de verdad se ataja. Esto es la red debajo: el dato tambien
-- puede llegar por SQL o por una importacion.
--
-- El cuerpo de las dos funciones NO esta reescrito a mano: es el que estaba
-- en produccion, sacado con pg_get_functiondef, con una linea añadida.
--
-- Idempotente. No toca dinero.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) EL DATO QUE SE TORCIO
-- ------------------------------------------------------------
-- Solo si sigue en el futuro: si el dueño ya lo arreglo a mano, no se le
-- pisa la correccion.
UPDATE public.config_empresa
   SET caja_historial_desde = date_trunc('month', (now() AT TIME ZONE 'America/Santo_Domingo')::date)::date
 WHERE caja_historial_desde > (now() AT TIME ZONE 'America/Santo_Domingo')::date;

-- ------------------------------------------------------------
-- 2) LA RED: EL ANCLA SE RECORTA A HOY
-- ------------------------------------------------------------
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
           f.total::numeric AS ingreso, 0::numeric AS egreso,
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
    - COALESCE((SELECT SUM(total_comision) FROM public.pagos_comisiones
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND UPPER(COALESCE(forma_pago,'EFECTIVO')) = 'TRANSFERENCIA'
          AND COALESCE(anulado, false) = false), 0)
    - COALESCE((SELECT SUM(monto_capital) FROM public.prestamos
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND desembolso IS NOT NULL), 0);

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
          AND desembolso ILIKE 'efectivo'), 0);

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

SELECT public.registrar_migracion('ancla_caja_no_puede_ser_futura.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  (SELECT count(*) FROM public.config_empresa
    WHERE caja_historial_desde > (now() AT TIME ZONE 'America/Santo_Domingo')::date) AS anclas_en_el_futuro,
  (SELECT caja_historial_desde FROM public.config_empresa
    WHERE tenant_id='00000000-0000-0000-0000-000000000001')                          AS morla_ahora,
  CASE WHEN (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.proname='get_flujo_neto_dashboard') LIKE '%LEAST(v_anchor, v_hoy)%'
       THEN 'OK  flujo neto recorta el ancla' ELSE '*** FALLO ***' END               AS flujo,
  CASE WHEN (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.proname='get_caja_excedente_dashboard') LIKE '%LEAST(v_anchor_date, v_today)%'
       THEN 'OK  excedente recorta el ancla' ELSE '*** FALLO ***' END                AS excedente;
