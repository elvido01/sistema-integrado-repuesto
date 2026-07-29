-- =====================================================================
-- GESTIÓN EMPRESARIAL: estado actual arriba, cada mes con lo suyo
-- ---------------------------------------------------------------------
-- (2026-07-28) Pedido: "este módulo se llama Gestión Empresarial, así que
-- hay que poner datos que de verdad nos ayuden a tomar decisiones. En el
-- recuadro verde vamos a poner el ESTADO ACTUAL de la empresa; empezamos
-- con las cuotas vencidas — número — RD$. Las 6 líneas de abajo solo
-- mostrarán los datos de su mes correspondiente."
--
-- >>> LO QUE ESTORBABA <<<
-- El mes en curso se comía TODO lo vencido más lo que vencía hasta el
-- domingo. Julio aparecía con 32 cuotas y RD$3,537,773 — de los cuales
-- 30 cuotas y RD$3,467,621 eran ARRASTRE de meses ya pasados. Mirando esa
-- fila no había forma de saber qué parte era de julio y qué parte era deuda
-- atrasada, que son dos decisiones distintas: una se planifica, la otra se
-- resuelve YA.
--
-- >>> COMO QUEDA <<<
--   * ESTADO ACTUAL (arriba): cuotas vencidas, número y monto. Es deuda
--     exigible hoy, no proyección.
--   * MES POR MES: cada fila trae únicamente lo que vence DENTRO de ese mes.
--     Julio pasa de 3,537,773 (32 cuotas) a 70,152 (2 cuotas), que es lo que
--     de verdad queda por pagar de aquí a fin de mes.
--
-- Los totales de 6 meses bajan en consecuencia: ya no incluyen el atraso,
-- que se lee aparte y no se confunde con el plan.
--
-- Idempotente / re-ejecutable. Continúa proyeccion_nomina_real_por_mes.sql.
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
  v_corte    date;
  v_n        int  := GREATEST(COALESCE(p_meses, 6), 1);
  v_dealer     uuid;
  v_dealer_nom text;
  v_gasto_d  numeric := 0;
  v_margen   numeric;
  v_ventas   numeric := 0;
  v_costo    numeric := 0;
  v_result   json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;

  -- Domingo de la semana en curso (semana lunes→domingo, como el tablero)
  v_corte := GREATEST(
    (v_mes_ini + interval '1 month - 1 day')::date,
    (v_hoy + (7 - EXTRACT(isodow FROM v_hoy)::int))
  );

  -- ¿Esta empresa es la financiera de algún dealer? (relación configurada)
  SELECT ce.tenant_id, ce.nombre
    INTO v_dealer, v_dealer_nom
  FROM public.config_empresa ce
  WHERE ce.financiera_tenant_id = v_tenant
    AND COALESCE(ce.financiamiento_tipo, 'propio') = 'terceros'
  LIMIT 1;

  -- Gasto operativo promedio por día (real, últimos 90 días)
  SELECT COALESCE(SUM(monto), 0) / 90.0 INTO v_gasto_d
  FROM public.gastos_diarios
  WHERE tenant_id = v_tenant
    AND fecha >= (v_hoy - 90) AND fecha <= v_hoy
    AND COALESCE(anulado, false) = false;

  -- Margen bruto de los últimos 90 días: (venta - costo) / venta
  SELECT COALESCE(SUM(d.importe), 0),
         COALESCE(SUM(COALESCE(d.costo_unitario, 0) * d.cantidad), 0)
    INTO v_ventas, v_costo
  FROM public.facturas f
  JOIN public.facturas_detalle d ON d.factura_id = f.id
  WHERE f.tenant_id = v_tenant
    AND f.fecha >= (v_hoy - 90)
    AND COALESCE(f.estado, '') <> 'ANULADA';
  v_margen := CASE WHEN v_ventas > 0 AND v_costo > 0 AND v_costo < v_ventas
                   THEN (v_ventas - v_costo) / v_ventas
                   ELSE NULL END;

  WITH meses AS (
    SELECT (v_mes_ini + (n || ' month')::interval)::date AS mes
    FROM generate_series(0, v_n - 1) n
  ),
  comp_activos AS (  -- compromisos aún por pagar
    SELECT c.monto,
           date_trunc('month', c.fecha)::date AS mes_origen,
           -- RECURRENTE = carga fija que se repite mes a mes, sin importar la
           -- frecuencia.
           COALESCE(c.recurrente, false) AS repite
    FROM public.compromisos c
    WHERE c.tenant_id = v_tenant
      AND COALESCE(c.activo, true) = true          -- activo = aún por pagar
      -- La NÓMINA no entra por aquí: se calcula abajo, mes por mes. Contarla
      -- por filas dependía de cuántas nóminas estuvieran generadas y de la
      -- bandera 'recurrente' de cada una, y con el semanal eso nunca cuadra
      -- (un mes tiene 4 sábados y otro 5).
      --
      -- Se reconoce por el VÍNCULO (nominas.compromiso_id), no por el 'tipo':
      -- el tipo es una columna que se edita desde el tablero y de hecho ya
      -- estaba pisada — de 7 compromisos de nómina, 2 decían 'nomina', 1
      -- 'Fijo' y 4 estaban en blanco. Filtrar por tipo dejaba 5 colándose y
      -- se contaban DOS VECES (una por fila y otra en el cálculo): 154,000
      -- de más al mes.
      AND NOT EXISTS (SELECT 1 FROM public.nominas n WHERE n.compromiso_id = c.id)
      AND COALESCE(c.tipo, '') <> 'nomina'
  ),
  compromisos_mes AS (
    -- Los recurrentes se proyectan a todos los meses de la ventana; los que
    -- no se repiten (pagos únicos) solo caen en su mes.
    SELECT m.mes,
           COALESCE(SUM(ca.monto), 0) AS monto,
           COUNT(ca.monto)            AS cant
    FROM meses m
    LEFT JOIN comp_activos ca
      ON (ca.repite AND m.mes >= LEAST(ca.mes_origen, v_mes_ini))
      OR (NOT ca.repite AND m.mes = ca.mes_origen)
    GROUP BY m.mes
  ),
  emp AS (  -- lo que cuesta cada empleado AL MES, ya neto
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
    WHERE e.tenant_id = v_tenant AND e.activo = true
  ),
  nomina_monto AS (
    -- Lo que cuesta la nómina de CADA mes, calculado — no contado.
    --   mensual   → su sueldo
    --   quincenal → su sueldo (las 2 quincenas juntas)
    --   semanal   → sueldo/4 × los sábados que tenga ESE mes
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
    -- CUÁNTOS PAGOS: son DÍAS DE PAGO, no empleados. La nómina quincenal
    -- sale de la caja 2 veces al mes tenga 7 empleados o tenga 70; contar uno
    -- por empleado daba 14 pagos donde hay 2. Se cuentan los días en que de
    -- verdad hay que sacar dinero, que es lo que se ve en Compromisos a
    -- Pagar: una línea por día de pago.
    SELECT m.mes, count(*) AS cant
    FROM meses m
    CROSS JOIN LATERAL generate_series(
           m.mes::timestamp,
           (m.mes + interval '1 month - 1 day')::timestamp,
           interval '1 day') d
    WHERE EXISTS (
      SELECT 1 FROM emp e
      WHERE (e.frecuencia_pago = 'semanal'
             AND extract(dow FROM d)::int = e.dow)
         OR (e.frecuencia_pago = 'quincenal'
             AND extract(day FROM d)::int IN (
                   15, LEAST(30, extract(day FROM (m.mes + interval '1 month - 1 day'))::int)))
         OR (e.frecuencia_pago = 'mensual'
             AND d::date = (m.mes + interval '1 month - 1 day')::date))
    GROUP BY m.mes
  ),
  cxp AS (  -- cada pagaré pendiente con su fecha de vencimiento.
    SELECT (co.fecha + COALESCE(co.dias_credito, 0))::date AS vence,
           COALESCE(co.monto_pendiente, 0)                 AS monto
    FROM public.compras co
    WHERE co.tenant_id = COALESCE(v_dealer, v_tenant)
      AND co.estado = 'PENDIENTE'
      AND co.forma_pago ILIKE '%credito%'
      AND COALESCE(co.monto_pendiente, 0) > 0
  ),
  vencidas AS (
    -- ESTADO ACTUAL: lo que YA se pasó de fecha. No es proyección, es deuda
    -- exigible hoy, y por eso sale arriba y no dentro de ningún mes.
    SELECT COUNT(*) AS cant, COALESCE(SUM(monto), 0) AS monto
    FROM cxp WHERE vence < v_hoy
  ),
  suplidores_mes AS (
    -- Cada mes muestra SOLO lo suyo. Antes el mes en curso se comía todo lo
    -- vencido más lo que vencía hasta el domingo: julio salía con 32 cuotas y
    -- 3.5 millones, y no había forma de saber cuánto era de julio y cuánto
    -- arrastre de meses viejos. Lo vencido ahora vive en el estado actual.
    SELECT m.mes,
           COALESCE(SUM(x.monto), 0) AS monto,
           COUNT(x.monto)            AS cant
    FROM meses m
    LEFT JOIN cxp x
      ON date_trunc('month', x.vence)::date = m.mes
     AND x.vence >= v_hoy
    GROUP BY m.mes
  ),
  filas AS (
    SELECT
      m.mes,
      COALESCE(cm.monto, 0) + COALESCE(nm.monto, 0) AS compromisos,
      COALESCE(cm.cant, 0)  + COALESCE(nd.cant, 0)  AS compromisos_cant,
      COALESCE(sm.monto, 0) AS suplidores,
      COALESCE(sm.cant, 0)  AS suplidores_cant,
      -- gasto estimado del mes = promedio diario x días de ese mes
      ROUND(v_gasto_d * EXTRACT(day FROM (m.mes + interval '1 month - 1 day'))::numeric, 2) AS gastos
    FROM meses m
    LEFT JOIN compromisos_mes cm ON cm.mes = m.mes
    LEFT JOIN nomina_monto    nm ON nm.mes = m.mes
    LEFT JOIN nomina_dias     nd ON nd.mes = m.mes
    LEFT JOIN suplidores_mes  sm ON sm.mes = m.mes
  ),
  hist AS (  -- gasto REAL de los últimos 6 meses (para el historial)
    SELECT date_trunc('month', g.fecha)::date AS mes,
           SUM(g.monto) AS monto,
           COUNT(*)     AS cant
    FROM public.gastos_diarios g
    WHERE g.tenant_id = v_tenant
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
    -- ESTADO ACTUAL DE LA EMPRESA: la foto de HOY, separada de la proyección.
    'estado_actual', (
      SELECT json_build_object(
        'cuotas_vencidas_cant',  v.cant,
        'cuotas_vencidas_monto', ROUND(v.monto, 2)
      ) FROM vencidas v
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
    PERFORM public.registrar_migracion('gestion_estado_actual.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) EL DATO NUEVO: cuotas vencidas por empresa (número y RD$)
SELECT t.nombre AS empresa,
       count(*) FILTER (WHERE (co.fecha + COALESCE(co.dias_credito,0)) < CURRENT_DATE) AS cuotas_vencidas,
       COALESCE(SUM(co.monto_pendiente) FILTER (
         WHERE (co.fecha + COALESCE(co.dias_credito,0)) < CURRENT_DATE), 0) AS rd_vencido,
       count(*) AS cuotas_pendientes_total
FROM public.compras co
JOIN public.tenants t ON t.id = co.tenant_id
WHERE co.estado = 'PENDIENTE' AND co.forma_pago ILIKE '%credito%'
  AND COALESCE(co.monto_pendiente, 0) > 0
GROUP BY t.nombre
ORDER BY rd_vencido DESC;
-- esperado (CAMINERO MOTORS): 30 cuotas vencidas, RD$3,467,620.93

-- 2) Cada mes con lo SUYO: ninguna cuota vencida debe caer en un mes
SELECT to_char((co.fecha + COALESCE(co.dias_credito,0)), 'YYYY-MM') AS vence_en,
       count(*) AS cuotas, SUM(co.monto_pendiente) AS monto
FROM public.compras co
WHERE co.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND co.estado = 'PENDIENTE' AND co.forma_pago ILIKE '%credito%'
  AND COALESCE(co.monto_pendiente, 0) > 0
  AND (co.fecha + COALESCE(co.dias_credito,0)) >= CURRENT_DATE
GROUP BY 1 ORDER BY 1;
-- esperado: 2026-07 con 2 cuotas (lo que queda de julio), no 32
