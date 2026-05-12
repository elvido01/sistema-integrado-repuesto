-- ============================================================
-- MIGRACIÓN: Tienda Pública - Stock y CRM Leads
-- ============================================================

-- 1. Tabla para guardar prospectos de CRM (Avisarme cuando esté disponible)
CREATE TABLE IF NOT EXISTS public.crm_tienda_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  producto_id UUID REFERENCES public.productos(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  contacto TEXT NOT NULL,
  fecha_solicitud TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  estado TEXT DEFAULT 'PENDIENTE'
);

ALTER TABLE public.crm_tienda_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant admin can view leads" ON public.crm_tienda_leads;
CREATE POLICY "Tenant admin can view leads" ON public.crm_tienda_leads
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- 2. Función para registrar el lead (SECURITY DEFINER para anon)
CREATE OR REPLACE FUNCTION public.registrar_lead_tienda(
  p_dominio TEXT,
  p_producto_id UUID,
  p_nombre TEXT,
  p_contacto TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- Obtener tenant_id del dominio
  SELECT id INTO v_tenant_id FROM tenants WHERE dominio = p_dominio AND activo = true LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN false; END IF;

  INSERT INTO crm_tienda_leads (tenant_id, producto_id, nombre, contacto)
  VALUES (v_tenant_id, p_producto_id, p_nombre, p_contacto);
  
  RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.registrar_lead_tienda(TEXT, UUID, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.registrar_lead_tienda(TEXT, UUID, TEXT, TEXT) TO authenticated;

-- 3. Actualizar get_productos_tienda para retornar existencia y filtrar por modelo
DROP FUNCTION IF EXISTS public.get_productos_tienda(TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_productos_tienda(TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.get_productos_tienda(
  p_dominio TEXT,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0,
  p_search TEXT DEFAULT NULL,
  p_marca TEXT DEFAULT NULL,
  p_tipo TEXT DEFAULT NULL,
  p_modelo TEXT DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  codigo TEXT,
  descripcion TEXT,
  ecommerce_descripcion TEXT,
  precio NUMERIC,
  imagen_url TEXT,
  ecommerce_slug TEXT,
  marca_nombre TEXT,
  tipo_nombre TEXT,
  ecommerce_orden INTEGER,
  existencia NUMERIC,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- Resolver tenant por dominio
  SELECT t.id INTO v_tenant_id
  FROM tenants t
  WHERE t.dominio = p_dominio
    AND t.activo = true
    AND COALESCE(t.feat_tienda, false) = true
  LIMIT 1;

  -- Si no existe tenant o no tiene tienda habilitada, retornar vacío
  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      p.id,
      p.codigo,
      p.descripcion,
      p.ecommerce_descripcion,
      p.precio,
      p.imagen_url,
      p.ecommerce_slug,
      m.nombre AS marca_nombre,
      tp.nombre AS tipo_nombre,
      COALESCE(p.ecommerce_orden, 0) AS ecommerce_orden,
      get_stock_actual(p.id) AS existencia
    FROM productos p
    LEFT JOIN marcas m ON m.id = p.marca_id
    LEFT JOIN tipos_producto tp ON tp.id = p.tipo_id
    WHERE p.tenant_id = v_tenant_id
      AND p.ecommerce_visible = true
      AND p.activo = true
      -- Filtro de búsqueda
      AND (
        p_search IS NULL OR p_search = '' OR
        p.descripcion ILIKE '%' || p_search || '%' OR
        p.codigo ILIKE '%' || p_search || '%' OR
        p.referencia ILIKE '%' || p_search || '%'
      )
      -- Filtro de marca
      AND (
        p_marca IS NULL OR p_marca = '' OR
        m.nombre ILIKE '%' || p_marca || '%'
      )
      -- Filtro de tipo
      AND (
        p_tipo IS NULL OR p_tipo = '' OR
        tp.nombre ILIKE '%' || p_tipo || '%'
      )
      -- Filtro de modelo (busca en los modelos compatibles)
      AND (
        p_modelo IS NULL OR p_modelo = '' OR
        EXISTS (
          SELECT 1 
          FROM unnest(p.modelos_ids) AS mid
          JOIN modelos mo ON mo.id = mid
          WHERE mo.nombre ILIKE '%' || p_modelo || '%'
        )
      )
  ),
  counted AS (
    SELECT f.*, count(*) OVER() AS total_count
    FROM filtered f
  )
  SELECT
    c.id,
    c.codigo,
    c.descripcion,
    c.ecommerce_descripcion,
    c.precio,
    c.imagen_url,
    c.ecommerce_slug,
    c.marca_nombre,
    c.tipo_nombre,
    c.ecommerce_orden,
    c.existencia,
    c.total_count
  FROM counted c
  ORDER BY
    c.existencia <= 0 ASC, -- Primero los que tienen stock
    c.ecommerce_orden ASC,
    c.descripcion ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_productos_tienda(TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_productos_tienda(TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- 4. Actualizar get_producto_tienda_por_slug para retornar existencia
DROP FUNCTION IF EXISTS public.get_producto_tienda_por_slug(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.get_producto_tienda_por_slug(
  p_dominio TEXT,
  p_slug TEXT
)
RETURNS TABLE(
  id UUID,
  codigo TEXT,
  descripcion TEXT,
  ecommerce_descripcion TEXT,
  precio NUMERIC,
  imagen_url TEXT,
  ecommerce_slug TEXT,
  marca_nombre TEXT,
  tipo_nombre TEXT,
  referencia TEXT,
  existencia NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- Resolver tenant por dominio
  SELECT t.id INTO v_tenant_id
  FROM tenants t
  WHERE t.dominio = p_dominio
    AND t.activo = true
    AND COALESCE(t.feat_tienda, false) = true
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.codigo,
    p.descripcion,
    p.ecommerce_descripcion,
    p.precio,
    p.imagen_url,
    p.ecommerce_slug,
    m.nombre AS marca_nombre,
    tp.nombre AS tipo_nombre,
    p.referencia,
    get_stock_actual(p.id) AS existencia
  FROM productos p
  LEFT JOIN marcas m ON m.id = p.marca_id
  LEFT JOIN tipos_producto tp ON tp.id = p.tipo_id
  WHERE p.tenant_id = v_tenant_id
    AND p.ecommerce_slug = p_slug
    AND p.ecommerce_visible = true
    AND p.activo = true
  LIMIT 1;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_producto_tienda_por_slug(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_producto_tienda_por_slug(TEXT, TEXT) TO authenticated;

-- 5. Actualizar get_filtros_tienda para retornar modelos
DROP FUNCTION IF EXISTS public.get_filtros_tienda(TEXT);
CREATE OR REPLACE FUNCTION public.get_filtros_tienda(p_dominio TEXT)
RETURNS TABLE(
  marcas JSON,
  tipos JSON,
  modelos JSON
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id UUID;
  v_marcas JSON;
  v_tipos JSON;
  v_modelos JSON;
BEGIN
  -- Resolver tenant
  SELECT t.id INTO v_tenant_id
  FROM tenants t
  WHERE t.dominio = p_dominio
    AND t.activo = true
    AND COALESCE(t.feat_tienda, false) = true
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    v_marcas := '[]'::JSON;
    v_tipos := '[]'::JSON;
    v_modelos := '[]'::JSON;
    RETURN QUERY SELECT v_marcas, v_tipos, v_modelos;
    RETURN;
  END IF;

  -- Obtener marcas que tienen al menos un producto publicado
  SELECT COALESCE(json_agg(DISTINCT jsonb_build_object(
    'nombre', m.nombre
  )), '[]'::JSON)
  INTO v_marcas
  FROM productos p
  JOIN marcas m ON m.id = p.marca_id
  WHERE p.tenant_id = v_tenant_id
    AND p.ecommerce_visible = true
    AND p.activo = true;

  -- Obtener tipos que tienen al menos un producto publicado
  SELECT COALESCE(json_agg(DISTINCT jsonb_build_object(
    'nombre', tp.nombre
  )), '[]'::JSON)
  INTO v_tipos
  FROM productos p
  JOIN tipos_producto tp ON tp.id = p.tipo_id
  WHERE p.tenant_id = v_tenant_id
    AND p.ecommerce_visible = true
    AND p.activo = true;

  -- Obtener modelos que tienen al menos un producto publicado
  SELECT COALESCE(json_agg(DISTINCT jsonb_build_object(
    'nombre', mo.nombre
  )), '[]'::JSON)
  INTO v_modelos
  FROM productos p
  CROSS JOIN unnest(p.modelos_ids) AS mid
  JOIN modelos mo ON mo.id = mid
  WHERE p.tenant_id = v_tenant_id
    AND p.ecommerce_visible = true
    AND p.activo = true;

  RETURN QUERY SELECT v_marcas, v_tipos, v_modelos;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_filtros_tienda(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_filtros_tienda(TEXT) TO authenticated;

