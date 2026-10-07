-- =====================================================================
-- INVERSIONES LOS NARANJOS — PT-0000789 (BENITO POLO LUIS) NO ERA CASTIGO
-- =====================================================================
-- (07/10/2026) Préstamo nuevo del 17/09/2026 (RD$30,000 solo interés al 7%,
-- capital al 17/09/2029) llegó con el backup del 28/09 como 'castigado':
-- fase-financiera-cxc castigaba por el ÚLTIMO PAGO DEL CLIENTE (27/08/2020,
-- más de 6 años) sin mirar que el préstamo es de este mes. Por eso el
-- Recibo de Ingreso decía "Sin cuotas pendientes".
--
-- Se deja como lo dejó el ajuste del 28/09 a los demás préstamos nuevos
-- (odalys_inversiones_interes_tras_migrar_28_09.sql): activo, solo interés y
-- el ancla del interés en su fecha de inicio (no tiene pagos).
-- El script ya está corregido: el castigo mira la fecha del préstamo también.
-- =====================================================================

UPDATE public.prestamos
   SET estado = 'activo',
       motivo_castigo = NULL,
       fecha_castigo = NULL,
       es_solo_interes = true,
       interes_cobrado_hasta = fecha_inicio
 WHERE tenant_id = 'c07a1d07-1e2f-4b3c-9d4a-107a10500007'
   AND numero = 'PT-0000789'
   AND estado = 'castigado'
   AND NOT castigado_manual;

SELECT public.registrar_migracion('inversiones_pt789_no_era_castigo.sql');
