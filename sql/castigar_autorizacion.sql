-- =====================================================================
-- Autorización para castigar una cuenta ACTIVA (contraseña del creador)
-- ---------------------------------------------------------------------
-- Castigar una cuenta activa requiere la contraseña del correo del CREADOR
-- de la empresa (el perfil role='admin', el más antiguo del tenant), SALVO
-- que la acción la haga el propio creador o un super-admin (no piden clave).
-- La verificación es EN EL SERVIDOR (contra auth.users) para que no se pueda
-- saltar desde el cliente.
-- Requiere sql/cuentas_incobrables.sql + sql/cuentas_incobrables_rpc.sql.
-- =====================================================================

-- Creador del tenant actual (perfil admin más antiguo).
CREATE OR REPLACE FUNCTION public._creador_tenant()
RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path TO 'public'
AS $$
  SELECT id FROM public.profiles
  WHERE tenant_id = public.get_user_tenant() AND role = 'admin'
  ORDER BY created_at NULLS LAST
  LIMIT 1;
$$;

-- ¿El usuario actual puede castigar SIN contraseña? (es el creador o super-admin)
CREATE OR REPLACE FUNCTION public.puede_castigar_sin_clave()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path TO 'public'
AS $$
DECLARE v_super boolean;
BEGIN
  IF auth.uid() = public._creador_tenant() THEN RETURN true; END IF;
  SELECT COALESCE(is_superadmin, false) INTO v_super FROM public.profiles WHERE id = auth.uid() LIMIT 1;
  RETURN COALESCE(v_super, false);
END;
$$;

-- Castigar (con autorización). Reemplaza la versión de 2 args.
DROP FUNCTION IF EXISTS public.castigar_prestamo(uuid, text);
CREATE OR REPLACE FUNCTION public.castigar_prestamo(
  p_prestamo_id uuid,
  p_motivo      text DEFAULT 'incobrable',
  p_password    text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant  uuid := public.get_user_tenant();
  v_motivo  text := CASE WHEN p_motivo IN ('incobrable','vehiculo_robado','perdida_total') THEN p_motivo ELSE 'incobrable' END;
  v_creador uuid;
  v_ok      boolean;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;

  -- Autorización
  IF NOT public.puede_castigar_sin_clave() THEN
    v_creador := public._creador_tenant();
    IF v_creador IS NULL THEN RAISE EXCEPTION 'No se encontró el creador de la empresa para autorizar'; END IF;
    IF COALESCE(btrim(p_password), '') = '' THEN
      RAISE EXCEPTION 'Se requiere la contraseña del creador de la empresa para castigar una cuenta activa';
    END IF;
    SELECT (u.encrypted_password = extensions.crypt(p_password, u.encrypted_password))
      INTO v_ok
    FROM auth.users u WHERE u.id = v_creador;
    IF NOT COALESCE(v_ok, false) THEN
      RAISE EXCEPTION 'Contraseña del creador incorrecta';
    END IF;
  END IF;

  UPDATE public.prestamos
     SET estado = 'castigado', motivo_castigo = v_motivo,
         fecha_castigo = (now() AT TIME ZONE 'America/Santo_Domingo')::date,
         castigado_manual = true
   WHERE id = p_prestamo_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Préstamo no encontrado'; END IF;

  RETURN json_build_object('ok', true, 'motivo', v_motivo);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._creador_tenant() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.puede_castigar_sin_clave() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.castigar_prestamo(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._creador_tenant() TO authenticated;
GRANT EXECUTE ON FUNCTION public.puede_castigar_sin_clave() TO authenticated;
GRANT EXECUTE ON FUNCTION public.castigar_prestamo(uuid,text,text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'autorización de castigo lista' AS status;
