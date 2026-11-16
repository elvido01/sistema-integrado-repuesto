-- =====================================================================
-- REPUESTOS MORLA: NCF de la compra OC-0378 de HAO (16/11/2026)
-- ---------------------------------------------------------------------
-- Estaba "e3100000060376" (un 0 de más). La factura en papel (14/10/2026,
-- ref. 00319920, 3 baterías Golkey) dice E310000060376 (confirmado por el
-- dueño). Con el NCF mal quedaba fuera del 606 de octubre (ITBIS 457.15).
-- Solo la empresa Morla (…0001). Idempotente.
-- =====================================================================

UPDATE public.compras
   SET ncf = 'E310000060376'
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND numero = 'OC-0378'
   AND ncf = 'e3100000060376';

SELECT registrar_migracion('morla_ncf_hao_oc0378.sql');
