-- =====================================================================
-- EL SUPER ADMINISTRADOR VE TODAS LAS EMPRESAS (19/10/2026)
-- ---------------------------------------------------------------------
-- El selector de empresa (abajo en el menú) sale de get_mis_empresas(), que
-- solo listaba la empresa del perfil y las de usuarios_empresas. El súper
-- admin estaba agregado a mano en 9 de 12: GRUPO PAMPHILE, INVERSIONES EL
-- NARANJO y Motoprestasmos Caminero Morla no le salían, y cada empresa
-- nueva tampoco.
--
-- cambiar_empresa_activa() y get_user_tenant() ya dejaban pasar al súper
-- admin a cualquier empresa, y las políticas de usuarios/permisos usan
-- is_superadmin(); faltaba solo la lista. Ahora, si es súper admin, la
-- lista son TODAS las empresas de config_empresa, las de hoy y las que se
-- creen después, sin tener que agregarlo a cada una.
--
-- No se le crean filas en usuarios_empresas a propósito: así no aparece en
-- "Usuarios y Permisos" de las empresas de los clientes.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_mis_empresas()
 RETURNS TABLE(tenant_id uuid, nombre text, activa boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH mias AS (
    SELECT p.tenant_id FROM public.profiles p
    WHERE p.id = auth.uid() AND p.tenant_id IS NOT NULL
    UNION
    SELECT ue.tenant_id FROM public.usuarios_empresas ue
    WHERE ue.user_id = auth.uid()
    UNION
    -- (19/10/2026) El súper admin: todas, también las futuras.
    SELECT ce.tenant_id FROM public.config_empresa ce
    WHERE EXISTS (SELECT 1 FROM public.profiles me
                  WHERE me.id = auth.uid() AND COALESCE(me.is_superadmin, false))
  )
  SELECT m.tenant_id, ce.nombre::text,
         (m.tenant_id = public.get_user_tenant()) AS activa
  FROM mias m
  JOIN public.config_empresa ce ON ce.tenant_id = m.tenant_id
  ORDER BY ce.nombre;
$function$;

SELECT public.registrar_migracion('superadmin_todas_las_empresas.sql');
