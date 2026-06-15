-- ============================================================
-- Fix 0.5b — Diagnostico de duplicados en documentos_fiscales
-- ============================================================
-- READ ONLY: solo SELECTs. No modifica nada.
--
-- Listar duplicados que estan bloqueando los UNIQUE indices.
-- Despues que veas el resultado, decidimos cual fila conservar
-- en cada par.
-- ============================================================

-- 1) Duplicados por (tenant_id, encf)
SELECT
  tenant_id,
  encf,
  COUNT(*) AS n_filas,
  array_agg(id ORDER BY created_at)                AS ids,
  array_agg(estado ORDER BY created_at)            AS estados,
  array_agg(estado_dgii ORDER BY created_at)       AS estados_dgii,
  array_agg(factura_id ORDER BY created_at)        AS factura_ids,
  array_agg(track_id ORDER BY created_at)          AS track_ids,
  array_agg(created_at ORDER BY created_at)        AS fechas
FROM public.documentos_fiscales
WHERE encf IS NOT NULL
GROUP BY tenant_id, encf
HAVING COUNT(*) > 1
ORDER BY n_filas DESC, tenant_id, encf;

-- 2) Duplicados por track_id
SELECT
  track_id,
  COUNT(*) AS n_filas,
  array_agg(id ORDER BY created_at)                AS ids,
  array_agg(encf ORDER BY created_at)              AS encfs,
  array_agg(estado ORDER BY created_at)            AS estados,
  array_agg(estado_dgii ORDER BY created_at)       AS estados_dgii,
  array_agg(factura_id ORDER BY created_at)        AS factura_ids
FROM public.documentos_fiscales
WHERE track_id IS NOT NULL
GROUP BY track_id
HAVING COUNT(*) > 1
ORDER BY n_filas DESC;

-- 3) Duplicados por factura_id en estados vivos
SELECT
  factura_id,
  COUNT(*) AS n_filas,
  array_agg(id ORDER BY created_at)                AS ids,
  array_agg(encf ORDER BY created_at)              AS encfs,
  array_agg(estado ORDER BY created_at)            AS estados,
  array_agg(estado_dgii ORDER BY created_at)       AS estados_dgii
FROM public.documentos_fiscales
WHERE factura_id IS NOT NULL
  AND estado IN ('procesando', 'emitido')
GROUP BY factura_id
HAVING COUNT(*) > 1
ORDER BY n_filas DESC;

-- 4) Detalle COMPLETO de cada par duplicado por (tenant_id, encf):
-- da contexto para decidir cual mantener
SELECT
  d.tenant_id,
  d.encf,
  d.id,
  d.factura_id,
  d.estado,
  d.estado_dgii,
  d.track_id,
  d.created_at,
  d.updated_at,
  d.error_message,
  d.retry_count,
  d.arecf_recibido_at,
  d.aecf_recibido_at,
  CASE
    WHEN d.estado_dgii IN ('aceptado', 'aceptado_condicional') THEN '⭐ MANTENER (aceptado DGII)'
    WHEN d.estado = 'error' THEN '🗑 candidato a borrar (error)'
    WHEN d.estado_dgii = 'rechazado' THEN '🗑 candidato a borrar (rechazado DGII)'
    ELSE '⚠ revisar'
  END AS recomendacion
FROM public.documentos_fiscales d
WHERE (d.tenant_id, d.encf) IN (
  SELECT tenant_id, encf
  FROM public.documentos_fiscales
  WHERE encf IS NOT NULL
  GROUP BY tenant_id, encf
  HAVING COUNT(*) > 1
)
ORDER BY d.tenant_id, d.encf, d.created_at;
