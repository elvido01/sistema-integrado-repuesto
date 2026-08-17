-- =====================================================================
-- QUITAR 3 DE LAS 7 REPOSICIONES: el cliente tiene un recibo posterior
-- ---------------------------------------------------------------------
-- Reportado por el dueño el 2026-08-17, mirando la pantalla de Altagracia:
--   "en el recibo impreso de altagracia el ultimo 0147924 aparece el balance
--    pendiente 29,000, no se pueden recuperar los 615.07"
--   Tenia razon.
--
-- EL ERROR
--   El criterio de sql/reponer_interes_perdido.sql era "la perdida ocurrio en
--   el ULTIMO recibo del cliente", para contradecir un solo papel. Pero al
--   escogerlos compare por FECHA, no por secuencia. Tres clientes hicieron un
--   SEGUNDO pago EL MISMO DIA, y ese segundo recibo ya salio impreso con el
--   balance sin el interes. Ese papel es el que el cliente tiene en la mano:
--
--     0147923  ALTAGRACIA SUERO GARCIA  615.07
--              despues 0147924 (14:04)  imprimio Balance Actual  29,000.00
--     0147884  JULIO A. SOSA SILVERIO   588.60
--              despues 0147885 (13:48)  imprimio Balance Actual  60,569.52
--     0147752  KATIANA PETION           221.92
--              despues 0147753 (16:10)  imprimio Balance Actual  45,145.00
--
--   Cobrarles ahora seria desmentir un recibo firmado. No se hace.
--
-- QUEDAN LOS 4 QUE SI SE PUEDEN (359.22), sin recibo posterior:
--     0147728  DESCOLLINES CHRONIQUE     170.30   PT-0026564
--     0147754  VALENTIN FERRERAS MESA    120.75   PT-0026002
--     0147877  ANDRES CARPIO              41.50   PT-0026375
--     0147909  JUAN NARCISO PADUA MIRIO   26.67   PT-0026589
--
-- Esto NO deshace el arreglo de fondo: la fuga sigue tapada y de aqui en
-- adelante no se pierde un centavo. Solo se retira un cobro que el papel del
-- cliente no respalda.
--
-- Solo borra si nadie le abono nada todavia. Idempotente / re-ejecutable.
-- Correr en PRODUCCION.
-- =====================================================================

BEGIN;

WITH quitar(prestamo_numero, fecha, monto, cliente) AS (
  VALUES
    ('PT-0026576', DATE '2026-08-17', 615.07::numeric, 'ALTAGRACIA SUERO GARCIA'),
    ('PT-0026532', DATE '2026-08-13', 588.60::numeric, 'JULIO A. SOSA SILVERIO'),
    ('PT-0026561', DATE '2026-08-01', 221.92::numeric, 'KATIANA PETION')
)
DELETE FROM public.prestamo_cuotas q
USING quitar k, public.prestamos p
WHERE p.numero = k.prestamo_numero
  AND p.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND q.prestamo_id = p.id
  AND q.capital = 0
  AND q.interes = k.monto
  AND q.fecha_vencimiento = k.fecha
  -- nadie le ha abonado: ni un centavo, ni un recibo colgado de esta cuota
  AND q.interes_pagado = 0
  AND q.capital_pagado = 0
  AND q.mora_pagada = 0
  AND NOT EXISTS (SELECT 1 FROM public.prestamo_pago_detalle d WHERE d.cuota_id = q.id)
  AND NOT EXISTS (SELECT 1 FROM public.prestamo_nota_credito_detalle d WHERE d.cuota_id = q.id);

DO $mig$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('quitar_reposicion_indebida.sql');
  END IF;
END $mig$;

COMMIT;

-- =====================================================================
-- VERIFICACION — 3 deben decir QUITADA, 4 deben decir SIGUE (correcto)
-- =====================================================================

WITH todas(prestamo_numero, fecha, monto, cliente, debe_quedar) AS (
  VALUES
    ('PT-0026576', DATE '2026-08-17', 615.07::numeric, 'ALTAGRACIA SUERO GARCIA',  false),
    ('PT-0026532', DATE '2026-08-13', 588.60::numeric, 'JULIO A. SOSA SILVERIO',   false),
    ('PT-0026561', DATE '2026-08-01', 221.92::numeric, 'KATIANA PETION',           false),
    ('PT-0026564', DATE '2026-07-31', 170.30::numeric, 'DESCOLLINES CHRONIQUE',    true),
    ('PT-0026002', DATE '2026-08-01', 120.75::numeric, 'VALENTIN FERRERAS MESA',   true),
    ('PT-0026375', DATE '2026-08-12',  41.50::numeric, 'ANDRES CARPIO',            true),
    ('PT-0026589', DATE '2026-08-15',  26.67::numeric, 'JUAN NARCISO PADUA MIRIO', true)
)
SELECT
  t.cliente,
  t.prestamo_numero,
  t.monto,
  CASE WHEN q.id IS NULL THEN 'QUITADA' ELSE 'SIGUE' END AS ahora,
  CASE
    WHEN t.debe_quedar AND q.id IS NOT NULL THEN 'OK · se cobra'
    WHEN NOT t.debe_quedar AND q.id IS NULL THEN 'OK · retirada'
    ELSE '*** REVISAR ***'
  END AS estado
FROM todas t
JOIN public.prestamos p
  ON p.numero = t.prestamo_numero
 AND p.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
LEFT JOIN public.prestamo_cuotas q
  ON q.prestamo_id = p.id AND q.capital = 0
 AND q.interes = t.monto AND q.fecha_vencimiento = t.fecha
ORDER BY t.debe_quedar, t.monto DESC;

-- Altagracia debe volver a: Capital 29,000.00 · Intereses 0.00
--   (su interes vuelve a correr desde el 17/08 sobre los 5,000 del PT-0026576)
