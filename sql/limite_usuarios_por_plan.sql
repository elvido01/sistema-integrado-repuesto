-- =====================================================================
-- Límite de usuarios por plan (07/11/2026)
-- ---------------------------------------------------------------------
-- 1. tenants.limite_usuarios_especial: el tope pactado con una empresa
--    (manda sobre el del plan). Centenario: precio fundador = 3 usuarios
--    y SIN el Sales Hub / CRM (el CRM es del EDUCA PRO a precio completo).
-- 2. public.cupo_usuarios(tenant): { limite, usados, disponibles }.
--    admin-management la consulta antes de crear o vincular un usuario.
--    Cuenta los usuarios de la empresa (usuarios_empresas + profiles),
--    sin contar superadmins. limite NULL = sin límite.
--    Quien ya tenga más usuarios que su plan NO pierde a nadie: solo no
--    puede crear más (hoy: INVERSIONES EL NARANJO, 4 en Básico de 3).
-- =====================================================================

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS limite_usuarios_especial integer
  CHECK (limite_usuarios_especial IS NULL OR limite_usuarios_especial > 0);

UPDATE public.tenants
   SET limite_usuarios_especial = 3,
       precio_especial_nota = 'Precio fundador (primer colegio de MotoFlow): RD$2,000/mes con lo de EDUCA PRO hasta 700 estudiantes y 3 usuarios, sin el Sales Hub / CRM (es del EDUCA PRO a precio completo). Para siempre mientras pague sin atrasos. Aprobado por el dueño 06/11/2026; usuarios y CRM 07/11/2026.'
 WHERE id = '8bcd59ef-9502-486c-b919-c77b991387bb';

CREATE OR REPLACE FUNCTION public.cupo_usuarios(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_limite integer; v_usados integer;
BEGIN
  -- La propia empresa, el superadmin o el servidor (admin-management).
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND p_tenant IS DISTINCT FROM public.get_user_tenant()
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND COALESCE(is_superadmin, false)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT COALESCE(t.limite_usuarios_especial,
                  (SELECT pl.limite_usuarios
                     FROM public.suscripciones s JOIN public.planes pl ON pl.id = s.plan_id
                    WHERE s.tenant_id = t.id AND s.estado IN ('trial', 'activo')
                    ORDER BY s.fecha_fin DESC LIMIT 1))
    INTO v_limite
    FROM public.tenants t WHERE t.id = p_tenant;
  IF v_limite >= 99999 THEN v_limite := NULL; END IF;   -- "ilimitados"

  SELECT count(DISTINCT u.uid) INTO v_usados
    FROM (SELECT user_id AS uid FROM public.usuarios_empresas WHERE tenant_id = p_tenant
          UNION SELECT id FROM public.profiles WHERE tenant_id = p_tenant) u
    JOIN public.profiles p ON p.id = u.uid
   WHERE NOT COALESCE(p.is_superadmin, false);

  RETURN jsonb_build_object('limite', v_limite, 'usados', v_usados,
                            'disponibles', CASE WHEN v_limite IS NULL THEN NULL ELSE greatest(v_limite - v_usados, 0) END);
END;
$function$;
REVOKE ALL ON FUNCTION public.cupo_usuarios(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cupo_usuarios(uuid) TO authenticated, service_role;

SELECT public.registrar_migracion('limite_usuarios_por_plan.sql');
