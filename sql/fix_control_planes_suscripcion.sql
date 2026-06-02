-- ============================================================
-- Fix control de planes y suscripciones
-- ============================================================
-- Corrige check_suscripcion_activa para:
-- 1) No depender solo de suscripciones trial/activo.
-- 2) Devolver la ultima suscripcion real aunque este vencida.
-- 3) Permitir la actualizacion automatica de estado usando VOLATILE.
-- 4) Mantener acceso temporal si hay pago pendiente de revision.

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
  _activa := _sub.fecha_fin > now() AND _sub.estado IN ('trial', 'activo');

  IF NOT _activa AND _sub.estado IN ('trial', 'activo') THEN
    UPDATE public.suscripciones
    SET estado = 'vencido', updated_at = now()
    WHERE id = _sub.id;
  END IF;

  _estado := CASE
    WHEN _pago_pendiente AND NOT _activa THEN 'en_revision'
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
