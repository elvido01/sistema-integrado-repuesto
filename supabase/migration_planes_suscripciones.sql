-- ============================================================
-- MIGRACIÓN: Sistema de Planes y Suscripciones SaaS
-- Sistema Integrado Repuestos Morla
-- Fecha: 2026-03-26
--
-- NOTA: Se integra con la tabla tenants existente
--       y el sistema RLS multi-tenant ya implementado
-- ============================================================


-- ============================================================
-- PASO 1: Crear tabla PLANES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.planes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        text NOT NULL UNIQUE,              -- 'TRIAL', 'BASICO', 'PRO', 'ENTERPRISE'
  descripcion   text,
  precio        numeric(10,2) NOT NULL DEFAULT 0,   -- Precio mensual en DOP
  duracion_dias integer NOT NULL DEFAULT 30,         -- Duración por defecto del ciclo
  
  -- Límites del plan
  limite_usuarios   integer DEFAULT 3,               -- Máx usuarios simultáneos
  limite_productos  integer DEFAULT 100,             -- Máx productos en catálogo
  limite_facturas   integer DEFAULT NULL,            -- Máx facturas por mes (NULL = ilimitado)
  limite_almacenes  integer DEFAULT 1,               -- Máx almacenes
  
  -- Features habilitadas
  feat_cotizaciones_magna boolean DEFAULT false,
  feat_carta_ruta         boolean DEFAULT false,
  feat_cobranzas          boolean DEFAULT false,
  feat_reportes_avanzados boolean DEFAULT false,
  feat_ocr_facturas       boolean DEFAULT false,
  feat_api_access         boolean DEFAULT false,
  
  activo        boolean DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- PASO 2: Crear tabla SUSCRIPCIONES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.suscripciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id         uuid NOT NULL REFERENCES public.planes(id),
  
  estado          text NOT NULL DEFAULT 'trial' 
                  CHECK (estado IN ('trial', 'activo', 'vencido', 'cancelado', 'suspendido')),
  
  fecha_inicio    timestamptz NOT NULL DEFAULT now(),
  fecha_fin       timestamptz NOT NULL,
  
  -- Datos de pago (preparado para futuro)
  metodo_pago     text,                              -- 'transferencia', 'tarjeta', 'efectivo', 'stripe'
  referencia_pago text,                              -- ID de transacción o referencia
  monto_pagado    numeric(10,2) DEFAULT 0,
  
  -- Renovación automática
  auto_renovar    boolean DEFAULT false,
  
  -- Auditoría
  cancelado_por   uuid REFERENCES auth.users(id),
  motivo_cancelacion text,
  
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(tenant_id, plan_id, fecha_inicio)
);

CREATE INDEX IF NOT EXISTS idx_suscripciones_tenant   ON public.suscripciones(tenant_id);
CREATE INDEX IF NOT EXISTS idx_suscripciones_estado   ON public.suscripciones(estado);
CREATE INDEX IF NOT EXISTS idx_suscripciones_fechas   ON public.suscripciones(fecha_inicio, fecha_fin);


-- ============================================================
-- PASO 3: Insertar planes por defecto
-- ============================================================

INSERT INTO public.planes (nombre, descripcion, precio, duracion_dias, limite_usuarios, limite_productos, limite_facturas, limite_almacenes, feat_cotizaciones_magna, feat_carta_ruta, feat_cobranzas, feat_reportes_avanzados, feat_ocr_facturas, feat_api_access)
VALUES
  ('TRIAL', 'Plan de prueba gratuito por 15 días', 0, 15, 2, 50, 100, 1, false, false, false, false, false, false),
  ('BASICO', 'Plan básico para pequeñas empresas', 2500, 30, 3, 500, 500, 1, false, false, false, false, false, false),
  ('PRO', 'Plan profesional con todas las funciones', 5000, 30, 10, 99999, NULL, 5, true, true, true, true, true, false),
  ('ENTERPRISE', 'Plan empresarial sin límites', 10000, 30, 99999, 99999, NULL, 99, true, true, true, true, true, true)
ON CONFLICT (nombre) DO NOTHING;


