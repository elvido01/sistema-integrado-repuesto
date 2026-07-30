-- =====================================================================
-- «Se debía pagar» = el valor INICIAL del mes (la fila de «Mes por mes»)
-- ---------------------------------------------------------------------
-- (2026-07-30) La regla, ahora en la dirección correcta:
--
--   «Mes por mes» manda. Es la meta de cada mes.
--   «Estado actual» toma la meta del mes en curso y mide cuánto se lleva
--   pagado de ella.
--
-- El usuario lo dijo con agosto: cuando llegue agosto, "se debía pagar"
-- tiene que decir 673,964 en compromisos y 2,260,607.71 en suplidores —
-- exactamente lo que hoy muestra la fila de agosto. Entonces en julio tiene
-- que decir lo que decía la fila de julio al empezar el mes.
--
-- >>> LO QUE ESTABA MAL <<<
-- Ayer lo hice al revés: la fila del mes tomaba el número de las filas de
-- `compromisos`. Y ese número SE MUEVE SOLO durante el mes: al pagar
-- DR.ARECHE, la recurrencia lo empuja al 20/08 y julio "debía" 200,000
-- menos. La meta del mes bajaba cada vez que se pagaba algo, así que nunca
-- iba a poder compararse contra lo pagado.
--
-- Ahora los dos paneles salen de la proyección, que no depende de lo que se
-- haya pagado:
--
--   compromisos fijos del mes  503,964   (los 12 recurrentes)
--   nómina de julio            162,000   (2 quincenas + 4 sábados)
--                            ──────────
--   se debía pagar             665,964   ← y lo mismo en la fila de julio
--   pagado                     292,400   (ARECHE 200,000 + AGRICOLA 92,400)
--   falta                      373,564
--
-- Suplidores ya cuadraba desde el script anterior: la tabla muestra lo que
-- vence completo, 2,975,290.78, que es el "se debía pagar" de julio.
--
-- >>> UN RECURRENTE EN MARCHA CUENTA DESDE ESTE MES <<<
-- Nueve de los doce fijos (TSS, PEPE, CRUZ MARIA, TELEFONO...) tienen fecha
-- de agosto: es su PRÓXIMA fecha, no su primera. Son gastos mensuales y en
-- julio también tocaban. Por eso cuentan desde el mes en curso aunque su
-- fecha guardada sea la del mes que viene. Lo que sí se corrige: si la
-- próxima fecha está MÁS ALLÁ del mes que viene, todavía no arrancó y no
-- debe aparecer en los meses anteriores.
--
-- Idempotente / re-ejecutable. Va DESPUÉS de
-- sql/gestion_mes_por_mes_igual_al_estado.sql.
-- =====================================================================

