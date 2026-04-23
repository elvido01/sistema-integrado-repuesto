-- ============================================================
-- MIGRACIÓN: Sistema de Pagos de Suscripciones
-- Transferencia bancaria con verificación de comprobante
-- ============================================================

-- 1. Tabla pagos_suscripcion
CREATE TABLE IF NOT EXISTS public.pagos_suscripcion (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id         uuid NOT NULL REFERENCES public.planes(id),

  -- Estado del pago
  estado          text NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),

  -- Datos del pago
  metodo_pago     text NOT NULL DEFAULT 'transferencia',
  monto           numeric(10,2) NOT NULL,
  referencia      text,
  banco_origen    text,
  titular_cuenta  text,
  comprobante_url text,

  -- Revisión admin
  revisado_por    uuid REFERENCES auth.users(id),
  fecha_revision  timestamptz,
  notas_revision  text,
  motivo_rechazo  text,

  -- Suscripción creada al aprobar
  suscripcion_id  uuid REFERENCES public.suscripciones(id),

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_suscripcion_tenant ON pagos_suscripcion(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pagos_suscripcion_estado ON pagos_suscripcion(estado);

-- 2. Tabla cuentas_bancarias (datos bancarios para recibir pagos)
CREATE TABLE IF NOT EXISTS public.cuentas_bancarias_saas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  banco       text NOT NULL,
  tipo_cuenta text NOT NULL DEFAULT 'Corriente',
  numero      text NOT NULL,
  titular     text NOT NULL,
  rnc         text,
  moneda      text NOT NULL DEFAULT 'DOP',
  activa      boolean DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Las cuentas bancarias se agregan desde el panel de SuperAdmin

-- 3. RLS para pagos_suscripcion
ALTER TABLE pagos_suscripcion ENABLE ROW LEVEL SECURITY;

-- Tenant puede ver sus propios pagos
CREATE POLICY "pagos_select_tenant" ON pagos_suscripcion
FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant());

-- Tenant puede insertar sus propios pagos
CREATE POLICY "pagos_insert_tenant" ON pagos_suscripcion
FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_user_tenant());

-- Superadmin puede ver y gestionar todos
CREATE POLICY "pagos_manage_superadmin" ON pagos_suscripcion
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.is_superadmin = true
  )
);

-- 4. RLS para cuentas_bancarias_saas (solo lectura para todos)
ALTER TABLE cuentas_bancarias_saas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cuentas_select_all" ON cuentas_bancarias_saas
FOR SELECT TO authenticated
USING (activa = true);

CREATE POLICY "cuentas_manage_superadmin" ON cuentas_bancarias_saas
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.is_superadmin = true
  )
);

