-- ============================================================
-- config_empresa: flag de default para "Incluir existencias en cero"
-- ============================================================
-- Permite que cada tenant decida si el checkbox "Incluir existencias
-- en cero" del modal de busqueda de productos viene marcado por
-- defecto (true) o desmarcado (false).
--
-- Default: true (comportamiento actual).
--
-- IDEMPOTENTE.
-- ============================================================

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS incluir_existencias_cero_default boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.config_empresa.incluir_existencias_cero_default IS
  'Si true, el modal ProductSearchModal abre con el checkbox "Incluir existencias en cero" marcado. Si false, abre desmarcado (solo productos con stock > 0). Configurable por tenant.';

NOTIFY pgrst, 'reload schema';

SELECT 'incluir_existencias_cero_default agregado a config_empresa' AS status;
