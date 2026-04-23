-- ============================================================
-- FIX: Constraints UNIQUE deben incluir tenant_id
-- FIX: Almacén "01" por defecto al registrar nueva empresa
-- ============================================================
-- PROBLEMA: Las constraints UNIQUE en marcas, modelos, tipos_producto,
-- presentaciones, tipos_presentacion, almacenes, vendedores, clientes
-- y productos son GLOBALES (sin tenant_id).
-- Esto impide que dos empresas tengan una marca "LONCIN" o un
-- almacén con código "01" cada una.
--
-- SOLUCIÓN: Reemplazar constraints globales por constraints
-- compuestas que incluyan tenant_id.
-- ============================================================

-- ──────────────────────────────────────────────────────
-- 1. MARCAS: nombre debe ser único POR TENANT, no global
-- ──────────────────────────────────────────────────────
ALTER TABLE marcas DROP CONSTRAINT IF EXISTS marcas_nombre_unique;
ALTER TABLE marcas DROP CONSTRAINT IF EXISTS marcas_nombre_key;
ALTER TABLE marcas ADD CONSTRAINT marcas_nombre_tenant_unique UNIQUE (nombre, tenant_id);

-- ──────────────────────────────────────────────────────
-- 2. MODELOS: (nombre, marca_id) debe ser único POR TENANT
-- ──────────────────────────────────────────────────────
ALTER TABLE modelos DROP CONSTRAINT IF EXISTS modelos_nombre_marca_unique;
ALTER TABLE modelos DROP CONSTRAINT IF EXISTS modelos_nombre_marca_id_key;
ALTER TABLE modelos ADD CONSTRAINT modelos_nombre_marca_tenant_unique UNIQUE (nombre, marca_id, tenant_id);

-- ──────────────────────────────────────────────────────
-- 3. TIPOS_PRODUCTO: nombre único POR TENANT
-- ──────────────────────────────────────────────────────
ALTER TABLE tipos_producto DROP CONSTRAINT IF EXISTS tipos_producto_nombre_unique;
ALTER TABLE tipos_producto DROP CONSTRAINT IF EXISTS tipos_producto_nombre_key;
ALTER TABLE tipos_producto ADD CONSTRAINT tipos_producto_nombre_tenant_unique UNIQUE (nombre, tenant_id);

-- (presentaciones NO tiene columna nombre — es tabla de cantidades/precios por producto)

-- ──────────────────────────────────────────────────────
-- 4. TIPOS_PRESENTACION: nombre único POR TENANT
-- ──────────────────────────────────────────────────────
ALTER TABLE tipos_presentacion DROP CONSTRAINT IF EXISTS tipos_presentacion_nombre_key;
ALTER TABLE tipos_presentacion DROP CONSTRAINT IF EXISTS tipos_presentacion_nombre_unique;
ALTER TABLE tipos_presentacion ADD CONSTRAINT tipos_presentacion_nombre_tenant_unique UNIQUE (nombre, tenant_id);

-- ──────────────────────────────────────────────────────
-- 6. ALMACENES: codigo único POR TENANT
-- ──────────────────────────────────────────────────────
ALTER TABLE almacenes DROP CONSTRAINT IF EXISTS almacenes_codigo_key;
ALTER TABLE almacenes DROP CONSTRAINT IF EXISTS almacenes_codigo_unique;
ALTER TABLE almacenes ADD CONSTRAINT almacenes_codigo_tenant_unique UNIQUE (codigo, tenant_id);

-- ──────────────────────────────────────────────────────
-- 7. VENDEDORES: nombre único POR TENANT
-- ──────────────────────────────────────────────────────
ALTER TABLE vendedores DROP CONSTRAINT IF EXISTS vendedores_nombre_key;
ALTER TABLE vendedores DROP CONSTRAINT IF EXISTS vendedores_nombre_unique;
ALTER TABLE vendedores ADD CONSTRAINT vendedores_nombre_tenant_unique UNIQUE (nombre, tenant_id);

-- ──────────────────────────────────────────────────────
-- 8. PRODUCTOS: codigo único POR TENANT
-- ──────────────────────────────────────────────────────
ALTER TABLE productos DROP CONSTRAINT IF EXISTS productos_codigo_key;
ALTER TABLE productos DROP CONSTRAINT IF EXISTS productos_codigo_unique;
ALTER TABLE productos ADD CONSTRAINT productos_codigo_tenant_unique UNIQUE (codigo, tenant_id);

-- ──────────────────────────────────────────────────────
-- 9. CLIENTES: codigo único POR TENANT
-- ──────────────────────────────────────────────────────
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_codigo_key;
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_codigo_unique;
ALTER TABLE clientes ADD CONSTRAINT clientes_codigo_tenant_unique UNIQUE (codigo, tenant_id);


-- ============================================================
-- FIX: Almacén "01" por defecto al registrar nueva empresa
-- ============================================================

-- Crear almacén para Caminero (si no tiene ninguno)
INSERT INTO almacenes (codigo, nombre, activo, tenant_id)
SELECT '01', 'ALMACEN PRINCIPAL', true, '91cc1e82-441e-4c22-8e30-9c8866294c00'
WHERE NOT EXISTS (
  SELECT 1 FROM almacenes WHERE tenant_id = '91cc1e82-441e-4c22-8e30-9c8866294c00'
);

-- Actualizar registrar_nueva_empresa para crear almacén por defecto
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

    UPDATE tenants
    SET trial_end_date = NOW() + INTERVAL '15 days'
    WHERE id = v_tenant_id;
  END IF;

  -- 4. Crear almacén principal por defecto
  INSERT INTO almacenes (codigo, nombre, activo, tenant_id)
  VALUES ('01', 'ALMACEN PRINCIPAL', true, v_tenant_id);

  RETURN v_tenant_id;
END;
$function$;
