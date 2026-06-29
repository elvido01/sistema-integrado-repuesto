-- =====================================================================
-- Tipo de negocio por empresa (tenant)
-- ---------------------------------------------------------------------
-- Define el giro de cada empresa para adaptar la UI. El primer uso es el
-- ancho/visibilidad del CODIGO en el buscador de productos:
--   'repuestos'  -> codigos cortos (ej. i-3010, 102-0057): columna angosta.
--   'dealer'     -> vehiculos con chasis/VIN largo (ej. XF1NC1102TL533465):
--                   el codigo se muestra COMPLETO.
--   'financiera' -> motoprestamos / financiera: tambien codigos largos.
--
-- Se configura en Configuración del Sistema. Re-ejecutable.
-- =====================================================================

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS tipo_negocio text NOT NULL DEFAULT 'repuestos';

-- CHECK seguro y re-ejecutable sobre los valores permitidos.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.config_empresa'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%tipo_negocio%'
  LOOP
    EXECUTE format('ALTER TABLE public.config_empresa DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.config_empresa
  ADD CONSTRAINT config_empresa_tipo_negocio_check
  CHECK (tipo_negocio IN ('repuestos','dealer','financiera'));

COMMENT ON COLUMN public.config_empresa.tipo_negocio IS
  'Giro de la empresa: repuestos | dealer | financiera. Adapta UI (ej. ancho de codigo).';

NOTIFY pgrst, 'reload schema';

SELECT 'config_empresa.tipo_negocio creado (default repuestos)' AS status;
