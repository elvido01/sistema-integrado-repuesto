-- ============================================================
-- Fix: compras.numero unique constraint debe ser POR TENANT
-- ============================================================
-- Error: "duplicate key value violates unique constraint
--        'compras_numero_key'" al grabar compra en Caminero Motors.
--
-- Causa: el constraint UNIQUE está sobre (numero) solamente, así
-- que cuando Caminero Motors intenta crear OC-0001 y Morla ya
-- tiene OC-0001, la BD rechaza el INSERT aunque sean tenants
-- distintos. La RPC get_next_compra_numero() YA calcula por
-- tenant (busca MAX dentro del tenant actual), solo falta ajustar
-- el constraint para que permita mismo numero en tenants distintos.
-- ============================================================

-- 1. Quitar el constraint global si existe (varios nombres posibles)
ALTER TABLE public.compras DROP CONSTRAINT IF EXISTS compras_numero_key;
ALTER TABLE public.compras DROP CONSTRAINT IF EXISTS compras_numero_unique;

-- 2. Crear constraint compuesto (tenant_id, numero)
ALTER TABLE public.compras
  ADD CONSTRAINT compras_tenant_numero_key UNIQUE (tenant_id, numero);

-- 3. Verificación: listar constraints actuales de compras
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'public.compras'::regclass
  AND contype = 'u';
