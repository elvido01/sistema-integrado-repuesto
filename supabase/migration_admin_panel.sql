-- ============================================================
-- MIGRACIÓN: Funciones Admin Panel SaaS
-- Panel de Administración Global (SuperAdmin)
-- Fecha: 2026-03-26
--
-- NOTA: Estas funciones son SECURITY DEFINER y bypasean RLS
--       Solo para uso del SuperAdmin
-- ============================================================


-- ============================================================
-- 1. FUNCIÓN: admin_get_dashboard_stats()
-- Retorna métricas generales para el dashboard admin
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
  _total_empresas integer;
  _empresas_activas integer;
  _empresas_trial integer;
  _empresas_vencidas integer;
  _empresas_pro integer;
  _empresas_basico integer;
  _empresas_enterprise integer;
  _mrr numeric;
  _total_usuarios integer;
  _total_productos integer;
  _total_ventas_mes numeric;
BEGIN
  -- Verificar que es superadmin
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true
  ) THEN
    RAISE EXCEPTION 'Acceso denegado: solo superadmins';
  END IF;

  -- Métricas de empresas
  SELECT COUNT(*) INTO _total_empresas FROM tenants;
  SELECT COUNT(*) INTO _empresas_activas FROM tenants WHERE activo = true;
  
  -- Métricas de suscripciones
  SELECT COUNT(DISTINCT s.tenant_id) INTO _empresas_trial 
  FROM suscripciones s WHERE s.estado = 'trial' AND s.fecha_fin > now();
  
  SELECT COUNT(DISTINCT s.tenant_id) INTO _empresas_vencidas 
  FROM suscripciones s 
  WHERE s.tenant_id NOT IN (
    SELECT tenant_id FROM suscripciones WHERE estado IN ('activo', 'trial') AND fecha_fin > now()
  );
  
  SELECT COUNT(DISTINCT s.tenant_id) INTO _empresas_pro
  FROM suscripciones s JOIN planes p ON p.id = s.plan_id
  WHERE p.nombre = 'PRO' AND s.estado = 'activo' AND s.fecha_fin > now();
  
  SELECT COUNT(DISTINCT s.tenant_id) INTO _empresas_basico
  FROM suscripciones s JOIN planes p ON p.id = s.plan_id
  WHERE p.nombre = 'BASICO' AND s.estado = 'activo' AND s.fecha_fin > now();
  
  SELECT COUNT(DISTINCT s.tenant_id) INTO _empresas_enterprise
  FROM suscripciones s JOIN planes p ON p.id = s.plan_id
  WHERE p.nombre = 'ENTERPRISE' AND s.estado = 'activo' AND s.fecha_fin > now();

  -- MRR: Sum of active subscription plan prices
  SELECT COALESCE(SUM(p.precio), 0) INTO _mrr
  FROM suscripciones s JOIN planes p ON p.id = s.plan_id
  WHERE s.estado = 'activo' AND s.fecha_fin > now();

  -- Total usuarios
  SELECT COUNT(*) INTO _total_usuarios FROM profiles;
  
  -- Total productos (global)
  SELECT COUNT(*) INTO _total_productos FROM productos;
  
  -- Total ventas del mes (global)
  SELECT COALESCE(SUM(total), 0) INTO _total_ventas_mes
  FROM facturas 
  WHERE fecha >= date_trunc('month', CURRENT_DATE)
  AND estado != 'ANULADA';

  _result := jsonb_build_object(
    'total_empresas', _total_empresas,
    'empresas_activas', _empresas_activas,
    'empresas_trial', _empresas_trial,
    'empresas_vencidas', COALESCE(_empresas_vencidas, 0),
    'empresas_pro', _empresas_pro,
    'empresas_basico', _empresas_basico,
    'empresas_enterprise', _empresas_enterprise,
    'mrr', _mrr,
    'total_usuarios', _total_usuarios,
    'total_productos', _total_productos,
    'total_ventas_mes', _total_ventas_mes
  );

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_stats() TO authenticated;


