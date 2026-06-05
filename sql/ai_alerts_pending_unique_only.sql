-- Permite historial de alertas resueltas/revisadas/ignoradas sin romper el boton Resolver.
-- Solo debe existir una alerta pendiente abierta por tenant + tipo + registro relacionado.

ALTER TABLE public.ai_alerts
DROP CONSTRAINT IF EXISTS ai_alerts_tenant_id_alert_type_related_id_status_key;

DROP INDEX IF EXISTS public.ai_alerts_pending_unique_idx;

CREATE UNIQUE INDEX ai_alerts_pending_unique_idx
ON public.ai_alerts(tenant_id, alert_type, related_id)
WHERE status = 'pending';
