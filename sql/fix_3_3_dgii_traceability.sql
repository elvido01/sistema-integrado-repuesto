-- ============================================================
-- Fix 3.3 — DGII e-CF: trazabilidad + CHECK de estado_dgii
-- ============================================================
-- AUDIT 2026-06-15 (R-18 y seccion 8 — Flujo DGII).
--
-- Cambios:
--   1. documentos_fiscales.emitido_por uuid REFERENCES auth.users(id)
--      Cumple art. 38 NES de DGII (trazabilidad user -> e-CF).
--   2. CHECK constraint en estado y estado_dgii con la lista cerrada
--      de valores conocidos (Fase 3.3 en docs/MODULES.md).
--   3. Indice por (emitido_por) para auditoria rapida.
--
-- IDEMPOTENTE. No migra datos historicos (emitido_por queda NULL en
-- documentos ya emitidos — futuros emits SI lo guardan, ver Fase 4
-- cuando emitir-fiscal se actualice para poblarlo).
-- ============================================================

-- 1) Agregar columna emitido_por (idempotente)
ALTER TABLE public.documentos_fiscales
  ADD COLUMN IF NOT EXISTS emitido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documentos_fiscales_emitido_por
  ON public.documentos_fiscales(emitido_por)
  WHERE emitido_por IS NOT NULL;

COMMENT ON COLUMN public.documentos_fiscales.emitido_por IS
  'Usuario que ordeno la emision del e-CF (art. 38 NES DGII). NULL en docs anteriores a Fase 3.3.';

-- 2) Diagnostico de valores existentes en estado y estado_dgii
SELECT 'estado' AS columna, estado AS valor, COUNT(*) AS n
FROM public.documentos_fiscales
WHERE estado IS NOT NULL
GROUP BY estado
UNION ALL
SELECT 'estado_dgii', estado_dgii, COUNT(*)
FROM public.documentos_fiscales
WHERE estado_dgii IS NOT NULL
GROUP BY estado_dgii
ORDER BY columna, valor;

-- 3) CHECK constraint en estado (terminos del emisor)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_documentos_fiscales_estado'
      AND conrelid = 'public.documentos_fiscales'::regclass
  ) THEN
    -- Solo si todos los valores actuales estan dentro del set permitido
    IF NOT EXISTS (
      SELECT 1 FROM public.documentos_fiscales
      WHERE estado IS NOT NULL
        AND estado NOT IN ('procesando', 'emitido', 'error', 'anulado')
    ) THEN
      ALTER TABLE public.documentos_fiscales
        ADD CONSTRAINT chk_documentos_fiscales_estado
        CHECK (estado IN ('procesando', 'emitido', 'error', 'anulado'));
      RAISE NOTICE 'CHECK chk_documentos_fiscales_estado agregado';
    ELSE
      RAISE WARNING 'estado tiene valores fuera del set [procesando, emitido, error, anulado]. CHECK NO agregado. Revisar manualmente.';
    END IF;
  ELSE
    RAISE NOTICE 'CHECK chk_documentos_fiscales_estado ya existe';
  END IF;
END $$;

-- 4) CHECK constraint en estado_dgii (estados que devuelve DGII)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_documentos_fiscales_estado_dgii'
      AND conrelid = 'public.documentos_fiscales'::regclass
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.documentos_fiscales
      WHERE estado_dgii IS NOT NULL
        AND estado_dgii NOT IN (
          'enviado', 'aceptado', 'aceptado_condicional', 'rechazado',
          'enviado_rfce', 'anulado'
        )
    ) THEN
      ALTER TABLE public.documentos_fiscales
        ADD CONSTRAINT chk_documentos_fiscales_estado_dgii
        CHECK (estado_dgii IS NULL OR estado_dgii IN (
          'enviado', 'aceptado', 'aceptado_condicional', 'rechazado',
          'enviado_rfce', 'anulado'
        ));
      RAISE NOTICE 'CHECK chk_documentos_fiscales_estado_dgii agregado';
    ELSE
      RAISE WARNING 'estado_dgii tiene valores fuera del set permitido. CHECK NO agregado.';
    END IF;
  ELSE
    RAISE NOTICE 'CHECK chk_documentos_fiscales_estado_dgii ya existe';
  END IF;
END $$;

-- 5) Documentar maquina de estados en comentarios de columna
COMMENT ON COLUMN public.documentos_fiscales.estado IS
  'Estado interno (CHECK): procesando | emitido | error | anulado. ' ||
  'Transiciones: procesando -> (emitido | error); emitido -> anulado.';

COMMENT ON COLUMN public.documentos_fiscales.estado_dgii IS
  'Estado segun DGII (CHECK): enviado | aceptado | aceptado_condicional | rechazado | enviado_rfce | anulado. ' ||
  'NULL cuando aun no se ha enviado. Solo dgii-callback lo modifica (Fase 0.9).';

NOTIFY pgrst, 'reload schema';

SELECT 'fix_3_3 DGII traceability + CHECK estado/estado_dgii listo' AS status;
