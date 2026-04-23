-- ============================================================
-- Placa y Matrícula en productos (motos USADAS - Caminero Motors)
-- Para motos NUEVAS estos campos quedan vacíos y al facturar
-- se imprime "TRAMITE" automáticamente.
-- ============================================================

ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS placa TEXT;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS matricula BOOLEAN DEFAULT false;

NOTIFY pgrst, 'reload schema';
