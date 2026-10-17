-- =====================================================================
-- MotoPréstamos Los Naranjos: Compras encendido (17/10/2026)
-- ---------------------------------------------------------------------
-- Pedido del dueño tras la separación de Caminero. Las compras entran al
-- inventario compartido: el trigger de espejo
-- (sql/inventario_compartido_caminero_motoprestamos.sql) las copia a
-- Caminero. Ya tiene los suplidores de Caminero
-- (sql/separacion_caminero_motoprestamos_cxc_suplidores.sql).
-- Orden de Compra, Aprobaciones, Cotizaciones y Devoluciones siguen apagados.
-- =====================================================================

UPDATE public.config_empresa
   SET modulos_deshabilitados = ARRAY(
         SELECT m FROM unnest(modulos_deshabilitados) m WHERE m <> 'compras')
 WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';

SELECT public.registrar_migracion('motoprestamos_compras.sql');

-- Verificación
SELECT nombre, modulos_deshabilitados FROM public.config_empresa
 WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
