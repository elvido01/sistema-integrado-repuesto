-- ============================================================
-- Fix 0.5 — UNIQUE indices en documentos_fiscales
-- ============================================================
-- Auditoria 2026-06-15 (docs/architecture-analysis/AUDIT-2026-06-15.md R-06)
--
-- Problema: la tabla documentos_fiscales no tiene UNIQUE en factura_id
-- ni en track_id. Race condition en emitir-fiscal (dos requests paralelos
-- para la misma factura) puede crear dos filas con dos e-NCF distintos.
--
-- Fix: indices UNIQUE parciales para prevenir duplicados sin bloquear
-- los estados de error/anulados (que pueden coexistir con un re-emitido).
--
-- Estrategia:
--   1. UNIQUE PARCIAL sobre factura_id WHERE estado vivo
--      (procesando, emitido o cualquier estado_dgii distinto de NULL/error)
--      - Si ya hay duplicados, el CREATE INDEX falla. Detectamos primero.
--   2. UNIQUE sobre track_id donde no sea NULL
--   3. UNIQUE sobre encf cuando no sea NULL (e-NCF debe ser unico por tenant)
--
-- Idempotente (DROP/CREATE en orden). NO migra datos.
-- ============================================================

-- 0. Detectar duplicados existentes ANTES de aplicar UNIQUE
-- (esto NO modifica nada, solo reporta. Lo loguea como NOTICE en la sesion.)
DO $$
DECLARE
  v_count_dup_factura int;
  v_count_dup_track int;
  v_count_dup_encf int;
BEGIN
  SELECT COUNT(*) INTO v_count_dup_factura
  FROM (
    SELECT factura_id
    FROM public.documentos_fiscales
    WHERE factura_id IS NOT NULL
      AND estado IN ('procesando', 'emitido')
    GROUP BY factura_id
    HAVING COUNT(*) > 1
  ) d;

  SELECT COUNT(*) INTO v_count_dup_track
  FROM (
    SELECT track_id
    FROM public.documentos_fiscales
    WHERE track_id IS NOT NULL
    GROUP BY track_id
    HAVING COUNT(*) > 1
  ) d;

  SELECT COUNT(*) INTO v_count_dup_encf
  FROM (
    SELECT tenant_id, encf
    FROM public.documentos_fiscales
    WHERE encf IS NOT NULL
    GROUP BY tenant_id, encf
    HAVING COUNT(*) > 1
  ) d;

  RAISE NOTICE 'Duplicados detectados antes del UNIQUE:';
  RAISE NOTICE '  factura_id (con estado vivo): %', v_count_dup_factura;
  RAISE NOTICE '  track_id: %', v_count_dup_track;
  RAISE NOTICE '  (tenant_id, encf): %', v_count_dup_encf;

  IF v_count_dup_factura + v_count_dup_track + v_count_dup_encf > 0 THEN
    RAISE WARNING 'Hay duplicados. Revisa antes de aplicar UNIQUE. El CREATE INDEX fallara.';
  END IF;
END;
$$;

-- 1. UNIQUE parcial sobre factura_id en estados vivos
DROP INDEX IF EXISTS idx_documentos_fiscales_factura_vivo;
CREATE UNIQUE INDEX idx_documentos_fiscales_factura_vivo
  ON public.documentos_fiscales(factura_id)
  WHERE factura_id IS NOT NULL
    AND estado IN ('procesando', 'emitido');

-- 2. UNIQUE sobre track_id (DGII no asigna duplicados)
DROP INDEX IF EXISTS idx_documentos_fiscales_track_id_unique;
CREATE UNIQUE INDEX idx_documentos_fiscales_track_id_unique
  ON public.documentos_fiscales(track_id)
  WHERE track_id IS NOT NULL;

-- 3. UNIQUE (tenant_id, encf): e-NCF es unico por tenant
DROP INDEX IF EXISTS idx_documentos_fiscales_tenant_encf_unique;
CREATE UNIQUE INDEX idx_documentos_fiscales_tenant_encf_unique
  ON public.documentos_fiscales(tenant_id, encf)
  WHERE encf IS NOT NULL;

COMMENT ON INDEX public.idx_documentos_fiscales_factura_vivo IS
  'Fase 0.5: impide dos documentos fiscales vivos para la misma factura. Permite re-emision si el anterior quedo en error/anulado.';
COMMENT ON INDEX public.idx_documentos_fiscales_track_id_unique IS
  'Fase 0.5: garantiza que cada TrackId DGII apunta a un solo documento.';
COMMENT ON INDEX public.idx_documentos_fiscales_tenant_encf_unique IS
  'Fase 0.5: e-NCF debe ser unico dentro del mismo tenant.';

NOTIFY pgrst, 'reload schema';

SELECT 'fix_0_5 documentos_fiscales UNIQUE indices listo' AS status;