-- ============================================================
-- PASO 4: Función check_suscripcion_activa()
-- Retorna info completa de la suscripción del tenant
-- ============================================================

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
BEGIN
  -- Si no se pasa tenant_id, usar el del usuario autenticado
  _tenant := COALESCE(p_tenant_id, get_user_tenant());
  
  IF _tenant IS NULL THEN
    RETURN jsonb_build_object(
      'activa', false,
      'error', 'No se pudo determinar el tenant'
    );
  END IF;

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

  -- No hay suscripción
  IF _sub IS NULL THEN
    RETURN jsonb_build_object(
      'activa', false,
      'estado', 'sin_suscripcion',
      'plan', null,
      'dias_restantes', 0,
      'mensaje', 'No tiene suscripción activa. Por favor, contrate un plan.'
    );
  END IF;

  -- Calcular días restantes
  _dias_restantes := GREATEST(0, EXTRACT(DAY FROM (_sub.fecha_fin - now()))::integer);
  
  -- Verificar si está vencida
  _activa := _sub.fecha_fin > now();
  
  -- Si está vencida, actualizar estado automáticamente
  IF NOT _activa AND _sub.estado IN ('trial', 'activo') THEN
    UPDATE suscripciones 
    SET estado = 'vencido', updated_at = now() 
    WHERE id = _sub.id;
  END IF;

  RETURN jsonb_build_object(
    'activa', _activa,
    'suscripcion_id', _sub.id,
    'estado', CASE WHEN _activa THEN _sub.estado ELSE 'vencido' END,
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
      WHEN NOT _activa THEN 'Su suscripción ha vencido. Renueve para continuar.'
      WHEN _dias_restantes <= 3 THEN 'Su suscripción está por vencer en ' || _dias_restantes || ' día(s).'
      ELSE 'Suscripción activa.'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_suscripcion_activa(uuid) TO authenticated;


-- ============================================================
-- PASO 5: Función para crear trial automático en onboarding
-- ============================================================

CREATE OR REPLACE FUNCTION public.crear_suscripcion_trial(p_tenant_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _plan_trial_id uuid;
  _sub_id uuid;
BEGIN
  -- Obtener el plan TRIAL
  SELECT id INTO _plan_trial_id FROM planes WHERE nombre = 'TRIAL' AND activo = true LIMIT 1;
  
  IF _plan_trial_id IS NULL THEN
    RAISE EXCEPTION 'Plan TRIAL no encontrado o no activo';
  END IF;

  -- Verificar si ya tiene una suscripción
  IF EXISTS (
    SELECT 1 FROM suscripciones 
    WHERE tenant_id = p_tenant_id 
    AND estado IN ('trial', 'activo')
  ) THEN
    -- Retornar la existente
    SELECT id INTO _sub_id FROM suscripciones 
    WHERE tenant_id = p_tenant_id 
    AND estado IN ('trial', 'activo')
    ORDER BY fecha_fin DESC LIMIT 1;
    RETURN _sub_id;
  END IF;

  -- Crear suscripción trial de 15 días
  INSERT INTO suscripciones (tenant_id, plan_id, estado, fecha_inicio, fecha_fin)
  VALUES (
    p_tenant_id,
    _plan_trial_id,
    'trial',
    now(),
    now() + INTERVAL '15 days'
  )
  RETURNING id INTO _sub_id;

  RETURN _sub_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_suscripcion_trial(uuid) TO authenticated;


-- ============================================================
-- PASO 6: Función para renovar/cambiar plan
-- ============================================================

CREATE OR REPLACE FUNCTION public.renovar_suscripcion(
  p_tenant_id uuid,
  p_plan_nombre text,
  p_metodo_pago text DEFAULT NULL,
  p_referencia_pago text DEFAULT NULL,
  p_monto_pagado numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _plan RECORD;
  _sub_id uuid;
BEGIN
  -- Obtener plan
  SELECT * INTO _plan FROM planes WHERE nombre = p_plan_nombre AND activo = true;
  
  IF _plan IS NULL THEN
    RAISE EXCEPTION 'Plan "%" no encontrado o no activo', p_plan_nombre;
  END IF;

  -- Marcar suscripción anterior como vencida
  UPDATE suscripciones 
  SET estado = 'vencido', updated_at = now() 
  WHERE tenant_id = p_tenant_id 
  AND estado IN ('trial', 'activo');

  -- Crear nueva suscripción
  INSERT INTO suscripciones (
    tenant_id, plan_id, estado, 
    fecha_inicio, fecha_fin,
    metodo_pago, referencia_pago, monto_pagado
  )
  VALUES (
    p_tenant_id,
    _plan.id,
    'activo',
    now(),
    now() + (_plan.duracion_dias || ' days')::interval,
    p_metodo_pago,
    p_referencia_pago,
    p_monto_pagado
  )
  RETURNING id INTO _sub_id;

  -- Actualizar tenant con features del plan
  UPDATE tenants 
  SET 
    plan = LOWER(p_plan_nombre),
    feat_cotizaciones_magna = _plan.feat_cotizaciones_magna,
    feat_carta_ruta = _plan.feat_carta_ruta,
    feat_cobranzas = _plan.feat_cobranzas,
    trial_end_date = (now() + (_plan.duracion_dias || ' days')::interval)::date,
    updated_at = now()
  WHERE id = p_tenant_id;

  RETURN _sub_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.renovar_suscripcion(uuid, text, text, text, numeric) TO authenticated;


-- ============================================================
-- PASO 7: Habilitar RLS en planes y suscripciones
-- ============================================================

ALTER TABLE public.planes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suscripciones ENABLE ROW LEVEL SECURITY;

-- PLANES: Todos los autenticados pueden ver planes activos (catálogo público)
CREATE POLICY "planes_select_authenticated"
ON public.planes
FOR SELECT
TO authenticated
USING (activo = true);

-- PLANES: Solo superadmins pueden gestionar planes
CREATE POLICY "planes_manage_superadmin"
ON public.planes
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.is_superadmin = true
  )
);

-- SUSCRIPCIONES: Usuarios solo ven suscripciones de su tenant
CREATE POLICY "suscripciones_select_tenant"
ON public.suscripciones
FOR SELECT
TO authenticated
USING (tenant_id = public.get_user_tenant());

-- SUSCRIPCIONES: Solo superadmins pueden insertar/actualizar directamente
-- (Los usuarios usan las funciones RPC para gestionar suscripciones)
CREATE POLICY "suscripciones_manage_superadmin"
ON public.suscripciones
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.is_superadmin = true
  )
);


