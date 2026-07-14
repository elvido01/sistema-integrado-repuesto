-- =====================================================================
-- Super-admin con acceso a TODAS las empresas
-- ---------------------------------------------------------------------
-- elvidocaminero@gmail.com es el dueño de la plataforma. Ya tenía
-- is_superadmin=true y role='admin' (acceso total a módulos y bypass de
-- tenant en get_user_tenant / cambiar_empresa_activa), pero el SELECTOR de
-- empresas (get_mis_empresas) solo lista lo que hay en usuarios_empresas,
-- así que solo veía Morla. Este script lo enlaza a TODAS las empresas con
-- config_empresa para que el selector las muestre todas y pueda cambiar a
-- cualquiera. Idempotente.
-- Aplicado en prod vía service key el 2026-07-14; se deja para el registro.
-- =====================================================================

INSERT INTO public.usuarios_empresas (user_id, tenant_id, rol)
SELECT u.id, ce.tenant_id, 'admin'
FROM auth.users u
CROSS JOIN public.config_empresa ce
WHERE lower(u.email) = 'elvidocaminero@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.usuarios_empresas ue
    WHERE ue.user_id = u.id AND ue.tenant_id = ce.tenant_id
  );

-- Asegurar el flag de super-admin (por si algún día se resetea el perfil).
UPDATE public.profiles p
SET is_superadmin = true, role = 'admin'
FROM auth.users u
WHERE p.id = u.id
  AND lower(u.email) = 'elvidocaminero@gmail.com'
  AND (p.is_superadmin IS DISTINCT FROM true OR p.role IS DISTINCT FROM 'admin');

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('superadmin_todas_empresas.sql');
  END IF;
END $$;

SELECT 'elvidocaminero@gmail.com enlazado a todas las empresas' AS status;
