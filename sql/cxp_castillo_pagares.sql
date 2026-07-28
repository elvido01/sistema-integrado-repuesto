-- =====================================================================
-- CxP Caminero — MOTOPRESTAMOS CASTILLO: la deuda real en sus 3 pagos
-- ---------------------------------------------------------------------
-- (2026-07-28) Estaba como un "SALDO INICIAL papel" (SI-CXP-3) de
-- RD$1,269,000 en una sola línea, sin vencimientos.
--
-- La deuda real es RD$1,378,000, a pagar el DÍA 15 DE CADA MES:
--
--   15-06-2026   RD$   277,500
--   15-07-2026   RD$   550,250
--   15-08-2026   RD$   550,250
--                ─────────────
--                RD$ 1,378,000   ✔ suma exacta
--
-- SUBE RD$109,000: el saldo en papel se había quedado corto (1,269,000).
--
-- >>> DOS DE LOS TRES YA ESTÁN VENCIDOS <<<
-- Hoy es 28-07-2026, así que las cuotas de junio y julio ya pasaron:
-- RD$827,750 entran como VENCIDO en cuentas por pagar y en el dashboard.
-- No es un error del cargue: es la situación real de esa deuda.
--
-- Esta cuenta es en PESOS, no en dólares como los demás suplidores de
-- Caminero. No lleva tasa de cambio.
--
-- El saldo inicial se ANULA (no se borra) para dejar el rastro de lo que
-- decía el papel. No tiene pagos aplicados, así que no se pierde nada.
--
-- Idempotente por compras.legacy_id. Correr en PRODUCCIÓN.
-- =====================================================================

DO $$
DECLARE
  v_cam       uuid := 'b39506c3-27dc-467d-830b-096731b83113';  -- CAMINERO MOTORS
  v_cas       uuid := 'b4d12387-2858-4fc1-bc7e-00323415a0be';  -- MOTOPRESTAMOS CASTILLO S.R.L.
  v_si_legacy text := 'papel:cxp:2026-07-14:3';                -- saldo inicial SI-CXP-3
  v_base      date := DATE '2026-06-15';                       -- primer vencimiento
  r           record;
  v_n         int;
BEGIN
  -- 1) Los 3 pagos, cada uno venciendo el 15
  FOR r IN
    SELECT * FROM (VALUES
      (1,  0, 277500.00),   -- 15-06-2026
      (2, 30, 550250.00),   -- 15-07-2026
      (3, 61, 550250.00)    -- 15-08-2026
    ) AS t(cuota, dias, monto)
  LOOP
    INSERT INTO public.compras (
      tenant_id, numero, fecha, suplidor_id, referencia, notas,
      total_exento, total_gravado, itbis_total, total_compra,
      forma_pago, dias_credito, monto_pagado, monto_pendiente, estado,
      itbis_incluido, actualizar_precios, moneda, legacy_id
    )
    SELECT
      v_cam,
      'FIN-CAST-' || lpad(r.cuota::text, 2, '0'),
      v_base, v_cas,
      'Deuda Motopréstamos Castillo - Pagaré ' || r.cuota || '/3 (MOTOPRESTAMOS CASTILLO S.R.L.)',
      CASE WHEN r.cuota = 1
           THEN E'Deuda total RD$1,378,000 pagadera el día 15 de cada mes:\n15-06-2026  RD$277,500\n15-07-2026  RD$550,250\n15-08-2026  RD$550,250\nCuenta en PESOS (no lleva tasa de cambio).\nReemplaza el saldo inicial de papel, que decía RD$1,269,000.'
           ELSE 'Cuota ' || r.cuota || '/3 de la deuda con Motopréstamos Castillo - detalle en la cuota 1' END,
      r.monto, 0, 0, r.monto,
      'CREDITO', r.dias, 0, r.monto, 'PENDIENTE',
      false, false, 'DOP',
      'papel:cxp:castillo:P' || r.cuota
    WHERE NOT EXISTS (
      SELECT 1 FROM public.compras c
      WHERE c.tenant_id = v_cam
        AND c.legacy_id = 'papel:cxp:castillo:P' || r.cuota
    );
  END LOOP;

  -- 2) El saldo inicial de papel queda reemplazado. Se ANULA, no se borra:
  --    así queda el rastro de que el papel decía RD$1,269,000.
  UPDATE public.compras
     SET estado          = 'ANULADA',
         monto_pendiente = 0,
         referencia      = regexp_replace(referencia, '\s+—.*$', '')
                           || ' — reemplazado por los 3 pagarés (deuda real RD$1,378,000)'
   WHERE tenant_id = v_cam
     AND legacy_id  = v_si_legacy
     AND estado    <> 'ANULADA';
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RAISE NOTICE 'Castillo: 3 pagarés cargados (RD$1,378,000). Saldo inicial anulado: % fila(s)', v_n;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('cxp_castillo_pagares.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) Los 3 pagos con su vencimiento el día 15
SELECT numero, referencia, fecha, dias_credito,
       (fecha + dias_credito)::date AS vence,
       total_compra, estado,
       CASE WHEN (fecha + dias_credito)::date < CURRENT_DATE THEN 'VENCIDO' ELSE 'por vencer' END AS situacion
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND legacy_id LIKE 'papel:cxp:castillo:%'
ORDER BY vence;
-- esperado: 15/06 277,500 VENCIDO | 15/07 550,250 VENCIDO | 15/08 550,250 por vencer

-- 2) EL NÚMERO QUE IMPORTA: RD$1,378,000
SELECT count(*) AS pagares, SUM(total_compra) AS total_rd, SUM(monto_pendiente) AS pendiente_rd
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND legacy_id LIKE 'papel:cxp:castillo:%';
-- esperado: 3 | 1,378,000.00 | 1,378,000.00

-- 3) El saldo inicial viejo queda ANULADO y fuera de cuentas por pagar
SELECT numero, total_compra, monto_pendiente, estado, referencia
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND legacy_id = 'papel:cxp:2026-07-14:3';
-- esperado: ANULADA | pendiente 0

-- 4) Total pendiente con Castillo (solo debe contar lo nuevo)
SELECT COALESCE(SUM(monto_pendiente), 0) AS pendiente_castillo
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND suplidor_id = 'b4d12387-2858-4fc1-bc7e-00323415a0be'
  AND estado = 'PENDIENTE';
-- esperado: 1,378,000.00 (antes eran 1,269,000: sube RD$109,000)
