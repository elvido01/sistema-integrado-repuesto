-- ============================================================
-- Agrega soporte de dominio por tenant para white-labeling
-- en la pantalla de login.
-- ============================================================

-- 1. Agregar columna dominio a tenants (único por tenant)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS dominio TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_dominio_idx
  ON tenants (dominio)
  WHERE dominio IS NOT NULL;

-- 2. Registrar el dominio de Repuestos Morla
--    (ajusta el tenant_id al UUID real de Repuestos Morla en tu BD)
-- UPDATE tenants SET dominio = 'repuestos-morla.pages.dev' WHERE nombre ILIKE '%morla%';

-- 3. Función pública para obtener branding por dominio
--    Accesible por usuarios anónimos (para la pantalla de login)
CREATE OR REPLACE FUNCTION get_tenant_por_dominio(p_dominio TEXT)
RETURNS TABLE (
  nombre    TEXT,
  logo_url  TEXT,
  telefono  TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT t.nombre, t.logo_url, t.telefono
  FROM tenants t
  WHERE t.dominio = p_dominio
    AND t.activo = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_tenant_por_dominio(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_tenant_por_dominio(TEXT) TO authenticated;
