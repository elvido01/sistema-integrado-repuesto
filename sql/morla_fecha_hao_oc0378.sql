-- =====================================================================
-- REPUESTOS MORLA: fecha de la compra OC-0378 (16/11/2026)
-- ---------------------------------------------------------------------
-- La factura E310000060376 de G & G IMPORT (ficha HAO, ref. 00319920) es del
-- 13/10/2026 según el papel; en MotoFlow estaba 14/10. El 606 lleva la fecha
-- del comprobante (col. 6). Solo cambia la fecha de la compra.
-- Solo la empresa Morla (…0001). Idempotente.
-- =====================================================================

UPDATE public.compras
   SET fecha = '2026-10-13'
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND numero = 'OC-0378'
   AND ncf = 'E310000060376'
   AND fecha = '2026-10-14';

SELECT registrar_migracion('morla_fecha_hao_oc0378.sql');
