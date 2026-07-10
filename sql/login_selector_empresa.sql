-- =====================================================================
-- Selector de empresa EN EL LOGIN (como el SiiF viejo):
-- al escribir el usuario, si pertenece a MAS de una empresa, el login
-- muestra un campo "Empresa" para elegir a cual entrar.
--
-- Seguridad: el RPC es anonimo pero SOLO devuelve filas cuando el
-- usuario tiene 2+ empresas (un usuario normal de 1 empresa no revela
-- nada, evita enumerar usuarios). Solo expone tenant_id + nombre.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_empresas_login(p_usuario text)
RETURNS TABLE(tenant_id uuid, nombre text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH u AS (
    SELECT p.id, p.tenant_id
    FROM public.profiles p
    WHERE lower(p.email) = lower(btrim(p_usuario))
    LIMIT 1
  ),
  mias AS (
    SELECT u2.tenant_id FROM u u2 WHERE u2.tenant_id IS NOT NULL
    UNION
    SELECT ue.tenant_id FROM public.usuarios_empresas ue JOIN u ON ue.user_id = u.id
  )
  SELECT m.tenant_id, ce.nombre::text
  FROM mias m
  JOIN public.config_empresa ce ON ce.tenant_id = m.tenant_id
  WHERE (SELECT count(*) FROM mias) > 1
  ORDER BY ce.nombre;
$$;

GRANT EXECUTE ON FUNCTION public.get_empresas_login(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('login_selector_empresa.sql');
  END IF;
END $$;

SELECT 'Selector de empresa en el login listo' AS status;
