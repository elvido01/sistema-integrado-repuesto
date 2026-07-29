-- =====================================================================
-- GESTIÓN EMPRESARIAL: el grupo como UNA empresa, y cumplimiento del mes
-- ---------------------------------------------------------------------
-- (2026-07-29) Cuatro cambios pedidos, más el que los explica todos:
--
-- >>> 0) CAMINERO Y MOTOPRÉSTAMOS SON UNA SOLA EMPRESA <<<
-- "en el sistema son dos empresas, pero en la vida real es una sola: una
--  vende las motocicletas y la otra las financia. Los gastos estimados y
--  los ingresos de este panel deben ser de ambas."
-- El panel ya tomaba las CxP del dealer, pero el gasto diario y el margen
-- salían de una sola. MotoPréstamos no factura (0 facturas en 90 días), así
-- que el margen daba NULL y el gasto/día salía RD$1,059 cuando entre las dos
-- es RD$1,152. Ahora todo se calcula sobre el GRUPO (v_grupo), que se arma
-- solo desde config_empresa — no se adivina por nombre.
--
-- >>> 1) LAS CUOTAS VENCIDAS SUBEN A LAS TARJETAS <<<
-- Se siguen calculando igual; el recuadro verde queda libre para el
-- cumplimiento. Es dato de tarjeta: un número de alarma, no un análisis.
--
-- >>> 2) EL RECUADRO VERDE = CUMPLIMIENTO DEL MES <<<
-- "los compromisos y pagos a suplidores que se deben pagar este [mes] vs lo
--  que se ha pagado, y que diga el porcentaje de cumplimiento."
-- Con los datos de hoy:
--   Compromisos  se debía 497,720      pagado 292,400      →  58.7%
--   Suplidores   se debía 14,390,621   pagado 7,222,483    →  50.2%
-- El pagado de suplidores sale de compras.monto_pagado de las cuotas que
-- vencen ESTE mes — no del total abonado en el mes. Así el % compara lo
-- mismo contra lo mismo: si se abona a una cuota de septiembre, no infla el
-- cumplimiento de julio.
--
-- >>> 3) MES POR MES CON LOS DATOS COMPLETOS <<<
-- "en el cuadro de mes por mes siempre deben estar los datos completos de
--  cada mes."
-- El mes en curso mostraba solo de HOY en adelante: julio salía con 1 cuota
-- y RD$229 cuando el mes entero son 17 cuotas y RD$14.4 millones. Ahora cada
-- fila trae TODO lo que vence en ese mes, por su monto completo, se haya
-- pagado o no. Lo pagado se lee en el cumplimiento de arriba.
--
-- >>> 4) LA TARJETA DE SUPLIDORES DICE CON QUÉ SE RESPONDE <<<
-- "en el cuadro suplidores quiero las unidades de motocicletas y el valor en
--  inventario que representan."
-- Motocicleta = producto con CHASIS y existencia > 0. Al lado de lo que se
-- debe, lo que hay para responder.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_gestion_empresarial_ia(
  p_meses int DEFAULT 6
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_hoy      date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_mes_ini  date := date_trunc('month', (now() AT TIME ZONE 'America/Santo_Domingo')::date)::date;
  v_mes_fin  date;
  v_n        int  := GREATEST(COALESCE(p_meses, 6), 1);
  -- EL GRUPO: las empresas que en la vida real son una sola. Sale de
  -- config_empresa (financiera_tenant_id + financiamiento_tipo='terceros'),
  -- nunca de adivinar por nombre.
  v_grupo      uuid[];
  v_dealer     uuid;
  v_dealer_nom text;
  v_financiera uuid;
  v_gasto_d  numeric := 0;
  v_margen   numeric;
  v_ventas   numeric := 0;
  v_costo    numeric := 0;
  v_motos_cant  int := 0;
  v_motos_valor numeric := 0;
  v_result   json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  v_mes_fin := (v_mes_ini + interval '1 month - 1 day')::date;

  -- ¿Soy la financiera de algún dealer?
  SELECT ce.tenant_id, ce.nombre INTO v_dealer, v_dealer_nom
  FROM public.config_empresa ce
  WHERE ce.financiera_tenant_id = v_tenant
    AND COALESCE(ce.financiamiento_tipo, 'propio') = 'terceros'
  LIMIT 1;

  -- ¿O soy el dealer y mi financiera es otra?
  SELECT ce.financiera_tenant_id INTO v_financiera
  FROM public.config_empresa ce
  WHERE ce.tenant_id = v_tenant
    AND COALESCE(ce.financiamiento_tipo, 'propio') = 'terceros'
    AND ce.financiera_tenant_id IS NOT NULL
  LIMIT 1;

  v_grupo := ARRAY[v_tenant];
  IF v_dealer IS NOT NULL AND NOT (v_dealer = ANY(v_grupo)) THEN
    v_grupo := v_grupo || v_dealer;
  END IF;
  IF v_financiera IS NOT NULL AND NOT (v_financiera = ANY(v_grupo)) THEN
    v_grupo := v_grupo || v_financiera;
  END IF;

  -- Gasto operativo promedio por día — de TODO el grupo (real, 90 días)
  SELECT COALESCE(SUM(monto), 0) / 90.0 INTO v_gasto_d
  FROM public.gastos_diarios
  WHERE tenant_id = ANY(v_grupo)
    AND fecha >= (v_hoy - 90) AND fecha <= v_hoy
    AND COALESCE(anulado, false) = false;

  -- Margen bruto de los últimos 90 días — también del grupo: quien factura
  -- es el dealer, así que mirando solo la financiera el margen salía NULL.
  SELECT COALESCE(SUM(d.importe), 0),
         COALESCE(SUM(COALESCE(d.costo_unitario, 0) * d.cantidad), 0)
    INTO v_ventas, v_costo
  FROM public.facturas f
  JOIN public.facturas_detalle d ON d.factura_id = f.id
  WHERE f.tenant_id = ANY(v_grupo)
    AND f.fecha >= (v_hoy - 90)
    AND COALESCE(f.estado, '') <> 'ANULADA';
  v_margen := CASE WHEN v_ventas > 0 AND v_costo > 0 AND v_costo < v_ventas
                   THEN (v_ventas - v_costo) / v_ventas
                   ELSE NULL END;

  -- CON QUÉ SE RESPONDE: motocicletas en inventario y lo que valen al costo.
  -- Moto = producto con CHASIS (el dealer serializa cada unidad).
  SELECT COUNT(*), COALESCE(SUM(COALESCE(p.costo, 0)), 0)
    INTO v_motos_cant, v_motos_valor
  FROM public.productos p
  WHERE p.tenant_id = ANY(v_grupo)
    AND COALESCE(p.activo, true) = true
    AND p.chasis IS NOT NULL AND btrim(p.chasis) <> ''
    AND public.get_stock_actual(p.id) > 0;

  WITH meses AS (
    SELECT (v_mes_ini + (n || ' month')::interval)::date AS mes
    FROM generate_series(0, v_n - 1) n
  ),
  comp_activos AS (  -- compromisos aún por pagar (todo el grupo)
    SELECT c.monto,
           date_trunc('month', c.fecha)::date AS mes_origen,
           COALESCE(c.recurrente, false) AS repite
    FROM public.compromisos c
    WHERE c.tenant_id = ANY(v_grupo)
      AND COALESCE(c.activo, true) = true          -- activo = aún por pagar
      -- La NÓMINA se calcula abajo, mes por mes. Se reconoce por el VÍNCULO
      -- (nominas.compromiso_id) y no por el 'tipo', que se puede pisar desde
      -- el editor del tablero y de hecho ya había pasado.
      AND NOT EXISTS (SELECT 1 FROM public.nominas n WHERE n.compromiso_id = c.id)
      AND COALESCE(c.tipo, '') <> 'nomina'
  ),
  compromisos_mes AS (
    SELECT m.mes,
           COALESCE(SUM(ca.monto), 0) AS monto,
           COUNT(ca.monto)            AS cant
    FROM meses m
    LEFT JOIN comp_activos ca
      ON (ca.repite AND m.mes >= LEAST(ca.mes_origen, v_mes_ini))
      OR (NOT ca.repite AND m.mes = ca.mes_origen)
    GROUP BY m.mes
  ),
  emp AS (  -- lo que cuesta cada empleado del grupo AL MES, ya neto
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
    --   mensual → su sueldo | quincenal → su sueldo (las 2 quincenas)
    --   semanal → sueldo/4 × los sábados que tenga ESE mes
    SELECT m.mes,
           COALESCE(SUM(
             CASE WHEN e.frecuencia_pago = 'semanal'
                  THEN round(e.neto_mes / 4.0, 2)
                       * public.nomina_pagos_en_periodo(
                           m.mes, (m.mes + interval '1 month - 1 day')::date, e.dow)
                  ELSE e.neto_mes END), 0) AS monto
    FROM meses m
    LEFT JOIN emp e ON true
    GROUP BY m.mes
  ),
  nomina_dias AS (
    -- Un pago = una NÓMINA que se salda. La quincena es UNA aunque cobren 7
    -- personas, y el sábado es OTRA aunque caiga el mismo día (el 15/08 cae
    -- sábado y es quincena: son dos líneas en Compromisos a Pagar).
    SELECT m.mes, count(*) AS cant
    FROM meses m
    CROSS JOIN LATERAL (
      SELECT DISTINCT e.frecuencia_pago, d::date AS fecha
      FROM public.empleados e
      CROSS JOIN generate_series(
             m.mes::timestamp,
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
    -- TODAS las cuotas del grupo, pagadas o no, con su monto completo. Antes
    -- solo entraban las PENDIENTES: el mes en curso perdía lo ya saldado y
    -- julio mostraba 1 cuota donde el mes tiene 17.
    SELECT (co.fecha + COALESCE(co.dias_credito, 0))::date AS vence,
           COALESCE(co.total_compra, 0)    AS total,
           COALESCE(co.monto_pagado, 0)    AS pagado,
           COALESCE(co.monto_pendiente, 0) AS pendiente
    FROM public.compras co
    WHERE co.tenant_id = ANY(v_grupo)
      AND co.forma_pago ILIKE '%credito%'
      AND COALESCE(co.estado, '') <> 'ANULADA'
      AND COALESCE(co.total_compra, 0) > 0
  ),
  vencidas AS (
    -- Deuda exigible HOY. Va a la tarjeta de arriba, no dentro de un mes.
    SELECT COUNT(*) AS cant, COALESCE(SUM(pendiente), 0) AS monto
    FROM cxp WHERE vence < v_hoy AND pendiente > 0
  ),
  cumplimiento AS (
    -- CUMPLIMIENTO DEL MES: lo que vence ESTE mes contra lo ya abonado A ESAS
    -- MISMAS cuotas. Comparar contra el total pagado en el mes mentiría: un
    -- abono a una cuota de septiembre subiría el cumplimiento de julio.
    SELECT
      COALESCE(SUM(x.total), 0)  AS suplidores_debia,
      COALESCE(SUM(x.pagado), 0) AS suplidores_pagado,
      COUNT(*)                   AS suplidores_cuotas,
      (SELECT COALESCE(SUM(c.monto), 0) FROM public.compromisos c
        WHERE c.tenant_id = ANY(v_grupo)
          AND c.fecha BETWEEN v_mes_ini AND v_mes_fin) AS compromisos_debia,
      (SELECT COALESCE(SUM(c.monto), 0) FROM public.compromisos c
        WHERE c.tenant_id = ANY(v_grupo)
          AND c.fecha BETWEEN v_mes_ini AND v_mes_fin
          AND c.fecha_pago IS NOT NULL) AS compromisos_pagado,
      (SELECT COUNT(*) FROM public.compromisos c
        WHERE c.tenant_id = ANY(v_grupo)
          AND c.fecha BETWEEN v_mes_ini AND v_mes_fin) AS compromisos_cant
    FROM cxp x
    WHERE x.vence BETWEEN v_mes_ini AND v_mes_fin
  ),
  suplidores_mes AS (
    -- Cada mes, COMPLETO: todo lo que vence dentro de él por su monto total.
    SELECT m.mes,
           COALESCE(SUM(x.total), 0) AS monto,
           COUNT(x.total)            AS cant
    FROM meses m
    LEFT JOIN cxp x ON date_trunc('month', x.vence)::date = m.mes
    GROUP BY m.mes
  ),
  filas AS (
    SELECT
      m.mes,
      COALESCE(cm.monto, 0) + COALESCE(nm.monto, 0) AS compromisos,
      COALESCE(cm.cant, 0)  + COALESCE(nd.cant, 0)  AS compromisos_cant,
      COALESCE(sm.monto, 0) AS suplidores,
      COALESCE(sm.cant, 0)  AS suplidores_cant,
      ROUND(v_gasto_d * EXTRACT(day FROM (m.mes + interval '1 month - 1 day'))::numeric, 2) AS gastos
    FROM meses m
    LEFT JOIN compromisos_mes cm ON cm.mes = m.mes
    LEFT JOIN nomina_monto    nm ON nm.mes = m.mes
    LEFT JOIN nomina_dias     nd ON nd.mes = m.mes
    LEFT JOIN suplidores_mes  sm ON sm.mes = m.mes
  ),
  hist AS (  -- gasto REAL de los últimos 6 meses (del grupo)
    SELECT date_trunc('month', g.fecha)::date AS mes,
           SUM(g.monto) AS monto,
           COUNT(*)     AS cant
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
    -- ESTADO ACTUAL: la foto de HOY, separada de la proyección.
    'estado_actual', (
      SELECT json_build_object(
        'cuotas_vencidas_cant',  v.cant,
        'cuotas_vencidas_monto', ROUND(v.monto, 2),
        'motos_unidades',        v_motos_cant,
        'motos_valor',           ROUND(v_motos_valor, 2),
        'mes',                   to_char(v_mes_ini, 'YYYY-MM'),
        'compromisos_debia',     ROUND(c.compromisos_debia, 2),
        'compromisos_pagado',    ROUND(c.compromisos_pagado, 2),
        'compromisos_cant',      c.compromisos_cant,
        'compromisos_pct',       CASE WHEN c.compromisos_debia > 0
                                      THEN ROUND(c.compromisos_pagado * 100 / c.compromisos_debia, 1)
                                      ELSE NULL END,
        'suplidores_debia',      ROUND(c.suplidores_debia, 2),
        'suplidores_pagado',     ROUND(c.suplidores_pagado, 2),
        'suplidores_cant',       c.suplidores_cuotas,
        'suplidores_pct',        CASE WHEN c.suplidores_debia > 0
                                      THEN ROUND(c.suplidores_pagado * 100 / c.suplidores_debia, 1)
                                      ELSE NULL END,
        'total_debia',           ROUND(c.compromisos_debia + c.suplidores_debia, 2),
        'total_pagado',          ROUND(c.compromisos_pagado + c.suplidores_pagado, 2),
        'total_pct',             CASE WHEN (c.compromisos_debia + c.suplidores_debia) > 0
                                      THEN ROUND((c.compromisos_pagado + c.suplidores_pagado) * 100
                                                 / (c.compromisos_debia + c.suplidores_debia), 1)
                                      ELSE NULL END
      ) FROM vencidas v, cumplimiento c
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
        'facturacion_necesaria',
          CASE WHEN v_margen IS NULL
               THEN ROUND(f.compromisos + f.suplidores + f.gastos, 2)
               ELSE ROUND((f.compromisos + f.suplidores + f.gastos) / v_margen, 2) END
      ) ORDER BY f.mes)
      FROM filas f
    ), '[]'::json),
    'totales', (
      SELECT json_build_object(
        'compromisos',  ROUND(COALESCE(SUM(compromisos), 0), 2),
        'suplidores',   ROUND(COALESCE(SUM(suplidores), 0), 2),
        'gastos',       ROUND(COALESCE(SUM(gastos), 0), 2),
        'total_cubrir', ROUND(COALESCE(SUM(compromisos + suplidores + gastos), 0), 2),
        'facturacion_necesaria',
          CASE WHEN v_margen IS NULL
               THEN ROUND(COALESCE(SUM(compromisos + suplidores + gastos), 0), 2)
               ELSE ROUND(COALESCE(SUM(compromisos + suplidores + gastos), 0) / v_margen, 2) END
      ) FROM filas
    ),
    'historial_gastos', COALESCE((
      SELECT json_agg(json_build_object(
        'mes',   to_char(h.mes, 'YYYY-MM'),
        'monto', ROUND(h.monto, 2),
        'cant',  h.cant
      ) ORDER BY h.mes)
      FROM hist h
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_gestion_empresarial_ia(int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_gestion_empresarial_ia(int) TO authenticated, service_role;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('gestion_grupo_y_cumplimiento.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) EL GRUPO: quién se suma a quién (sale de config_empresa, no de nombres)
SELECT t.nombre AS empresa, ce.financiamiento_tipo,
       tf.nombre AS su_financiera
FROM public.config_empresa ce
JOIN public.tenants t  ON t.id = ce.tenant_id
LEFT JOIN public.tenants tf ON tf.id = ce.financiera_tenant_id
WHERE ce.financiera_tenant_id IS NOT NULL
   OR COALESCE(ce.financiamiento_tipo,'propio') = 'terceros';
-- esperado: CAMINERO MOTORS → terceros → MotoPréstamos Los Naranjos

-- 2) CUMPLIMIENTO DEL MES en curso (lo que va al recuadro verde)
WITH cuotas AS (
  SELECT COALESCE(co.total_compra,0) t, COALESCE(co.monto_pagado,0) p
  FROM public.compras co
  WHERE co.tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113',
                         '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
    AND co.forma_pago ILIKE '%credito%' AND COALESCE(co.estado,'') <> 'ANULADA'
    AND (co.fecha + COALESCE(co.dias_credito,0))
        BETWEEN date_trunc('month', CURRENT_DATE)::date
            AND (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date
), comp AS (
  SELECT COALESCE(SUM(monto),0) t,
         COALESCE(SUM(monto) FILTER (WHERE fecha_pago IS NOT NULL),0) p
  FROM public.compromisos
  WHERE tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113',
                      '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
    AND fecha BETWEEN date_trunc('month', CURRENT_DATE)::date
                  AND (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date
)
SELECT 'Compromisos' AS concepto, comp.t AS se_debia, comp.p AS pagado,
       ROUND(comp.p*100/NULLIF(comp.t,0),1) AS pct FROM comp
UNION ALL
SELECT 'Suplidores', SUM(t), SUM(p), ROUND(SUM(p)*100/NULLIF(SUM(t),0),1) FROM cuotas;
-- esperado: Compromisos 497,720 / 292,400 / 58.7%
--           Suplidores 14,390,620.78 / 7,222,482.60 / 50.2%

-- 3) MOTOCICLETAS en inventario y su valor al costo
SELECT count(*) AS unidades, COALESCE(SUM(p.costo),0) AS valor_costo
FROM public.productos p
WHERE p.tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113',
                      '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
  AND COALESCE(p.activo,true) AND p.chasis IS NOT NULL AND btrim(p.chasis) <> ''
  AND public.get_stock_actual(p.id) > 0;

-- 4) GASTO DIARIO del grupo (antes solo salía el de una empresa)
SELECT t.nombre, ROUND(SUM(g.monto)/90.0, 2) AS por_dia
FROM public.gastos_diarios g JOIN public.tenants t ON t.id = g.tenant_id
WHERE g.tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113',
                      '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
  AND g.fecha >= CURRENT_DATE - 90 AND NOT COALESCE(g.anulado,false)
GROUP BY ROLLUP(t.nombre);
-- esperado: CAMINERO ≈ 92 + MOTOPRÉSTAMOS ≈ 1,059 → total ≈ 1,152/día
