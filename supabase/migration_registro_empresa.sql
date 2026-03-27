-- ============================================================
-- FUNCIÓN: registrar_nueva_empresa
-- Permite crear un nuevo tenant + config_empresa + suscripción TRIAL
-- desde el frontend sin necesidad de service_role.
-- SECURITY DEFINER: se ejecuta con permisos del propietario.
-- ============================================================

CREATE OR REPLACE FUNCTION registrar_nueva_empresa(
  p_nombre      TEXT,
  p_rnc         TEXT DEFAULT NULL,
  p_direccion   TEXT DEFAULT NULL,
  p_telefono    TEXT DEFAULT NULL,
  p_email       TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id   UUID;
  v_plan_id     UUID;
BEGIN
  -- 1. Crear el tenant
  INSERT INTO tenants (nombre, rnc, direccion, telefono, email, activo, plan)
  VALUES (p_nombre, p_rnc, p_direccion, p_telefono, p_email, true, 'TRIAL')
  RETURNING id INTO v_tenant_id;

  -- 2. Crear config_empresa (tabla legacy, para compatibilidad)
  INSERT INTO config_empresa (tenant_id, nombre, rnc, direccion, telefono, email)
  VALUES (v_tenant_id, p_nombre, p_rnc, p_direccion, p_telefono, p_email)
  ON CONFLICT (tenant_id) DO NOTHING;

  -- 3. Crear suscripción TRIAL de 15 días
  SELECT id INTO v_plan_id FROM planes WHERE nombre = 'TRIAL' LIMIT 1;

  IF v_plan_id IS NOT NULL THEN
    INSERT INTO suscripciones (
      tenant_id, plan_id, estado,
      fecha_inicio, fecha_fin,
      monto_pagado, auto_renovar
    )
    VALUES (
      v_tenant_id, v_plan_id, 'trial',
      NOW(), NOW() + INTERVAL '15 days',
      0, false
    );

    -- Actualizar trial_end_date en tenants
    UPDATE tenants
    SET trial_end_date = NOW() + INTERVAL '15 days'
    WHERE id = v_tenant_id;
  END IF;

  RETURN v_tenant_id;
END;
$$;

-- Permitir que usuarios anónimos llamen a esta función (para el registro)
GRANT EXECUTE ON FUNCTION registrar_nueva_empresa(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION registrar_nueva_empresa(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
