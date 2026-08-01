-- =====================================================================
-- FT-20 pasa a CONTADO: pagó el 100% al momento
-- ---------------------------------------------------------------------
-- (2026-07-31) "¿Por qué la venta de hoy de 85,000 no me sale de contado?"
--
-- Porque se grabó como CRÉDITO aunque el cliente pagó todo:
--
--   FT-20 · RUBENS FRANCOIS · 31/07 22:01
--   forma_pago CREDITO · total 85,000 · recibido 85,000 · pendiente 0
--   días de crédito 0 · sin préstamo asociado
--   RI-000012 · 85,000 EFECTIVO · "Abono parcial al momento de la venta"
--
-- De parcial no tuvo nada. Al ser crédito, el cobro se registró como recibo
-- y por eso no aparece en ninguna línea de "ventas de contado".
--
-- >>> EL DINERO NUNCA SE PERDIÓ <<<
-- Entraba por la otra puerta: el recibo. Por eso el cuadre de caja daba bien
-- y lo único mal era la clasificación. Eso manda cómo se corrige: si se pone
-- la factura en CONTADO y se deja el recibo vivo, los 85,000 se cuentan DOS
-- veces —una por la factura y otra por el recibo—. Por eso el recibo se
-- anula en el mismo paso.
--
--   antes:  factura CREDITO (no suma) + recibo 85,000   = 85,000
--   ahora:  factura CONTADO (suma)    + recibo anulado  = 85,000
--
-- El total del día no cambia. Cambia dónde se lee: deja de ser "inicial de
-- una venta financiada" y pasa a ser lo que fue, una venta de contado.
--
-- Se calca FT-18, la venta de contado de ayer: forma_pago CONTADO,
-- tipo_pago EFECTIVO, recibido = total, cambio 0, pendiente 0, PAGADA.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

DO $$
DECLARE
  v_ten     uuid := 'b39506c3-27dc-467d-830b-096731b83113';
  v_fact    uuid := 'fcc71ca9-3101-4c8c-8902-ae69923f6e37';  -- FT-20
  v_recibo  uuid := 'bb32efb9-b9aa-46f8-a6b1-85cf53bd259d';  -- RI-000012
  v_total   numeric;
  v_pend    numeric;
BEGIN
  SELECT total, COALESCE(monto_pendiente, 0) INTO v_total, v_pend
  FROM public.facturas WHERE id = v_fact AND tenant_id = v_ten;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No aparece FT-20 (%). Revisar antes de tocar nada.', v_fact;
  END IF;

  -- Guarda: si quedara algo pendiente, NO es una venta de contado y
  -- convertirla escondería una deuda.
  IF v_pend > 0.009 THEN
    RAISE EXCEPTION 'FT-20 tiene RD$% pendiente: no es de contado.', v_pend;
  END IF;

  UPDATE public.facturas
     SET forma_pago     = 'CONTADO',
         tipo_pago      = 'EFECTIVO',
         monto_recibido = v_total,
         cambio         = 0,
         dias_credito   = 0,
         monto_pendiente = 0,
         estado         = 'PAGADA'
   WHERE id = v_fact AND tenant_id = v_ten;

  -- El recibo se anula: su cobro ya lo representa la factura de contado.
  -- Sin esto los 85,000 se contarían dos veces.
  UPDATE public.recibos_ingreso
     SET anulado  = true,
         concepto = COALESCE(concepto, '') || ' · ANULADO: la venta pasó a CONTADO (el cobro lo representa la factura)'
   WHERE id = v_recibo AND tenant_id = v_ten AND COALESCE(anulado, false) = false;

  RAISE NOTICE 'FT-20 ahora es CONTADO por RD$ % y RI-000012 quedó anulado.', v_total;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('ft20_a_contado.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) LA FACTURA, IGUAL QUE FT-18
SELECT numero, fecha, forma_pago, tipo_pago, total, monto_recibido,
       cambio, monto_pendiente, estado
FROM public.facturas
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND numero IN (18, 19, 20)
ORDER BY numero;
-- esperado: 18 y 20 CONTADO/EFECTIVO con pendiente 0; 19 sigue CREDITO con
-- 5,000 pendientes, que ese sí es crédito de verdad.

-- 2) QUE NO SE CUENTE DOS VECES
WITH hoy AS (SELECT DATE '2026-07-31' AS d)
SELECT 'Ventas de contado' AS concepto, COALESCE(SUM(f.total), 0) AS monto
FROM public.facturas f CROSS JOIN hoy
WHERE f.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date = hoy.d
  AND f.forma_pago ILIKE 'contado' AND COALESCE(f.estado, '') <> 'ANULADA'
UNION ALL
SELECT 'Recibos vivos', COALESCE(SUM(r.monto_pagado), 0)
FROM public.recibos_ingreso r CROSS JOIN hoy
WHERE r.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND r.fecha = hoy.d AND COALESCE(r.anulado, false) = false;
-- esperado: contado 85,000 · recibos 50,000 (solo la inicial de FT-19).
-- Total cobrado hoy 135,000, el mismo de antes: solo cambió de columna.
