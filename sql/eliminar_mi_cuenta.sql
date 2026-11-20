-- =====================================================================
-- Eliminar mi cuenta desde la app (20/11/2026) — exigencia de Google Play
-- ---------------------------------------------------------------------
-- Una app que deja crear cuentas debe dejar borrarlas desde la propia app.
-- eliminar_mi_cuenta('ELIMINAR'), para el usuario que la llama:
--   * Se borran sus datos personales: nombre, correo, sesiones, permisos,
--     avisos, guías y su lugar en TODAS sus empresas.
--   * El usuario se BORRA. Si hay registros de negocio a su nombre (ventas,
--     compras, cierres…) que no pueden quedarse sin autor, se ANONIMIZA: sin
--     nombre, sin correo real, sin contraseña, rol mínimo (seller) y SIN empresa
--     (así su token pierde el acceso al instante y no cuenta como usuario).
--   * En cada empresa donde era el último usuario: sin datos → se borra;
--     con datos → se conserva (la DGII obliga a guardar los comprobantes) y
--     se avisa al superadmin.
--   * El único dueño/administrador de una empresa con más usuarios no puede
--     irse sin dejar a otro de administrador.
--   * El superadmin no puede borrarse desde aquí.
-- cuentas_eliminadas guarda la empresa en empresa_id (no tenant_id) a
-- propósito: así no hace que una empresa vacía parezca "con datos".
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.cuentas_eliminadas (
  id             bigserial PRIMARY KEY,
  user_id        uuid NOT NULL,
  empresa_id     uuid,
  empresa        text,
  como           text NOT NULL,          -- 'borrada' | 'anonimizada'
  empresa_queda  text,                   -- 'sigue' | 'borrada' | 'conservada (datos)'
  eliminada_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cuentas_eliminadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cuentas_eliminadas_superadmin ON public.cuentas_eliminadas;
CREATE POLICY cuentas_eliminadas_superadmin ON public.cuentas_eliminadas
  FOR SELECT TO authenticated USING (public.is_superadmin());
REVOKE ALL ON public.cuentas_eliminadas FROM anon;

-- Usuarios VIVOS de una empresa (sin contar a p_sin ni a los anonimizados).
CREATE OR REPLACE FUNCTION private._usuarios_vivos(p_tenant uuid, p_sin uuid, p_solo_admin boolean)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $f$
  SELECT count(*)::int FROM (
    SELECT p.id FROM public.profiles p
     WHERE p.tenant_id = p_tenant AND p.id <> p_sin AND COALESCE(p.role, '') <> 'eliminado'
       AND (NOT p_solo_admin OR p.role IN ('owner', 'admin'))
    UNION
    SELECT ue.user_id FROM public.usuarios_empresas ue
      JOIN public.profiles p ON p.id = ue.user_id AND COALESCE(p.role, '') <> 'eliminado'
     WHERE ue.tenant_id = p_tenant AND ue.user_id <> p_sin
       AND (NOT p_solo_admin OR ue.rol IN ('owner', 'admin'))) x;
$f$;
REVOKE ALL ON FUNCTION private._usuarios_vivos(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.eliminar_mi_cuenta(text);
CREATE FUNCTION public.eliminar_mi_cuenta(p_confirmacion text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $f$
DECLARE
  v_uid      uuid := auth.uid();
  v_prof     record;
  v_t        record;
  v_como     text;
  v_borrar   uuid[] := '{}';   -- empresas que quedan vacías y sin datos
  v_conserva uuid[] := '{}';   -- empresas que quedan sin usuarios pero con datos
  v_res      jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Inicia sesión primero.'; END IF;
  IF COALESCE(p_confirmacion, '') <> 'ELIMINAR' THEN RAISE EXCEPTION 'Escribe ELIMINAR para confirmar.'; END IF;

  SELECT * INTO v_prof FROM public.profiles WHERE id = v_uid;
  IF COALESCE(v_prof.is_superadmin, false) THEN
    RAISE EXCEPTION 'La cuenta del superadmin no se borra desde aquí.';
  END IF;

  -- Todas sus empresas (la del perfil y las de usuarios_empresas), bloqueadas
  -- para que dos borrados a la vez no dejen una empresa sin administrador.
  FOR v_t IN
    SELECT t.id, t.nombre, t.rnc, t.created_at,
           (v_prof.tenant_id = t.id AND v_prof.role IN ('owner', 'admin'))
           OR EXISTS (SELECT 1 FROM public.usuarios_empresas ue WHERE ue.user_id = v_uid AND ue.tenant_id = t.id AND ue.rol IN ('owner', 'admin')) AS soy_admin
      FROM public.tenants t
     WHERE t.id = v_prof.tenant_id
        OR t.id IN (SELECT ue.tenant_id FROM public.usuarios_empresas ue WHERE ue.user_id = v_uid)
     ORDER BY t.id
       FOR UPDATE OF t
  LOOP
    IF private._usuarios_vivos(v_t.id, v_uid, false) = 0 THEN
      IF private._empresa_tiene_negocio(v_t.id) IS NULL THEN v_borrar := v_borrar || v_t.id;
      ELSE v_conserva := v_conserva || v_t.id; END IF;
    ELSIF v_t.soy_admin AND private._usuarios_vivos(v_t.id, v_uid, true) = 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', HINT = 'unico_admin',
        MESSAGE = 'Eres el único administrador de ' || COALESCE(v_t.nombre, 'una de tus empresas') || ' y hay más usuarios. Antes de borrar tu cuenta, pon a otro usuario de administrador (Usuarios) o elimina a los demás.';
    END IF;
  END LOOP;

  -- Datos personales y accesos.
  DELETE FROM public.usuarios_empresas WHERE user_id = v_uid;
  DELETE FROM public.usuario_tenant_activo WHERE user_id = v_uid;
  DELETE FROM public.user_module_permissions WHERE user_id = v_uid;
  DELETE FROM public.notificaciones WHERE user_id = v_uid;
  DELETE FROM public.guias_progreso WHERE user_id = v_uid;
  DELETE FROM public.guias_eventos WHERE user_id = v_uid;
  DELETE FROM public.hermes_dispositivos WHERE user_id = v_uid;
  -- La reclamación de alta de una empresa que se va a borrar no deja borrar al usuario.
  DELETE FROM private.tenant_onboarding_claims WHERE tenant_id = ANY (v_borrar);

  -- Borrar el usuario; si algo de negocio lo nombra, anonimizar.
  BEGIN
    DELETE FROM public.profiles WHERE id = v_uid;
    DELETE FROM auth.users WHERE id = v_uid;
    v_como := 'borrada';
  EXCEPTION WHEN foreign_key_violation OR check_violation OR not_null_violation OR restrict_violation THEN
    -- (el bloque se deshizo: el perfil sigue; se deja sin datos ni acceso)
    UPDATE public.profiles
       SET full_name = 'Usuario eliminado', email = NULL, role = 'seller', tenant_id = NULL
     WHERE id = v_uid;
    DELETE FROM auth.sessions WHERE user_id = v_uid;
    DELETE FROM auth.refresh_tokens WHERE user_id = v_uid::text;
    DELETE FROM auth.identities WHERE user_id = v_uid;
    DELETE FROM auth.mfa_factors WHERE user_id = v_uid;
    UPDATE auth.users
       SET email = 'eliminado-' || v_uid || '@cuenta-eliminada.invalid',
           phone = NULL,
           encrypted_password = NULL,
           raw_user_meta_data = jsonb_build_object('eliminado', true),
           raw_app_meta_data = jsonb_build_object('provider', 'eliminado'),
           banned_until = timestamptz 'infinity',
           email_confirmed_at = NULL,
           updated_at = now()
     WHERE id = v_uid;
    v_como := 'anonimizada';
  END;

  -- Empresas que quedaron sin nadie.
  FOR v_t IN SELECT t.* FROM public.tenants t WHERE t.id = ANY (v_borrar || v_conserva) LOOP
    IF v_t.id = ANY (v_borrar) AND v_como = 'borrada'
       AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.tenant_id = v_t.id) THEN
      DELETE FROM public.notificaciones WHERE tenant_id = v_t.id;
      DELETE FROM public.guias_eventos WHERE tenant_id = v_t.id;
      DELETE FROM public.guias_progreso WHERE tenant_id = v_t.id;
      DELETE FROM public.usuario_tenant_activo WHERE tenant_id = v_t.id;
      DELETE FROM public.tenant_doc_counters WHERE tenant_id = v_t.id;
      DELETE FROM private.tenant_onboarding_claims WHERE tenant_id = v_t.id;
      DELETE FROM public.suscripciones WHERE tenant_id = v_t.id;
      DELETE FROM public.almacenes WHERE tenant_id = v_t.id;
      DELETE FROM public.config_empresa WHERE tenant_id = v_t.id;
      DELETE FROM public.tenants WHERE id = v_t.id;   -- tenant_actividad en cascada
      INSERT INTO public.empresas_eliminadas (tenant_id, nombre, rnc, creada, eliminada_por, motivo)
      VALUES (v_t.id, v_t.nombre, v_t.rnc, v_t.created_at, NULL, 'el dueño borró su cuenta desde la app (empresa sin datos)');
      v_res := v_res || jsonb_build_object('empresa', v_t.nombre, 'queda', 'borrada');
      INSERT INTO public.cuentas_eliminadas (user_id, empresa_id, empresa, como, empresa_queda)
      VALUES (v_uid, v_t.id, v_t.nombre, v_como, 'borrada');
    ELSE
      INSERT INTO public.notificaciones (tenant_id, user_id, tipo, titulo, mensaje)
      SELECT p.tenant_id, p.id, 'cuenta_eliminada', left('Cuenta eliminada: ' || COALESCE(v_t.nombre, ''), 120),
             'El último usuario de ' || COALESCE(v_t.nombre, '') || ' (' || v_t.id || ') borró su cuenta. La empresa queda sin usuarios; sus datos se conservan.'
        FROM public.profiles p WHERE COALESCE(p.is_superadmin, false) AND p.tenant_id IS NOT NULL;
      v_res := v_res || jsonb_build_object('empresa', v_t.nombre, 'queda', 'conservada (datos)');
      INSERT INTO public.cuentas_eliminadas (user_id, empresa_id, empresa, como, empresa_queda)
      VALUES (v_uid, v_t.id, v_t.nombre, v_como, 'conservada (datos)');
    END IF;
  END LOOP;
  IF jsonb_array_length(v_res) = 0 THEN
    INSERT INTO public.cuentas_eliminadas (user_id, empresa_id, empresa, como, empresa_queda)
    VALUES (v_uid, v_prof.tenant_id, (SELECT nombre FROM public.tenants WHERE id = v_prof.tenant_id), v_como, 'sigue');
  END IF;

  RETURN jsonb_build_object('ok', true, 'como', v_como, 'empresas', v_res,
    'empresa', CASE WHEN v_res @> '[{"queda": "borrada"}]' THEN 'borrada'
                    WHEN v_res @> '[{"queda": "conservada (datos)"}]' THEN 'conservada (datos)'
                    ELSE 'sigue' END);
END $f$;
REVOKE ALL ON FUNCTION public.eliminar_mi_cuenta(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_mi_cuenta(text) TO authenticated;

COMMIT;

SELECT public.registrar_migracion('eliminar_mi_cuenta.sql');
