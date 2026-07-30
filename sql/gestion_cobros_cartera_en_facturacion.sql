-- =====================================================================
-- La cartera también entra plata: baja lo que hay que facturar
-- ---------------------------------------------------------------------
-- (2026-07-30) "A la facturación necesaria hay que agregar lo que debería
-- recaudar la cartera de préstamos, ya que son dos empresas en una:
-- Caminero Motors vende motocicletas y MotoPréstamos las financia
-- agregándole una tasa de interés."
--
-- Y es la diferencia entre pedir 92 millones y pedir 52. Las cuotas de la
-- cartera entran COMPLETAS —capital + interés—; no dejan margen porque el
-- margen ya lo dejó la venta de la moto cuando se hizo. Una venta nueva, en
-- cambio, solo deja su 16.27%. Por eso los cobros se restan ANTES de dividir
-- entre el margen:
--
--   total a cubrir 6 meses      15,016,758
--   − cobros de la cartera       6,454,510
--                              ────────────
--   falta cubrir con ventas       8,562,248
--   ÷ margen 16.27%
--                              ────────────
--   hay que facturar             52,626,600   (antes decía 92,313,901)
--
-- Mes por mes, lo que la cartera debe recaudar:
--
--   jul    653,792      oct  1,120,144
--   ago  1,367,615      nov  1,101,257
--   sep  1,258,305      dic    953,398
--
-- >>> QUÉ CUOTAS CUENTAN <<<
-- Las que todavía tienen saldo (capital + interés cobrado menos de lo
-- pactado) de préstamos NO castigados. Son 287 préstamos con 13.87 millones
-- por cobrar — los mismos de la línea "Cartera de préstamos" de la posición.
-- Los castigados quedan fuera: son 227 préstamos y 33.7 millones que
-- justamente se castigaron porque no se espera cobrarlos.
--
-- No se mete lo vencido de antes de este mes (919,298), igual que la tabla
-- tampoco mete las cuotas vencidas a suplidores: la ventana son estos
-- 6 meses.
--
-- Idempotente / re-ejecutable.
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

  IF position('cobros_mes' in v_src) > 0 THEN
    RAISE NOTICE 'Ya estaba aplicado.';
    RETURN;
  END IF;

  -- ---- 1) lo que la cartera debe recaudar cada mes ----
  v_src := replace(v_src,
$viejo$  filas AS (
    SELECT m.mes,$viejo$,
$nuevo$  -- Lo que la cartera debe recaudar en cada mes. Caminero vende la moto y
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
    SELECT m.mes,$nuevo$);

  IF position('cobros_mes AS (' in v_src) = 0 THEN
    RAISE EXCEPTION 'No se pudo insertar cobros_mes — revisar a mano.';
  END IF;

  -- ---- 2) la columna en `filas` ----
  v_src := replace(v_src,
$viejo$      ROUND(v_gasto_d * EXTRACT(day FROM (m.mes + interval '1 month - 1 day'))::numeric, 2) AS gastos
    FROM meses m
    LEFT JOIN compromisos_mes cm ON cm.mes = m.mes
    LEFT JOIN nomina_monto    nm ON nm.mes = m.mes
    LEFT JOIN nomina_dias     nd ON nd.mes = m.mes
    LEFT JOIN suplidores_mes  sm ON sm.mes = m.mes$viejo$,
$nuevo$      ROUND(v_gasto_d * EXTRACT(day FROM (m.mes + interval '1 month - 1 day'))::numeric, 2) AS gastos,
      COALESCE(cb.monto, 0) AS cobros,
      COALESCE(cb.cant, 0)  AS cobros_cant
    FROM meses m
    LEFT JOIN compromisos_mes cm ON cm.mes = m.mes
    LEFT JOIN nomina_monto    nm ON nm.mes = m.mes
    LEFT JOIN nomina_dias     nd ON nd.mes = m.mes
    LEFT JOIN suplidores_mes  sm ON sm.mes = m.mes
    LEFT JOIN cobros_mes      cb ON cb.mes = m.mes$nuevo$);

  IF position('LEFT JOIN cobros_mes      cb' in v_src) = 0 THEN
    RAISE EXCEPTION 'No se pudo agregar cobros a filas — revisar a mano.';
  END IF;

  -- ---- 3) la fila del mes en el JSON ----
  v_src := replace(v_src,
$viejo$        'total_cubrir',     ROUND(f.compromisos + f.suplidores + f.gastos, 2),
        'facturacion_necesaria',
          CASE WHEN v_margen IS NULL THEN ROUND(f.compromisos + f.suplidores + f.gastos, 2)
               ELSE ROUND((f.compromisos + f.suplidores + f.gastos) / v_margen, 2) END$viejo$,
$nuevo$        'total_cubrir',     ROUND(f.compromisos + f.suplidores + f.gastos, 2),
        'cobros',           ROUND(f.cobros, 2),
        'cobros_cant',      f.cobros_cant,
        -- los cobros entran completos; solo lo que sobra hay que venderlo, y
        -- de cada venta queda su margen.
        'facturacion_necesaria',
          CASE WHEN (f.compromisos + f.suplidores + f.gastos - f.cobros) <= 0 THEN 0
               WHEN v_margen IS NULL
                 THEN ROUND(f.compromisos + f.suplidores + f.gastos - f.cobros, 2)
               ELSE ROUND((f.compromisos + f.suplidores + f.gastos - f.cobros) / v_margen, 2) END$nuevo$);

  IF position($q$'cobros',           ROUND(f.cobros, 2)$q$ in v_src) = 0 THEN
    RAISE EXCEPTION 'No se pudo cambiar la facturacion por mes — revisar a mano.';
  END IF;

  -- ---- 4) los totales ----
  v_src := replace(v_src,
$viejo$        'total_cubrir', ROUND(COALESCE(SUM(compromisos + suplidores + gastos), 0), 2),
        'facturacion_necesaria',
          CASE WHEN v_margen IS NULL THEN ROUND(COALESCE(SUM(compromisos + suplidores + gastos), 0), 2)
               ELSE ROUND(COALESCE(SUM(compromisos + suplidores + gastos), 0) / v_margen, 2) END$viejo$,
$nuevo$        'total_cubrir', ROUND(COALESCE(SUM(compromisos + suplidores + gastos), 0), 2),
        'cobros',       ROUND(COALESCE(SUM(cobros), 0), 2),
        'falta_cubrir', ROUND(GREATEST(COALESCE(SUM(compromisos + suplidores + gastos - cobros), 0), 0), 2),
        'facturacion_necesaria',
          CASE WHEN COALESCE(SUM(compromisos + suplidores + gastos - cobros), 0) <= 0 THEN 0
               WHEN v_margen IS NULL
                 THEN ROUND(COALESCE(SUM(compromisos + suplidores + gastos - cobros), 0), 2)
               ELSE ROUND(COALESCE(SUM(compromisos + suplidores + gastos - cobros), 0) / v_margen, 2) END$nuevo$);

  IF position($q$'falta_cubrir'$q$ in v_src) = 0 THEN
    RAISE EXCEPTION 'No se pudieron cambiar los totales — revisar a mano.';
  END IF;

  EXECUTE v_src;
  RAISE NOTICE 'Los cobros de la cartera ya bajan lo que hay que facturar.';
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('gestion_cobros_cartera_en_facturacion.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) LO QUE LA CARTERA DEBE RECAUDAR, MES POR MES
WITH g AS (SELECT ARRAY['b39506c3-27dc-467d-830b-096731b83113'::uuid,
                        '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'::uuid] AS ids),
meses AS (SELECT (date_trunc('month', CURRENT_DATE) + (n || ' month')::interval)::date AS mes
          FROM generate_series(0, 5) n)
SELECT to_char(m.mes, 'YYYY-MM') AS mes,
       COUNT(q.id) AS cuotas,
       COALESCE(SUM(GREATEST(COALESCE(q.capital, 0) + COALESCE(q.interes, 0)
         - COALESCE(q.capital_pagado, 0) - COALESCE(q.interes_pagado, 0), 0)), 0) AS por_cobrar
FROM meses m
CROSS JOIN g
LEFT JOIN public.prestamo_cuotas q
       ON date_trunc('month', q.fecha_vencimiento)::date = m.mes
      AND q.tenant_id = ANY(g.ids)
      AND COALESCE(q.capital, 0) + COALESCE(q.interes, 0)
          > COALESCE(q.capital_pagado, 0) + COALESCE(q.interes_pagado, 0)
      AND EXISTS (SELECT 1 FROM public.prestamos pp
                   WHERE pp.id = q.prestamo_id AND COALESCE(pp.estado, '') <> 'castigado')
GROUP BY m.mes
ORDER BY m.mes;
-- esperado: jul 653,791.95 · ago 1,367,614.97 · sep 1,258,305.30
--           oct 1,120,143.62 · nov 1,101,256.69 · dic 953,397.93
--           TOTAL 6,454,510.46

-- 2) DE DÓNDE SALEN: los préstamos vivos contra los castigados
SELECT CASE WHEN COALESCE(p.estado, '') = 'castigado' THEN 'castigado (fuera)'
            ELSE 'vivo (cuenta)' END AS grupo,
       COUNT(DISTINCT p.id) AS prestamos,
       ROUND(SUM(GREATEST(COALESCE(q.capital, 0) + COALESCE(q.interes, 0)
         - COALESCE(q.capital_pagado, 0) - COALESCE(q.interes_pagado, 0), 0)), 2) AS por_cobrar
FROM public.prestamos p
JOIN public.prestamo_cuotas q ON q.prestamo_id = p.id
WHERE p.tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113',
                      '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
  AND COALESCE(q.capital, 0) + COALESCE(q.interes, 0)
      > COALESCE(q.capital_pagado, 0) + COALESCE(q.interes_pagado, 0)
GROUP BY 1;
-- esperado: vivo 287 préstamos · 13,875,237.52 — la línea "Cartera de
--           préstamos" de la posición. Castigado 227 · 33,746,914.11 (fuera).
