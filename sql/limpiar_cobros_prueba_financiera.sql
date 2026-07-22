-- =====================================================================
-- Borrar cobros de PRUEBA en el sistema nuevo (financiera 766fe3d6)
-- ---------------------------------------------------------------------
-- Verificado: los recibos 0000001/0000002/0000003 (ELVIDO / JUAN ALONZO,
-- RD$5,500 / 10,450 / 12,515 del 23 y 26 jun 2026) NO existen en SiiF
-- (el respaldo solo tiene pagos 2013-2016 de esa cedula). Son pruebas.
-- Borrarlos desbloquea la re-sincronizacion de prestamos (Fase 3), que
-- regenera las cuotas desde el respaldo (fuente de la verdad).
-- Correr en el editor SQL de Supabase.
-- =====================================================================

BEGIN;

DELETE FROM public.prestamo_pago_detalle
 WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
   AND pago_id IN (
     SELECT id FROM public.prestamo_pagos
      WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
        AND numero IN ('0000001', '0000002', '0000003'));

DELETE FROM public.prestamo_pagos
 WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
   AND numero IN ('0000001', '0000002', '0000003');

COMMIT;

-- Verificacion: debe dar 0.
SELECT count(*) AS abonos_app_restantes
FROM public.prestamo_pago_detalle
WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
