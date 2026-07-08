-- Formato de impresión del Cierre de Caja por empresa:
--   'pos_80mm' (ticket térmico, default) | 'carta' (hoja 8.5 x 11)
-- Se configura en Configuración del Sistema > Configuración de Impresión.

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS formato_cierre_caja text NOT NULL DEFAULT 'pos_80mm';

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('config_formato_cierre_caja.sql');
  END IF;
END $$;

SELECT 'Formato de cierre de caja configurable listo' AS status;
