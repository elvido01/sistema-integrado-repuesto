-- =====================================================================
-- Corregir el año de la compra F30000106772 (Teruel, RD$880,500)
-- ---------------------------------------------------------------------
-- (2026-07-27) La compra se grabó con fecha 22/07/2022 cuando era
-- 22/07/2026: el día y el mes estaban bien, se erró el AÑO.
--
-- Por eso "no aparecía" en el Reporte de Compras: el listado va ordenado por
-- fecha y la compra quedaba cuatro años atrás, al fondo de todo.
--
-- La compra son 15 pagarés de RD$58,700 (15 x 58,700 = 880,500) con
-- vencimientos mensuales (dias_credito 31, 62, 92 ... 457). Con la fecha
-- vieja los 15 figuraban VENCIDOS; al corregir el año pasan a vencer entre
-- agosto/2026 y octubre/2027, que es lo real.
--
-- Solo se toca la fecha. Montos, pagarés, plazos y estados quedan igual.
--
-- Idempotente: al correrlo de nuevo ya no encuentra filas en 2022.
-- =====================================================================

DO $$
DECLARE
  v_cam uuid := 'b39506c3-27dc-467d-830b-096731b83113';  -- CAMINERO MOTORS
  v_n   int;
BEGIN
  UPDATE public.compras
     SET fecha = DATE '2026-07-22'
   WHERE tenant_id = v_cam
     AND numero LIKE 'F30000106772-%'
     AND fecha = DATE '2022-07-22';
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RAISE NOTICE 'Pagarés con el año corregido: % (se esperaban 15)', v_n;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_fecha_compra_teruel_880500.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) Los 15 pagarés con su vencimiento recalculado
SELECT numero, fecha, dias_credito,
       (fecha + dias_credito)::date AS vence,
       total_compra, estado
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND numero LIKE 'F30000106772-%'
ORDER BY dias_credito;
-- esperado: los 15 con fecha 2026-07-22, venciendo de 2026-08-22 a 2027-10-22

-- 2) La factura completa debe seguir sumando 880,500
SELECT count(*) AS pagares, SUM(total_compra) AS total_factura
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND numero LIKE 'F30000106772-%';
-- esperado: 15 | 880,500.00

-- 3) A Caminero no debe quedarle NINGUNA compra en 2022
SELECT EXTRACT(YEAR FROM fecha)::int AS anio, count(*) AS compras
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
GROUP BY 1 ORDER BY 1;
-- esperado: sin fila de 2022
