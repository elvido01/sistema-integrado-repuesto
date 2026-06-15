-- ============================================================
-- Fix 3.2 — CHECK constraint para estados de ordenes_compra
-- ============================================================
-- AUDIT 2026-06-15 (seccion 7 — Dominio de Abastecimiento):
-- formalizar la maquina de estados de ordenes_compra para prevenir
-- typos y documentar transiciones validas.
--
-- Estrategia:
--   1. Diagnostico: contar valores actuales (debe ser solo Pendiente,
--      Recibida, Anulada).
--   2. Normalizar valores raros si existen (UPPER/lower/whitespace).
--   3. Agregar CHECK constraint que limita a la lista de valores validos.
--
-- IDEMPOTENTE. Aborta si encuentra valores inesperados que no sabe
-- normalizar, en ese caso el usuario revisa manualmente antes de
-- agregar el CHECK.
-- ============================================================

-- 1) Diagnostico previo (no modifica nada)
SELECT
  estado,
  COUNT(*) AS n
FROM public.ordenes_compra
GROUP BY estado
ORDER BY n DESC;

-- 2) Normalizar variantes comunes (case, trim) si existen
UPDATE public.ordenes_compra
   SET estado = INITCAP(TRIM(estado))
 WHERE estado IS NOT NULL
   AND estado <> INITCAP(TRIM(estado))
   AND TRIM(estado) IN ('pendiente', 'PENDIENTE', 'recibida', 'RECIBIDA', 'anulada', 'ANULADA');

-- 3) Verificacion: hay valores fuera del set permitido?
-- Si esta query retorna filas, ABORTAR aqui y revisar manualmente.
SELECT
  estado,
  COUNT(*) AS n
FROM public.ordenes_compra
WHERE estado IS NULL OR estado NOT IN ('Pendiente', 'Recibida', 'Anulada')
GROUP BY estado;

-- 4) Si #3 devolvio 0 filas, agregar el CHECK constraint.
-- Solo se crea si no existe ya, para idempotencia.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_ordenes_compra_estado'
      AND conrelid = 'public.ordenes_compra'::regclass
  ) THEN
    ALTER TABLE public.ordenes_compra
      ADD CONSTRAINT chk_ordenes_compra_estado
      CHECK (estado IN ('Pendiente', 'Recibida', 'Anulada'));
    RAISE NOTICE 'CHECK constraint chk_ordenes_compra_estado agregado';
  ELSE
    RAISE NOTICE 'CHECK constraint chk_ordenes_compra_estado ya existe';
  END IF;
END $$;

-- 5) Documentar transiciones permitidas en comentarios de la columna
COMMENT ON COLUMN public.ordenes_compra.estado IS
  'Estados validos (CHECK): Pendiente | Recibida | Anulada. Transiciones: Pendiente->Recibida (procesar a Compra), Pendiente->Anulada (cancelar), Recibida->Anulada (solo admin). NO: Pendiente->Pendiente, Anulada->*, Recibida->Pendiente.';

NOTIFY pgrst, 'reload schema';

SELECT 'fix_3_2 CHECK constraint ordenes_compra.estado listo' AS status;
