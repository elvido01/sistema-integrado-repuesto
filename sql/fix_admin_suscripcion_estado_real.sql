-- ============================================================
-- Fix estado real de suscripciones en Admin Dashboard
-- ============================================================
-- Corrige casos donde una suscripcion aparece como vencida aunque
-- fecha_fin todavia este en el futuro. Esto evita combinaciones como
-- "VENCIDO" + "301d".

UPDATE public.suscripciones
SET estado = 'activo',
    updated_at = now()
WHERE estado = 'vencido'
  AND fecha_fin > now();

CREATE OR REPLACE FUNCTION public.admin_get_tenants_detalle()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true
  ) THEN
    RAISE EXCEPTION 'Acceso denegado: solo superadmins';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'nombre', t.nombre,
      'email', t.email,
      'rnc', t.rnc,
      'telefono', t.telefono,
      'logo_url', t.logo_url,
      'activo', t.activo,
      'plan', t.plan,
      'created_at', t.created_at,
      'suscripcion', (
        SELECT jsonb_build_object(
          'id', s.id,
          'estado', CASE
            WHEN s.fecha_fin <= now() THEN 'vencido'
            WHEN s.estado = 'vencido' THEN 'activo'
            ELSE s.estado
          END,
          'plan_nombre', p.nombre,
          'plan_precio', p.precio,
          'fecha_inicio', s.fecha_inicio,
          'fecha_fin', s.fecha_fin,
          'dias_restantes', GREATEST(0, CEIL(EXTRACT(EPOCH FROM (s.fecha_fin - now())) / 86400)::integer),
          'metodo_pago', s.metodo_pago,
          'monto_pagado', s.monto_pagado
        )
        FROM suscripciones s
        JOIN planes p ON p.id = s.plan_id
        WHERE s.tenant_id = t.id
        ORDER BY s.fecha_fin DESC, s.created_at DESC
        LIMIT 1
      ),
      'total_usuarios', (SELECT COUNT(*) FROM usuarios_empresas ue WHERE ue.tenant_id = t.id),
      'total_productos', (SELECT COUNT(*) FROM productos pr WHERE pr.tenant_id = t.id),
      'total_ventas_mes', (
        SELECT COALESCE(SUM(f.total), 0)
        FROM facturas f
        WHERE f.tenant_id = t.id
          AND f.fecha >= date_trunc('month', CURRENT_DATE)
          AND f.estado != 'ANULADA'
      ),
      'feat_carta_ruta', t.feat_carta_ruta,
      'feat_cobranzas', t.feat_cobranzas,
      'feat_cotizaciones_magna', t.feat_cotizaciones_magna
    )
    ORDER BY t.created_at ASC
  ) INTO _result
  FROM tenants t;

  RETURN COALESCE(_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_tenants_detalle() TO authenticated;

CREATE OR REPLACE FUNCTION public.check_suscripcion_activa(p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid;
  _sub RECORD;
  _dias_restantes integer;
  _activa boolean;
  _pago_pendiente boolean;
  _estado text;
BEGIN
  _tenant := COALESCE(p_tenant_id, get_user_tenant());

  IF _tenant IS NULL THEN
    RETURN jsonb_build_object(
      'activa', false,
      'estado', 'sin_suscripcion',
      'dias_restantes', 0,
      'mensaje', 'No se pudo determinar el tenant'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.pagos_suscripcion
    WHERE tenant_id = _tenant
      AND estado = 'pendiente'
  ) INTO _pago_pendiente;

  SELECT s.*, p.nombre AS plan_nombre, p.descripcion AS plan_descripcion,
         p.precio AS plan_precio, p.limite_usuarios, p.limite_productos,
         p.limite_facturas, p.limite_almacenes,
         p.feat_cotizaciones_magna, p.feat_carta_ruta, p.feat_cobranzas,
         p.feat_reportes_avanzados, p.feat_ocr_facturas, p.feat_api_access
  INTO _sub
  FROM public.suscripciones s
  JOIN public.planes p ON p.id = s.plan_id
  WHERE s.tenant_id = _tenant
  ORDER BY s.fecha_fin DESC, s.created_at DESC
  LIMIT 1;

  IF _sub IS NULL THEN
    RETURN jsonb_build_object(
      'activa', _pago_pendiente,
      'estado', CASE WHEN _pago_pendiente THEN 'en_revision' ELSE 'sin_suscripcion' END,
      'pago_pendiente', _pago_pendiente,
      'plan', null,
      'dias_restantes', CASE WHEN _pago_pendiente THEN 30 ELSE 0 END,
      'mensaje', CASE
        WHEN _pago_pendiente THEN 'Su pago esta siendo verificado. Recibira confirmacion en las proximas 24 horas.'
        ELSE 'No tiene suscripcion activa. Por favor, contrate un plan.'
      END
    );
  END IF;

  _dias_restantes := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (_sub.fecha_fin - now())) / 86400)::integer);
  _activa := _sub.fecha_fin > now() AND _sub.estado NOT IN ('cancelado', 'suspendido');

  IF NOT _activa AND _sub.estado IN ('trial', 'activo') THEN
    UPDATE public.suscripciones
    SET estado = 'vencido', updated_at = now()
    WHERE id = _sub.id;
  ELSIF _activa AND _sub.estado = 'vencido' THEN
    UPDATE public.suscripciones
    SET estado = 'activo', updated_at = now()
    WHERE id = _sub.id;
  END IF;

  _estado := CASE
    WHEN _pago_pendiente AND NOT _activa THEN 'en_revision'
    WHEN _activa AND _sub.estado = 'vencido' THEN 'activo'
    WHEN _activa THEN _sub.estado
    WHEN _sub.estado IN ('cancelado', 'suspendido') THEN _sub.estado
    ELSE 'vencido'
  END;

  RETURN jsonb_build_object(
    'activa', _activa OR _pago_pendiente,
    'suscripcion_id', _sub.id,
    'estado', _estado,
    'pago_pendiente', _pago_pendiente,
    'plan', _sub.plan_nombre,
    'plan_id', _sub.plan_id,
    'plan_descripcion', _sub.plan_descripcion,
    'plan_precio', _sub.plan_precio,
    'fecha_inicio', _sub.fecha_inicio,
    'fecha_fin', _sub.fecha_fin,
    'dias_restantes', _dias_restantes,
    'auto_renovar', _sub.auto_renovar,
    'limites', jsonb_build_object(
      'usuarios', _sub.limite_usuarios,
      'productos', _sub.limite_productos,
      'facturas', _sub.limite_facturas,
      'almacenes', _sub.limite_almacenes
    ),
    'features', jsonb_build_object(
      'cotizaciones_magna', _sub.feat_cotizaciones_magna,
      'carta_ruta', _sub.feat_carta_ruta,
      'cobranzas', _sub.feat_cobranzas,
      'reportes_avanzados', _sub.feat_reportes_avanzados,
      'ocr_facturas', _sub.feat_ocr_facturas,
      'api_access', _sub.feat_api_access
    ),
    'mensaje', CASE
      WHEN _pago_pendiente AND NOT _activa THEN 'Su pago esta siendo verificado. Recibira confirmacion en las proximas 24 horas.'
      WHEN NOT _activa THEN 'Su suscripcion ha vencido. Renueve para continuar.'
      WHEN _dias_restantes <= 3 THEN 'Su suscripcion esta por vencer en ' || _dias_restantes || ' dia(s).'
      ELSE 'Suscripcion activa.'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_suscripcion_activa(uuid) TO authenticated;
