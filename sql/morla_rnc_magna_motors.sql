-- =====================================================================
-- REPUESTOS MORLA: RNC de MAGNA MOTORS (16/11/2026)
-- ---------------------------------------------------------------------
-- La ficha tenía 92246819 (8 dígitos). El dueño dio el correcto,
-- 101-05557-1, y el listado de la DGII lo confirma: MAGNA MOTORS S A,
-- ACTIVO. Sin esto, sus futuras facturas E31 no entrarían al 606.
-- Solo la empresa Morla (…0001). Idempotente.
-- =====================================================================

UPDATE public.proveedores
   SET rnc = '101055571'
 WHERE id = 'ece448e5-9a41-4318-9dc0-6a1a3a27ceff'
   AND tenant_id = '00000000-0000-0000-0000-000000000001'
   AND rnc = '92246819';

SELECT registrar_migracion('morla_rnc_magna_motors.sql');
