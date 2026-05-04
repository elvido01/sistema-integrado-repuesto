-- ============================================================
-- Tabla de auditoria de callbacks DGII
-- ============================================================
-- Cada vez que DGII llama nuestro endpoint /dgii-callback,
-- guardamos el payload crudo + resultado del procesamiento.
-- Util para:
--   - Diagnostico cuando un e-CF queda en limbo
--   - Auditoria DGII (10 anos)
--   - Reproceso si algo fallo en el procesamiento original
-- ============================================================

CREATE TABLE IF NOT EXISTS public.dgii_callbacks_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         text NOT NULL,           -- 'ARECF' | 'AECF' | 'ANECF' | 'XML_DESCONOCIDO' | etc
  raw_body     text,                    -- payload crudo (truncado a 50KB)
  headers      jsonb,                   -- headers HTTP que mando DGII
  resultado    jsonb,                   -- el JSON que retornamos
  ip           text,                    -- IP de origen (best-effort)
  procesado    boolean DEFAULT true,    -- false si requiere reintento manual
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dgii_callbacks_tipo
  ON public.dgii_callbacks_log(tipo);
CREATE INDEX IF NOT EXISTS idx_dgii_callbacks_created
  ON public.dgii_callbacks_log(created_at DESC);

-- RLS: solo super_admin (services) ve la tabla.
-- Los usuarios normales NO necesitan ver esta tabla — los callbacks
-- ya se reflejan en documentos_fiscales con su estado normalizado.
ALTER TABLE public.dgii_callbacks_log ENABLE ROW LEVEL SECURITY;

-- No creamos politicas para authenticated — service_role bypassa RLS
-- y la edge function dgii-callback usa service_role, asi que escribe sin
-- problema. Si en el futuro queremos exponer este log a un panel de
-- super-admin, agregamos politica condicional.

-- Vista util para troubleshooting
CREATE OR REPLACE VIEW public.dgii_callbacks_recientes AS
SELECT
  id,
  tipo,
  resultado->>'trackId'      AS track_id,
  resultado->>'estado'       AS estado,
  resultado->>'documento_id' AS documento_id,
  resultado->>'warning'      AS warning,
  resultado->>'error'        AS error,
  ip,
  created_at
FROM public.dgii_callbacks_log
ORDER BY created_at DESC
LIMIT 100;

NOTIFY pgrst, 'reload schema';
