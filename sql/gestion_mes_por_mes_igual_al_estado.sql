-- =====================================================================
-- «Mes por mes» = «Se debía pagar». Los dos paneles, el mismo número
-- ---------------------------------------------------------------------
-- (2026-07-30) La regla que puso el usuario, y es la correcta:
--
--   ESTADO ACTUAL — arranca el mes con lo que hay que pagar y muestra el
--                   detalle de cómo va: se debía / pagado / falta.
--   MES POR MES   — vista general de los compromisos y metas de los
--                   próximos 6 meses.
--
-- Entonces la fila del mes en curso de «Mes por mes» tiene que ser la
-- columna SE DEBÍA PAGAR, no la columna FALTA. Ayer quedó al revés.
--
-- Tres cosas para que cuadren de verdad:
--
-- >>> 1) LA TABLA MUESTRA LO QUE VENCE, COMPLETO <<<
-- Suplidores mostraba el pendiente de cada mes. Ahora muestra lo que vence,
-- pagado o no — que es "se debía pagar". Solo cambia donde ya se pagó algo:
--   julio   1,623,162.78  →  2,975,290.78   (ya pagado 1,352,128)
--   agosto  2,227,148.71  →  2,260,607.71   (una cuota con 33,459 abonados)
-- Los otros cuatro meses no se mueven: todavía no se ha pagado nada de ellos.
--
-- >>> 2) EL MES EN CURSO SALE DEL MISMO CÁLCULO <<<
-- Compromisos de julio venía de la proyección de los fijos, y la proyección
-- no sirve para el mes en curso: los recurrentes con fecha de AGOSTO se
-- colaban en julio (el LEAST de abajo). Ahora la fila toma directamente el
-- "se debía pagar" del cumplimiento, así que no puede discrepar.
-- De paso, LEAST → GREATEST: un compromiso recurrente no puede aparecer en
-- meses ANTERIORES a su fecha. Hoy no cambia ningún número (todos los fijos
-- son de julio o agosto); evita que uno creado para noviembre salga en agosto.
--
-- >>> 3) NÓMINAS ANULADAS: 130,000 DE MÁS <<<
-- Revisando el 497,720 aparecieron tres compromisos idénticos de 65,000
-- "Nómina quincenal 16/07–31/07". Solo uno es real:
--
--   nómina 16/07–31/07  anulada   → compromiso 65,000  (fantasma)
--   nómina 16/07–31/07  anulada   → compromiso 65,000  (fantasma)
--   nómina 16/07–31/07  borrador  → compromiso 65,000  ← la de verdad
--
-- Al anular una nómina su compromiso queda ahí y el cumplimiento lo sumaba
-- igual, porque solo filtraba por fecha. Ahora se excluyen los compromisos
-- de nóminas anuladas. Julio pasa de 497,720 a 367,720 y de 6 pagos a 4:
-- DR.ARECHE, AGRICOLA, LUZ MOTOPRESTAMO y la nómina buena.
--
-- OJO: no se filtra por activo. Un compromiso PAGADO queda inactivo cuando
-- la recurrencia crea el del mes siguiente — DR.ARECHE y AGRICOLA están así,
-- y son deuda legítima de julio. Lo que no cuenta es la nómina anulada.
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

  IF position('la fila del mes = lo que vence, completo' in v_src) > 0 THEN
    RAISE NOTICE 'Ya estaba aplicado.';
    RETURN;
  END IF;

  -- ---- 1) nóminas anuladas fuera del cumplimiento ----
  -- Las tres subconsultas de `cumplimiento` comparten esta línea, y las tres
  -- necesitan el filtro: debía, pagado y cantidad.
  IF position('nx.estado = ''anulada''' in v_src) = 0 THEN
    v_src := replace(v_src,
$viejo$        WHERE c.tenant_id = ANY(v_grupo) AND c.fecha BETWEEN v_mes_ini AND v_mes_fin$viejo$,
$nuevo$        WHERE c.tenant_id = ANY(v_grupo) AND c.fecha BETWEEN v_mes_ini AND v_mes_fin
          AND NOT EXISTS (SELECT 1 FROM public.nominas nx
                           WHERE nx.compromiso_id = c.id AND nx.estado = 'anulada')$nuevo$);
    RAISE NOTICE 'Compromisos de nominas anuladas excluidos del cumplimiento.';
  END IF;

  -- ---- 2) la tabla muestra lo que vence, completo ----
  v_src := replace(v_src,
$viejo$    SELECT m.mes,
           COALESCE(SUM(x.pendiente), 0) AS monto,
           COUNT(x.pendiente) FILTER (WHERE x.pendiente > 0) AS cant
    FROM meses m
    LEFT JOIN cxp x ON date_trunc('month', x.vence)::date = m.mes
                   AND x.pendiente > 0
    GROUP BY m.mes$viejo$,
$nuevo$    -- la fila del mes = lo que vence, completo: el mismo numero que
    -- "se debia pagar" del cumplimiento. Cuanto de eso ya se cubrio se
    -- ve arriba, en Estado actual.
    SELECT m.mes,
           COALESCE(SUM(x.total), 0) AS monto,
           COUNT(x.total) AS cant
    FROM meses m
    LEFT JOIN cxp x ON date_trunc('month', x.vence)::date = m.mes
    GROUP BY m.mes$nuevo$);

  IF position('la fila del mes = lo que vence, completo' in v_src) = 0 THEN
    RAISE EXCEPTION 'No se pudo cambiar suplidores_mes a monto completo — revisar a mano.';
  END IF;

  -- ---- 3) el mes en curso toma el "se debia pagar" ----
  v_src := replace(v_src,
$viejo$      -- mes en curso: lo que FALTA, el mismo número del cumplimiento de
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
           ELSE COALESCE(cm.cant, 0) + COALESCE(nd.cant, 0) END AS compromisos_cant,$viejo$,
$nuevo$      -- mes en curso: el "se debia pagar" del cumplimiento, tal cual. La
      -- proyeccion de los fijos no sirve para este mes — mete los que ya
      -- tienen fecha del mes siguiente — y ademas seria otro calculo, que
      -- es justo lo que hacia que los dos paneles no coincidieran.
      CASE WHEN m.mes = v_mes_ini
           THEN (SELECT c.compromisos_debia FROM cumplimiento c)
           ELSE COALESCE(cm.monto, 0) + COALESCE(nm.monto, 0) END AS compromisos,
      CASE WHEN m.mes = v_mes_ini
           THEN (SELECT c.compromisos_cant FROM cumplimiento c)
           ELSE COALESCE(cm.cant, 0) + COALESCE(nd.cant, 0) END AS compromisos_cant,$nuevo$);

  IF position('el "se debia pagar" del cumplimiento, tal cual' in v_src) = 0 THEN
    RAISE EXCEPTION 'No se pudo ajustar la fila del mes en curso — corre antes sql/gestion_mes_actual_cuadra.sql';
  END IF;

  -- ---- 4) un recurrente no vale para meses anteriores a su fecha ----
  v_src := replace(v_src,
    'ON (ca.repite AND m.mes >= LEAST(ca.mes_origen, v_mes_ini))',
    'ON (ca.repite AND m.mes >= GREATEST(ca.mes_origen, v_mes_ini))');

  EXECUTE v_src;
  RAISE NOTICE 'Mes por mes y Estado actual ya salen del mismo calculo.';
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('gestion_mes_por_mes_igual_al_estado.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) LO QUE TIENE QUE SALIR EN LAS DOS PANTALLAS
--    (se_debia_pagar es lo que va en la fila del mes en «Mes por mes»)
WITH g AS (SELECT ARRAY['b39506c3-27dc-467d-830b-096731b83113'::uuid,
                        '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'::uuid] AS ids),
mes AS (SELECT date_trunc('month', CURRENT_DATE)::date AS ini,
               (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date AS fin)
SELECT 'Compromisos' AS concepto,
       COUNT(*)                          AS cant,
       COALESCE(SUM(c.monto), 0)         AS se_debia_pagar,
       COALESCE(SUM(c.monto) FILTER (WHERE c.fecha_pago IS NOT NULL), 0) AS pagado
FROM public.compromisos c
CROSS JOIN g CROSS JOIN mes
WHERE c.tenant_id = ANY(g.ids)
  AND c.fecha BETWEEN mes.ini AND mes.fin
  AND NOT EXISTS (SELECT 1 FROM public.nominas nx
                   WHERE nx.compromiso_id = c.id AND nx.estado = 'anulada')
UNION ALL
-- El LEFT JOIN va pegado a `compras`: con "FROM compras co, g, mes LEFT
-- JOIN ..." el join se ata a `mes` y `co` queda fuera de su alcance.
SELECT 'Suplidores',
       COUNT(*),
       COALESCE(SUM(co.total_compra), 0),
       COALESCE(SUM(co.monto_pagado), 0)
FROM public.compras co
LEFT JOIN public.proveedores pv ON pv.id = co.suplidor_id
CROSS JOIN g CROSS JOIN mes
WHERE co.tenant_id = ANY(g.ids)
  AND co.forma_pago ILIKE '%credito%'
  AND COALESCE(co.estado, '') <> 'ANULADA'
  AND COALESCE(co.total_compra, 0) > 0
  AND NOT COALESCE(co.es_saldo_inicial, false)
  AND (pv.empresa_grupo_tenant_id IS NULL OR NOT (pv.empresa_grupo_tenant_id = ANY(g.ids)))
  AND (co.fecha + COALESCE(co.dias_credito, 0)) BETWEEN mes.ini AND mes.fin;
-- esperado: Compromisos  4 ·   367,720.00 · pagado   292,400.00
--           Suplidores  11 · 2,975,290.78 · pagado 1,352,128.00

-- 2) LOS 130,000 FANTASMA: la nómina de julio triplicada
SELECT c.fecha, c.nombre, c.monto, c.activo, n.estado AS estado_nomina,
       CASE WHEN n.estado = 'anulada' THEN 'FANTASMA — ya no cuenta'
            ELSE 'la buena' END AS ahora
FROM public.compromisos c
JOIN public.nominas n ON n.compromiso_id = c.id
WHERE c.tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113',
                      '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
  AND c.fecha BETWEEN date_trunc('month', CURRENT_DATE)::date
                  AND (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date
ORDER BY c.fecha, n.estado;
-- esperado: 3 filas de 65,000 — dos anuladas (fantasma) y una borrador
