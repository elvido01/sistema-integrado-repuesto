-- =====================================================================
-- Reparar la compra F30000106772 de Teruel: referencia repetida y fecha
-- ---------------------------------------------------------------------
-- (2026-07-27) Al editar y volver a grabar la compra, quedó así:
--
--   "Factura Factura F30000106772 - Pagaré 1/15 (TERUEL & COMPANIA SRL)
--    - Pagaré 3/15 (TERUEL & COMPANIA SRL)"
--
-- DOS problemas, los dos ya corregidos en el código:
--
-- 1) LA ETIQUETA SE ENVOLVÍA SOBRE SÍ MISMA. Al crear, la referencia es la
--    factura pelada ("F30000106772") y el sistema le arma la etiqueta. Pero al
--    EDITAR ya venía con la etiqueta puesta y se la volvía a poner encima.
--    Fíjate que el pagaré del medio quedó congelado en "1/15" (el que se
--    guardó la primera vez) y solo el del final va cambiando.
--
-- 2) LA FECHA RETROCEDÍA UN DÍA EN CADA EDICIÓN. El formulario cargaba
--    new Date('2026-07-22'), que JavaScript lee como medianoche UTC; en
--    Santo Domingo (UTC-4) eso es el día 21 a las 8pm. Al grabar se guardaba
--    el 21. La compra quedó en 2026-07-21 y va el 22.
--
-- Este script arregla las 15 filas que ya se grabaron mal. El código nuevo
-- evita que vuelva a pasar.
--
-- Idempotente: al correrlo de nuevo no encuentra nada que cambiar.
-- =====================================================================

DO $$
DECLARE
  v_cam uuid := 'b39506c3-27dc-467d-830b-096731b83113';  -- CAMINERO MOTORS
  v_n   int;
BEGIN
  -- 1) Rearmar la etiqueta desde cero: se recorta a la factura pelada y se le
  --    pone el número de pagaré que le toca según el sufijo del número.
  --    OC-0005-03 -> "Factura F30000106772 - Pagaré 3/15 (TERUEL & COMPANIA SRL)"
  UPDATE public.compras c
     SET referencia = 'Factura '
                   || regexp_replace(
                        regexp_replace(c.referencia, '\s*-\s*(Pagar[ée]|Cuota)\s+\d+\s*/\s*\d+.*$', '', 'i'),
                        '^(\s*Factura\s+)+', '', 'i')
                   || ' - Pagaré '
                   || ltrim(right(c.numero, 2), '0') || '/15'
                   || ' (' || p.nombre || ')'
    FROM public.proveedores p
   WHERE p.id = c.suplidor_id
     AND c.tenant_id = v_cam
     AND c.numero LIKE 'OC-0005-%'
     -- solo las que traen la etiqueta repetida
     AND (c.referencia ~* 'Factura\s+Factura'
          OR (length(c.referencia) - length(regexp_replace(c.referencia, 'Pagar[ée]', '', 'gi'))) > 7);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Referencias rearmadas: %', v_n;

  -- 2) La fecha correcta es 22/07/2026 (confirmada por el usuario)
  UPDATE public.compras
     SET fecha = DATE '2026-07-22'
   WHERE tenant_id = v_cam
     AND numero LIKE 'OC-0005-%'
     AND fecha <> DATE '2026-07-22';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Fechas corregidas a 2026-07-22: %', v_n;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_compra_teruel_referencia_y_fecha.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) Los 15 pagarés con su etiqueta limpia y su vencimiento
SELECT numero, fecha, (fecha + dias_credito)::date AS vence,
       referencia, total_usd, estado
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND numero LIKE 'OC-0005-%'
ORDER BY dias_credito;
-- esperado: "Factura F30000106772 - Pagaré N/15 (TERUEL & COMPANIA SRL)"
--           con N corriendo de 1 a 15, fecha 2026-07-22, sin "Factura Factura"

-- 2) Ninguna referencia puede nombrar "Pagaré" más de una vez
SELECT count(*) AS referencias_repetidas
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND (referencia ~* 'Factura\s+Factura'
       OR (length(referencia) - length(regexp_replace(referencia, 'Pagar[ée]', '', 'gi'))) > 7);
-- esperado: 0

-- 3) La factura completa: 15 pagarés que suman lo mismo de antes
SELECT count(*) AS pagares,
       SUM(total_usd)    AS total_usd,
       SUM(total_compra) AS total_rd
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND numero LIKE 'OC-0005-%';
-- esperado: 15 | 13,963.50 | 851,773.50
