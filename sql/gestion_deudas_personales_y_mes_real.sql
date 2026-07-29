-- =====================================================================
-- POSICIÓN: deudas personales adentro, y el mes por mes que CUADRA
-- ---------------------------------------------------------------------
-- (2026-07-29) Dos pedidos y una comprobación:
--
--   "Quítame Deudas entre las empresas del grupo del reporte y sustitúyelo
--    por Deudas Personales que está dentro de SAN Ahorro."
--   "El monto de los deudores mes a mes no cuadra con la deuda real."
--
-- >>> 1) EL MES POR MES NO CUADRABA — Y ASÍ ES <<<
-- Las filas mostraban el monto COMPLETO de cada cuota, pagada o no. Sumando
-- los 6 meses daban 17,927,750 cuando la deuda real son 12,153,392: la
-- diferencia era cuotas ya pagadas y los saldos iniciales contados junto a
-- sus propios pagarés.
--
-- Ahora cada mes muestra lo que FALTA por pagar de ese mes. Con eso los
-- números cierran contra la deuda, hasta el último centavo:
--
--   antes de julio (vencido)   1,844,687.51
--   julio a diciembre          9,356,569.34   ← lo que se ve en la tabla
--   2027 en adelante             952,135.50
--                             ──────────────
--   deuda real a suplidores   12,153,392.35   ✓
--
-- La tabla ahora avisa cuánto queda fuera de la ventana de 6 meses, para que
-- se vea que el total no es toda la deuda sino el pedazo de esos 6 meses.
--
-- >>> 2) DEUDAS PERSONALES EN LUGAR DE LA DEUDA ENTRE EMPRESAS <<<
-- La línea entre empresas ya no aporta: se sabe que se elimina y en cuánto.
-- Su lugar lo toman las deudas personales del módulo SAN (san_deudas), que
-- SÍ son plata que hay que devolver:
--
--   DR ARECHE                      20,000,000.00
--   CRUZ MARIA                      2,000,000.00
--   MARIA CAMINERO                  1,000,000.00
--   EVARITA CAMINERO                1,000,000.00
--   JEEPETA ODALYS                    580,000.00
--   DEUDA DE PAPI A MAMA LILIANA       80,000.00
--                                  ─────────────
--                                  24,660,000.00
--
-- >>> OJO: LA POSICIÓN SE VUELVE NEGATIVA <<<
-- Y tiene que ser así. Con 24.6 millones en deudas personales sumados a los
-- 12.8 de suplidores y compromisos, la posición pasa de +8.1 millones a unos
-- −16.5. No es que el panel empeore: es que antes le faltaba la deuda más
-- grande que tiene el grupo.
--
-- Idempotente / re-ejecutable. Trae también la exclusión de los saldos
-- iniciales, por si gestion_excluir_saldo_inicial.sql no se corrió.
-- =====================================================================

-- ------------------------------------------------------------
-- 0) Los "SALDO INICIAL" ya desglosados en pagarés (por si falta)
-- ------------------------------------------------------------
ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS es_saldo_inicial boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.compras.es_saldo_inicial IS
  'Documento de arranque de la deuda, ya desglosado en pagarés. Es la MISMA deuda que sus pagarés: no debe sumarse junto a ellos.';

UPDATE public.compras
   SET es_saldo_inicial = true
 WHERE NOT es_saldo_inicial
   AND (referencia ILIKE 'SALDO INICIAL%' OR legacy_id LIKE 'papel:cxp:____-__-__:%');

-- ------------------------------------------------------------
-- 1) La función
-- ------------------------------------------------------------
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

  -- ---- deudas personales ----
  IF position('deudas_personales' in v_src) = 0 THEN
    v_src := replace(v_src,
      '  v_comp        numeric := 0;',
      '  v_comp        numeric := 0;' || E'\n' ||
      '  v_personales  numeric := 0;' || E'\n' ||
      '  v_personales_n int := 0;');

    v_src := replace(v_src,
$a$  SELECT COUNT(*), COALESCE(SUM(c.monto), 0) INTO v_comp_n, v_comp
  FROM public.compromisos c
  WHERE c.tenant_id = ANY(v_grupo) AND COALESCE(c.activo, true);$a$,
$b$  SELECT COUNT(*), COALESCE(SUM(c.monto), 0) INTO v_comp_n, v_comp
  FROM public.compromisos c
  WHERE c.tenant_id = ANY(v_grupo) AND COALESCE(c.activo, true);

  -- DEUDAS PERSONALES (módulo SAN). Es plata que hay que devolver, así que
  -- pesa en la posición igual que un suplidor. Sin esto el panel ignoraba la
  -- deuda más grande del grupo.
  SELECT COUNT(*), COALESCE(SUM(d.monto), 0) INTO v_personales_n, v_personales
  FROM public.san_deudas d
  WHERE d.tenant_id = ANY(v_grupo) AND COALESCE(d.activo, true);$b$);

    v_src := replace(v_src,
      $c$      'intercompania',    ROUND(v_inter, 2),$c$,
      $d$      'intercompania',    ROUND(v_inter, 2),
      'deudas_personales',      ROUND(v_personales, 2),
      'deudas_personales_cant', v_personales_n,$d$);

    -- Los pasivos y la neta cuentan las personales
    v_src := replace(v_src,
      $e$      'pasivos',          ROUND(v_cxp + v_comp, 2),$e$,
      $f$      'pasivos',          ROUND(v_cxp + v_comp + v_personales, 2),$f$);
    v_src := replace(v_src,
      '- v_cxp - v_comp, 2)',
      '- v_cxp - v_comp - v_personales, 2)');
    RAISE NOTICE 'Deudas personales incorporadas a la posición.';
  END IF;

  -- ---- el mes por mes, con lo que FALTA ----
  IF position('AS pendiente' in v_src) = 0 THEN
    v_src := replace(v_src,
$g$    SELECT (co.fecha + COALESCE(co.dias_credito, 0))::date AS vence,
           COALESCE(co.total_compra, 0) AS total,
           COALESCE(co.monto_pagado, 0) AS pagado$g$,
$h$    SELECT (co.fecha + COALESCE(co.dias_credito, 0))::date AS vence,
           COALESCE(co.total_compra, 0) AS total,
           COALESCE(co.monto_pagado, 0) AS pagado,
           COALESCE(co.monto_pendiente, 0) AS pendiente$h$);

    v_src := replace(v_src,
$i$      AND (pv.empresa_grupo_tenant_id IS NULL OR NOT (pv.empresa_grupo_tenant_id = ANY(v_grupo)))
  ),$i$,
