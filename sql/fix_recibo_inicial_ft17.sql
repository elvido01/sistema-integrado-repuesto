-- =====================================================================
-- FIX: recibo del INICIAL de FT-17 (Caminero) faltante en la lista
-- ---------------------------------------------------------------------
-- (2026-07-24) La venta FT-17 (GUILLAUME JUDELOR, inicial RD$28,000) se
-- registró de CONTADO y luego se editó a CRÉDITO. El recibo del inicial se
-- crea automáticamente SOLO en una venta a crédito nueva, así que quedó sin
-- recibo: no aparece en "Lista de Transacciones" ni sumó a la caja de
-- Caminero (a diferencia de FT-12..16, que sí tienen su RI del inicial).
--
-- Crea el recibo del inicial (igual que los demás: a nombre del COMPRADOR,
-- en efectivo, con la fecha de la venta). Idempotente: no duplica si ya existe.
-- NO toca el pendiente de la factura (esa CxC es del financiamiento a terceros).
-- Correr en PRODUCCIÓN (SQL editor de Supabase).
-- =====================================================================

DO $$
DECLARE
  v_cam   uuid := 'b39506c3-27dc-467d-830b-096731b83113';  -- Caminero Motors
  v_cli   uuid := 'cf4b57ab-5b36-40aa-9c19-c55c811601b7';  -- GUILLAUME JUDELOR
  v_user  uuid := '6d7e711c-935d-442b-8f45-cf308863f414';  -- cajero/owner Caminero
  v_seq   int;
  v_num   text;
BEGIN
  -- Idempotencia: si ya hay un recibo del inicial de FT-17, no hacer nada.
  IF EXISTS (
    SELECT 1 FROM public.recibos_ingreso
    WHERE tenant_id = v_cam AND concepto ILIKE '%FT-17%'
      AND COALESCE(anulado, false) = false
  ) THEN
    RAISE NOTICE 'Ya existe un recibo para FT-17; no se crea otro.';
    RETURN;
  END IF;

  -- Siguiente número RI-XXXXXX (ignora números legacy gigantes)
  SELECT COALESCE(MAX((regexp_replace(numero, '\D', '', 'g'))::bigint), 0) + 1
    INTO v_seq
  FROM public.recibos_ingreso
  WHERE tenant_id = v_cam
    AND numero ~ '^RI-\d+$'
    AND (regexp_replace(numero, '\D', '', 'g'))::bigint < 9000000;
  v_num := 'RI-' || lpad(v_seq::text, 6, '0');

  INSERT INTO public.recibos_ingreso (
    tenant_id, numero, fecha, cliente_id, monto_pagado, concepto,
    formas_pago, usuario_id, anulado, origen
  ) VALUES (
    v_cam, v_num, DATE '2026-07-24', v_cli, 28000,
    'Abono parcial al momento de la venta - FT-17',
    '[{"forma":"EFECTIVO","monto":28000,"referencia":""}]'::jsonb,
    v_user, false, NULL
  );

  RAISE NOTICE 'Recibo % creado (inicial FT-17, RD$28,000).', v_num;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_recibo_inicial_ft17.sql');
  END IF;
END $$;

-- Verificación
SELECT numero, fecha, monto_pagado, concepto
FROM public.recibos_ingreso
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND concepto ILIKE '%FT-17%';
