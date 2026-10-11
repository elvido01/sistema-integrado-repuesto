-- =====================================================================
-- REGISTRO CON CAPTCHA: el público ya no crea empresas directo
-- =====================================================================
-- (11/10/2026) /registro llamaba registrar_nueva_empresa como anon: un
-- script podía crear miles de empresas basura. Ahora la llama la función
-- registrar-empresa (edge) después de comprobar el captcha de Cloudflare,
-- con la llave de servicio.
--
-- CORRER SOLO DESPUÉS de publicar la web nueva y la función
-- registrar-empresa con su secreto TURNSTILE_SECRET: si se corre antes, la
-- página vieja se queda sin poder registrar.
--
-- Además, un freno por si el captcha falla o lo burlan: más de 10 empresas
-- en una hora (todas juntas) se rechazan. Una alta normal no llega ni cerca.
-- =====================================================================

BEGIN;

-- Freno: un trigger en tenants, así registrar_nueva_empresa queda igual.
CREATE OR REPLACE FUNCTION public._freno_registro_empresas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
BEGIN
  -- Solo frena las altas públicas (plan TRIAL inactivo, como las crea
  -- registrar_nueva_empresa); el superadmin crea empresas por otro camino.
  IF NEW.plan = 'TRIAL' AND NOT coalesce(NEW.activo, false)
     AND (SELECT count(*) FROM public.tenants
           WHERE created_at > now() - interval '1 hour' AND plan = 'TRIAL') >= 10 THEN
    RAISE EXCEPTION 'Hay demasiados registros en este momento. Intenta en una hora o escríbenos por WhatsApp.';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_freno_registro_empresas ON public.tenants;
CREATE TRIGGER trg_freno_registro_empresas
  BEFORE INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public._freno_registro_empresas();

REVOKE ALL ON FUNCTION public._freno_registro_empresas() FROM PUBLIC, anon, authenticated;

-- El público ya no puede crear empresas por su cuenta.
REVOKE EXECUTE ON FUNCTION public.registrar_nueva_empresa(text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_nueva_empresa(text, text, text, text, text, text) TO service_role;

COMMIT;

SELECT public.registrar_migracion('registro_con_captcha.sql');
