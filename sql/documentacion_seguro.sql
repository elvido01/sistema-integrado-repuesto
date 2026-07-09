-- Documentación Cliente: sexta imagen "Seguro"
ALTER TABLE public.documentacion_clientes
  ADD COLUMN IF NOT EXISTS seguro_path TEXT;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('documentacion_seguro.sql');
  END IF;
END $$;

SELECT 'Casilla Seguro en documentación lista' AS status;
