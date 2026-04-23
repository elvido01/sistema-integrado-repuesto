-- ============================================================
-- FIX: Separar UBICACIONES de ALMACENES
-- FIX: Preseleccionar ALMACEN PRINCIPAL
-- FIX: Limitar almacenes por plan
-- ============================================================
-- CONCEPTO:
--   ALMACEN  = Bodega física (ALMACEN PRINCIPAL, ALMACEN CAJAS, etc.)
--              Limitado por plan: TRIAL/BASICO/PRO = 1, ENTERPRISE = 3
--   UBICACION = Cajita/estante DENTRO del almacén (A-CAJA-1, B-ESTANTE-2)
--              Sin límite por plan
-- ============================================================

-- ──────────────────────────────────────────────────────
-- 1. Crear tabla UBICACIONES (nueva, separada de almacenes)
-- ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ubicaciones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  activo BOOLEAN DEFAULT true,
  tenant_id UUID NOT NULL REFERENCES tenants(id) DEFAULT public.get_user_tenant(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Constraint: codigo+nombre único POR TENANT
ALTER TABLE ubicaciones ADD CONSTRAINT ubicaciones_nombre_tenant_unique UNIQUE (nombre, tenant_id);

-- RLS
ALTER TABLE ubicaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ubicaciones_select" ON ubicaciones;
DROP POLICY IF EXISTS "ubicaciones_insert" ON ubicaciones;
DROP POLICY IF EXISTS "ubicaciones_update" ON ubicaciones;
DROP POLICY IF EXISTS "ubicaciones_delete" ON ubicaciones;

CREATE POLICY "ubicaciones_select" ON ubicaciones FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant());

CREATE POLICY "ubicaciones_insert" ON ubicaciones FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_user_tenant());

CREATE POLICY "ubicaciones_update" ON ubicaciones FOR UPDATE TO authenticated
USING (tenant_id = public.get_user_tenant());

CREATE POLICY "ubicaciones_delete" ON ubicaciones FOR DELETE TO authenticated
USING (tenant_id = public.get_user_tenant());

CREATE INDEX IF NOT EXISTS idx_ubicaciones_tenant ON ubicaciones(tenant_id);

-- ──────────────────────────────────────────────────────
-- 2. Migrar datos: las "ubicaciones" que están en almacenes
--    van a la nueva tabla, y limpiar almacenes
-- ──────────────────────────────────────────────────────

-- 2A. Para MORLA: copiar almacenes actuales a ubicaciones
--     (los almacenes de Morla son realmente ubicaciones como A-CAJA-1)
INSERT INTO ubicaciones (codigo, nombre, activo, tenant_id)
SELECT codigo, nombre, activo, tenant_id
FROM almacenes
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
ON CONFLICT (nombre, tenant_id) DO NOTHING;

-- 2B. Para CAMINERO: copiar almacenes actuales a ubicaciones
INSERT INTO ubicaciones (codigo, nombre, activo, tenant_id)
SELECT codigo, nombre, activo, tenant_id
FROM almacenes
WHERE tenant_id = '91cc1e82-441e-4c22-8e30-9c8866294c00'
  AND nombre != 'ALMACEN PRINCIPAL'
ON CONFLICT (nombre, tenant_id) DO NOTHING;

-- 2C. Para cualquier otro tenant: copiar también
INSERT INTO ubicaciones (codigo, nombre, activo, tenant_id)
SELECT codigo, nombre, activo, tenant_id
FROM almacenes
WHERE tenant_id NOT IN (
  '00000000-0000-0000-0000-000000000001',
  '91cc1e82-441e-4c22-8e30-9c8866294c00'
)
ON CONFLICT (nombre, tenant_id) DO NOTHING;

-- 3. Asegurar que MORLA tenga su almacén PRINCIPAL real
--    (además de las ubicaciones que ya tiene)
INSERT INTO almacenes (codigo, nombre, activo, tenant_id)
SELECT '01', 'ALMACEN PRINCIPAL', true, '00000000-0000-0000-0000-000000000001'
WHERE NOT EXISTS (
  SELECT 1 FROM almacenes
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
    AND (nombre ILIKE '%principal%' OR codigo = '01' OR codigo = 'ALM01')
);

-- 4. Asegurar que CAMINERO tenga su almacén PRINCIPAL
INSERT INTO almacenes (codigo, nombre, activo, tenant_id)
SELECT '01', 'ALMACEN PRINCIPAL', true, '91cc1e82-441e-4c22-8e30-9c8866294c00'
WHERE NOT EXISTS (
  SELECT 1 FROM almacenes
  WHERE tenant_id = '91cc1e82-441e-4c22-8e30-9c8866294c00'
    AND (nombre ILIKE '%principal%' OR codigo = '01')
);

-- ──────────────────────────────────────────────────────
-- 5. Actualizar registrar_nueva_empresa:
--    Crear almacén principal + ubicación por defecto
-- ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_nueva_empresa(
  p_nombre text,
  p_rnc text DEFAULT NULL::text,
  p_direccion text DEFAULT NULL::text,
  p_telefono text DEFAULT NULL::text,
  p_email text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id   UUID;
  v_plan_id     UUID;
BEGIN
  -- 1. Crear el tenant
  INSERT INTO tenants (nombre, rnc, direccion, telefono, email, activo, plan)
  VALUES (p_nombre, p_rnc, p_direccion, p_telefono, p_email, true, 'TRIAL')
  RETURNING id INTO v_tenant_id;

  -- 2. Crear config_empresa (tabla legacy)
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

    UPDATE tenants
    SET trial_end_date = NOW() + INTERVAL '15 days'
    WHERE id = v_tenant_id;
  END IF;

  -- 4. Crear almacén principal por defecto
  INSERT INTO almacenes (codigo, nombre, activo, tenant_id)
  VALUES ('01', 'ALMACEN PRINCIPAL', true, v_tenant_id);

  -- 5. Crear ubicación por defecto
  INSERT INTO ubicaciones (codigo, nombre, activo, tenant_id)
  VALUES ('A', 'A-GENERAL', true, v_tenant_id);

  RETURN v_tenant_id;
END;
$function$;
