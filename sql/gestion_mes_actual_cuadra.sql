-- =====================================================================
-- El MES EN CURSO de la tabla = el FALTA del cumplimiento
-- ---------------------------------------------------------------------
-- (2026-07-29) "Estos números deben ser iguales según la lógica."
--
-- En SUPLIDORES ya lo eran, aunque no se notara:
--   se debía 2,975,291 − pagado 1,352,128 = FALTA 1,623,163
--   fila de julio en la tabla ............. 1,623,162.78   ✓
--
-- En COMPROMISOS no:
--   se debía 497,720 − pagado 292,400 = FALTA 205,320
--   fila de julio en la tabla .......... 665,964   ✗
--
-- >>> POR QUÉ <<<
-- La tabla proyecta los 12 compromisos fijos activos en TODOS los meses,
-- incluido el actual. Pero de esos 12, once ya tienen fecha de AGOSTO: los
-- de julio se pagaron y la recurrencia los movió al mes siguiente. En julio
-- solo queda vencido de verdad LUZ MOTOPRESTAMO (10,320) y una nómina.
--
--   20/07  PRESTAMO DR.ARECHE   200,000  PAGADO   →  su gemelo vence 20/08
--   22/07  PRESTAMO AGRICOLA     92,400  PAGADO   →  su gemelo vence 22/08
--   30/07  LUZ MOTOPRESTAMO      10,320  activo   ←  esto sí es de julio
--
-- Proyectar los de agosto sobre julio hacía que el mes en curso pidiera
-- 665,964 cuando lo que falta de julio son 205,320.
--
-- >>> LA REGLA <<<
-- La tabla dice "lo que falta por cubrir". Para los meses futuros eso es la
-- proyección — nada está pagado todavía. Para el MES EN CURSO es, por
-- definición, lo que el cumplimiento llama FALTA. Así que el mes en curso
-- toma ese número directamente: no puede volver a discrepar porque sale del
-- mismo cálculo.
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

  IF position('mes en curso: lo que FALTA' in v_src) > 0 THEN
    RAISE NOTICE 'El mes en curso ya cuadra con el cumplimiento.';
    RETURN;
  END IF;

  v_src := replace(v_src,
$viejo$      COALESCE(cm.monto, 0) + COALESCE(nm.monto, 0) AS compromisos,
      COALESCE(cm.cant, 0)  + COALESCE(nd.cant, 0)  AS compromisos_cant,$viejo$,
$nuevo$      -- mes en curso: lo que FALTA, el mismo número del cumplimiento de
      -- arriba. Proyectar los fijos aquí los contaba dos veces: once de los
      -- doce ya tienen fecha del mes siguiente porque los de este mes se
      -- pagaron y la recurrencia los movió.
      CASE WHEN m.mes = v_mes_ini
           THEN GREATEST((SELECT c.compromisos_debia - c.compromisos_pagado FROM cumplimiento c), 0)
           ELSE COALESCE(cm.monto, 0) + COALESCE(nm.monto, 0) END AS compromisos,
      CASE WHEN m.mes = v_mes_ini
           THEN (SELECT COUNT(*) FROM public.compromisos c2
                  WHERE c2.tenant_id = ANY(v_grupo)
                    AND c2.fecha BETWEEN v_mes_ini AND v_mes_fin
                    AND c2.fecha_pago IS NULL)
           ELSE COALESCE(cm.cant, 0) + COALESCE(nd.cant, 0) END AS compromisos_cant,$nuevo$);

  IF position('mes en curso: lo que FALTA' in v_src) = 0 THEN
    RAISE EXCEPTION 'No se pudo ajustar la fila del mes en curso — revisar a mano.';
  END IF;

  EXECUTE v_src;
  RAISE NOTICE 'La fila del mes en curso ahora sale del mismo cálculo que el cumplimiento.';
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('gestion_mes_actual_cuadra.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) LOS DOS NÚMEROS QUE TIENEN QUE SER IGUALES
--    (el de arriba es el cumplimiento; el de abajo, la fila del mes)
WITH g AS (SELECT ARRAY['b39506c3-27dc-467d-830b-096731b83113'::uuid,
                        '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'::uuid] AS ids),
mes AS (SELECT date_trunc('month', CURRENT_DATE)::date AS ini,
               (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date AS fin)
SELECT 'Compromisos' AS concepto,
       COALESCE(SUM(c.monto), 0) AS se_debia,
       COALESCE(SUM(c.monto) FILTER (WHERE c.fecha_pago IS NOT NULL), 0) AS pagado,
       COALESCE(SUM(c.monto) FILTER (WHERE c.fecha_pago IS NULL), 0) AS falta_y_fila_del_mes
FROM public.compromisos c, g, mes
WHERE c.tenant_id = ANY(g.ids) AND c.fecha BETWEEN mes.ini AND mes.fin
UNION ALL
SELECT 'Suplidores',
       COALESCE(SUM(co.total_compra), 0),
       COALESCE(SUM(co.monto_pagado), 0),
       COALESCE(SUM(co.monto_pendiente), 0)
FROM public.compras co, g, mes
LEFT JOIN public.proveedores pv ON pv.id = co.suplidor_id
WHERE co.tenant_id = ANY(g.ids)
  AND co.forma_pago ILIKE '%credito%'
  AND COALESCE(co.estado, '') <> 'ANULADA'
  AND NOT COALESCE(co.es_saldo_inicial, false)
  AND pv.empresa_grupo_tenant_id IS NULL
  AND (co.fecha + COALESCE(co.dias_credito, 0)) BETWEEN mes.ini AND mes.fin;
-- esperado: Compromisos 497,720 / 292,400 / 205,320
--           Suplidores 2,975,291 / 1,352,128 / 1,623,163
-- La ÚLTIMA columna es la que debe aparecer en la fila de julio.

-- 2) Por qué se contaban de más: los fijos que ya son de agosto
SELECT nombre, monto, fecha,
       CASE WHEN fecha_pago IS NOT NULL THEN 'pagado en julio, su gemelo vence en agosto'
            ELSE 'pendiente' END AS situacion
FROM public.compromisos
WHERE tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113',
                    '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
  AND COALESCE(tipo, '') <> 'nomina'
ORDER BY fecha;
-- se ve que de los 12 fijos, 11 ya tienen fecha de AGOSTO