-- ============================================================
-- 2. FUNCIÓN: admin_get_tenants_detalle()
-- Retorna lista de tenants con detalles de suscripción
-- ============================================================

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
  -- Verificar superadmin
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
      -- Suscripción actual
      'suscripcion', (
        SELECT jsonb_build_object(
          'id', s.id,
          'estado', CASE WHEN s.fecha_fin > now() THEN s.estado ELSE 'vencido' END,
          'plan_nombre', p.nombre,
          'plan_precio', p.precio,
          'fecha_inicio', s.fecha_inicio,
          'fecha_fin', s.fecha_fin,
          'dias_restantes', GREATEST(0, EXTRACT(DAY FROM (s.fecha_fin - now()))::integer),
          'metodo_pago', s.metodo_pago,
          'monto_pagado', s.monto_pagado
        )
        FROM suscripciones s
        JOIN planes p ON p.id = s.plan_id
        WHERE s.tenant_id = t.id
        ORDER BY s.fecha_fin DESC
        LIMIT 1
      ),
      -- Stats
      'total_usuarios', (SELECT COUNT(*) FROM usuarios_empresas ue WHERE ue.tenant_id = t.id),
      'total_productos', (SELECT COUNT(*) FROM productos pr WHERE pr.tenant_id = t.id),
      'total_ventas_mes', (
        SELECT COALESCE(SUM(f.total), 0) 
        FROM facturas f 
        WHERE f.tenant_id = t.id 
        AND f.fecha >= date_trunc('month', CURRENT_DATE)
        AND f.estado != 'ANULADA'
      ),
      -- Features
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


-- ============================================================
-- 3. FUNCIÓN: admin_activar_empresa(tenant_id)
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_activar_empresa(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true
  ) THEN
    RAISE EXCEPTION 'Acceso denegado: solo superadmins';
  END IF;

  UPDATE tenants SET activo = true, updated_at = now() WHERE id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_activar_empresa(uuid) TO authenticated;


-- ============================================================
-- 4. FUNCIÓN: admin_suspender_empresa(tenant_id)
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_suspender_empresa(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true
  ) THEN
    RAISE EXCEPTION 'Acceso denegado: solo superadmins';
  END IF;

  UPDATE tenants SET activo = false, updated_at = now() WHERE id = p_tenant_id;
  
  -- Suspender suscripciones activas
  UPDATE suscripciones 
  SET estado = 'suspendido', updated_at = now() 
  WHERE tenant_id = p_tenant_id AND estado IN ('activo', 'trial');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_suspender_empresa(uuid) TO authenticated;


-- ============================================================
-- 5. FUNCIÓN: admin_cambiar_plan(tenant_id, plan_nombre)
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_cambiar_plan(p_tenant_id uuid, p_plan_nombre text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _plan RECORD;
  _sub_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true
  ) THEN
    RAISE EXCEPTION 'Acceso denegado: solo superadmins';
  END IF;

  -- Obtener plan
  SELECT * INTO _plan FROM planes WHERE UPPER(nombre) = UPPER(p_plan_nombre) AND activo = true;
  IF _plan IS NULL THEN
    RAISE EXCEPTION 'Plan "%" no encontrado', p_plan_nombre;
  END IF;

  -- Cerrar suscripción anterior
  UPDATE suscripciones SET estado = 'vencido', updated_at = now()
  WHERE tenant_id = p_tenant_id AND estado IN ('activo', 'trial');

  -- Crear nueva suscripción
  INSERT INTO suscripciones (tenant_id, plan_id, estado, fecha_inicio, fecha_fin)
  VALUES (
    p_tenant_id,
    _plan.id,
    CASE WHEN _plan.nombre = 'TRIAL' THEN 'trial' ELSE 'activo' END,
    now(),
    now() + (_plan.duracion_dias || ' days')::interval
  )
  RETURNING id INTO _sub_id;

  -- Actualizar tenant
  UPDATE tenants SET 
    plan = LOWER(p_plan_nombre),
    feat_cotizaciones_magna = _plan.feat_cotizaciones_magna,
    feat_carta_ruta = _plan.feat_carta_ruta,
    feat_cobranzas = _plan.feat_cobranzas,
    trial_end_date = (now() + (_plan.duracion_dias || ' days')::interval)::date,
    activo = true,
    updated_at = now()
  WHERE id = p_tenant_id;

  RETURN _sub_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cambiar_plan(uuid, text) TO authenticated;


