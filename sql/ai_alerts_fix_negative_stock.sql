-- Corrige la clasificacion de alertas de inventario:
-- existencia negativa debe ser "existencia_negativa", no "stock_bajo".

ALTER TABLE public.ai_alerts
DROP CONSTRAINT IF EXISTS ai_alerts_tenant_id_alert_type_related_id_status_key;

DROP INDEX IF EXISTS public.ai_alerts_pending_unique_idx;

CREATE UNIQUE INDEX ai_alerts_pending_unique_idx
ON public.ai_alerts(tenant_id, alert_type, related_id)
WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.ai_detect_stock_bajo(p_tenant_id UUID)
RETURNS TABLE (producto_id UUID, codigo TEXT, descripcion TEXT, existencia NUMERIC, min_stock NUMERIC, severity TEXT)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  WITH stock AS (
    SELECT
      p.id,
      p.codigo,
      p.descripcion,
      p.min_stock,
      public.get_stock_actual(p.id) AS existencia
    FROM public.productos p
    WHERE p.tenant_id = p_tenant_id
      AND COALESCE(p.activo, true) = true
      AND p.min_stock > 0
  )
  SELECT
    s.id,
    s.codigo,
    s.descripcion,
    s.existencia,
    s.min_stock,
    CASE
      WHEN s.existencia = 0 THEN 'critical'
      WHEN s.existencia < (s.min_stock * 0.5) THEN 'high'
      ELSE 'medium'
    END AS severity
  FROM stock s
  WHERE s.existencia >= 0
    AND s.existencia < s.min_stock
  ORDER BY s.existencia ASC
  LIMIT 200;
$$;

-- Cierra las alertas pendientes que ya quedaron mal clasificadas.
UPDATE public.ai_alerts
SET
  status = 'resolved',
  resolved_at = COALESCE(resolved_at, NOW()),
  resolution_notes = COALESCE(resolution_notes, 'Cerrada automaticamente: existencia negativa reclasificada.')
WHERE alert_type = 'stock_bajo'
  AND status = 'pending'
  AND CASE
    WHEN metadata->>'existencia' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (metadata->>'existencia')::NUMERIC < 0
    ELSE false
  END;

-- Inserta la alerta correcta para esos productos si todavia no existe abierta.
INSERT INTO public.ai_alerts (
  tenant_id,
  alert_type,
  area,
  severity,
  title,
  description,
  recommendation,
  related_table,
  related_id,
  metadata
)
SELECT
  p.tenant_id,
  'existencia_negativa',
  'inventario',
  'critical',
  'Existencia negativa: ' || p.codigo,
  p.descripcion || ' - existencia ' || public.get_stock_actual(p.id),
  'Revisar movimientos: probablemente falta una entrada o sobra una salida.',
  'productos',
  p.id,
  jsonb_build_object('existencia', public.get_stock_actual(p.id), 'codigo', p.codigo)
FROM public.productos p
WHERE public.get_stock_actual(p.id) < 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.ai_alerts a
    WHERE a.tenant_id = p.tenant_id
      AND a.alert_type = 'existencia_negativa'
      AND a.related_id = p.id
      AND a.status = 'pending'
  )
ON CONFLICT (tenant_id, alert_type, related_id) WHERE status = 'pending' DO NOTHING;

GRANT EXECUTE ON FUNCTION public.ai_detect_stock_bajo(UUID) TO service_role, authenticated;
