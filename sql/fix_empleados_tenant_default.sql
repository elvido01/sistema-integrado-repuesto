-- =====================================================================
-- FIX: alta de empleado violaba RLS ("new row violates row-level security
-- policy for table empleados")
-- ---------------------------------------------------------------------
-- La página inserta el empleado sin tenant_id y la política exige
-- tenant_id = get_user_tenant(). Mismo patrón que otras tablas del
-- sistema: el default lo resuelve desde la sesión del usuario.
-- Sin cambios de frontend. Idempotente.
-- =====================================================================

ALTER TABLE public.empleados
  ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_empleados_tenant_default.sql');
  END IF;
END $$;

SELECT 'empleados.tenant_id ahora toma el tenant de la sesión (alta desde la web OK)' AS status;
