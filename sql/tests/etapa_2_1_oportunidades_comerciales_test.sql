-- =====================================================================
-- ETAPA 2.1 / TAREA 4 — PRUEBAS DE LA COLA DE OPORTUNIDADES
-- ---------------------------------------------------------------------
-- Solo lectura (no toca datos). Correr en el SQL Editor DESPUÉS de
-- sql/etapa_2_1_oportunidades_comerciales.sql. Cada caso lanza EXCEPTION
-- si falla; si todo pasa, termina con 'TESTS ETAPA 2.1: TODOS OK'.
-- Los casos usan los datos reales de Morla (no hay staging): son
-- invariantes de negocio, no dependen de filas específicas.
-- =====================================================================

DO $$
DECLARE
  v int;
  v_morla constant uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- CASO 1: ninguna 'promocion' con stock < 2, sin foto o precio < 100
  SELECT count(*) INTO v FROM hermes.oportunidades_comerciales
  WHERE tipo = 'promocion'
    AND (stock_actual < 2 OR has_image IS DISTINCT FROM true OR precio < 100);
  IF v > 0 THEN RAISE EXCEPTION 'CASO 1 FALLÓ: % promociones violan stock/foto/precio', v; END IF;
  RAISE NOTICE 'CASO 1 OK: toda promoción tiene foto real, stock >= 2 y precio >= 100';

  -- CASO 2: los sin foto solo pueden ser requiere_foto (nunca promocion)
  SELECT count(*) INTO v FROM hermes.oportunidades_comerciales
  WHERE has_image = false AND tipo = 'promocion';
  IF v > 0 THEN RAISE EXCEPTION 'CASO 2 FALLÓ: % productos sin foto salieron como promoción', v; END IF;
  SELECT count(*) INTO v FROM hermes.oportunidades_comerciales
  WHERE tipo = 'requiere_foto'
    AND (has_image IS DISTINCT FROM false OR stock_actual < 1 OR precio < 100 OR sales_30d > 3);
  IF v > 0 THEN RAISE EXCEPTION 'CASO 2 FALLÓ: % requiere_foto violan sus condiciones', v; END IF;
  RAISE NOTICE 'CASO 2 OK: sin foto => solo requiere_foto, con sus condiciones';

  -- CASO 3: grupos excluidos (arandelas, tornillos, tuercas, aceites,
  -- filtros, parchos, cadenas) nunca como promoción ni producto frío
  SELECT count(*) INTO v FROM hermes.oportunidades_comerciales
  WHERE tipo IN ('promocion', 'producto_frio', 'requiere_foto')
    AND descripcion ~* '(arandela|tornillo|tuerca|aceite|filtro|parcho|cadena)';
  IF v > 0 THEN RAISE EXCEPTION 'CASO 3 FALLÓ: % filas de grupos excluidos', v; END IF;
  RAISE NOTICE 'CASO 3 OK: grupos excluidos fuera de promoción/frío/foto';

  -- CASO 4: en oportunidades_hoy, ningún seguimiento 'media'/'baja'
  -- aparece antes que uno 'alta'
  SELECT count(*) INTO v FROM (
    SELECT CASE prioridad WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END AS cur,
           lag(CASE prioridad WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END) OVER () AS prev
    FROM (SELECT * FROM hermes.oportunidades_hoy WHERE tipo = 'seguimiento') s
  ) x WHERE prev IS NOT NULL AND cur < prev;
  IF v > 0 THEN RAISE EXCEPTION 'CASO 4 FALLÓ: seguimientos fuera de orden de prioridad'; END IF;
  RAISE NOTICE 'CASO 4 OK: seguimientos alta primero';

  -- CASO 5: agotado_solicitado no aparece en la cola
  SELECT count(*) INTO v FROM hermes.oportunidades_hoy
  WHERE estado_crm = 'agotado_solicitado';
  IF v > 0 THEN RAISE EXCEPTION 'CASO 5 FALLÓ: % fichas agotado_solicitado en la cola', v; END IF;
  RAISE NOTICE 'CASO 5 OK: sin agotado_solicitado en oportunidades_hoy';

  -- CASO 6: aislamiento de tenant (solo Morla en ambas vistas)
  SELECT count(*) INTO v FROM (
    SELECT tenant_id FROM hermes.oportunidades_comerciales WHERE tenant_id <> v_morla
    UNION ALL
    SELECT tenant_id FROM hermes.oportunidades_hoy WHERE tenant_id <> v_morla
  ) t;
  IF v > 0 THEN RAISE EXCEPTION 'CASO 6 FALLÓ: % filas de otro tenant', v; END IF;
  RAISE NOTICE 'CASO 6 OK: solo datos de Morla';

  -- CASO 7: la vista no expone costos ni márgenes
  SELECT count(*) INTO v FROM information_schema.columns
  WHERE table_schema = 'hermes'
    AND table_name IN ('oportunidades_comerciales', 'oportunidades_hoy')
    AND column_name IN ('costo', 'costo_unitario', 'margen', 'margen_pct');
  IF v > 0 THEN RAISE EXCEPTION 'CASO 7 FALLÓ: la vista expone columnas de costo/margen'; END IF;
  SELECT count(*) INTO v FROM hermes.oportunidades_comerciales
  WHERE razon ~* 'margen [0-9]';   -- el margen solo cualitativo, nunca en números
  IF v > 0 THEN RAISE EXCEPTION 'CASO 7 FALLÓ: la razón muestra el margen en números'; END IF;
  RAISE NOTICE 'CASO 7 OK: sin costos internos expuestos';

  -- CASO 8: límites de la cola diaria (≤2 promo, ≤1 frío, ≤5 fotos)
  SELECT count(*) INTO v FROM hermes.oportunidades_hoy WHERE tipo = 'promocion';
  IF v > 2 THEN RAISE EXCEPTION 'CASO 8 FALLÓ: % promociones (máx 2)', v; END IF;
  SELECT count(*) INTO v FROM hermes.oportunidades_hoy WHERE tipo = 'producto_frio';
  IF v > 1 THEN RAISE EXCEPTION 'CASO 8 FALLÓ: % fríos (máx 1)', v; END IF;
  SELECT count(*) INTO v FROM hermes.oportunidades_hoy WHERE tipo = 'requiere_foto';
  IF v > 5 THEN RAISE EXCEPTION 'CASO 8 FALLÓ: % requiere_foto (máx 5)', v; END IF;
  RAISE NOTICE 'CASO 8 OK: límites de la cola respetados';

  -- CASO 9: anti-repetición 5 días (si hay historial de marketing)
  SELECT count(*) INTO v FROM hermes.oportunidades_hoy
  WHERE tipo = 'promocion'
    AND last_recommended_at IS NOT NULL
    AND last_recommended_at >= now() - interval '5 days';
  IF v > 0 THEN RAISE EXCEPTION 'CASO 9 FALLÓ: % promociones repetidas en menos de 5 días', v; END IF;
  RAISE NOTICE 'CASO 9 OK: sin promociones repetidas en 5 días';
END $$;

-- Resumen visual de la cola (para el operador)
SELECT tipo, count(*) AS filas, round(avg(score), 1) AS score_prom
FROM hermes.oportunidades_hoy
GROUP BY tipo ORDER BY tipo;

SELECT 'TESTS ETAPA 2.1: TODOS OK' AS resultado;
