-- ============================================================
-- Fix 0.5c — Limpiar duplicados de documentos_fiscales antes del UNIQUE
-- ============================================================
-- Diagnostico previo (fix_0_5b) confirmo 6 duplicados de (tenant_id, encf):
--
--   tenant 00000000-...-001 (prueba/dev): 3 filas en error sin track_id
--     - "DGII validar semilla 400: Tipo de certificado no admitido" x2
--     - "Error subiendo XML firmado: The resource already exists"
--   tenant 58c09df3-...           : 3 filas (2 error + 1 emitido)
--     - 2 errors por XML invalido (totales/emisor)
--     - 1 emitido con track_id (la real, MANTENER)
--
-- Las 5 filas en estado=error con track_id IS NULL son intentos fallidos
-- que NO llegaron a DGII (semilla rechazada o XML invalido). DGII no
-- asigno TrackId, asi que no hay rastro fiscal a preservar. Borrarlas
-- es seguro y libera el e-NCF para los UNIQUE indices.
--
-- IMPORTANTE: este script borra SOLO si:
--   1. estado = 'error'
--   2. track_id IS NULL
--   3. existe otra fila con mismo (tenant_id, encf)  [duplicado]
-- ============================================================

-- 0) Confirmacion previa: cuantas filas BORRARIAMOS (READ ONLY).
-- Si el numero NO coincide con lo esperado (5), aborta.
SELECT
  COUNT(*) AS filas_a_borrar
FROM public.documentos_fiscales d
WHERE d.estado = 'error'
  AND d.track_id IS NULL
  AND d.encf IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.documentos_fiscales d2
    WHERE d2.tenant_id = d.tenant_id
      AND d2.encf      = d.encf
      AND d2.id       <> d.id
  );

-- 1) Detalle de las filas que se borran (READ ONLY). Util para audit.
SELECT
  id, tenant_id, encf, factura_id, estado, error_message, created_at
FROM public.documentos_fiscales d
WHERE d.estado = 'error'
  AND d.track_id IS NULL
  AND d.encf IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.documentos_fiscales d2
    WHERE d2.tenant_id = d.tenant_id
      AND d2.encf      = d.encf
      AND d2.id       <> d.id
  )
ORDER BY tenant_id, encf, created_at;

-- 2) BORRADO efectivo (descomenta despues de verificar arriba)
-- DELETE FROM public.documentos_fiscales d
-- WHERE d.estado = 'error'
--   AND d.track_id IS NULL
--   AND d.encf IS NOT NULL
--   AND EXISTS (
--     SELECT 1 FROM public.documentos_fiscales d2
--     WHERE d2.tenant_id = d.tenant_id
--       AND d2.encf      = d.encf
--       AND d2.id       <> d.id
--   );
