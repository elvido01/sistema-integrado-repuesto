-- =====================================================================
-- Financiamiento PROPIO / TERCEROS por empresa (config_empresa)
-- ---------------------------------------------------------------------
-- Caminero Motors no financia: usa una financiera externa (terceros),
-- MotoPrestamos Los Naranjos. Cuando es 'terceros', al facturar una
-- solicitud financiada se crea el prestamo y las cuentas en el tenant
-- de la financiera (ver RPC facturar_solicitud_terceros, fase 3).
--
-- 'propio'   -> las cuentas por cobrar quedan en la misma empresa.
-- 'terceros' -> se selecciona la empresa financiera (financiera_tenant_id).
-- Re-ejecutable.
-- =====================================================================

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS financiamiento_tipo text NOT NULL DEFAULT 'propio';

ALTER TABLE public.config_empresa
  DROP CONSTRAINT IF EXISTS config_empresa_financiamiento_tipo_check;
ALTER TABLE public.config_empresa
  ADD CONSTRAINT config_empresa_financiamiento_tipo_check
  CHECK (financiamiento_tipo IN ('propio', 'terceros'));

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS financiera_tenant_id uuid;

-- ---------------------------------------------------------------------
-- RPC: lista de empresas financieras disponibles para seleccionar como
-- "tercero" (feat_financiera = true). SECURITY DEFINER porque lee
-- config_empresa de otros tenants, pero solo expone id + nombre y solo
-- de empresas marcadas como financiera. Cualquier usuario autenticado
-- puede listarlas para configurarlo.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_financiera_tenants()
RETURNS TABLE (tenant_id uuid, nombre text)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path TO 'public'
AS $$
  -- DISTINCT ON (tenant_id): una sola fila por empresa aunque config_empresa
  -- tenga filas duplicadas para el mismo tenant.
  SELECT t.tenant_id, t.nombre
  FROM (
    SELECT DISTINCT ON (ce.tenant_id) ce.tenant_id, ce.nombre
    FROM public.config_empresa ce
    WHERE COALESCE(ce.feat_financiera, false) = true
    ORDER BY ce.tenant_id, ce.nombre
  ) t
  ORDER BY t.nombre;
$$;

REVOKE EXECUTE ON FUNCTION public.get_financiera_tenants() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_financiera_tenants() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'config_empresa.financiamiento_tipo / financiera_tenant_id + get_financiera_tenants listos' AS status;
