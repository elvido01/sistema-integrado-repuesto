-- =====================================================================
-- Etiqueta del pagaré en la REFERENCIA (compra 028468 Motores del Sur)
-- ---------------------------------------------------------------------
-- (2026-07-25, Caminero) En Cuentas por Pagar la columna "Referencia" es la
-- que se lee, y los pagarés viejos de Motores del Sur muestran:
--   "Factura 27324 - Pagaré 6/6 (Motores del Sur)"
-- Los 6 pagarés nuevos de la factura 028468 quedaron con la referencia
-- pelada ("028468") porque la etiqueta se guardó en `notas`.
--
-- Ya corregido en el front (la etiqueta se arma en `referencia` al grabar).
-- Este script actualiza las 6 filas YA guardadas al mismo formato, usando el
-- número de pagaré que quedó en `notas` y el nombre real del suplidor.
-- Solo toca filas cuya referencia sigue siendo el número pelado. Idempotente.
-- Correr en PRODUCCIÓN (SQL editor de Supabase).
-- =====================================================================

UPDATE public.compras c
   SET referencia = 'Factura ' || c.referencia || ' - Pagaré '
                    || substring(c.notas from 'Pagaré\s+(\d+/\d+)')
                    || ' (' || initcap(p.nombre) || ')'
  FROM public.proveedores p
 WHERE p.id = c.suplidor_id
   AND c.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'   -- Caminero Motors
   AND c.referencia = '028468'                                -- factura afectada
   AND c.notas ~ 'Pagaré\s+\d+/\d+'
   AND c.referencia NOT LIKE 'Factura %';                     -- no re-etiquetar

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_referencia_pagares_028468.sql');
  END IF;
END $$;

-- Verificación: las 6 filas con su etiqueta
SELECT numero, referencia, total_usd, dias_credito
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND numero LIKE 'OC-0002-%'
ORDER BY numero;
