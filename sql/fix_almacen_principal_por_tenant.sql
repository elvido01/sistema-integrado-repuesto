-- ============================================================
-- FIX: Garantizar almacén PRINCIPAL por tenant
--   1. Crea almacén PRINCIPAL para tenants existentes que no lo tienen
--   2. Actualiza registrar_nueva_empresa para crear PRINCIPAL al registrar
-- ============================================================

-- 1. Backfill: crear PRINCIPAL para tenants existentes sin almacén
INSERT INTO public.almacenes (codigo, nombre, activo, tenant_id)
SELECT 'PRINCIPAL', 'PRINCIPAL', true, t.id
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.almacenes a WHERE a.tenant_id = t.id
);

-- 2. Actualizar registrar_nueva_empresa para crear PRINCIPAL automáticamente
CREATE OR REPLACE FUNCTION public.registrar_nueva_empresa(
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
  INSERT INTO tenants (nombre, rnc, direccion, telefono, email, activo, plan)
  VALUES (p_nombre, p_rnc, p_direccion, p_telefono, p_email, true, 'TRIAL')
  RETURNING id INTO v_tenant_id;

  INSERT INTO config_empresa (tenant_id, nombre, rnc, direccion, telefono, email)
  VALUES (v_tenant_id, p_nombre, p_rnc, p_direccion, p_telefono, p_email)
  ON CONFLICT (tenant_id) DO NOTHING;

  -- Almacén PRINCIPAL por defecto
  INSERT INTO almacenes (codigo, nombre, activo, tenant_id)
  VALUES ('PRINCIPAL', 'PRINCIPAL', true, v_tenant_id);

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

    UPDATE tenants
    SET trial_end_date = NOW() + INTERVAL '15 days'
    WHERE id = v_tenant_id;
  END IF;

  RETURN v_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_nueva_empresa(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.registrar_nueva_empresa(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
