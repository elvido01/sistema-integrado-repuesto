-- =====================================================================
-- SYNC: productos.precio = precio1 de la presentación principal
-- ---------------------------------------------------------------------
-- Auditoría 2026-07-17: 12 productos activos (en todas las empresas)
-- tenían productos.precio distinto al precio1 de su presentación
-- afecta_ft — la fuente REAL que usa la facturación:
--   * Repuestos Caminero: 1 (GOMA 5.00-12: 2,809 vs 3,111.10)
--   * Caminero Motors: 11 (motores BRIO-110: 110,000 vs 129,805.19)
--   * Repuestos Morla: 0
--
-- La facturación siempre cobró por la presentación (bien); este sync solo
-- alinea el campo espejo productos.precio con la convención del sistema
-- (ComprasPage y la ficha lo mantienen igual al precio1 de la afecta_ft).
--
-- Aplica a TODAS las empresas. Idempotente: re-correrlo no cambia nada
-- si ya están sincronizados. Muestra lo que corrigió.
-- =====================================================================

-- 1) Vista previa de lo que se va a corregir
SELECT ce.nombre AS empresa, p.codigo, p.descripcion,
       p.precio AS precio_actual, m.precio1 AS precio_correcto
FROM public.productos p
JOIN LATERAL (
  SELECT pr.precio1
  FROM public.presentaciones pr
  WHERE pr.producto_id = p.id
  ORDER BY pr.afecta_ft DESC NULLS LAST, pr.id
  LIMIT 1
) m ON true
LEFT JOIN public.config_empresa ce ON ce.tenant_id = p.tenant_id
WHERE p.activo = true
  AND COALESCE(m.precio1, 0) > 0
  AND abs(COALESCE(p.precio, 0) - m.precio1) > 0.01
ORDER BY ce.nombre, p.codigo;

-- 2) Corrección
WITH principal AS (
  SELECT DISTINCT ON (pr.producto_id)
         pr.producto_id, pr.precio1
  FROM public.presentaciones pr
  ORDER BY pr.producto_id, pr.afecta_ft DESC NULLS LAST, pr.id
)
UPDATE public.productos p
   SET precio = m.precio1,
       updated_at = now()
FROM principal m
WHERE m.producto_id = p.id
  AND p.activo = true
  AND COALESCE(m.precio1, 0) > 0
  AND abs(COALESCE(p.precio, 0) - m.precio1) > 0.01;

-- 3) Verificación: debe devolver 0 filas
SELECT count(*) AS desincronizados_restantes
FROM public.productos p
JOIN LATERAL (
  SELECT pr.precio1
  FROM public.presentaciones pr
  WHERE pr.producto_id = p.id
  ORDER BY pr.afecta_ft DESC NULLS LAST, pr.id
  LIMIT 1
) m ON true
WHERE p.activo = true
  AND COALESCE(m.precio1, 0) > 0
  AND abs(COALESCE(p.precio, 0) - m.precio1) > 0.01;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('sync_precio_presentacion.sql');
  END IF;
END $$;

SELECT 'productos.precio sincronizado con la presentación principal' AS status;
