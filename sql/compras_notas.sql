-- =====================================================================
-- compras.notas — la pestaña "Notas/Comentarios" no se guardaba
-- ---------------------------------------------------------------------
-- (2026-07-25, Caminero) Al grabar una compra estilo PAGARÉ salía:
--   "Could not find the 'notas' column of 'compras' in the schema cache"
--
-- CAUSA: la tabla `compras` NO tiene columna `notas`, pero el formulario sí
-- tiene la pestaña "Notas/Comentarios" (CompraFooter) y ese texto viaja en el
-- guardado. Con una compra normal solo fallaba si el usuario escribía algo;
-- en las compras financiadas (pagarés) el sistema SIEMPRE ponía una nota
-- ("Pagaré 1/6 - factura X") → fallaba siempre.
--
-- Se agrega la columna para que el comentario se guarde de verdad (y los
-- pagarés lleven su etiqueta). El front ya no se bloquea si falta la columna,
-- pero sin este SQL las notas se descartan al guardar.
--
-- Idempotente. Correr en PRODUCCIÓN (SQL editor de Supabase).
-- =====================================================================

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS notas text;

COMMENT ON COLUMN public.compras.notas IS
  'Comentario libre de la compra (pestaña Notas/Comentarios). En compras financiadas guarda además la etiqueta del pagaré. Ver sql/compras_notas.sql';

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('compras_notas.sql');
  END IF;
END $$;

-- Verificación
SELECT 'compras.notas' AS objeto,
       (SELECT count(*)::text FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'compras'
          AND column_name = 'notas') AS existe;
