-- =====================================================================
-- POSICIÓN: la caja abierta en pesos y en dólares
-- ---------------------------------------------------------------------
-- (2026-07-29) "Pon debajo del monto 424,834 el monto en pesos y el monto
-- en dólares, como se ve dólares a 61."
--
-- La línea decía el total convertido y, debajo, solo la tasa. Faltaba de
-- dónde sale ese total: cuánto hay de verdad en pesos y cuántos dólares hay.
-- Sin eso, si la tasa se mueve el número cambia y no se sabe por qué.
--
--   Caja y bancos                    RD$ 424,834
--   RD$ 275,309 en pesos + US$ 2,451 a 61
--
-- Se agregan dos datos al resumen: la caja en pesos y la caja en dólares SIN
-- convertir. El total sigue igual — esto no cambia ninguna cuenta, solo
-- muestra sus partes.
--
-- Idempotente / re-ejecutable. Requiere gestion_posicion_grupo.sql.
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

  IF position('caja_dop' in v_src) > 0 THEN
    RAISE NOTICE 'La caja ya viene abierta por moneda — nada que cambiar.';
    RETURN;
  END IF;

  -- 1) Las variables
  v_src := replace(v_src,
    '  v_bancos      numeric := 0;',
    '  v_bancos      numeric := 0;' || E'\n' ||
    '  v_caja_dop    numeric := 0;' || E'\n' ||
    '  v_caja_usd    numeric := 0;');

  -- 2) La consulta: el mismo saldo, ahora también separado por moneda.
  --    FILTER evita recorrer la tabla tres veces.
  v_src := replace(v_src,
$viejo$  SELECT COALESCE(SUM(
           (c.saldo_inicial + COALESCE(m.neto, 0))
           * CASE WHEN upper(COALESCE(c.moneda, 'DOP')) = 'USD' THEN v_tasa ELSE 1 END), 0)
    INTO v_bancos$viejo$,
$nuevo$  SELECT COALESCE(SUM(
           (c.saldo_inicial + COALESCE(m.neto, 0))
           * CASE WHEN upper(COALESCE(c.moneda, 'DOP')) = 'USD' THEN v_tasa ELSE 1 END), 0),
         COALESCE(SUM(c.saldo_inicial + COALESCE(m.neto, 0))
           FILTER (WHERE upper(COALESCE(c.moneda, 'DOP')) <> 'USD'), 0),
         COALESCE(SUM(c.saldo_inicial + COALESCE(m.neto, 0))
           FILTER (WHERE upper(COALESCE(c.moneda, 'DOP')) = 'USD'), 0)
    INTO v_bancos, v_caja_dop, v_caja_usd$nuevo$);

  -- 3) Al resumen
  v_src := replace(v_src,
    $v2$      'caja_bancos',      ROUND(v_bancos, 2),$v2$,
    $n2$      'caja_bancos',      ROUND(v_bancos, 2),
      'caja_dop',         ROUND(v_caja_dop, 2),
      'caja_usd',         ROUND(v_caja_usd, 2),$n2$);

  EXECUTE v_src;
  RAISE NOTICE 'La caja ahora se muestra abierta en pesos y en dólares.';
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('gestion_caja_por_moneda.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) Que la función ya devuelve las dos partes
SELECT position('caja_dop' in pg_get_functiondef(p.oid)) > 0 AS abre_por_moneda
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_gestion_empresarial_ia';
-- esperado: true

-- 2) Cuenta por cuenta, y el total que tiene que cuadrar
WITH g AS (SELECT ARRAY['b39506c3-27dc-467d-830b-096731b83113'::uuid,
                        '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'::uuid] AS ids),
tasa AS (SELECT COALESCE(MAX(t.tasa), 1) AS v FROM public.tasas_cambio t, g WHERE t.tenant_id = ANY(g.ids)),
saldos AS (
  SELECT COALESCE(c.alias, c.banco) AS cuenta,
         upper(COALESCE(c.moneda, 'DOP')) AS moneda,
         c.saldo_inicial + COALESCE(m.neto, 0) AS saldo
  FROM public.cuentas_bancarias c, g
  LEFT JOIN LATERAL (SELECT SUM(CASE WHEN tipo = 'ENTRADA' THEN monto ELSE -monto END) neto
                       FROM public.movimientos_bancarios mb WHERE mb.cuenta_id = c.id) m ON true
  WHERE c.tenant_id = ANY(g.ids) AND COALESCE(c.activo, true)
)
SELECT cuenta, moneda, saldo FROM saldos
UNION ALL SELECT '— en pesos —', 'DOP', SUM(saldo) FROM saldos WHERE moneda <> 'USD'
UNION ALL SELECT '— en dólares —', 'USD', SUM(saldo) FROM saldos WHERE moneda = 'USD'
UNION ALL SELECT '— TOTAL en RD$ —', 'DOP',
       (SELECT SUM(saldo) FROM saldos WHERE moneda <> 'USD')
     + (SELECT COALESCE(SUM(saldo), 0) FROM saldos WHERE moneda = 'USD') * (SELECT v FROM tasa);
-- el TOTAL tiene que dar el mismo "Caja y bancos" que muestra el panel
