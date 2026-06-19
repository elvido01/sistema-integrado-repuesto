-- ============================================================
-- BACKFILL: Completar tenant_id de devoluciones existentes
-- ============================================================
-- Toma el tenant desde la factura original. No cambia registros que
-- ya tienen tenant_id asignado.
-- ============================================================

UPDATE public.devoluciones d
SET tenant_id = f.tenant_id
FROM public.facturas f
WHERE d.factura_id = f.id
  AND d.tenant_id IS NULL
  AND f.tenant_id IS NOT NULL;

UPDATE public.devoluciones_detalle dd
SET tenant_id = d.tenant_id
FROM public.devoluciones d
WHERE dd.devolucion_id = d.id
  AND dd.tenant_id IS NULL
  AND d.tenant_id IS NOT NULL;

UPDATE public.inventario_movimientos im
SET tenant_id = d.tenant_id
FROM public.devoluciones d
WHERE im.referencia_doc = 'DEVOLUCION-' || d.numero::text
  AND im.tenant_id IS NULL
  AND d.tenant_id IS NOT NULL;
