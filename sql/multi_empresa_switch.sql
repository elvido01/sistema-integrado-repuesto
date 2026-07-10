-- =====================================================================
-- Multi-empresa con el mismo usuario (como el selector del SiiF viejo):
-- un usuario entra con su misma clave a cualquier empresa donde esté
-- configurado (usuarios_empresas) y cambia de empresa desde la web.
-- La empresa activa vive en usuario_tenant_activo (ya la usa la
-- extensión) y get_user_tenant() la respeta para todo el RLS.
-- =====================================================================

-- Empresas a las que el usuario logueado tiene acceso
CREATE OR REPLACE FUNCTION public.get_mis_empresas()
RETURNS TABLE(tenant_id uuid, nombre text, activa boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH mias AS (
    SELECT p.tenant_id FROM public.profiles p
    WHERE p.id = auth.uid() AND p.tenant_id IS NOT NULL
    UNION
    SELECT ue.tenant_id FROM public.usuarios_empresas ue
    WHERE ue.user_id = auth.uid()
  )
  SELECT m.tenant_id, ce.nombre::text,
         (m.tenant_id = public.get_user_tenant()) AS activa
  FROM mias m
  JOIN public.config_empresa ce ON ce.tenant_id = m.tenant_id
  ORDER BY ce.nombre;
$$;
GRANT EXECUTE ON FUNCTION public.get_mis_empresas() TO authenticated;

-- Cambiar la empresa activa (valida la membresía en el servidor)
CREATE OR REPLACE FUNCTION public.cambiar_empresa_activa(p_tenant uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.tenant_id = p_tenant OR COALESCE(p.is_superadmin, false) = true)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.usuarios_empresas ue
      WHERE ue.user_id = auth.uid() AND ue.tenant_id = p_tenant
    )
  THEN
    RAISE EXCEPTION 'No tienes acceso a esa empresa';
  END IF;

  INSERT INTO public.usuario_tenant_activo (user_id, tenant_id, updated_at)
  VALUES (auth.uid(), p_tenant, now())
  ON CONFLICT (user_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.cambiar_empresa_activa(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('multi_empresa_switch.sql');
  END IF;
END $$;

SELECT 'Multi-empresa (selector como el SiiF) listo' AS status;
