-- =====================================================================
-- e-CF · Quitar un rango cargado por error (10/11/2026)
-- ---------------------------------------------------------------------
-- BRIMAR cargó E32 sin tenerlo autorizado y no había cómo quitarlo.
-- · No se borra: se DESACTIVA (activo=false). La pantalla lo esconde y nadie
--   emite con él (get_next_encf_empresa, emitir-fiscal y la vista previa
--   de ventas filtran activo=true), pero el contador «ultimo» se queda: si
--   luego se vuelve a cargar ese tipo, ecf_cargar_secuencia lo reactiva sin
--   retroceder y nunca se repite un e-NCF.
-- · Solo si no se ha usado: ningún número del rango actual (ultimo < desde)
--   y ningún comprobante de producción de ese tipo en la empresa (por
--   tipo_ecf, encf, ncf o el encf asignado de una emisión a medias).
-- · Solo dueño/administrador de ESTA empresa (rol en usuarios_empresas), o
--   super admin. Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.ecf_quitar_secuencia(p_tipo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_tipo   text := btrim(coalesce(p_tipo, ''));
  v_rol    text;
  v_row    public.ecf_secuencias;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No hay empresa activa.'; END IF;

  -- El rol que cuenta es el de la empresa activa, no el del perfil.
  SELECT ue.rol INTO v_rol FROM public.usuarios_empresas ue
   WHERE ue.user_id = auth.uid() AND ue.tenant_id = v_tenant
   ORDER BY (ue.rol IN ('owner', 'admin')) DESC LIMIT 1;
  IF NOT (public.is_superadmin()
          OR v_rol IN ('owner', 'admin')
          OR (v_rol IS NULL AND public.es_usuario_admin()
              AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.tenant_id = v_tenant))) THEN
    RAISE EXCEPTION 'Solo el dueño o un administrador de esta empresa puede quitar secuencias.';
  END IF;

  SELECT * INTO v_row FROM public.ecf_secuencias
   WHERE tenant_id = v_tenant AND tipo_ecf = v_tipo AND serie = 'E' AND ambiente = 'Produccion' AND activo
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'E% no tiene rango cargado.', v_tipo; END IF;

  IF v_row.ultimo >= v_row.desde THEN
    RAISE EXCEPTION 'E% ya usó números (hasta el %). Un rango usado no se puede quitar.', v_tipo, v_row.ultimo;
  END IF;
  IF EXISTS (SELECT 1 FROM public.documentos_fiscales d
              WHERE d.tenant_id = v_tenant
                AND coalesce(d.ambiente, 'Produccion') = 'Produccion'
                AND (d.tipo_ecf::text = v_tipo
                     OR d.encf LIKE 'E' || v_tipo || '%'
                     OR d.ncf  LIKE 'E' || v_tipo || '%'
                     OR d.request_payload->>'encf_asignado' LIKE 'E' || v_tipo || '%')) THEN
    RAISE EXCEPTION 'Ya hay comprobantes E% emitidos en esta empresa. Ese rango no se puede quitar.', v_tipo;
  END IF;

  UPDATE public.ecf_secuencias SET activo = false, updated_at = now()
   WHERE tenant_id = v_tenant AND tipo_ecf = v_tipo AND serie = 'E' AND ambiente = 'Produccion'
  RETURNING * INTO v_row;
  RAISE LOG 'ecf_quitar_secuencia: tenant % tipo E% (% a %, ultimo %) desactivado por %',
    v_tenant, v_tipo, v_row.desde, v_row.hasta, v_row.ultimo, auth.uid();
  RETURN to_jsonb(v_row);
END
$function$;
REVOKE ALL ON FUNCTION public.ecf_quitar_secuencia(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ecf_quitar_secuencia(text) TO authenticated;

SELECT public.registrar_migracion('ecf_quitar_secuencia.sql');
