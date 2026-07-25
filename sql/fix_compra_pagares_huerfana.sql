-- =====================================================================
-- FIX: compra a PAGARÉS que quedó a medias (solo la cuota 1)
-- ---------------------------------------------------------------------
-- (2026-07-25, Caminero) Al grabar la factura 028468 (Motores del Sur,
-- US$26,975 en 6 pagarés) solo entró la 1ra cuota: `OC-0002-01`. Las otras 5
-- no se crearon y la compra quedó SIN detalle y SIN movimientos de inventario
-- (verificado: detalle 0, inventario 0, pagos 0). Al reintentar, el sistema
-- la bloqueaba con "Factura Duplicada" por esa fila huérfana.
--
-- CAUSA: el guardado insertaba primero la cuota 1 y DESPUÉS el resto en otra
-- llamada; si la 2da fallaba, quedaba la compra a medias. Ya está corregido
-- en el front: ahora las N filas se insertan de una sola vez (todo o nada).
--
-- Este script borra ÚNICAMENTE esa fila huérfana para poder volver a grabar
-- la compra completa. Solo borra si sigue sin detalle, sin inventario y sin
-- pagos (si tuviera algo, no toca nada). Idempotente.
-- Correr en PRODUCCIÓN (SQL editor de Supabase).
-- =====================================================================

DO $$
DECLARE
  v_cam uuid := 'b39506c3-27dc-467d-830b-096731b83113';  -- Caminero Motors
  v_id  uuid;
BEGIN
  SELECT c.id INTO v_id
  FROM public.compras c
  WHERE c.tenant_id = v_cam
    AND c.numero = 'OC-0002-01'
    AND c.referencia = '028468'
    AND NOT EXISTS (SELECT 1 FROM public.compras_detalle d WHERE d.compra_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.inventario_movimientos m
                    WHERE m.referencia_doc = 'COMPRA-' || c.numero)
    AND COALESCE(c.monto_pagado, 0) = 0;

  IF v_id IS NULL THEN
    RAISE NOTICE 'No se encontró la fila huérfana (o ya tiene detalle/inventario/pagos): no se borra nada.';
    RETURN;
  END IF;

  DELETE FROM public.compras WHERE id = v_id;
  RAISE NOTICE 'Fila huérfana OC-0002-01 (factura 028468) borrada. Ya puedes volver a grabar la compra completa.';
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_compra_pagares_huerfana.sql');
  END IF;
END $$;

-- Verificación: no debe quedar ninguna compra con esa factura
SELECT numero, referencia, total_usd, estado
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND referencia = '028468';
