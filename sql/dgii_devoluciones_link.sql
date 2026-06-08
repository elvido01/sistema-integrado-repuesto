-- ============================================================
-- DGII Nota de Credito (Tipo 34) — link devoluciones <-> documentos_fiscales
-- ============================================================
-- Agrega 2 columnas a la tabla devoluciones para asociar una
-- devolucion con la Nota de Credito Tipo 34 que se emitio a DGII.
-- Idempotente: usa IF NOT EXISTS.
--
-- Despues de correr esto, la accion `dgii_emitir_nota_credito`
-- puede linkear automaticamente.
-- ============================================================

ALTER TABLE public.devoluciones
  ADD COLUMN IF NOT EXISTS documento_fiscal_id UUID
    REFERENCES public.documentos_fiscales(id) ON DELETE SET NULL;

ALTER TABLE public.devoluciones
  ADD COLUMN IF NOT EXISTS encf TEXT;

CREATE INDEX IF NOT EXISTS idx_devoluciones_documento_fiscal
  ON public.devoluciones(documento_fiscal_id);

CREATE INDEX IF NOT EXISTS idx_devoluciones_encf
  ON public.devoluciones(encf);

SELECT 'devoluciones extendida' AS check,
       (SELECT count(*) FROM information_schema.columns
        WHERE table_name = 'devoluciones' AND column_name IN ('documento_fiscal_id', 'encf')) AS cols_agregadas;
