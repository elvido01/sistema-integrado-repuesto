-- =====================================================================
-- Precio especial atado a UN plan (07/11/2026)
-- ---------------------------------------------------------------------
-- Decisión del dueño: el primer colegio (Centenario) va en EDUCA INICIAL
-- (RD$2,000) con el tope extendido a 700 estudiantes (la reservación de
-- cupo ya es del Inicial). Si mañana sube a EDUCA PRO o EDUCA TOTAL no hay que tocar nada:
-- lo pactado vale SOLO mientras esté en el plan del especial; en otro plan
-- manda lo de ese plan (800 / sin límite, 6 / ilimitados usuarios, CRM).
--
-- 1. tenants.plan_especial: el plan donde vale lo pactado. NULL = en
--    cualquier plan (como era antes).
-- 2. private.especial_vigente(tenant): ¿está hoy en el plan del especial?
-- 3. edu_limite_estudiantes y cupo_usuarios lo respetan.
-- 4. Centenario: plan_especial = EDUCA INICIAL, 700 estudiantes, usuarios
--    los del plan (3), y su suscripción (trial) pasa de EDUCA PRO a EDUCA
--    INICIAL sin cambiar fechas.
-- =====================================================================

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS plan_especial text;

CREATE OR REPLACE FUNCTION private.especial_vigente(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT t.plan_especial IS NULL
      OR upper(t.plan_especial) = upper((SELECT pl.nombre
                                           FROM public.suscripciones s JOIN public.planes pl ON pl.id = s.plan_id
                                          WHERE s.tenant_id = t.id
                                          ORDER BY s.fecha_fin DESC NULLS LAST, s.created_at DESC
                                          LIMIT 1))
    FROM public.tenants t WHERE t.id = p_tenant;
$function$;
REVOKE ALL ON FUNCTION private.especial_vigente(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.edu_limite_estudiantes(p_tenant uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT COALESCE(
    (SELECT t.limite_estudiantes_especial FROM public.tenants t
      WHERE t.id = p_tenant AND COALESCE(private.especial_vigente(p_tenant), true)),
    (SELECT p.limite_estudiantes
       FROM public.suscripciones s JOIN public.planes p ON p.id = s.plan_id
      WHERE s.tenant_id = p_tenant
      ORDER BY s.fecha_fin DESC NULLS LAST, s.created_at DESC
      LIMIT 1)
  );
$function$;

CREATE OR REPLACE FUNCTION public.cupo_usuarios(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_limite integer; v_usados integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND p_tenant IS DISTINCT FROM public.get_user_tenant()
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND COALESCE(is_superadmin, false)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT COALESCE(CASE WHEN COALESCE(private.especial_vigente(t.id), true) THEN t.limite_usuarios_especial END,
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

-- Centenario: EDUCA INICIAL con 700 estudiantes.
UPDATE public.tenants
   SET plan_especial = 'EDUCA INICIAL',
       limite_estudiantes_especial = 700,
       limite_usuarios_especial = NULL,
       precio_especial_nota = 'Plan fundador (primer colegio de MotoFlow): EDUCA INICIAL a RD$2,000/mes con el tope extendido a 700 estudiantes; 3 usuarios, sin Sales Hub/CRM ni nómina (son del EDUCA PRO). Si sube a EDUCA PRO o TOTAL rige lo de ese plan. Aprobado por el dueño 06-07/11/2026.'
 WHERE id = '8bcd59ef-9502-486c-b919-c77b991387bb';

UPDATE public.suscripciones
   SET plan_id = (SELECT id FROM public.planes WHERE nombre = 'EDUCA INICIAL')
 WHERE tenant_id = '8bcd59ef-9502-486c-b919-c77b991387bb'
   AND plan_id = (SELECT id FROM public.planes WHERE nombre = 'EDUCA PRO');

SELECT public.registrar_migracion('plan_especial_educa_inicial.sql');
