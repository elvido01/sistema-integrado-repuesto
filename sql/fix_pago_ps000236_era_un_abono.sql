-- =====================================================================
-- PS-000236: era un abono de 353.32, se grabó la factura completa
-- ---------------------------------------------------------------------
-- (2026-08-10) Pago a ARIAS MOTORS registrado por RD$ 21,001.21 —el total de
-- la factura 990159745 (compra OC-0288)— cuando lo que se pagó fueron
-- RD$ 353.32.
--
-- Lo que quedó mal, en cadena:
--   pagos_suplidores.monto_pagado          21,001.21   -> 353.32
--   pagos_suplidores.formas_pago[].monto   21,001.21   -> 353.32
--   pagos_suplidores_detalle.monto_abonado 21,001.21   -> 353.32
--   compras.monto_pagado                   21,001.21   -> 353.32
--   compras.monto_pendiente                        0   -> 20,647.89
--   compras.estado                            PAGADA   -> PENDIENTE
--
-- Y no es solo la deuda del suplidor: el pago fue en EFECTIVO, así que el
-- cuadre del día tiene 21,001.21 de salida en vez de 353.32. Corrigiendo el
-- monto se corrige el cierre, que lo lee de aquí.
--
-- >>> POR QUÉ SE RECALCULA EN VEZ DE ESCRIBIR EL NÚMERO <<<
-- monto_pagado de la compra es la suma de TODOS sus abonos, no el de este
-- pago. Hoy solo hay uno —se comprobó— pero escribir 353.32 a mano dejaría
-- una bomba para el día que alguien abone otra vez y alguien más re-ejecute
-- esto. Se recalcula desde pagos_suplidores_detalle, que es la fuente.
--
-- >>> CÓMO PASÓ, PARA QUE NO SE REPITA <<<
-- En PagoSuplidoresPage, DOBLE CLIC sobre la celda de abono la rellena con el
-- pendiente completo. Es un atajo cómodo y también es un accidente a un gesto
-- de distancia. No se toca aquí —arreglar la pantalla es otra decisión— pero
-- queda anotado porque es la explicación más probable.
--
-- Idempotente: re-ejecutarlo no vuelve a cambiar nada.
-- =====================================================================

BEGIN;

UPDATE public.pagos_suplidores
SET monto_pagado = 353.32,
    formas_pago  = '[{"id":1,"forma":"Efectivo","monto":353.32,"referencia":""}]'::jsonb
WHERE numero = 'PS-000236'
  AND tenant_id = '00000000-0000-0000-0000-000000000001'
  AND anulado = false;

UPDATE public.pagos_suplidores_detalle d
SET monto_abonado = 353.32
FROM public.pagos_suplidores p
WHERE d.pago_id = p.id
  AND p.numero = 'PS-000236'
  AND p.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND d.compra_id = '2f4a5c6b-5c11-4ad1-ab8b-e26b3e402490';

-- La compra se recalcula desde sus abonos vivos. Los pagos anulados no
-- cuentan: anular no borra la fila del detalle.
WITH abonado AS (
  SELECT COALESCE(SUM(d.monto_abonado), 0) AS total
  FROM public.pagos_suplidores_detalle d
  JOIN public.pagos_suplidores p ON p.id = d.pago_id AND p.anulado = false
  WHERE d.compra_id = '2f4a5c6b-5c11-4ad1-ab8b-e26b3e402490'
)
UPDATE public.compras c
SET monto_pagado   = a.total,
    monto_pendiente = ROUND(c.total_compra - a.total, 2),
    -- Con un céntimo de tolerancia: los redondeos del ITBIS dejan restos que
    -- no son deuda y marcarían como PENDIENTE una compra ya saldada.
    estado = CASE WHEN c.total_compra - a.total <= 0.01 THEN 'PAGADA' ELSE 'PENDIENTE' END,
    updated_at = now()
FROM abonado a
WHERE c.id = '2f4a5c6b-5c11-4ad1-ab8b-e26b3e402490';

COMMIT;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_pago_ps000236_era_un_abono.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
SELECT p.numero, p.fecha, p.monto_pagado, p.formas_pago
FROM public.pagos_suplidores p WHERE p.numero = 'PS-000236';
-- monto_pagado = 353.32

SELECT c.numero, c.referencia, c.total_compra, c.monto_pagado, c.monto_pendiente, c.estado
FROM public.compras c WHERE c.id = '2f4a5c6b-5c11-4ad1-ab8b-e26b3e402490';
-- total 21,001.21 · pagado 353.32 · pendiente 20,647.89 · PENDIENTE

-- Y el balance del suplidor, que es lo que se ve en pantalla:
SELECT SUM(monto_pendiente) AS debe_arias
FROM public.compras
WHERE suplidor_id = '26924eb0-839e-48ab-bfb1-555b6e535a04'
  AND tenant_id = '00000000-0000-0000-0000-000000000001'
  AND estado <> 'PAGADA';
