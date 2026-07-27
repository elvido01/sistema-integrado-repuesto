-- =====================================================================
-- CxP Caminero: detallar la deuda de TUCAN en sus facturas reales
-- ---------------------------------------------------------------------
-- (2026-07-27) TUCAN estaba cargado como un solo "SALDO INICIAL papel" de
-- US$16,580. El usuario aportó las facturas físicas: son de AUTO
-- MOTOPRESTAMOS ORIENTAL RAMIREZ, SRL (la misma casa; "Super Tucán" es la
-- marca de las motos). Se detalla la deuda por factura y pagaré, y TUCAN
-- desaparece como suplidor duplicado.
--
-- LAS FACTURAS CUADRAN EXACTO con el saldo que había:
--     VCRO-6618 (06/05/2026)  US$ 12,150.00  → 4 pagos de 3,038 (últ. 3,036)
--     VCRO-6644 (12/05/2026)  US$  4,430.00  → 4 pagos de 1,108 (últ. 1,106)
--                             ─────────────
--                             US$ 16,580.00 = saldo inicial de TUCAN ✔
--
-- Ya se le habían pagado US$5,000 (PS-000003 del 15/07), así que la deuda
-- viva sigue siendo US$11,580: ese pago se aplica a los pagarés más viejos
-- (6618-P1 completo, 6644-P1 completo y 854 al 6618-P2), igual que en una
-- cascada normal. El total pendiente NO cambia.
--
-- Vencimientos cada 30 días desde la fecha de la factura (confirmado con el
-- usuario). Nota: Motores del Sur también factura su primer pagaré a ~30
-- días (verificado en la factura 028468: dias_credito 31/62/92/123/153/184).
--
-- Moneda US$ con la tasa de la propia factura (62.00). El US$ es lo
-- autoritativo; el RD$ es referencial, cada pago usa la tasa de su día.
--
-- Idempotente por compras.legacy_id. Correr en PRODUCCIÓN.
-- =====================================================================

DO $$
DECLARE
  v_cam      uuid := 'b39506c3-27dc-467d-830b-096731b83113';  -- CAMINERO MOTORS
  v_tucan    uuid := '110cebb1-52f2-4fd1-b0f0-3c174384cb1f';  -- TUCAN (a eliminar)
  v_oriental uuid := '3206aa5c-dc93-41b7-b889-c8fadbe0c7df';  -- AUTO MOTOPRESTAMOS ORIENTAL RAMIREZ
  v_tasa     numeric := 62.00;   -- tasa impresa en ambas facturas
  r          record;
BEGIN
  -- 0) El suplidor factura en dólares
  UPDATE public.proveedores
     SET moneda = 'USD'
   WHERE id = v_oriental AND tenant_id = v_cam AND COALESCE(moneda, 'DOP') <> 'USD';

  -- 1) Los 8 pagarés. `pagado_usd` = parte ya cubierta por el pago de
  --    US$5,000 que se había hecho (cascada por vencimiento más viejo).
  FOR r IN
    SELECT * FROM (VALUES
      -- factura,      fecha_fac,      n, total_usd, pagado_usd, dias
      ('VCRO-6618', DATE '2026-05-06', 1, 3038.00, 3038.00,  30),
      ('VCRO-6618', DATE '2026-05-06', 2, 3038.00,  854.00,  60),
      ('VCRO-6618', DATE '2026-05-06', 3, 3038.00,    0.00,  90),
      ('VCRO-6618', DATE '2026-05-06', 4, 3036.00,    0.00, 120),
      ('VCRO-6644', DATE '2026-05-12', 1, 1108.00, 1108.00,  30),
      ('VCRO-6644', DATE '2026-05-12', 2, 1108.00,    0.00,  60),
      ('VCRO-6644', DATE '2026-05-12', 3, 1108.00,    0.00,  90),
      ('VCRO-6644', DATE '2026-05-12', 4, 1106.00,    0.00, 120)
    ) AS t(factura, fecha_fac, n, total_usd, pagado_usd, dias)
  LOOP
    INSERT INTO public.compras (
      tenant_id, numero, fecha, suplidor_id, referencia,
      total_exento, total_gravado, itbis_total, total_compra,
      forma_pago, dias_credito, monto_pagado, monto_pendiente, estado,
      itbis_incluido, actualizar_precios,
      moneda, tasa_cambio, total_usd, pendiente_usd, legacy_id
    )
    SELECT
      v_cam,
      'FIN-' || replace(r.factura, 'VCRO-', '') || '-' || lpad(r.n::text, 2, '0'),
      r.fecha_fac, v_oriental,
      'Factura ' || r.factura || ' - Pagaré ' || r.n || '/4 (Auto Motoprestamos Oriental Ramirez)',
      ROUND(r.total_usd * v_tasa, 2), 0, 0, ROUND(r.total_usd * v_tasa, 2),
      'CREDITO', r.dias,
      ROUND(r.pagado_usd * v_tasa, 2),
      ROUND((r.total_usd - r.pagado_usd) * v_tasa, 2),
      CASE WHEN r.pagado_usd >= r.total_usd THEN 'PAGADA' ELSE 'PENDIENTE' END,
      false, false,
      'USD', v_tasa, r.total_usd, (r.total_usd - r.pagado_usd),
      'papel:cxp:factura:' || r.factura || ':P' || r.n
    WHERE NOT EXISTS (
      SELECT 1 FROM public.compras c
      WHERE c.tenant_id = v_cam
        AND c.legacy_id = 'papel:cxp:factura:' || r.factura || ':P' || r.n
    );
  END LOOP;

  -- 2) Los pagos ya hechos pasan al suplidor correcto (no se pierde historial)
  UPDATE public.pagos_suplidores
     SET suplidor_id = v_oriental
   WHERE tenant_id = v_cam AND suplidor_id = v_tucan;

  -- 3) Fuera el "SALDO INICIAL papel" de TUCAN: ya está detallado arriba
  DELETE FROM public.compras
   WHERE tenant_id = v_cam AND suplidor_id = v_tucan;

  -- 4) TUCAN desaparece como suplidor (solo si ya no lo referencia nada)
  IF NOT EXISTS (SELECT 1 FROM public.compras          WHERE suplidor_id = v_tucan)
 AND NOT EXISTS (SELECT 1 FROM public.pagos_suplidores WHERE suplidor_id = v_tucan)
 AND NOT EXISTS (SELECT 1 FROM public.productos        WHERE suplidor_id = v_tucan)
  THEN
    DELETE FROM public.proveedores WHERE id = v_tucan AND tenant_id = v_cam;
    RAISE NOTICE 'TUCAN eliminado como suplidor.';
  ELSE
    RAISE NOTICE 'TUCAN NO se eliminó: todavía hay registros que lo referencian.';
  END IF;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('cxp_tucan_a_oriental_ramirez.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) Los 8 pagarés con su vencimiento y estado
SELECT c.numero, c.referencia,
       (c.fecha + c.dias_credito)::date AS vence,
       c.total_usd, c.pendiente_usd, c.estado
FROM public.compras c
WHERE c.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND c.legacy_id LIKE 'papel:cxp:factura:VCRO-%'
ORDER BY vence;

-- 2) La deuda viva debe seguir siendo US$11,580
SELECT COALESCE(SUM(pendiente_usd), 0) AS pendiente_usd_oriental
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND suplidor_id = '3206aa5c-dc93-41b7-b889-c8fadbe0c7df'
  AND estado = 'PENDIENTE';

-- 3) TUCAN ya no debe existir
SELECT count(*) AS tucan_restante
FROM public.proveedores
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113' AND nombre = 'TUCAN';