DO $$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_gestion_empresarial_ia'
  LIMIT 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'Falta get_gestion_empresarial_ia — corre antes sql/gestion_posicion_grupo.sql';
  END IF;

  IF position('valor inicial del mes' in v_src) > 0 THEN
    RAISE NOTICE 'Ya estaba aplicado.';
    RETURN;
  END IF;

  -- ---- 1) "se debia pagar" sale de la proyeccion, no de las filas ----
  -- `compromisos_mes`, `nomina_monto` y `nomina_dias` se calculan ANTES que
  -- `cumplimiento` en el mismo WITH, asi que se pueden leer desde aqui.
  v_src := replace(v_src,
$viejo$      (SELECT COALESCE(SUM(c.monto), 0) FROM public.compromisos c
        WHERE c.tenant_id = ANY(v_grupo) AND c.fecha BETWEEN v_mes_ini AND v_mes_fin
          AND NOT EXISTS (SELECT 1 FROM public.nominas nx
                           WHERE nx.compromiso_id = c.id AND nx.estado = 'anulada')) AS compromisos_debia,$viejo$,
$nuevo$      -- valor inicial del mes: la meta, la misma fila de "mes por mes".
      -- No se cuenta de las filas de `compromisos` porque ese numero se
      -- mueve solo: al pagar uno, la recurrencia lo empuja al mes que viene
      -- y la meta bajaria sola en medio del mes.
      ((SELECT COALESCE(SUM(cm.monto), 0) FROM compromisos_mes cm WHERE cm.mes = v_mes_ini)
       + (SELECT COALESCE(SUM(nm.monto), 0) FROM nomina_monto nm WHERE nm.mes = v_mes_ini)) AS compromisos_debia,$nuevo$);

  IF position('valor inicial del mes' in v_src) = 0 THEN
    RAISE EXCEPTION 'No se pudo cambiar compromisos_debia — corre antes sql/gestion_mes_por_mes_igual_al_estado.sql';
  END IF;

  v_src := replace(v_src,
$viejo$      (SELECT COUNT(*) FROM public.compromisos c
        WHERE c.tenant_id = ANY(v_grupo) AND c.fecha BETWEEN v_mes_ini AND v_mes_fin
          AND NOT EXISTS (SELECT 1 FROM public.nominas nx
                           WHERE nx.compromiso_id = c.id AND nx.estado = 'anulada')) AS compromisos_cant$viejo$,
$nuevo$      ((SELECT COALESCE(SUM(cm.cant), 0) FROM compromisos_mes cm WHERE cm.mes = v_mes_ini)
       + (SELECT COALESCE(SUM(nd.cant), 0) FROM nomina_dias nd WHERE nd.mes = v_mes_ini))::int AS compromisos_cant$nuevo$);

  IF position('nomina_dias nd WHERE nd.mes = v_mes_ini' in v_src) = 0 THEN
    RAISE EXCEPTION 'No se pudo cambiar compromisos_cant — revisar a mano.';
  END IF;

  -- ---- 2) la tabla vuelve a ser una sola formula para todos los meses ----
  v_src := replace(v_src,
$viejo$      -- mes en curso: el "se debia pagar" del cumplimiento, tal cual. La
      -- proyeccion de los fijos no sirve para este mes — mete los que ya
      -- tienen fecha del mes siguiente — y ademas seria otro calculo, que
      -- es justo lo que hacia que los dos paneles no coincidieran.
      CASE WHEN m.mes = v_mes_ini
           THEN (SELECT c.compromisos_debia FROM cumplimiento c)
           ELSE COALESCE(cm.monto, 0) + COALESCE(nm.monto, 0) END AS compromisos,
      CASE WHEN m.mes = v_mes_ini
           THEN (SELECT c.compromisos_cant FROM cumplimiento c)
           ELSE COALESCE(cm.cant, 0) + COALESCE(nd.cant, 0) END AS compromisos_cant,$viejo$,
$nuevo$      -- todos los meses con la misma formula, el actual incluido. Estado
      -- actual lee de aqui su "se debia pagar", asi que no pueden diferir.
      COALESCE(cm.monto, 0) + COALESCE(nm.monto, 0) AS compromisos,
      COALESCE(cm.cant, 0)  + COALESCE(nd.cant, 0)  AS compromisos_cant,$nuevo$);

  IF position('todos los meses con la misma formula' in v_src) = 0 THEN
    RAISE EXCEPTION 'No se pudo devolver la fila del mes a la formula unica — revisar a mano.';
  END IF;

  -- ---- 3) desde cuando cuenta un recurrente ----
  -- Su `fecha` es la PROXIMA, no la primera: al pagarlo la recurrencia lo
  -- mueve al mes que viene. Si esa proxima fecha es de este mes o del que
  -- viene, es un gasto ya en marcha y cuenta desde este mes. Si esta mas
  -- lejos, todavia no arranco y solo cuenta desde su propia fecha.
  v_src := replace(v_src,
    'ON (ca.repite AND m.mes >= GREATEST(ca.mes_origen, v_mes_ini))',
    'ON (ca.repite AND m.mes >= CASE
            WHEN ca.mes_origen <= (v_mes_ini + interval ''1 month'')::date THEN v_mes_ini
            ELSE ca.mes_origen END)');
  v_src := replace(v_src,
    'ON (ca.repite AND m.mes >= LEAST(ca.mes_origen, v_mes_ini))',
    'ON (ca.repite AND m.mes >= CASE
            WHEN ca.mes_origen <= (v_mes_ini + interval ''1 month'')::date THEN v_mes_ini
            ELSE ca.mes_origen END)');

  EXECUTE v_src;
  RAISE NOTICE 'Estado actual ya muestra el valor inicial del mes.';
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('gestion_estado_actual_valor_inicial.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) LA META DEL MES — el mismo número en las dos pantallas
WITH g AS (SELECT ARRAY['b39506c3-27dc-467d-830b-096731b83113'::uuid,
                        '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'::uuid] AS ids),
mes AS (SELECT date_trunc('month', CURRENT_DATE)::date AS ini,
               (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date AS fin),
fijos AS (
  SELECT c.nombre, c.monto
  FROM public.compromisos c CROSS JOIN g CROSS JOIN mes
  WHERE c.tenant_id = ANY(g.ids)
    AND COALESCE(c.activo, true)
    AND COALESCE(c.tipo, '') <> 'nomina'
    AND NOT EXISTS (SELECT 1 FROM public.nominas n WHERE n.compromiso_id = c.id)
    AND ((COALESCE(c.recurrente, false)
          AND date_trunc('month', c.fecha)::date <= (mes.ini + interval '1 month')::date)
      OR (NOT COALESCE(c.recurrente, false)
          AND date_trunc('month', c.fecha)::date = mes.ini))
),
emp AS (
  SELECT e.frecuencia_pago, COALESCE(e.dia_pago_semanal, 6)::smallint AS dow,
         (e.sueldo_mensual
            - CASE WHEN e.cotiza_tss
                   THEN round(LEAST(e.sueldo_mensual, 464460) * 0.0287, 2)
                      + round(LEAST(e.sueldo_mensual, 232230) * 0.0304, 2)
                      + public.nomina_isr_mensual(e.sueldo_mensual
                          - round(LEAST(e.sueldo_mensual, 464460) * 0.0287, 2)
                          - round(LEAST(e.sueldo_mensual, 232230) * 0.0304, 2))
                   ELSE 0 END) AS neto_mes
  FROM public.empleados e CROSS JOIN g
  WHERE e.tenant_id = ANY(g.ids) AND e.activo
),
nomina AS (
  SELECT COALESCE(SUM(CASE WHEN e.frecuencia_pago = 'semanal'
              THEN round(e.neto_mes / 4.0, 2)
                   * public.nomina_pagos_en_periodo(mes.ini, mes.fin, e.dow)
              ELSE e.neto_mes END), 0) AS monto
  FROM emp e CROSS JOIN mes
),
suplidores AS (
  SELECT COUNT(*) AS cuotas,
         COALESCE(SUM(co.total_compra), 0) AS debia,
         COALESCE(SUM(co.monto_pagado), 0) AS pagado
  FROM public.compras co
  LEFT JOIN public.proveedores pv ON pv.id = co.suplidor_id
  CROSS JOIN g CROSS JOIN mes
  WHERE co.tenant_id = ANY(g.ids)
    AND co.forma_pago ILIKE '%credito%'
    AND COALESCE(co.estado, '') <> 'ANULADA'
    AND COALESCE(co.total_compra, 0) > 0
    AND NOT COALESCE(co.es_saldo_inicial, false)
    AND (pv.empresa_grupo_tenant_id IS NULL OR NOT (pv.empresa_grupo_tenant_id = ANY(g.ids)))
    AND (co.fecha + COALESCE(co.dias_credito, 0)) BETWEEN mes.ini AND mes.fin
)
SELECT 'Compromisos' AS concepto,
       (SELECT COALESCE(SUM(monto), 0) FROM fijos) + (SELECT monto FROM nomina) AS se_debia_pagar,
       (SELECT COALESCE(SUM(c.monto), 0) FROM public.compromisos c
         WHERE c.tenant_id = ANY(g.ids)
           AND c.fecha BETWEEN mes.ini AND mes.fin
           AND c.fecha_pago IS NOT NULL) AS pagado
FROM g CROSS JOIN mes
UNION ALL
SELECT 'Suplidores', s.debia, s.pagado FROM suplidores s;
-- esperado: Compromisos  665,964.00 · pagado   292,400.00  (falta   373,564)
--           Suplidores 2,975,290.78 · pagado 1,352,128.00  (falta 1,623,163)
-- Los dos "se debia pagar" son los que van en la fila de julio de «Mes por mes».

-- 2) LOS 12 FIJOS QUE FORMAN LA META, con su próxima fecha
SELECT c.nombre, c.monto, c.fecha AS proxima_fecha,
       CASE WHEN date_trunc('month', c.fecha)::date > date_trunc('month', CURRENT_DATE)::date
            THEN 'fecha del mes que viene: ya se pago el de este mes o toca igual'
            ELSE 'vence este mes' END AS por_que_cuenta
FROM public.compromisos c
WHERE c.tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113',
                      '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
  AND COALESCE(c.activo, true)
  AND COALESCE(c.tipo, '') <> 'nomina'
  AND NOT EXISTS (SELECT 1 FROM public.nominas n WHERE n.compromiso_id = c.id)
ORDER BY c.monto DESC;
-- esperado: 12 fijos, 503,964.00 en total
