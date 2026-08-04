-- =====================================================================
-- Una cuenta por pagar por MES, no una por cuota diaria
-- ---------------------------------------------------------------------
-- (2026-08-03) "Un préstamo diario de 365 cuotas crea 365 cuentas por pagar
-- de RD$300 por una sola moto." — "si agrúpala".
--
-- El módulo parte la deuda con el dealer en una CxP por cuota, para poder
-- pagarle a medida que el cliente paga. Con 12 o 24 cuotas eso se lee bien.
-- Con 365 la pantalla de Cuentas por Pagar queda inservible: 365 renglones
-- de 300 pesos, todos iguales, por una sola motocicleta. Y la moto de al
-- lado empuja otros 365.
--
-- >>> LA REGLA <<<
-- Cuando el préstamo cobra más seguido que quincenal —diario o semanal— las
-- cuotas se juntan POR MES en una sola CxP:
--
--   antes:  FIN-000011-001 … -365        365 renglones de 300.00
--   ahora:  FIN-000011-M202608 … -M202708  13 renglones (uno por mes)
--
-- Mensual y quincenal NO cambian: ahí una CxP por cuota ya es una por mes o
-- por quincena, que es como se le paga al dealer.
--
-- >>> EL NÚMERO LLEVA EL MES, NO UN CONTADOR <<<
-- La primera versión numeraba -01, -02... con un contador, y el reagrupado
-- reventó con "duplicate key ... FIN-000011-M10 already exists": basta que
-- el contador arranque dos veces sobre el mismo financiamiento para que
-- choque. El mes no se repite dentro de un préstamo, así que el número sale
-- solo, no depende del orden y se puede volver a correr sin miedo.
--
-- >>> POR QUÉ VENCE CON LA ÚLTIMA <<<
-- El vencimiento del bloque es el de la ÚLTIMA cuota del mes, no la primera:
-- la financiera le paga al dealer con lo que cobró, así que no puede deberle
-- el mes completo antes de haberlo cobrado completo.
--
-- El monto no cambia: la suma de las cuotas del mes es la misma plata.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) LA REGLA, EN EL RPC
-- ------------------------------------------------------------
DO $$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'procesar_financiamiento_terceros'
  LIMIT 1;

  IF v_src IS NULL THEN RAISE EXCEPTION 'No existe procesar_financiamiento_terceros'; END IF;

  -- ---- PASO A: agrupar las cuotas por mes ----
  IF position('v_agrupa_mes' in v_src) = 0 THEN

    v_src := replace(v_src,
      '  v_cuota_m       numeric;',
      '  v_cuota_m       numeric;' || E'\n' ||
      '  v_agrupa_mes    boolean;');

    v_src := replace(v_src,
      '  v_plazo  := GREATEST(COALESCE(sol.tiempo_meses, 1), 1);',
      '  v_plazo  := GREATEST(COALESCE(sol.tiempo_meses, 1), 1);' || E'\n' ||
      '  -- Diario y semanal generan decenas o cientos de cuotas: sus CxP se' || E'\n' ||
      '  -- juntan por mes. Mensual y quincenal se quedan una por cuota.' || E'\n' ||
      '  v_agrupa_mes := COALESCE(sol.frecuencia, ''mensual'') IN (''diario'', ''semanal'');');

    v_src := replace(v_src,
$viejo$  FOR cq IN
    SELECT numero_cuota, fecha_vencimiento, capital
    FROM public.prestamo_cuotas
    WHERE prestamo_id = v_prestamo_id
    ORDER BY numero_cuota
  LOOP
    INSERT INTO public.compras ($viejo$,
$nuevo$  FOR cq IN
    SELECT MIN(q.numero_cuota) AS desde,
           MAX(q.numero_cuota) AS hasta,
           -- vence con la ULTIMA del mes: no se le debe al dealer un mes que
           -- todavia no se ha terminado de cobrar.
           MAX(q.fecha_vencimiento) AS fecha_vencimiento,
           SUM(q.capital) AS capital
    FROM public.prestamo_cuotas q
    WHERE q.prestamo_id = v_prestamo_id
    GROUP BY CASE WHEN v_agrupa_mes THEN to_char(q.fecha_vencimiento, 'YYYY-MM')
                  ELSE lpad(q.numero_cuota::text, 8, '0') END
    ORDER BY MIN(q.numero_cuota)
  LOOP
    v_lineas := v_lineas + 1;
    INSERT INTO public.compras ($nuevo$);

    -- cq.numero_cuota ya no existe: la descripcion pasa a hablar del rango.
    v_src := replace(v_src,
$viejo$      'Financiamiento factura #' || fac.numero || ' - comprador ' || buyer_nombre
        || ' | cuota ' || cq.numero_cuota || '/' || v_plazo,$viejo$,
$nuevo$      'Financiamiento factura #' || fac.numero || ' - comprador ' || buyer_nombre
        || CASE WHEN cq.desde = cq.hasta
                THEN ' | cuota ' || cq.desde || '/' || v_plazo
                ELSE ' | cuotas ' || cq.desde || '-' || cq.hasta || '/' || v_plazo
                     || ' (' || to_char(cq.fecha_vencimiento, 'MM/YYYY') || ')' END,$nuevo$);

    v_src := replace(v_src,
$viejo$      'PENDIENTE', false, false
    );
    v_lineas := v_lineas + 1;
  END LOOP;$viejo$,
$nuevo$      'PENDIENTE', false, false
    );
  END LOOP;$nuevo$);

  END IF;

  -- ---- PASO B: el numero lleva el mes ----
  -- Se contempla la version original (numero de cuota) y la primera version
  -- agrupada (contador v_lineas), para poder aplicarlo venga de donde venga.
  IF position('''-M'' || to_char(cq.fecha_vencimiento' in v_src) = 0 THEN
    v_src := replace(v_src,
      '      v_fin, v_compra_num || ''-'' || lpad(cq.numero_cuota::text, GREATEST(2, length(v_plazo::text)), ''0''), current_date, v_prov,',
      '      v_fin, v_compra_num || CASE WHEN v_agrupa_mes' || E'\n' ||
      '        THEN ''-M'' || to_char(cq.fecha_vencimiento, ''YYYYMM'')' || E'\n' ||
      '        ELSE ''-'' || lpad(cq.desde::text, GREATEST(2, length(v_plazo::text)), ''0'') END, current_date, v_prov,');

    v_src := replace(v_src,
      '      v_fin, v_compra_num || ''-'' || lpad(v_lineas::text, GREATEST(2, length(v_plazo::text)), ''0''), current_date, v_prov,',
      '      v_fin, v_compra_num || CASE WHEN v_agrupa_mes' || E'\n' ||
      '        THEN ''-M'' || to_char(cq.fecha_vencimiento, ''YYYYMM'')' || E'\n' ||
      '        ELSE ''-'' || lpad(cq.desde::text, GREATEST(2, length(v_plazo::text)), ''0'') END, current_date, v_prov,');
  END IF;

  IF position('v_agrupa_mes' in v_src) = 0
     OR position('cq.desde = cq.hasta' in v_src) = 0
     OR position('''-M'' || to_char(cq.fecha_vencimiento' in v_src) = 0 THEN
    RAISE EXCEPTION 'No se pudo aplicar la agrupacion — revisar a mano.';
  END IF;

  EXECUTE v_src;
  RAISE NOTICE 'Listo: diario y semanal generan una CxP por mes, numerada con el mes.';
END $$;

-- ------------------------------------------------------------
-- 2) AGRUPAR LAS QUE YA ESTÁN SUELTAS
-- ------------------------------------------------------------
-- Solo las que NO tienen ningún pago: una CxP ya abonada no se toca, porque
-- el abono quedaría huérfano. Hoy esto alcanza a FT-23 y sus 365 renglones.
--
-- El número sale del mes, así que dos pasadas no chocan; y por si acaso,
-- ON CONFLICT DO NOTHING.
DO $$
DECLARE
  g   record;
  v_n int;
BEGIN
  FOR g IN
    SELECT DISTINCT c.tenant_id,
           substring(c.numero from '^(FIN-\d+)') AS pref
    FROM public.compras c
    WHERE c.numero ~ '^FIN-\d+-\d+$'
      AND COALESCE(c.monto_pagado, 0) = 0
      AND COALESCE(c.estado, '') = 'PENDIENTE'
    GROUP BY c.tenant_id, substring(c.numero from '^(FIN-\d+)')
    HAVING COUNT(*) > 24
  LOOP
    INSERT INTO public.compras (
      tenant_id, numero, fecha, suplidor_id, referencia,
      total_exento, total_gravado, itbis_total, total_compra,
      forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, itbis_incluido, actualizar_precios
    )
    SELECT g.tenant_id,
           g.pref || '-M' || to_char(x.vence, 'YYYYMM'),
           x.fecha,
           x.prov,
           x.base || ' | cuotas ' || x.desde || '-' || x.hasta
                  || ' (' || to_char(x.vence, 'MM/YYYY') || ')',
           x.monto, 0, 0, x.monto,
           'CREDITO', GREATEST(0, x.vence - x.fecha), 0, x.monto,
           'PENDIENTE', false, false
    FROM (
      SELECT MIN(c.fecha) AS fecha,
             (array_agg(c.suplidor_id ORDER BY c.numero))[1] AS prov,
             split_part(MIN(c.referencia), ' | cuota', 1) AS base,
             MIN((substring(c.numero from '-(\d+)$'))::int) AS desde,
             MAX((substring(c.numero from '-(\d+)$'))::int) AS hasta,
             MAX(c.fecha + c.dias_credito) AS vence,
             SUM(c.total_compra) AS monto
      FROM public.compras c
      WHERE c.tenant_id = g.tenant_id
        AND c.numero ~ ('^' || g.pref || '-\d+$')
        AND COALESCE(c.monto_pagado, 0) = 0
      GROUP BY to_char(c.fecha + c.dias_credito, 'YYYY-MM')
    ) x
    ON CONFLICT (tenant_id, numero) DO NOTHING;

    GET DIAGNOSTICS v_n = ROW_COUNT;

    DELETE FROM public.compras c
    WHERE c.tenant_id = g.tenant_id
      AND c.numero ~ ('^' || g.pref || '-\d+$')
      AND COALESCE(c.monto_pagado, 0) = 0;

    RAISE NOTICE '%: agrupado en % meses', g.pref, v_n;
  END LOOP;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('cxp_financiamiento_agrupado_por_mes.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) FT-23: DE 365 RENGLONES A 13
SELECT numero, (fecha + dias_credito) AS vence, total_compra, referencia
FROM public.compras
WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND referencia LIKE '%factura #23%'
ORDER BY numero;
-- esperado: FIN-000011-M202608 … -M202708, uno por mes, ninguno con -001.

-- 2) LA PLATA ES LA MISMA
SELECT SUM(total_compra) AS total_cxp, COUNT(*) AS renglones
FROM public.compras
WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND referencia LIKE '%factura #23%';
-- esperado: 78,100.00 en 13 renglones — el capital del préstamo, ni un peso más.

-- 3) CUÁNTAS CxP TIENE CADA FINANCIAMIENTO
SELECT substring(numero from '^(FIN-\d+)') AS financiamiento, COUNT(*) AS renglones
FROM public.compras
WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4' AND numero LIKE 'FIN-%'
GROUP BY 1 ORDER BY 1;
-- esperado: FIN-000001..000010 como estaban (12, 19, 2, 24, 15, 13, 1, 18, 24, 12)
--           y FIN-000011 en 13.
