-- =====================================================================
-- Compromisos: la META del mes arriba, y lo que SIGUE PENDIENTE en «falta»
-- ---------------------------------------------------------------------
-- (2026-07-30) "El verdadero monto de compromisos de julio era 665,964 y
-- solo se restan 75,320."
--
-- Las dos cosas a la vez, que es lo que ninguna de mis dos versiones daba:
--
--   se debía pagar   665,964   la carga real del mes: los 12 fijos + nómina
--   falta             75,320   LUZ MOTOPRESTAMO + quincena 16/07–31/07
--   pagado           590,644   la meta menos lo que sigue pendiente
--   cumplimiento        88.7%
--
-- >>> POR QUÉ «PAGADO» NO SE CUENTA DE LAS FILAS <<<
-- Contar las filas con `fecha_pago` daba 292,400 (DR.ARECHE + AGRICOLA) y
-- entonces "falta" salía 373,564, que no es verdad: nueve de los doce fijos
-- —TSS, PEPE, CRUZ MARIA, TELEFONO, JEEPETA, CABLE, LUZ CASA, EBARITA,
-- MARIA HERMANA— no dejan fila en julio porque su próxima fecha ya es de
-- agosto, y aun así julio no los debe.
--
-- Lo que sí es un hecho firme es lo que QUEDA PENDIENTE: las filas del mes
-- sin `fecha_pago`. Son las mismas dos que se ven en el módulo. Entonces:
--
--   pagado = meta del mes − lo que sigue pendiente
--
-- Un compromiso que no está en la lista de pendientes es uno que ya no se
-- debe, sin importar si su pago quedó registrado con fecha o si la
-- recurrencia simplemente lo empujó al mes siguiente.
--
-- >>> Y LOS DOS PANELES SIGUEN DICIENDO LO MISMO <<<
-- «Se debía pagar» y la fila del mes en «Mes por mes» salen los dos de la
-- proyección, así que son el mismo número por construcción: 665,964 en
-- julio, 673,964 cuando llegue agosto.
--
-- Idempotente / re-ejecutable. Va después de
-- sql/gestion_estado_actual_filas_reales.sql.
-- =====================================================================

