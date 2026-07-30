-- =====================================================================
-- INGRESOS DEL MES: con qué se está pagando lo que el mes pide
-- ---------------------------------------------------------------------
-- (2026-07-30) Panel nuevo, encima de «Mes por mes». Arriba se ve cuánto se
-- debe; aquí, la plata que de verdad entró — no lo facturado.
--
--   CAMINERO MOTORS                                 293,500    8.1%
--   ▪ contado 0 · iniciales 293,500 (6) · abonos 0
--
--   MOTOPRÉSTAMOS LOS NARANJOS                    1,188,927   32.6%
--   ▪ 236 recibos de ingreso
--   ─────────────────────────────────────────────────────────────
--   TOTAL 1,482,427   vs   se debía pagar 3,641,255      40.7%
--   faltan 2,158,828 por entrar
--
-- >>> LAS TRES ENTRADAS <<<
--  1. CONTADO — facturas del dealer con forma de pago contado. Una factura
--     de contado NO deja recibo de ingreso (se verificó con las dos que hay),
--     así que no se duplica con lo de abajo.
--  2. INICIALES — el abono al momento de la venta de las financiadas. Son
--     los recibos con "momento de la venta" en el concepto.
--  3. RECIBOS DE LA FINANCIERA — las cuotas que cobró MotoPréstamos.
--
-- Los abonos posteriores a facturas a crédito del dealer también entran (van
-- en su propio segmento): es plata que entró a la caja. En julio son cero
-- porque los 6 recibos del mes son todos iniciales.
--
-- >>> QUIÉN ES QUIÉN <<<
-- No se detecta por nombre. `v_dealer` sale de config_empresa por el enlace
-- financiera_tenant_id, igual que el resto del panel. Si el grupo fuera una
-- sola empresa, los recibos no se cuentan dos veces: se pone 0 en la barra
-- de la financiera.
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

  IF position('ingresos_mes' in v_src) > 0 THEN
    RAISE NOTICE 'Ya estaba aplicado.';
    RETURN;
  END IF;

  -- ---- 1) las variables ----
  v_src := replace(v_src,
$viejo$  v_ventas_mes  numeric := 0;$viejo$,
$nuevo$  v_ventas_mes  numeric := 0;
  -- INGRESOS DEL MES: lo que entro a la caja, por empresa.
  v_dealer_id   uuid;
  v_fin_id      uuid;
  v_contado     numeric := 0;   v_contado_n   int := 0;
  v_iniciales   numeric := 0;   v_iniciales_n int := 0;
  v_abonos      numeric := 0;   v_abonos_n    int := 0;
  v_recibos     numeric := 0;   v_recibos_n   int := 0;$nuevo$);

  IF position('v_dealer_id   uuid;' in v_src) = 0 THEN
    RAISE EXCEPTION 'No se pudieron declarar las variables de ingresos — revisar a mano.';
  END IF;

  -- ---- 2) el calculo, antes del WITH ----
  v_src := replace(v_src,
$viejo$  WITH meses AS ($viejo$,
$nuevo$  -- ---- INGRESOS DEL MES ----
  -- El dealer vende (contado, y la inicial de las financiadas) y la
  -- financiera cobra las cuotas. Quien es quien sale del enlace de
  -- config_empresa, nunca del nombre.
  v_dealer_id := COALESCE(v_dealer, v_tenant);
  v_fin_id    := COALESCE(v_financiera, v_tenant);

  SELECT COUNT(*), COALESCE(SUM(fa.total), 0) INTO v_contado_n, v_contado
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

  WITH meses AS ($nuevo$);

  IF position('---- INGRESOS DEL MES ----' in v_src) = 0 THEN
    RAISE EXCEPTION 'No se pudo insertar el calculo de ingresos — revisar a mano.';
  END IF;

  -- ---- 3) el bloque en el JSON ----
  v_src := replace(v_src,
$viejo$    'ventas_mes',      ROUND(v_ventas_mes, 2),$viejo$,
$nuevo$    'ventas_mes',      ROUND(v_ventas_mes, 2),

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
    ),$nuevo$);

  IF position($q$'ingresos_mes', ($q$ in v_src) = 0 THEN
    RAISE EXCEPTION 'No se pudo agregar ingresos_mes al JSON — revisar a mano.';
  END IF;

  EXECUTE v_src;
  RAISE NOTICE 'Ingresos del mes listos.';
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('gestion_ingresos_del_mes.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) LAS TRES BARRAS
WITH mes AS (SELECT date_trunc('month', CURRENT_DATE)::date AS ini,
                    (date_trunc('month', CURRENT_DATE) + interval '1 month')::date AS fin),
cam AS (SELECT 'b39506c3-27dc-467d-830b-096731b83113'::uuid AS id),
mp  AS (SELECT '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'::uuid AS id)
SELECT 'CAMINERO · contado' AS concepto, COUNT(*) AS cant,
       COALESCE(SUM(fa.total), 0) AS monto
FROM public.facturas fa CROSS JOIN cam CROSS JOIN mes
WHERE fa.tenant_id = cam.id AND fa.fecha >= mes.ini AND fa.fecha < mes.fin
  AND fa.forma_pago ILIKE '%contado%' AND COALESCE(fa.estado, '') <> 'ANULADA'
UNION ALL
SELECT 'CAMINERO · iniciales', COUNT(*), COALESCE(SUM(ri.monto_pagado), 0)
FROM public.recibos_ingreso ri CROSS JOIN cam CROSS JOIN mes
WHERE ri.tenant_id = cam.id AND ri.fecha >= mes.ini AND ri.fecha < mes.fin
  AND NOT COALESCE(ri.anulado, false) AND ri.concepto ILIKE '%momento de la venta%'
UNION ALL
SELECT 'CAMINERO · abonos', COUNT(*), COALESCE(SUM(ri.monto_pagado), 0)
FROM public.recibos_ingreso ri CROSS JOIN cam CROSS JOIN mes
WHERE ri.tenant_id = cam.id AND ri.fecha >= mes.ini AND ri.fecha < mes.fin
  AND NOT COALESCE(ri.anulado, false) AND COALESCE(ri.concepto, '') NOT ILIKE '%momento de la venta%'
UNION ALL
SELECT 'MOTOPRESTAMOS · recibos', COUNT(*), COALESCE(SUM(ri.monto_pagado), 0)
FROM public.recibos_ingreso ri CROSS JOIN mp CROSS JOIN mes
WHERE ri.tenant_id = mp.id AND ri.fecha >= mes.ini AND ri.fecha < mes.fin
  AND NOT COALESCE(ri.anulado, false);
-- esperado: contado 0 · iniciales 6 = 293,500 · abonos 0
--           recibos 236 = 1,188,926.94  →  TOTAL 1,482,426.94
--           contra "se debía pagar" 3,641,254.78 = 40.7%

-- 2) OJO: 3 recibos duplicados por el sync del SiiF
-- Mismo número, cliente, monto y fecha, uno con origen='sync' y otro sin él.
SELECT numero, fecha, monto_pagado, origen, cliente_id
FROM public.recibos_ingreso
WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND regexp_replace(numero, '[^0-9]', '', 'g')::bigint IN (147492, 147493, 147494)
ORDER BY 1;
-- esperado: 6 filas (3 pares). Son RD$4,100 de mas sobre 1.19 millones.
-- Es del importador, no del panel: se arregla aparte.
