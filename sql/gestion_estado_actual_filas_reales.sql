-- =====================================================================
-- El mes en curso pide lo que pide: sus propias filas de `compromisos`
-- ---------------------------------------------------------------------
-- (2026-07-30) "Los únicos dos compromisos pendientes de MotoPréstamos este
-- mes son estos" — LUZ MOTOPRESTAMO 10,320 y NÓMINA QUINCENAL 16/07–31/07
-- 65,000. Falta = 75,320, y el panel decía 373,564.
--
-- >>> DÓNDE ME EQUIVOQUÉ <<<
-- Puse el mes en curso a salir de la PROYECCIÓN (665,964) creyendo que si
-- salía de las filas el número iba a bajar solo al ir pagando. No baja: al
-- pagar DR.ARECHE su fila de julio se queda ahí con `fecha_pago`, y la
-- recurrencia crea OTRA fila para el 20/08. Julio sigue diciendo que debía
-- 200,000. El total del mes es estable; lo único que lo sube es un
-- compromiso nuevo, que es correcto que lo suba.
--
-- Y proyectar los doce fijos sobre julio inventaba 298,244 de deuda:
--
--   9 fijos que empiezan en AGOSTO   201,244   TSS, PEPE, CRUZ MARIA,
--                                              TELEFONO, JEEPETA, CABLE,
--                                              LUZ CASA, EBARITA, M.HERMANA
--   nómina de julio que no existió    97,000   la primera quincena de julio
--                                              nunca se generó; el módulo
--                                              arrancó el 16
--                                  ──────────
--                                    298,244
--
-- Julio de verdad tuvo 4 compromisos, no 18:
--
--   20/07  PRESTAMO DR.ARECHE              200,000  PAGADO
--   22/07  PRESTAMO AGRICOLA                92,400  PAGADO
--   30/07  LUZ MOTOPRESTAMO                 10,320  pendiente
--   30/07  Nómina quincenal 16/07–31/07     65,000  pendiente
--                                          ────────
--   se debía pagar                          367,720
--   pagado                                  292,400
--   falta                                    75,320   ← los dos de la pantalla
--
-- >>> Y AGOSTO SIGUE DANDO 673,964 <<<
-- Que era la otra mitad del pedido. Hoy las filas de agosto suman 598,644
-- porque faltan dos que todavía no existen: LUZ MOTOPRESTAMO (nace cuando se
-- pague la de julio) y la quincena 16/08–31/08. Cuando agosto sea el mes en
-- curso, las dos ya estarán: 598,644 + 10,320 + 65,000 = 673,964, igual que
-- lo que hoy proyecta su fila.
--
-- Entonces la regla queda: el MES EN CURSO sale de sus filas reales —las
-- tiene todas—, y los meses que vienen de la proyección, porque todavía no
-- tienen filas. Los dos paneles siguen leyendo el mismo número.
--
-- Idempotente / re-ejecutable. Deshace
-- sql/gestion_estado_actual_valor_inicial.sql y deja lo demás como estaba.
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

  IF position('el mes en curso pide lo que pide' in v_src) > 0 THEN
    RAISE NOTICE 'Ya estaba aplicado.';
    RETURN;
  END IF;

  -- ---- 1) "se debia pagar" vuelve a las filas del mes ----
  v_src := replace(v_src,
$viejo$      -- valor inicial del mes: la meta, la misma fila de "mes por mes".
      -- No se cuenta de las filas de `compromisos` porque ese numero se
      -- mueve solo: al pagar uno, la recurrencia lo empuja al mes que viene
      -- y la meta bajaria sola en medio del mes.
      ((SELECT COALESCE(SUM(cm.monto), 0) FROM compromisos_mes cm WHERE cm.mes = v_mes_ini)
       + (SELECT COALESCE(SUM(nm.monto), 0) FROM nomina_monto nm WHERE nm.mes = v_mes_ini)) AS compromisos_debia,$viejo$,
$nuevo$      -- el mes en curso pide lo que pide: sus propias filas. Y el total no
      -- baja al ir pagando — la fila pagada se queda con su fecha_pago y la
      -- recurrencia crea OTRA para el mes siguiente. Proyectar aqui los doce
      -- fijos inventaba 298,244: nueve empiezan en agosto y la primera
      -- quincena de julio nunca se genero.
      (SELECT COALESCE(SUM(c.monto), 0) FROM public.compromisos c
        WHERE c.tenant_id = ANY(v_grupo) AND c.fecha BETWEEN v_mes_ini AND v_mes_fin
          AND NOT EXISTS (SELECT 1 FROM public.nominas nx
                           WHERE nx.compromiso_id = c.id AND nx.estado = 'anulada')) AS compromisos_debia,$nuevo$);

  IF position('el mes en curso pide lo que pide' in v_src) = 0 THEN
    RAISE EXCEPTION 'No se pudo devolver compromisos_debia a las filas del mes — revisar a mano.';
  END IF;

  v_src := replace(v_src,
$viejo$      ((SELECT COALESCE(SUM(cm.cant), 0) FROM compromisos_mes cm WHERE cm.mes = v_mes_ini)
       + (SELECT COALESCE(SUM(nd.cant), 0) FROM nomina_dias nd WHERE nd.mes = v_mes_ini))::int AS compromisos_cant$viejo$,
$nuevo$      (SELECT COUNT(*) FROM public.compromisos c
        WHERE c.tenant_id = ANY(v_grupo) AND c.fecha BETWEEN v_mes_ini AND v_mes_fin
          AND NOT EXISTS (SELECT 1 FROM public.nominas nx
                           WHERE nx.compromiso_id = c.id AND nx.estado = 'anulada')) AS compromisos_cant$nuevo$);

  IF position('nomina_dias nd WHERE nd.mes = v_mes_ini' in v_src) > 0 THEN
    RAISE EXCEPTION 'No se pudo devolver compromisos_cant a las filas del mes — revisar a mano.';
  END IF;

  -- ---- 2) la fila del mes en curso vuelve a leer del cumplimiento ----
  v_src := replace(v_src,
$viejo$      -- todos los meses con la misma formula, el actual incluido. Estado
      -- actual lee de aqui su "se debia pagar", asi que no pueden diferir.
      COALESCE(cm.monto, 0) + COALESCE(nm.monto, 0) AS compromisos,
      COALESCE(cm.cant, 0)  + COALESCE(nd.cant, 0)  AS compromisos_cant,$viejo$,
$nuevo$      -- mes en curso: sus filas reales, las mismas que Estado actual — ya
      -- estan todas creadas. Meses que vienen: la proyeccion, porque sus
      -- filas todavia no existen. Asi los dos paneles nunca discrepan.
      CASE WHEN m.mes = v_mes_ini
           THEN (SELECT c.compromisos_debia FROM cumplimiento c)
           ELSE COALESCE(cm.monto, 0) + COALESCE(nm.monto, 0) END AS compromisos,
      CASE WHEN m.mes = v_mes_ini
           THEN (SELECT c.compromisos_cant FROM cumplimiento c)
           ELSE COALESCE(cm.cant, 0) + COALESCE(nd.cant, 0) END AS compromisos_cant,$nuevo$);

  IF position('sus filas reales, las mismas que Estado actual' in v_src) = 0 THEN
    RAISE EXCEPTION 'No se pudo ajustar la fila del mes en curso — revisar a mano.';
  END IF;

  -- ---- 3) el recurrente cuenta desde su propio mes ----
  -- El mes en curso ya no usa la proyeccion, asi que aqui vale la regla
  -- simple: un recurrente cuenta desde su mes, y nunca antes.
  v_src := replace(v_src,
    'ON (ca.repite AND m.mes >= CASE
            WHEN ca.mes_origen <= (v_mes_ini + interval ''1 month'')::date THEN v_mes_ini
            ELSE ca.mes_origen END)',
    'ON (ca.repite AND m.mes >= GREATEST(ca.mes_origen, v_mes_ini))');

  EXECUTE v_src;
  RAISE NOTICE 'El mes en curso vuelve a salir de sus filas reales.';
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('gestion_estado_actual_filas_reales.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) LOS CUATRO COMPROMISOS DE JULIO, y los dos que faltan
SELECT c.fecha, c.nombre, c.monto,
       CASE WHEN c.fecha_pago IS NOT NULL THEN 'pagado' ELSE 'PENDIENTE' END AS situacion
FROM public.compromisos c
WHERE c.tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113',
                      '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
  AND c.fecha BETWEEN date_trunc('month', CURRENT_DATE)::date
                  AND (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date
  AND NOT EXISTS (SELECT 1 FROM public.nominas nx
                   WHERE nx.compromiso_id = c.id AND nx.estado = 'anulada')
ORDER BY c.fecha;
-- esperado: 4 filas. Pendientes: LUZ MOTOPRESTAMO 10,320 y
--           Nómina quincenal 16/07–31/07 65,000 = 75,320

-- 2) LO QUE VA EN LAS DOS PANTALLAS
WITH g AS (SELECT ARRAY['b39506c3-27dc-467d-830b-096731b83113'::uuid,
                        '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'::uuid] AS ids),
mes AS (SELECT date_trunc('month', CURRENT_DATE)::date AS ini,
               (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date AS fin)
SELECT 'Compromisos' AS concepto,
       COUNT(*)                  AS cant,
       COALESCE(SUM(c.monto), 0) AS se_debia_pagar,
       COALESCE(SUM(c.monto) FILTER (WHERE c.fecha_pago IS NOT NULL), 0) AS pagado,
       COALESCE(SUM(c.monto) FILTER (WHERE c.fecha_pago IS NULL), 0)     AS falta
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
       COALESCE(SUM(co.monto_pagado), 0),
       COALESCE(SUM(co.monto_pendiente), 0)
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
-- esperado: Compromisos  4 ·   367,720.00 · 292,400.00 ·    75,320.00
--           Suplidores  11 · 2,975,290.78 · 1,352,128.00 · 1,623,162.78

-- 3) POR QUÉ AGOSTO DIRÁ 673,964 aunque hoy sus filas sumen 598,644
SELECT COALESCE(SUM(c.monto), 0) AS filas_de_agosto_hoy,
       COALESCE(SUM(c.monto), 0) + 10320 + 65000 AS cuando_agosto_sea_el_mes
FROM public.compromisos c
WHERE c.tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113',
                      '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
  AND c.fecha BETWEEN (date_trunc('month', CURRENT_DATE) + interval '1 month')::date
                  AND (date_trunc('month', CURRENT_DATE) + interval '2 month - 1 day')::date
  AND NOT EXISTS (SELECT 1 FROM public.nominas nx
                   WHERE nx.compromiso_id = c.id AND nx.estado = 'anulada');
-- esperado: 598,644 hoy → 673,964 cuando nazcan LUZ MOTOPRESTAMO (al pagarse
-- la de julio) y la quincena 16/08–31/08. Es el número que hoy proyecta su fila.
