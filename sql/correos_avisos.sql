-- =====================================================================
-- Correos de aviso por Resend (20/11/2026) — Fase 5 del onboarding
-- ---------------------------------------------------------------------
-- El aviso del día 5 sin uso y el de la pausa salían solo en la campanita,
-- que el que no entra no ve. Ahora también van por correo:
--   * private._avisar_admins (la usa la ronda de inactividad) deja el correo
--     en la cola correos_pendientes para dueño y administradores con correo
--     REAL (no los @usuario.motoflow.app de quien entra con usuario, ni las
--     cuentas eliminadas).
--   * La función enviar-correos los manda por Resend (RESEND_API_KEY), desde
--     avisos@motoflow.com.do. La llama el cron cada 10 minutos.
--   * Si Resend falla se reintenta hasta 5 veces; nada se pierde.
-- correos_pendientes no se lee desde la app (RLS sin políticas).
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.correos_pendientes (
  id          bigserial PRIMARY KEY,
  para        text NOT NULL,
  asunto      text NOT NULL,
  html        text NOT NULL,
  tipo        text,
  empresa_id  uuid,
  estado      text NOT NULL DEFAULT 'pendiente',   -- pendiente | enviando | enviado | error
  intentos    integer NOT NULL DEFAULT 0,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  enviado_at  timestamptz
);
CREATE INDEX IF NOT EXISTS correos_pendientes_estado_idx ON public.correos_pendientes (estado, created_at);
ALTER TABLE public.correos_pendientes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.correos_pendientes FROM anon, authenticated;

-- Correo sencillo con el botón para entrar.
CREATE OR REPLACE FUNCTION private._html_aviso(p_titulo text, p_mensaje text, p_empresa text)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path TO 'pg_catalog'
AS $f$
  SELECT '<!DOCTYPE html><html><body style="font-family:Segoe UI,Arial,sans-serif;background:#f1f5f9;margin:0;padding:24px;color:#1e293b;">'
      || '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;">'
      || '<div style="font-weight:800;font-size:20px;color:#1d4ed8;margin-bottom:4px;">MotoFlow</div>'
      || '<div style="font-size:12px;color:#64748b;margin-bottom:18px;">' || replace(replace(replace(COALESCE(p_empresa, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</div>'
      || '<h1 style="font-size:20px;margin:0 0 12px;">' || p_titulo || '</h1>'
      || '<p style="font-size:15px;line-height:1.5;margin:0 0 22px;">' || p_mensaje || '</p>'
      || '<a href="https://motoflow.com.do" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;">Entrar a MotoFlow</a>'
      || '<p style="font-size:12px;color:#94a3b8;margin-top:26px;">Recibes este correo porque eres dueño o administrador de esta empresa en MotoFlow.</p>'
      || '</div></body></html>';
$f$;
REVOKE ALL ON FUNCTION private._html_aviso(text, text, text) FROM PUBLIC, anon, authenticated;

-- La de siempre (campanita) + correo para los avisos de inactividad/pausa.
CREATE OR REPLACE FUNCTION private._avisar_admins(p_tenant uuid, p_tipo text, p_titulo text, p_mensaje text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'private'
AS $f$
DECLARE v_empresa text;
BEGIN
  INSERT INTO public.notificaciones (tenant_id, user_id, tipo, titulo, mensaje)
  SELECT p_tenant, u.user_id, p_tipo, left(p_titulo, 120), p_mensaje
    FROM (SELECT p.id AS user_id FROM public.profiles p WHERE p.tenant_id = p_tenant AND p.role IN ('owner', 'admin')
          UNION
          SELECT ue.user_id FROM public.usuarios_empresas ue WHERE ue.tenant_id = p_tenant AND ue.rol IN ('owner', 'admin')) u;

  IF p_tipo IN ('aviso_inactividad', 'empresa_pausada') THEN
    SELECT nombre INTO v_empresa FROM public.tenants WHERE id = p_tenant;
    INSERT INTO public.correos_pendientes (para, asunto, html, tipo, empresa_id)
    SELECT DISTINCT lower(au.email), left(p_titulo, 150), private._html_aviso(p_titulo, p_mensaje, v_empresa), p_tipo, p_tenant
      FROM (SELECT p.id AS user_id FROM public.profiles p WHERE p.tenant_id = p_tenant AND p.role IN ('owner', 'admin')
            UNION
            SELECT ue.user_id FROM public.usuarios_empresas ue WHERE ue.tenant_id = p_tenant AND ue.rol IN ('owner', 'admin')) u
      JOIN auth.users au ON au.id = u.user_id
     WHERE au.email IS NOT NULL
       AND au.email LIKE '%@%.%'
       AND au.email NOT ILIKE '%@usuario.motoflow.app'
       AND au.email NOT ILIKE '%.invalid'
       AND au.banned_until IS NULL;
  END IF;
END $f$;
REVOKE ALL ON FUNCTION private._avisar_admins(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

-- Cada 10 minutos: la función enviar-correos vacía la cola (solo trabaja si hay algo).
DO $$ BEGIN
  PERFORM cron.unschedule('enviar-correos') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'enviar-correos');
END $$;
SELECT cron.schedule('enviar-correos', '*/10 * * * *', $c$
  SELECT net.http_post(
    url := 'https://zdvxowpuklbypweyqqki.supabase.co/functions/v1/enviar-correos',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpkdnhvd3B1a2xieXB3ZXlxcWtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5NjI1MzcsImV4cCI6MjA2NjUzODUzN30.noYknWBDdtSkrLuYPRvb_P4-BbAH4qV4ya8bQQp9ijs'),
    body := '{}'::jsonb)
  WHERE EXISTS (SELECT 1 FROM public.correos_pendientes WHERE estado = 'pendiente');
$c$);

COMMIT;

SELECT public.registrar_migracion('correos_avisos.sql');
