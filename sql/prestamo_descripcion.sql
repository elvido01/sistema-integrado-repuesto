-- =====================================================================
-- Préstamos: descripción propia que sale en el Recibo de Pago (20/11/2026)
-- ---------------------------------------------------------------------
-- Como en el SiiF: cada préstamo puede llevar su descripción (p. ej. "Moto
-- Yamaha AG 125 roja"). La pantalla del Recibo de Pago la muestra en la
-- columna Descripción en vez de "Financiamiento" y sale en el recibo
-- impreso. Vacía = "Financiamiento" (como siempre). Solo agrega la columna;
-- get_prestamos_cliente y crear_prestamo NO se tocan (la pantalla la lee
-- aparte y la guarda después de crear el préstamo).
-- =====================================================================
BEGIN;
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS descripcion text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prestamos_descripcion_largo') THEN
    ALTER TABLE public.prestamos ADD CONSTRAINT prestamos_descripcion_largo CHECK (descripcion IS NULL OR length(descripcion) <= 100);
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT public.registrar_migracion('prestamo_descripcion.sql');