-- ============================================================
-- 6. FUNCIÓN: admin_extender_suscripcion(tenant_id, dias)
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_extender_suscripcion(p_tenant_id uuid, p_dias integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true
  ) THEN
    RAISE EXCEPTION 'Acceso denegado: solo superadmins';
  END IF;

  IF p_dias <= 0 THEN
    RAISE EXCEPTION 'Los días deben ser un número positivo';
  END IF;

  -- Extender la suscripción más reciente activa/trial
  UPDATE suscripciones 
  SET 
    fecha_fin = fecha_fin + (p_dias || ' days')::interval,
    estado = CASE 
      WHEN estado = 'vencido' THEN 'activo'
      ELSE estado 
    END,
    updated_at = now()
  WHERE tenant_id = p_tenant_id
  AND id = (
    SELECT id FROM suscripciones 
    WHERE tenant_id = p_tenant_id 
    ORDER BY fecha_fin DESC LIMIT 1
  );

  -- Reactivar tenant si estaba inactivo
  UPDATE tenants SET activo = true, updated_at = now() WHERE id = p_tenant_id;
  
  -- Actualizar trial_end_date del tenant
  UPDATE tenants SET trial_end_date = (
    SELECT fecha_fin::date FROM suscripciones 
    WHERE tenant_id = p_tenant_id 
    ORDER BY fecha_fin DESC LIMIT 1
  ) WHERE id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_extender_suscripcion(uuid, integer) TO authenticated;


-- ============================================================
-- 7. FUNCIÓN: admin_get_empresa_detalle(tenant_id)
-- Retorna detalle completo de una empresa
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_get_empresa_detalle(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
  _tenant RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true
  ) THEN
    RAISE EXCEPTION 'Acceso denegado: solo superadmins';
  END IF;

  SELECT * INTO _tenant FROM tenants WHERE id = p_tenant_id;
  
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'Empresa no encontrada';
  END IF;

  _result := jsonb_build_object(
    'empresa', jsonb_build_object(
      'id', _tenant.id,
      'nombre', _tenant.nombre,
      'email', _tenant.email,
      'rnc', _tenant.rnc,
      'telefono', _tenant.telefono,
      'direccion', _tenant.direccion,
      'logo_url', _tenant.logo_url,
      'activo', _tenant.activo,
      'plan', _tenant.plan,
      'created_at', _tenant.created_at
    ),
    'usuarios', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'user_id', ue.user_id,
          'rol', ue.rol,
          'email', pr.email,
          'full_name', pr.full_name,
          'role', pr.role,
          'created_at', ue.created_at
        )
      ), '[]'::jsonb)
      FROM usuarios_empresas ue
      LEFT JOIN profiles pr ON pr.id = ue.user_id
      WHERE ue.tenant_id = p_tenant_id
    ),
    'suscripciones', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'plan', p.nombre,
          'precio', p.precio,
          'estado', s.estado,
          'fecha_inicio', s.fecha_inicio,
          'fecha_fin', s.fecha_fin,
          'metodo_pago', s.metodo_pago,
          'monto_pagado', s.monto_pagado
        )
        ORDER BY s.fecha_fin DESC
      ), '[]'::jsonb)
      FROM suscripciones s
      JOIN planes p ON p.id = s.plan_id
      WHERE s.tenant_id = p_tenant_id
    ),
    'stats', jsonb_build_object(
      'total_productos', (SELECT COUNT(*) FROM productos WHERE tenant_id = p_tenant_id),
      'total_clientes', (SELECT COUNT(*) FROM clientes WHERE tenant_id = p_tenant_id),
      'total_proveedores', (SELECT COUNT(*) FROM proveedores WHERE tenant_id = p_tenant_id),
      'total_facturas', (SELECT COUNT(*) FROM facturas WHERE tenant_id = p_tenant_id AND estado != 'ANULADA'),
      'ventas_mes', (
        SELECT COALESCE(SUM(total), 0) FROM facturas 
        WHERE tenant_id = p_tenant_id 
        AND fecha >= date_trunc('month', CURRENT_DATE)
        AND estado != 'ANULADA'
      ),
      'ventas_total', (
        SELECT COALESCE(SUM(total), 0) FROM facturas 
        WHERE tenant_id = p_tenant_id AND estado != 'ANULADA'
      )
    )
  );

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_empresa_detalle(uuid) TO authenticated;


-- ============================================================
-- VERIFICACIÓN
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '  FUNCIONES ADMIN PANEL CREADAS';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '  ✅ admin_get_dashboard_stats()';
  RAISE NOTICE '  ✅ admin_get_tenants_detalle()';
  RAISE NOTICE '  ✅ admin_activar_empresa(tenant_id)';
  RAISE NOTICE '  ✅ admin_suspender_empresa(tenant_id)';
  RAISE NOTICE '  ✅ admin_cambiar_plan(tenant_id, plan)';
  RAISE NOTICE '  ✅ admin_extender_suscripcion(tenant_id, dias)';
  RAISE NOTICE '  ✅ admin_get_empresa_detalle(tenant_id)';
  RAISE NOTICE '==========================================';
END $$;
