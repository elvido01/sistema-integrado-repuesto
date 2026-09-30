-- ODALYS · DIONISIO AVILA (028-0058158-5): el interés que MotoFlow cobraba
-- de más (30/09/2026).
--
-- En el SiiF, al 29/09, sus dos préstamos a solo interés deben "7 Días de
-- Intereses" (PT-0000950: 720.66 · PT-0000979: 555.52): los dos tienen el
-- interés pagado hasta el 22/09, su último pago (RI-0007175 y RI-0007176,
-- uno por préstamo). MotoFlow los tenía anclados al 14/07 y cobraba 77 días:
-- 7,807.15 y 6,018.17 (balance 87,452.28 contra 74,903.14 del SiiF).
--
-- Por qué quedó así: sql/odalys_inversiones_interes_tras_migrar_28_09.sql solo
-- adelantó el ancla de clientes con UN préstamo activo, porque los recibos del
-- SiiF llegan sin detalle y con varios no se sabe cuál préstamo pagaron. Este
-- era el único cliente con varios (docs/cotejo_interes_odalys_inversiones_2026-09-28.csv,
-- "SIN TOCAR"). La prueba de que se pagaron los DOS es la pantalla del SiiF
-- que envió el dueño: 7 días de interés en cada uno.
--
-- Revisado a la vez en las tres financieras: todo interés cobrado EN MotoFlow
-- mueve bien el punto de partida (0 casos); fuera de este cliente no hay otro
-- préstamo con pagos del SiiF posteriores a su ancla.
--
-- El ancla nunca va hacia atrás.

UPDATE public.prestamos
   SET interes_cobrado_hasta = DATE '2026-09-22'
 WHERE tenant_id = 'c05a1d05-0d1e-4a2b-8c3f-0da1e5000005'
   AND numero IN ('PT-0000950', 'PT-0000979')
   AND estado = 'activo'
   AND es_solo_interes
   AND interes_cobrado_hasta < DATE '2026-09-22';

SELECT public.registrar_migracion('odalys_dionisio_ancla_interes_22_09.sql');

-- ===== VERIFICACION =====
SELECT numero, interes_cobrado_hasta, tasa_interes
FROM public.prestamos
WHERE tenant_id = 'c05a1d05-0d1e-4a2b-8c3f-0da1e5000005'
  AND numero IN ('PT-0000950', 'PT-0000979')
ORDER BY numero;
