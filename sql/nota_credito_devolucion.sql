-- =====================================================================
-- Nota de crédito electrónica (E34) de una devolución de venta (14/11/2026)
-- ---------------------------------------------------------------------
-- MotoFlow nunca había emitido una nota de crédito real. La función vieja
-- (emitir-fiscal → dgii_emitir_nota_credito) guardaba el documento con el
-- factura_id de la factura original, y eso choca con:
--   · idx_documentos_fiscales_factura_vivo (un documento vivo por factura):
--     la nota no se podía ni registrar;
--   · ecfImpresion / Reportes DGII / la cola de reintentos, que buscan "el
--     documento de esta factura" por factura_id: reimprimir la factura habría
--     sacado el QR de la NOTA.
-- Ahora la nota se une a la DEVOLUCIÓN:
--   · documentos_fiscales.devolucion_id (factura_id queda NULL en las notas);
--     un documento vivo por devolución.
--   · devoluciones.encf / documento_fiscal_id: el e-NCF de su nota.
-- Lo existente no cambia (todas las filas tienen factura_id). Idempotente.
-- =====================================================================

ALTER TABLE public.documentos_fiscales ALTER COLUMN factura_id DROP NOT NULL;
ALTER TABLE public.documentos_fiscales
  ADD COLUMN IF NOT EXISTS devolucion_id uuid REFERENCES public.devoluciones(id) ON DELETE RESTRICT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documentos_fiscales_de_algo_chk') THEN
    ALTER TABLE public.documentos_fiscales ADD CONSTRAINT documentos_fiscales_de_algo_chk
      CHECK (factura_id IS NOT NULL OR devolucion_id IS NOT NULL);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_documentos_fiscales_devolucion_vivo
  ON public.documentos_fiscales (devolucion_id)
  WHERE devolucion_id IS NOT NULL AND estado IN ('procesando', 'emitido');
COMMENT ON COLUMN public.documentos_fiscales.devolucion_id IS
  'Nota de crédito (E34) de esta devolución. En las notas factura_id va NULL: así nada que busque el documento de una factura agarra la nota.';

ALTER TABLE public.devoluciones ADD COLUMN IF NOT EXISTS encf text;
ALTER TABLE public.devoluciones ADD COLUMN IF NOT EXISTS documento_fiscal_id uuid REFERENCES public.documentos_fiscales(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.devoluciones.encf IS 'e-NCF de la nota de crédito (E34) emitida por esta devolución.';

SELECT registrar_migracion('nota_credito_devolucion.sql');