$j$      AND NOT COALESCE(co.es_saldo_inicial, false)
      AND (pv.empresa_grupo_tenant_id IS NULL OR NOT (pv.empresa_grupo_tenant_id = ANY(v_grupo)))
  ),$j$);

    -- La fila del mes = lo que FALTA por pagar de ese mes. Con el monto
    -- completo, los 6 meses sumaban 17.9 millones contra una deuda de 12.1:
    -- la diferencia eran cuotas ya pagadas.
    v_src := replace(v_src,
$k$    SELECT m.mes, COALESCE(SUM(x.total), 0) AS monto, COUNT(x.total) AS cant
    FROM meses m
    LEFT JOIN cxp x ON date_trunc('month', x.vence)::date = m.mes
    GROUP BY m.mes$k$,
$l$    SELECT m.mes,
           COALESCE(SUM(x.pendiente), 0) AS monto,
           COUNT(x.pendiente) FILTER (WHERE x.pendiente > 0) AS cant
    FROM meses m
    LEFT JOIN cxp x ON date_trunc('month', x.vence)::date = m.mes
                   AND x.pendiente > 0
    GROUP BY m.mes$l$);

    -- Y cuánta deuda queda FUERA de la ventana, para que el total se entienda
    v_src := replace(v_src,
      $m$    'ventas_mes',      ROUND(v_ventas_mes, 2),$m$,
      $n$    'ventas_mes',      ROUND(v_ventas_mes, 2),
    'suplidores_fuera_ventana', (
      SELECT ROUND(COALESCE(SUM(pendiente), 0), 2) FROM cxp
       WHERE pendiente > 0
         AND (vence < v_mes_ini OR vence >= (v_mes_ini + (v_n || ' month')::interval)::date)
    ),$n$);
    RAISE NOTICE 'El mes por mes ahora muestra lo que falta por pagar.';
  END IF;

  EXECUTE v_src;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('gestion_deudas_personales_y_mes_real.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) LAS DEUDAS PERSONALES que entran a la posición
SELECT nombre, monto FROM public.san_deudas
WHERE tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113',
                    '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
  AND COALESCE(activo, true)
ORDER BY monto DESC;
-- esperado: 6 deudas, 24,660,000.00 en total

-- 2) EL MES POR MES YA CUADRA con la deuda real
WITH cxp AS (
  SELECT (co.fecha + COALESCE(co.dias_credito, 0))::date AS vence,
         COALESCE(co.monto_pendiente, 0) AS pendiente
  FROM public.compras co
  LEFT JOIN public.proveedores pv ON pv.id = co.suplidor_id
  WHERE co.tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113',
                         '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
    AND co.forma_pago ILIKE '%credito%'
    AND COALESCE(co.estado, '') <> 'ANULADA'
    AND COALESCE(co.monto_pendiente, 0) > 0
    AND NOT COALESCE(co.es_saldo_inicial, false)
    AND pv.empresa_grupo_tenant_id IS NULL
)
SELECT CASE
         WHEN vence < date_trunc('month', CURRENT_DATE)::date THEN '1. vencido (antes de julio)'
         WHEN vence < (date_trunc('month', CURRENT_DATE) + interval '6 month')::date THEN '2. en la tabla (jul-dic)'
         ELSE '3. despues de diciembre' END AS donde,
       count(*) AS cuotas, SUM(pendiente) AS monto
FROM cxp GROUP BY 1
UNION ALL
SELECT '   TOTAL = deuda real', count(*), SUM(pendiente) FROM cxp
ORDER BY 1;
-- esperado: vencido 1,844,687.51 · tabla 9,356,569.34 · después 952,135.50
--           TOTAL 12,153,392.35 — el mismo de "Suplidores" en la posición

-- 3) La cuenta duplicada que hay que revisar
SELECT alias, banco, moneda, saldo, activo
FROM public.cuentas_bancarias_saldos
WHERE tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113',
                    '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
ORDER BY activo DESC, saldo DESC;
-- OJO: hay una cuenta INACTIVA llamada "MOTOPRESTAMOS LOS NARANJOS
-- (duplicada - usar la de MotoPréstamos)" con RD$10,000 dentro. Ni el panel
-- ni el módulo la cuentan (los dos filtran activas), así que esos 10,000
-- están invisibles. Hay que moverlos a la cuenta buena o dejarla en 0.
