-- =====================================================================
-- FIX multi-tenant: clientes.rnc debe ser unico POR EMPRESA, no global
-- ---------------------------------------------------------------------
-- La tabla clientes tenia uno (o varios) unique GLOBAL sobre rnc
-- (clientes_rnc_key, clientes_rnc_unique, ...). En multi-tenant eso impide
-- que el mismo cliente (misma cedula/RNC) exista en dos empresas -> rompia
-- el alta de clientes y el financiamiento de terceros (409 unique_violation).
--
-- Se eliminan TODOS los unique global sobre (rnc) — por constraint y por
-- indice, sin importar el nombre — y se deja un unico indice parcial por
-- (tenant_id, rnc). Re-ejecutable.
-- =====================================================================

-- 1) Quitar cualquier CONSTRAINT unique cuya definicion sea exactamente UNIQUE (rnc)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.clientes'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE 'UNIQUE (rnc)%'
  LOOP
    EXECUTE format('ALTER TABLE public.clientes DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'Drop constraint %', r.conname;
  END LOOP;
END $$;

-- 2) Quitar cualquier INDICE unique solo sobre (rnc) que no sea el por-tenant
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'clientes'
      AND indexdef ILIKE '%UNIQUE%'
      AND indexdef ILIKE '%(rnc)%'
      AND indexdef NOT ILIKE '%tenant_id%'
      AND indexname <> 'clientes_tenant_rnc_key'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.indexname);
    RAISE NOTICE 'Drop index %', r.indexname;
  END LOOP;
END $$;

-- 3) Unico por (tenant_id, rnc), permitiendo rnc NULL/'' repetidos
CREATE UNIQUE INDEX IF NOT EXISTS clientes_tenant_rnc_key
  ON public.clientes (tenant_id, rnc)
  WHERE rnc IS NOT NULL AND btrim(rnc) <> '';

NOTIFY pgrst, 'reload schema';

-- 4) Verificacion: que NO quede ningun unique global sobre rnc
SELECT conname AS constraint_global_rnc, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.clientes'::regclass AND contype = 'u'
  AND pg_get_constraintdef(oid) ILIKE 'UNIQUE (rnc)%';
