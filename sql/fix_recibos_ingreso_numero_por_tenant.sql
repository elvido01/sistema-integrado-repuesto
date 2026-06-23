-- =====================================================================
-- FIX: numero de recibos_ingreso UNICO POR EMPRESA (no global)
-- ---------------------------------------------------------------------
-- get_next_recibo_ingreso_numero() numera por tenant (RI-000001 por
-- empresa), pero el UNIQUE estaba sobre (numero) global, asi que una
-- empresa nueva (ej. MotoPrestamos) chocaba con el RI-000001 de otra:
--   duplicate key value violates unique constraint "recibos_ingreso_numero_key"
-- Igual que se hizo en sql/fix_compras_numero_por_tenant.sql.
-- Re-ejecutable.
-- =====================================================================

ALTER TABLE public.recibos_ingreso DROP CONSTRAINT IF EXISTS recibos_ingreso_numero_key;
ALTER TABLE public.recibos_ingreso DROP CONSTRAINT IF EXISTS recibos_ingreso_tenant_numero_key;
ALTER TABLE public.recibos_ingreso
  ADD CONSTRAINT recibos_ingreso_tenant_numero_key UNIQUE (tenant_id, numero);

NOTIFY pgrst, 'reload schema';

SELECT 'recibos_ingreso.numero ahora es unico por empresa' AS status;
