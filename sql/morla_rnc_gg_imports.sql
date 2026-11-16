-- =====================================================================
-- REPUESTOS MORLA: RNC de G&G IMPORTS (15/11/2026)
-- ---------------------------------------------------------------------
-- La ficha "G&G IMPORTS" tenía el RNC 13047882 (le faltaba un dígito).
-- Según el listado de la DGII es G & G IMPORT SRL, RNC 130478882, el mismo
-- de la ficha "HAO" (confirmado por el dueño). Con el RNC mal, sus compras
-- con E31 quedaban fuera del 606 (jul 10,215.96 · ago 11,093.63 · oct
-- 3,067.09 de ITBIS). Las dos fichas se quedan separadas; solo se corrige
-- el RNC. Solo la empresa Morla (…0001). Idempotente.
-- =====================================================================

UPDATE public.proveedores
   SET rnc = '130478882'
 WHERE id = 'f269f32e-9fdf-4d35-a884-1dc155b18631'
   AND tenant_id = '00000000-0000-0000-0000-000000000001'
   AND rnc = '13047882';

SELECT registrar_migracion('morla_rnc_gg_imports.sql');
