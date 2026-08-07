-- ============================================================
-- Meta queued dispatcher support
-- ============================================================
-- No guarda tokens ni modifica RLS. Solo acelera la cola de mensajes
-- salientes que la Edge Function meta-send-queued despacha desde backend.

CREATE INDEX IF NOT EXISTS idx_sales_messages_meta_queue
ON public.sales_messages (tenant_id, created_at)
WHERE platform IN ('instagram', 'facebook')
  AND sender_type = 'agent'
  AND status = 'queued';
