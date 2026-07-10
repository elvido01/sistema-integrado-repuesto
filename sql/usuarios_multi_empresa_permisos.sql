-- =====================================================================
-- Usuarios y Permisos + multi-empresa:
-- 1) La pantalla solo listaba profiles del tenant → un usuario VINCULADO
--    (usuarios_empresas) desde otra empresa no aparecía y no se le
--    podían asignar permisos ("no le sale acceso a nada").
--    get_usuarios_empresa() lista también a los miembros vinculados.
-- 2) Políticas ADITIVAS para que un admin pueda guardar rol y permisos
--    de cualquier usuario que sea miembro de su empresa activa.
-- =====================================================================

-- ¿El usuario logueado es admin y el objetivo es miembro de su empresa?
CREATE OR REPLACE FUNCTION public.puede_gestionar_usuario(p_target uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = auth.uid()
      AND (lower(COALESCE(me.role, '')) IN ('admin', 'owner')
           OR COALESCE(me.is_superadmin, false))
  )
  AND (
    EXISTS (SELECT 1 FROM public.profiles t
            WHERE t.id = p_target AND t.tenant_id = public.get_user_tenant())
    OR EXISTS (SELECT 1 FROM public.usuarios_empresas ue
               WHERE ue.user_id = p_target AND ue.tenant_id = public.get_user_tenant())
  );
$$;
GRANT EXECUTE ON FUNCTION public.puede_gestionar_usuario(uuid) TO authenticated;

-- Lista de usuarios de la empresa activa: perfiles propios + vinculados
CREATE OR REPLACE FUNCTION public.get_usuarios_empresa()
RETURNS SETOF public.profiles
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.*
  FROM public.profiles p
  WHERE EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.id = auth.uid()
        AND (lower(COALESCE(me.role, '')) IN ('admin', 'owner')
             OR COALESCE(me.is_superadmin, false))
    )
    AND (
      p.tenant_id = public.get_user_tenant()
      OR p.id IN (SELECT ue.user_id FROM public.usuarios_empresas ue
                  WHERE ue.tenant_id = public.get_user_tenant())
    )
  ORDER BY p.role, p.full_name;
$$;
GRANT EXECUTE ON FUNCTION public.get_usuarios_empresa() TO authenticated;

-- Políticas aditivas (PERMISSIVE: solo AGREGAN acceso, no quitan nada)
DROP POLICY IF EXISTS admin_gestiona_permisos_miembros ON public.user_module_permissions;
CREATE POLICY admin_gestiona_permisos_miembros ON public.user_module_permissions
  FOR ALL TO authenticated
  USING (public.puede_gestionar_usuario(user_id))
  WITH CHECK (public.puede_gestionar_usuario(user_id));

DROP POLICY IF EXISTS admin_actualiza_perfiles_miembros ON public.profiles;
CREATE POLICY admin_actualiza_perfiles_miembros ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.puede_gestionar_usuario(id))
  WITH CHECK (public.puede_gestionar_usuario(id));

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('usuarios_multi_empresa_permisos.sql');
  END IF;
END $$;

SELECT 'Usuarios vinculados visibles y gestionables por empresa' AS status;
