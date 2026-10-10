-- =====================================================================
-- REGISTRO DE ERRORES de MotoFlow (sin servicios de terceros)
-- =====================================================================
-- (10/10/2026) Plan de comercialización, paso 2. Hasta hoy un error en la
-- web de un cliente solo se sabía si el cliente llamaba. La web anota aquí
-- los errores no controlados (lib/registroErrores.js), deduplicados y con
-- tope por sesión. Cada empresa solo puede ESCRIBIR los suyos; solo el
-- superadmin los LEE. Se borran solos a los 60 días.
-- Deshacer: DROP TABLE public.errores_app; (la web sigue igual: si la tabla
-- no existe, el insert falla callado).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.errores_app (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id  uuid DEFAULT get_user_tenant(),
  user_id    uuid DEFAULT auth.uid(),
  origen     text NOT NULL,          -- 'window' | 'promesa' | nombre del flujo
  mensaje    text NOT NULL,
  detalle    jsonb,
  url        text,
  version    text
);
CREATE INDEX IF NOT EXISTS idx_errores_app_fecha ON public.errores_app (created_at DESC);

ALTER TABLE public.errores_app ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS errores_app_insert ON public.errores_app;
CREATE POLICY errores_app_insert ON public.errores_app
  FOR INSERT TO authenticated
  WITH CHECK (
    (tenant_id IS NULL OR tenant_id = get_user_tenant())
    AND user_id = auth.uid()
    AND length(mensaje) <= 2000
  );

DROP POLICY IF EXISTS errores_app_superadmin ON public.errores_app;
CREATE POLICY errores_app_superadmin ON public.errores_app
  FOR SELECT TO authenticated
  USING (is_superadmin());

-- Limpieza: más de 60 días se borran (una vez al día, 4:15 am RD).
SELECT cron.unschedule('errores-app-limpieza')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'errores-app-limpieza');
SELECT cron.schedule('errores-app-limpieza', '15 8 * * *',
  $$DELETE FROM public.errores_app WHERE created_at < now() - interval '60 days'$$);

SELECT public.registrar_migracion('errores_app.sql');