-- 5. RPC: Solicitar pago (el cliente sube comprobante)
CREATE OR REPLACE FUNCTION public.solicitar_pago_suscripcion(
  p_plan_id uuid,
  p_monto numeric,
  p_referencia text DEFAULT NULL,
  p_banco_origen text DEFAULT NULL,
  p_titular_cuenta text DEFAULT NULL,
  p_comprobante_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid;
  _pago_id uuid;
BEGIN
  _tenant := get_user_tenant();
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant';
  END IF;

  -- Verificar que no haya un pago pendiente para este tenant
  IF EXISTS (
    SELECT 1 FROM pagos_suscripcion
    WHERE tenant_id = _tenant AND estado = 'pendiente'
  ) THEN
    RAISE EXCEPTION 'Ya tiene un pago pendiente de revisión. Espere la verificación.';
  END IF;

  -- Verificar que el plan existe
  IF NOT EXISTS (SELECT 1 FROM planes WHERE id = p_plan_id AND activo = true) THEN
    RAISE EXCEPTION 'Plan no encontrado o no activo';
  END IF;

  INSERT INTO pagos_suscripcion (
    tenant_id, plan_id, monto, referencia,
    banco_origen, titular_cuenta, comprobante_url
  )
  VALUES (
    _tenant, p_plan_id, p_monto, p_referencia,
    p_banco_origen, p_titular_cuenta, p_comprobante_url
  )
  RETURNING id INTO _pago_id;

  RETURN _pago_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.solicitar_pago_suscripcion(uuid, numeric, text, text, text, text) TO authenticated;

-- 6. RPC: Aprobar pago (superadmin)
CREATE OR REPLACE FUNCTION public.admin_aprobar_pago(
  p_pago_id uuid,
  p_notas text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pago RECORD;
  _plan RECORD;
  _sub_id uuid;
  _is_super boolean;
BEGIN
  -- Verificar superadmin
  SELECT is_superadmin INTO _is_super FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(_is_super, false) THEN
    RAISE EXCEPTION 'Solo superadmins pueden aprobar pagos';
  END IF;

  -- Obtener el pago
  SELECT * INTO _pago FROM pagos_suscripcion WHERE id = p_pago_id;
  IF _pago IS NULL THEN RAISE EXCEPTION 'Pago no encontrado'; END IF;
  IF _pago.estado != 'pendiente' THEN RAISE EXCEPTION 'Este pago ya fue procesado'; END IF;

  -- Obtener el plan
  SELECT * INTO _plan FROM planes WHERE id = _pago.plan_id;
  IF _plan IS NULL THEN RAISE EXCEPTION 'Plan no encontrado'; END IF;

  -- Marcar suscripciones anteriores como vencidas
  UPDATE suscripciones
  SET estado = 'vencido', updated_at = now()
  WHERE tenant_id = _pago.tenant_id
    AND estado IN ('trial', 'activo');

  -- Crear nueva suscripción activa
  INSERT INTO suscripciones (
    tenant_id, plan_id, estado,
    fecha_inicio, fecha_fin,
    metodo_pago, referencia_pago, monto_pagado
  )
  VALUES (
    _pago.tenant_id,
    _plan.id,
    'activo',
    now(),
    now() + (_plan.duracion_dias || ' days')::interval,
    'transferencia',
    _pago.referencia,
    _pago.monto
  )
  RETURNING id INTO _sub_id;

  -- Actualizar tenant con features del plan
  UPDATE tenants
  SET
    plan = LOWER(_plan.nombre),
    feat_cotizaciones_magna = _plan.feat_cotizaciones_magna,
    feat_carta_ruta = _plan.feat_carta_ruta,
    feat_cobranzas = _plan.feat_cobranzas,
    trial_end_date = (now() + (_plan.duracion_dias || ' days')::interval)::date,
    activo = true,
    updated_at = now()
  WHERE id = _pago.tenant_id;

  -- Marcar pago como aprobado
  UPDATE pagos_suscripcion
  SET
    estado = 'aprobado',
    revisado_por = auth.uid(),
    fecha_revision = now(),
    notas_revision = p_notas,
    suscripcion_id = _sub_id,
    updated_at = now()
  WHERE id = p_pago_id;

  RETURN _sub_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_aprobar_pago(uuid, text) TO authenticated;

-- 7. RPC: Rechazar pago (superadmin)
CREATE OR REPLACE FUNCTION public.admin_rechazar_pago(
  p_pago_id uuid,
  p_motivo text DEFAULT 'Comprobante no válido'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_super boolean;
BEGIN
  SELECT is_superadmin INTO _is_super FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(_is_super, false) THEN
    RAISE EXCEPTION 'Solo superadmins pueden rechazar pagos';
  END IF;

  UPDATE pagos_suscripcion
  SET
    estado = 'rechazado',
    revisado_por = auth.uid(),
    fecha_revision = now(),
    motivo_rechazo = p_motivo,
    updated_at = now()
  WHERE id = p_pago_id
    AND estado = 'pendiente';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago no encontrado o ya procesado';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_rechazar_pago(uuid, text) TO authenticated;

-- 8. RPC: Obtener pagos pendientes (para admin)
CREATE OR REPLACE FUNCTION public.admin_get_pagos_pendientes()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_super boolean;
BEGIN
  SELECT is_superadmin INTO _is_super FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(_is_super, false) THEN
    RAISE EXCEPTION 'Solo superadmins';
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json)
    FROM (
      SELECT
        p.id,
        p.tenant_id,
        t.nombre AS empresa_nombre,
        t.email AS empresa_email,
        t.logo_url,
        pl.nombre AS plan_nombre,
        pl.precio AS plan_precio,
        p.monto,
        p.referencia,
        p.banco_origen,
        p.titular_cuenta,
        p.comprobante_url,
        p.estado,
        p.created_at
      FROM pagos_suscripcion p
      JOIN tenants t ON t.id = p.tenant_id
      JOIN planes pl ON pl.id = p.plan_id
      WHERE p.estado = 'pendiente'
      ORDER BY p.created_at ASC
    ) r
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_pagos_pendientes() TO authenticated;

-- 9. GRANTs
GRANT SELECT ON public.pagos_suscripcion TO authenticated;
GRANT INSERT ON public.pagos_suscripcion TO authenticated;
GRANT SELECT ON public.cuentas_bancarias_saas TO authenticated;

-- 10. Actualizar check_suscripcion_activa para incluir estado 'en_revision'
CREATE OR REPLACE FUNCTION public.check_suscripcion_activa(p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid;
  _sub RECORD;
  _plan RECORD;
  _dias_restantes integer;
  _activa boolean;
  _pago_pendiente boolean;
BEGIN
  _tenant := COALESCE(p_tenant_id, get_user_tenant());

  IF _tenant IS NULL THEN
    RETURN jsonb_build_object('activa', false, 'error', 'No se pudo determinar el tenant');
  END IF;

  -- Verificar si hay un pago pendiente de revisión
  SELECT EXISTS (
    SELECT 1 FROM pagos_suscripcion
    WHERE tenant_id = _tenant AND estado = 'pendiente'
  ) INTO _pago_pendiente;

  -- Buscar la suscripción más reciente activa o trial
  SELECT s.*, p.nombre AS plan_nombre, p.descripcion AS plan_descripcion,
         p.precio AS plan_precio, p.limite_usuarios, p.limite_productos,
         p.limite_facturas, p.limite_almacenes,
         p.feat_cotizaciones_magna, p.feat_carta_ruta, p.feat_cobranzas,
         p.feat_reportes_avanzados, p.feat_ocr_facturas, p.feat_api_access
  INTO _sub
  FROM suscripciones s
  JOIN planes p ON p.id = s.plan_id
  WHERE s.tenant_id = _tenant
    AND s.estado IN ('trial', 'activo')
  ORDER BY s.fecha_fin DESC
  LIMIT 1;

  -- No hay suscripción activa
  IF _sub IS NULL THEN
    RETURN jsonb_build_object(
      'activa', _pago_pendiente,  -- Si hay pago pendiente, NO bloquear al cliente
      'estado', CASE WHEN _pago_pendiente THEN 'en_revision' ELSE 'sin_suscripcion' END,
      'pago_pendiente', _pago_pendiente,
      'plan', null,
      'dias_restantes', CASE WHEN _pago_pendiente THEN 30 ELSE 0 END,
      'mensaje', CASE
        WHEN _pago_pendiente THEN 'Su pago está siendo verificado. Recibirá confirmación en las próximas 24 horas.'
        ELSE 'No tiene suscripción activa. Por favor, contrate un plan.'
      END
    );
  END IF;

  _dias_restantes := GREATEST(0, EXTRACT(DAY FROM (_sub.fecha_fin - now()))::integer);
  _activa := _sub.fecha_fin > now();

  IF NOT _activa AND _sub.estado IN ('trial', 'activo') THEN
    UPDATE suscripciones
    SET estado = 'vencido', updated_at = now()
    WHERE id = _sub.id;
  END IF;

  RETURN jsonb_build_object(
    'activa', _activa OR _pago_pendiente,  -- Si hay pago pendiente, NO bloquear
    'suscripcion_id', _sub.id,
    'estado', CASE
      WHEN _pago_pendiente AND NOT _activa THEN 'en_revision'
      WHEN _activa THEN _sub.estado
      ELSE 'vencido'
    END,
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
      WHEN _pago_pendiente AND NOT _activa THEN 'Su pago está siendo verificado. Recibirá confirmación en las próximas 24 horas.'
      WHEN NOT _activa THEN 'Su suscripción ha vencido. Renueve para continuar.'
      WHEN _dias_restantes <= 3 THEN 'Su suscripción está por vencer en ' || _dias_restantes || ' día(s).'
      ELSE 'Suscripción activa.'
    END
  );
END;
$$;
