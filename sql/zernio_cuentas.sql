-- =====================================================================
-- ZERNIO: QUÉ CUENTA ES DE QUÉ EMPRESA
-- =====================================================================
-- (16/10/2026) Zernio (zernio.com) es una API unificada que ya tiene
-- aprobados los permisos de mensajes de Meta. Por ahí entran al CRM los
-- mensajes de Facebook Messenger (que por la app propia no llegaban) y
-- salen las respuestas de Instagram y Messenger (la app propia espera el
-- Acceso Avanzado de Meta desde el 03/10). Hermes ya la usaba para
-- publicar; la llave vive en el .env de Hermes y en los secretos de Supabase.
--
-- Cada cuenta de Zernio apunta a la cuenta de la red que ya conoce el CRM
-- (social_accounts.external_account_id): así la conversación lleva la misma
-- clave "plataforma:cuenta:cliente" que pone el webhook de Meta, y si un
-- mensaje llega por los dos caminos no se duplica.
--
-- Solo la usan las funciones con service_role: sin acceso para la app.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.zernio_cuentas (
  zernio_account_id   text PRIMARY KEY,
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id),
  platform            text NOT NULL CHECK (platform IN ('instagram', 'facebook')),
  external_account_id text NOT NULL,
  activo              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.zernio_cuentas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zernio_cuentas FROM PUBLIC, anon, authenticated;

-- Repuestos Morla (leído de GET /v1/accounts el 16/10/2026).
INSERT INTO public.zernio_cuentas (zernio_account_id, tenant_id, platform, external_account_id) VALUES
  ('6a52c8413ecd8aa344bc4bb4', '00000000-0000-0000-0000-000000000001', 'facebook',  '100771345587204'),
  ('6a52c05e3ecd8aa344baf81a', '00000000-0000-0000-0000-000000000001', 'instagram', '17841442598881436')
ON CONFLICT (zernio_account_id) DO UPDATE
   SET tenant_id = EXCLUDED.tenant_id, platform = EXCLUDED.platform,
       external_account_id = EXCLUDED.external_account_id, activo = true;

SELECT public.registrar_migracion('zernio_cuentas.sql');
