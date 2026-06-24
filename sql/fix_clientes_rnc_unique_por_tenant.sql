-- =====================================================================
-- FIX multi-tenant: clientes.rnc debe ser unico POR EMPRESA, no global
-- ---------------------------------------------------------------------
-- La tabla clientes tenia clientes_rnc_key UNIQUE (rnc) GLOBAL. En un
-- sistema multi-tenant eso impide que el mismo cliente (misma cedula/RNC)
-- exista en dos empresas distintas -> rompia el financiamiento de terceros
-- (crear el comprador en la financiera fallaba con 409 unique_violation)
-- y tambien el alta de clientes cuando el RNC ya existia en otro tenant.
--
-- Se reemplaza por un indice unico parcial por (tenant_id, rnc), que:
--   - permite el mismo RNC en empresas distintas,
--   - sigue evitando duplicados dentro de la misma empresa,
--   - permite multiples filas con rnc NULL/'' (clientes sin RNC).
-- Re-ejecutable.
-- =====================================================================

ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_rnc_key;

-- por si una corrida previa lo dejo como indice
DROP INDEX IF EXISTS public.clientes_rnc_key;

CREATE UNIQUE INDEX IF NOT EXISTS clientes_tenant_rnc_key
  ON public.clientes (tenant_id, rnc)
  WHERE rnc IS NOT NULL AND btrim(rnc) <> '';

NOTIFY pgrst, 'reload schema';

SELECT 'clientes.rnc ahora es unico por (tenant_id, rnc)' AS status;
