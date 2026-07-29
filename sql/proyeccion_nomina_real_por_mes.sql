-- =====================================================================
-- PROYECCIÓN: la nómina de cada mes se CALCULA, no se cuenta por filas
-- ---------------------------------------------------------------------
-- (2026-07-28) Reportado: "¿por qué agosto tiene 19 pagos vs 17 de
-- septiembre si la única diferencia es 1 sábado más que tiene agosto?"
--
-- Tenía toda la razón en desconfiar: la diferencia debía ser 1 pago de
-- 8,000, y salían 2 pagos de 16,000.
--
-- >>> LA CAUSA <<<
-- get_gestion_empresarial_ia proyectaba los compromisos con un interruptor:
--   recurrente = true  → se repite TODOS los meses
--   recurrente = false → solo cae en SU mes
--
-- De los 5 compromisos de nómina semanal, 3 quedaron marcados recurrentes y
-- 2 no. Resultado: los 3 se repetían en todos los meses (24,000 fijos) y los
-- 2 restantes solo aparecían en agosto — de ahí los "2 pagos de más".
--
-- >>> POR QUÉ EL INTERRUPTOR NO SIRVE PARA LA NÓMINA SEMANAL <<<
-- Ninguna de las dos posiciones da el número correcto:
--   todos recurrentes  → 5 × 8,000 = 40,000 TODOS los meses, y sobran 8,000
--                        en los meses de 4 sábados;
--   ninguno recurrente → agosto 40,000 y septiembre en adelante CERO
--                        nómina semanal, como si nadie cobrara.
-- El costo real depende de cuántos sábados tenga cada mes. Eso no es un
-- interruptor, es una cuenta.
--
-- >>> LA SOLUCIÓN <<<
-- La nómina sale del cálculo de los EMPLEADOS ACTIVOS, mes por mes, y deja
-- de contarse desde la tabla de compromisos:
--   mensual    → su sueldo, 1 pago
--   quincenal  → su sueldo (las 2 quincenas), 2 pagos
--   semanal    → sueldo/4 × SÁBADOS DE ESE MES, 4 o 5 pagos
--
-- Así el número se corrige solo: no depende de cuántas nóminas estén
-- generadas, ni de banderitas, ni de que alguien acuerde marcarlas. Se
-- descuentan TSS/ISR igual que en el módulo de Nómina, para proyectar el
-- neto que de verdad sale.
--
-- Con los datos de hoy:
--   fijos (12 compromisos)          503,964
--   quincenal (2 pagos)             130,000
--   semanal 4 sábados                32,000  → jul/sep/oct/nov  665,964
--   semanal 5 sábados                40,000  → agosto           673,964
-- Agosto queda 8,000 por encima: UN sábado, como usted esperaba.
--
-- Idempotente / re-ejecutable. Requiere nomina_semanal_por_sabado.sql
-- (usa nomina_pagos_en_periodo).
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
  nomina_mes AS (
    -- El costo de la nómina de CADA mes, calculado — no contado.
    --   mensual   → su sueldo, 1 pago
    --   quincenal → su sueldo (las 2 quincenas juntas), 2 pagos
    --   semanal   → sueldo/4 × los sábados que tenga ESE mes
    SELECT m.mes,
           COALESCE(SUM(
             CASE WHEN e.frecuencia_pago = 'semanal'
                  THEN round(e.neto_mes / 4.0, 2)
                       * public.nomina_pagos_en_periodo(
                           m.mes, (m.mes + interval '1 month - 1 day')::date, e.dow)
                  ELSE e.neto_mes END), 0) AS monto,
           COALESCE(SUM(
             CASE e.frecuencia_pago
               WHEN 'semanal'   THEN public.nomina_pagos_en_periodo(
                                       m.mes, (m.mes + interval '1 month - 1 day')::date, e.dow)
               WHEN 'quincenal' THEN 2
               ELSE 1 END), 0) AS cant
    FROM meses m
    LEFT JOIN emp e ON true
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
  suplidores_mes AS (
    SELECT m.mes,
           COALESCE(SUM(x.monto), 0) AS monto,
           COUNT(x.monto)            AS cant
    FROM meses m
    LEFT JOIN cxp x
      ON (m.mes = v_mes_ini AND x.vence <= v_corte)
      OR (m.mes > v_mes_ini AND date_trunc('month', x.vence)::date = m.mes
          AND x.vence > v_corte)
    GROUP BY m.mes
  ),
  filas AS (
    SELECT
      m.mes,
      COALESCE(cm.monto, 0) + COALESCE(nm.monto, 0) AS compromisos,
      COALESCE(cm.cant, 0)  + COALESCE(nm.cant, 0)  AS compromisos_cant,
      COALESCE(sm.monto, 0) AS suplidores,
      COALESCE(sm.cant, 0)  AS suplidores_cant,
      -- gasto estimado del mes = promedio diario x días de ese mes
      ROUND(v_gasto_d * EXTRACT(day FROM (m.mes + interval '1 month - 1 day'))::numeric, 2) AS gastos
    FROM meses m
    LEFT JOIN compromisos_mes cm ON cm.mes = m.mes
    LEFT JOIN nomina_mes      nm ON nm.mes = m.mes
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

-- ------------------------------------------------------------
-- Dejar las banderas de la nómina en orden
-- ------------------------------------------------------------
-- Ya no cambian el resultado (la nómina se calcula), pero un compromiso de
-- nómina marcado "recurrente" hace que al pagarlo el dashboard cree OTRO
-- por su cuenta, encima del que crea el módulo de nómina: el mismo sueldo
-- dos veces. La recurrencia de la nómina la maneja su ventana rodante.
UPDATE public.compromisos
   SET recurrente = false
 WHERE tipo = 'nomina' AND COALESCE(recurrente, false) = true;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('proyeccion_nomina_real_por_mes.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) LA PREGUNTA: agosto debe tener UN pago más que septiembre, de 8,000
--    OJO: no se llama al RPC aquí. get_gestion_empresarial_ia usa
--    get_user_tenant(), y en el editor SQL no hay sesión → "No se pudo
--    determinar el tenant". Esta consulta hace la misma cuenta por empresa.
WITH meses AS (
  SELECT (date_trunc('month', CURRENT_DATE) + (n || ' month')::interval)::date AS mes
  FROM generate_series(0, 5) n
),
comp AS (   -- los compromisos fijos (sin nómina), como los proyecta la función
  SELECT c.tenant_id, count(*) AS cant, sum(c.monto) AS monto
  FROM public.compromisos c
  WHERE COALESCE(c.activo, true) AND COALESCE(c.recurrente, false)
    AND COALESCE(c.tipo, '') <> 'nomina'
  GROUP BY 1
)
SELECT t.nombre AS empresa, to_char(m.mes, 'MM/YYYY') AS mes,
       COALESCE(c.cant, 0) + SUM(
         CASE e.frecuencia_pago
           WHEN 'semanal'   THEN public.nomina_pagos_en_periodo(
                                   m.mes, (m.mes + interval '1 month - 1 day')::date,
                                   COALESCE(e.dia_pago_semanal, 6)::smallint)
           WHEN 'quincenal' THEN 2 ELSE 1 END) AS pagos,
       COALESCE(c.monto, 0) + SUM(
         CASE WHEN e.frecuencia_pago = 'semanal'
              THEN round(e.sueldo_mensual / 4.0, 2)
                   * public.nomina_pagos_en_periodo(
                       m.mes, (m.mes + interval '1 month - 1 day')::date,
                       COALESCE(e.dia_pago_semanal, 6)::smallint)
              ELSE e.sueldo_mensual END) AS compromisos
FROM public.empleados e
JOIN public.tenants t ON t.id = e.tenant_id
CROSS JOIN meses m
LEFT JOIN comp c ON c.tenant_id = e.tenant_id
WHERE e.activo
GROUP BY t.nombre, m.mes, c.cant, c.monto
ORDER BY t.nombre, m.mes;
-- esperado (Motoprestamos/Caminero): agosto = septiembre + 1 pago y + 8,000
--   4 sábados → 18 pagos, 665,964  |  5 sábados → 19 pagos, 673,964
-- (esta consulta usa el sueldo bruto; con empleados informales, que es el
--  caso, bruto = neto y da idéntico a la función)

-- 2) De dónde sale: los sábados de cada mes y el costo de la nómina
SELECT to_char(d, 'MM/YYYY') AS mes,
       public.nomina_pagos_en_periodo(
         d::date, (d + interval '1 month - 1 day')::date, 6::smallint) AS sabados,
       8000 * public.nomina_pagos_en_periodo(
         d::date, (d + interval '1 month - 1 day')::date, 6::smallint) AS nomina_semanal
FROM generate_series(date_trunc('month', CURRENT_DATE),
                     date_trunc('month', CURRENT_DATE) + interval '5 month',
                     interval '1 month') d;

-- 3) Ningún compromiso de nómina quedó marcado recurrente
SELECT count(*) AS nomina_recurrentes_pendientes
FROM public.compromisos WHERE tipo = 'nomina' AND recurrente = true;
-- esperado: 0
