-- =====================================================================
-- INVERSIONES EL NARANJO: MÓDULO SOLICITUDES DE COMPRAS (20/10/2026)
-- ---------------------------------------------------------------------
-- Pedido del dueño. Se agrega 'solicitudes_compras' a config_empresa.modulos
-- (el menú lo muestra en Transacciones). Solo esta empresa.
-- =====================================================================

UPDATE public.config_empresa
   SET modulos = ARRAY(
         SELECT DISTINCT m FROM unnest(coalesce(modulos, '{}')
           || ARRAY['solicitudes_compras']) m)
 WHERE tenant_id = '160f0230-ed68-4d43-a569-8abafa8134a3';   -- INVERSIONES EL NARANJO

SELECT public.registrar_migracion('inversiones_el_naranjo_solicitudes_compras.sql');