-- ============================================================
-- PASO 8: GRANTs
-- ============================================================

GRANT SELECT ON public.planes TO authenticated;
GRANT SELECT ON public.suscripciones TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;


-- ============================================================
-- PASO 9: Crear suscripciones trial para tenants existentes
-- ============================================================

DO $$
DECLARE
  _tenant RECORD;
  _plan_trial_id uuid;
BEGIN
  SELECT id INTO _plan_trial_id FROM public.planes WHERE nombre = 'TRIAL' LIMIT 1;
  
  IF _plan_trial_id IS NULL THEN
    RAISE WARNING 'Plan TRIAL no encontrado, no se crearon suscripciones automáticas';
    RETURN;
  END IF;

  FOR _tenant IN
    SELECT t.id, t.plan, t.trial_end_date
    FROM public.tenants t
    WHERE NOT EXISTS (
      SELECT 1 FROM public.suscripciones s WHERE s.tenant_id = t.id
    )
  LOOP
    INSERT INTO public.suscripciones (tenant_id, plan_id, estado, fecha_inicio, fecha_fin)
    VALUES (
      _tenant.id,
      COALESCE(
        (SELECT id FROM public.planes WHERE LOWER(nombre) = COALESCE(_tenant.plan, 'trial') LIMIT 1),
        _plan_trial_id
      ),
      CASE 
        WHEN _tenant.plan IN ('pro', 'enterprise') THEN 'activo'
        ELSE 'trial'
      END,
      now(),
      CASE
        WHEN _tenant.trial_end_date IS NOT NULL THEN _tenant.trial_end_date::timestamptz
        WHEN _tenant.plan IN ('pro', 'enterprise') THEN now() + INTERVAL '365 days'
        ELSE now() + INTERVAL '15 days'
      END
    );
    
    RAISE NOTICE 'Suscripción creada para tenant: %', _tenant.id;
  END LOOP;
END $$;


-- ============================================================
-- PASO 10: Verificación
-- ============================================================

DO $$
DECLARE
  _planes_count integer;
  _subs_count integer;
BEGIN
  SELECT COUNT(*) INTO _planes_count FROM public.planes WHERE activo = true;
  SELECT COUNT(*) INTO _subs_count FROM public.suscripciones;
  
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '  SISTEMA DE PLANES Y SUSCRIPCIONES';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '  Planes activos: %', _planes_count;
  RAISE NOTICE '  Suscripciones totales: %', _subs_count;
  RAISE NOTICE '';
  RAISE NOTICE '  Funciones creadas:';
  RAISE NOTICE '    ✅ check_suscripcion_activa(tenant_id)';
  RAISE NOTICE '    ✅ crear_suscripcion_trial(tenant_id)';
  RAISE NOTICE '    ✅ renovar_suscripcion(tenant_id, plan, ...)';
  RAISE NOTICE '';
  RAISE NOTICE '  RLS habilitado en: planes, suscripciones';
  RAISE NOTICE '==========================================';
END $$;
