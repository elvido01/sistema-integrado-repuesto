-- =====================================================================
-- DATA FIX: facturas FT-12 y FT-13 de Caminero sin los extras financiados
-- ---------------------------------------------------------------------
-- Regla confirmada por Caminero Motors (2026-07-17): la factura de una
-- venta financiada incluye los add-ons (GPS/casco/seguro/placa) DENTRO
-- del precio del vehículo — así la imprime el sistema viejo (FERNANDO:
-- 0003995 por 184,600 = 180,000 + GPS 3,600 + seguro 1,000).
--
-- MotoFlow facturó solo el valor de contado. Corrección:
--   FT-12 ERNESTINA: 280,000 → 284,600 | pendiente 180,000 → 184,600
--       (queda 1:1 con la CxP FIN-000001 de 184,600 ✓)
--   FT-13 FERNANDO : 180,000 → 184,600 | pendiente 133,000 → 137,600
--       (= préstamo 134,600 + adicional 3,000)
--   CxP FIN-000002 : 134,600 → 137,600 (capital + adicional: todo lo que
--       la financiera cobra del cliente y le debe al dealer)
--
-- El flujo nuevo ya factura con extras y crea la CxP con capital+adicional
-- (SolicitudesComprasPage + adicional_cargo_financiamiento.sql).
-- Idempotente: los UPDATE solo tocan los valores viejos exactos.
-- =====================================================================

-- Vista previa ANTES
SELECT 'ANTES' AS momento, numero, subtotal, total, monto_recibido, monto_pendiente
FROM public.facturas
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113' AND numero IN (12, 13)
ORDER BY numero;

-- ---------------- FT-12 (ERNESTINA): +4,600 de GPS+seguro ----------------
UPDATE public.facturas
   SET subtotal = 284600, total = 284600, monto_pendiente = 184600
 WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
   AND numero = 12
   AND total = 280000;          -- solo si sigue con el valor viejo

UPDATE public.facturas_detalle
   SET precio = 284600, importe = 284600
 WHERE factura_id = 'd16b4b53-bf1c-45c9-976b-17298a4c3ff5'
   AND precio = 280000;

-- ---------------- FT-13 (FERNANDO): +4,600 de GPS+seguro ----------------
UPDATE public.facturas
   SET subtotal = 184600, total = 184600, monto_pendiente = 137600
 WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
   AND numero = 13
   AND total = 180000;

UPDATE public.facturas_detalle
   SET precio = 184600, importe = 184600
 WHERE factura_id = 'ab94986b-daf5-45c2-ace8-983bf814e865'
   AND precio = 180000;

-- ---------------- CxP FIN-000002: capital + adicional ----------------
UPDATE public.compras
   SET total_exento = 137600, total_compra = 137600, monto_pendiente = 137600
 WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
   AND numero = 'FIN-000002'
   AND total_compra = 134600
   AND monto_pagado = 0;        -- solo si aún no se ha pagado nada

-- Vista previa DESPUÉS (facturas + CxP deben cuadrar 1:1)
SELECT 'DESPUES' AS momento, f.numero, f.total, f.monto_pendiente AS cxc_pendiente,
       c.numero AS cxp, c.total_compra AS cxp_total
FROM public.facturas f
LEFT JOIN public.compras c
  ON c.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
 AND c.referencia ILIKE 'Financiamiento factura #' || f.numero || '%'
WHERE f.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113' AND f.numero IN (12, 13)
ORDER BY f.numero;
-- Esperado:
--   FT-12: total 284,600 | CxC 184,600 | CxP FIN-000001 184,600  (cuadra: financiera cobra 184,600 del préstamo)
--   FT-13: total 184,600 | CxC 137,600 | CxP FIN-000002 137,600  (cuadra: 134,600 préstamo + 3,000 AD)

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_facturas_extras_ft12_ft13.sql');
  END IF;
END $$;

SELECT 'Facturas FT-12/FT-13 con extras + CxP cuadrada' AS status;