DO $$
DECLARE
  v_src  text;
  v_meta text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_gestion_empresarial_ia'
  LIMIT 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'Falta get_gestion_empresarial_ia — corre antes sql/gestion_posicion_grupo.sql';
  END IF;

  IF position('la meta del mes menos lo que sigue pendiente' in v_src) > 0 THEN
    RAISE NOTICE 'Ya estaba aplicado.';
    RETURN;
  END IF;

  -- La meta del mes, escrita una sola vez y usada en los dos sitios.
  v_meta := '((SELECT COALESCE(SUM(cm.monto), 0) FROM compromisos_mes cm WHERE cm.mes = v_mes_ini)'
         || E'\n       + (SELECT COALESCE(SUM(nm.monto), 0) FROM nomina_monto nm WHERE nm.mes = v_mes_ini))';

  -- ---- 1) "se debia pagar" = la meta del mes ----
  v_src := replace(v_src,
$viejo$      -- el mes en curso pide lo que pide: sus propias filas. Y el total no
      -- baja al ir pagando — la fila pagada se queda con su fecha_pago y la
      -- recurrencia crea OTRA para el mes siguiente. Proyectar aqui los doce
      -- fijos inventaba 298,244: nueve empiezan en agosto y la primera
      -- quincena de julio nunca se genero.
      (SELECT COALESCE(SUM(c.monto), 0) FROM public.compromisos c
        WHERE c.tenant_id = ANY(v_grupo) AND c.fecha BETWEEN v_mes_ini AND v_mes_fin
          AND NOT EXISTS (SELECT 1 FROM public.nominas nx
                           WHERE nx.compromiso_id = c.id AND nx.estado = 'anulada')) AS compromisos_debia,$viejo$,
$nuevo$      -- la carga real del mes: los fijos + la nomina. Es la misma fila de
      -- este mes en "mes por mes", asi que los dos paneles no pueden diferir.
      $META$ AS compromisos_debia,$nuevo$);

  -- ---- 2) "pagado" = la meta menos lo que sigue pendiente ----
  v_src := replace(v_src,
$viejo$      (SELECT COALESCE(SUM(c.monto), 0) FROM public.compromisos c
        WHERE c.tenant_id = ANY(v_grupo) AND c.fecha BETWEEN v_mes_ini AND v_mes_fin
          AND NOT EXISTS (SELECT 1 FROM public.nominas nx
                           WHERE nx.compromiso_id = c.id AND nx.estado = 'anulada')
          AND c.fecha_pago IS NOT NULL) AS compromisos_pagado,$viejo$,
$nuevo$      -- la meta del mes menos lo que sigue pendiente. Contar las filas con
      -- fecha_pago daba 292,400 y dejaba un "falta" de 373,564 que no es
      -- real: nueve de los fijos no dejan fila en el mes en curso —su
      -- proxima fecha ya es del mes siguiente— y aun asi este mes no los
      -- debe. Lo firme es lo PENDIENTE: las filas del mes sin fecha_pago,
      -- las mismas que se ven en el modulo de compromisos.
      GREATEST($META$
        - (SELECT COALESCE(SUM(c.monto), 0) FROM public.compromisos c
            WHERE c.tenant_id = ANY(v_grupo) AND c.fecha BETWEEN v_mes_ini AND v_mes_fin
              AND c.fecha_pago IS NULL
              AND NOT EXISTS (SELECT 1 FROM public.nominas nx
                               WHERE nx.compromiso_id = c.id AND nx.estado = 'anulada')), 0) AS compromisos_pagado,$nuevo$);

  -- ---- 3) la cantidad, del mismo lado que el monto ----
  v_src := replace(v_src,
$viejo$      (SELECT COUNT(*) FROM public.compromisos c
        WHERE c.tenant_id = ANY(v_grupo) AND c.fecha BETWEEN v_mes_ini AND v_mes_fin
          AND NOT EXISTS (SELECT 1 FROM public.nominas nx
                           WHERE nx.compromiso_id = c.id AND nx.estado = 'anulada')) AS compromisos_cant$viejo$,
$nuevo$      ((SELECT COALESCE(SUM(cm.cant), 0) FROM compromisos_mes cm WHERE cm.mes = v_mes_ini)
       + (SELECT COALESCE(SUM(nd.cant), 0) FROM nomina_dias nd WHERE nd.mes = v_mes_ini))::int AS compromisos_cant$nuevo$);

  v_src := replace(v_src, '$META$', v_meta);

  IF position('la meta del mes menos lo que sigue pendiente' in v_src) = 0
     OR position('$META$' in v_src) > 0 THEN
    RAISE EXCEPTION 'No se pudo reescribir el cumplimiento — corre antes sql/gestion_estado_actual_filas_reales.sql';
  END IF;

  -- ---- 4) la tabla, una sola formula para todos los meses ----
  v_src := replace(v_src,
$viejo$      -- mes en curso: sus filas reales, las mismas que Estado actual — ya
      -- estan todas creadas. Meses que vienen: la proyeccion, porque sus
      -- filas todavia no existen. Asi los dos paneles nunca discrepan.
      CASE WHEN m.mes = v_mes_ini
           THEN (SELECT c.compromisos_debia FROM cumplimiento c)
           ELSE COALESCE(cm.monto, 0) + COALESCE(nm.monto, 0) END AS compromisos,
      CASE WHEN m.mes = v_mes_ini
           THEN (SELECT c.compromisos_cant FROM cumplimiento c)
           ELSE COALESCE(cm.cant, 0) + COALESCE(nd.cant, 0) END AS compromisos_cant,$viejo$,
$nuevo$      -- misma formula todos los meses, el actual incluido: "se debia pagar"
      -- de arriba sale de estos mismos CTEs.
      COALESCE(cm.monto, 0) + COALESCE(nm.monto, 0) AS compromisos,
      COALESCE(cm.cant, 0)  + COALESCE(nd.cant, 0)  AS compromisos_cant,$nuevo$);

  IF position('misma formula todos los meses' in v_src) = 0 THEN
    RAISE EXCEPTION 'No se pudo unificar la fila del mes — revisar a mano.';
  END IF;

  -- ---- 5) un recurrente EN MARCHA cuenta desde el mes en curso ----
  -- `fecha` es su PROXIMA, no su primera: al pagarlo la recurrencia lo mueve
  -- al mes siguiente. Con GREATEST, TSS y los otros ocho —que ya tienen
  -- fecha de agosto— desaparecian de julio y la meta caia a 172,320.
  -- Si su proxima fecha esta MAS ALLA del mes que viene, entonces todavia no
  -- arranco y cuenta desde su propia fecha.
  v_src := replace(v_src,
    'ON (ca.repite AND m.mes >= GREATEST(ca.mes_origen, v_mes_ini))',
    'ON (ca.repite AND m.mes >= CASE
            WHEN ca.mes_origen <= (v_mes_ini + interval ''1 month'')::date THEN v_mes_ini
            ELSE ca.mes_origen END)');

  IF position('WHEN ca.mes_origen <=' in v_src) = 0 THEN
    RAISE EXCEPTION 'No se pudo ajustar desde cuando cuenta un recurrente — revisar a mano.';
  END IF;

  EXECUTE v_src;
  RAISE NOTICE 'Compromisos: meta arriba, pendiente en falta.';
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('gestion_compromisos_meta_y_pendiente.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) LAS TRES COLUMNAS DE COMPROMISOS
WITH g AS (SELECT ARRAY['b39506c3-27dc-467d-830b-096731b83113'::uuid,
                        '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'::uuid] AS ids),
mes AS (SELECT date_trunc('month', CURRENT_DATE)::date AS ini,
               (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date AS fin),
fijos AS (
  SELECT c.monto
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
pendiente AS (
  SELECT COALESCE(SUM(c.monto), 0) AS monto
  FROM public.compromisos c CROSS JOIN g CROSS JOIN mes
  WHERE c.tenant_id = ANY(g.ids)
    AND c.fecha BETWEEN mes.ini AND mes.fin
    AND c.fecha_pago IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.nominas nx
                     WHERE nx.compromiso_id = c.id AND nx.estado = 'anulada')
)
SELECT (SELECT COALESCE(SUM(monto), 0) FROM fijos) + (SELECT monto FROM nomina) AS se_debia_pagar,
       (SELECT COALESCE(SUM(monto), 0) FROM fijos) + (SELECT monto FROM nomina)
         - (SELECT monto FROM pendiente) AS pagado,
       (SELECT monto FROM pendiente) AS falta;
-- esperado: se_debia_pagar 665,964.00 · pagado 590,644.00 · falta 75,320.00
-- y 665,964.00 es lo que va en la fila de julio de «Mes por mes».

-- 2) LOS DOS QUE FORMAN EL «FALTA»
SELECT c.fecha, c.nombre, c.monto
FROM public.compromisos c
WHERE c.tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113',
                      '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
  AND c.fecha BETWEEN date_trunc('month', CURRENT_DATE)::date
                  AND (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date
  AND c.fecha_pago IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.nominas nx
                   WHERE nx.compromiso_id = c.id AND nx.estado = 'anulada')
ORDER BY c.fecha;
-- esperado: LUZ MOTOPRESTAMO 10,320 y Nómina quincenal 16/07–31/07 65,000

-- 3) LOS 12 FIJOS DE LA META
SELECT c.nombre, c.monto, c.fecha AS proxima_fecha
FROM public.compromisos c
WHERE c.tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113',
                      '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
  AND COALESCE(c.activo, true)
  AND COALESCE(c.tipo, '') <> 'nomina'
  AND NOT EXISTS (SELECT 1 FROM public.nominas n WHERE n.compromiso_id = c.id)
ORDER BY c.monto DESC;
-- esperado: 12 fijos, 503,964.00 · + nómina 162,000.00 = 665,964.00
