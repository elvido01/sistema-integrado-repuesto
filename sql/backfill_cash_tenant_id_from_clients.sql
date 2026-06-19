-- ============================================================
-- BACKFILL: Completar tenant_id en movimientos que afectan caja
-- ============================================================
-- Solo completa tenant_id cuando esta NULL. No cambia registros que ya
-- tienen tenant_id para evitar reasignaciones accidentales.
-- ============================================================

UPDATE public.facturas f
SET tenant_id = c.tenant_id
FROM public.clientes c
WHERE f.cliente_id = c.id
  AND f.tenant_id IS NULL
  AND c.tenant_id IS NOT NULL;

UPDATE public.recibos_ingreso r
SET tenant_id = c.tenant_id
FROM public.clientes c
WHERE r.cliente_id = c.id
  AND r.tenant_id IS NULL
  AND c.tenant_id IS NOT NULL;

UPDATE public.facturas_detalle fd
SET tenant_id = f.tenant_id
FROM public.facturas f
WHERE fd.factura_id = f.id
  AND fd.tenant_id IS NULL
  AND f.tenant_id IS NOT NULL;

UPDATE public.recibos_ingreso_detalle rid
SET tenant_id = r.tenant_id
FROM public.recibos_ingreso r
WHERE rid.recibo_id = r.id
  AND rid.tenant_id IS NULL
  AND r.tenant_id IS NOT NULL;
