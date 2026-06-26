-- =====================================================================
-- Ampliar los roles permitidos en profiles.role
-- ---------------------------------------------------------------------
-- El modal "Crear Nuevo Usuario" ahora ofrece Administrador, Gerente,
-- Supervisor y Vendedor. El CHECK historico de profiles.role solo permitia
-- un subconjunto (segun el entorno: ('admin','seller') o
-- ('admin','supervisor','vendedor')), lo que haria fallar la creacion con
-- 'gerente'/'supervisor'. Aqui dejamos un CHECK superset, seguro y re-ejecutable.
--
-- Permisos: solo 'admin'/'owner' dan acceso total; gerente/supervisor/seller
-- se rigen por los permisos por modulo (user_module_permissions) que el admin
-- configura en Usuarios y Permisos.
-- =====================================================================

-- Quitar cualquier CHECK existente sobre profiles.role (nombre puede variar)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin','owner','manager','gerente','supervisor','seller','vendedor'));

NOTIFY pgrst, 'reload schema';

SELECT 'profiles.role admite admin/owner/manager/gerente/supervisor/seller/vendedor' AS status;
