-- ============================================================
-- MIGRACIÓN: Tienda Pública (E-Commerce) — Fase 1A
-- Fecha: 2026-05-09
-- Impacto: CERO en flujo existente (solo ADD COLUMN con defaults)
-- ============================================================
-- INSTRUCCIONES:
-- 1. Ejecutar en Supabase SQL Editor (producción)
-- 2. Verificar con las queries de validación al final
-- 3. NO requiere downtime ni afecta operación actual
-- ============================================================

-- ============================================================
-- PASO 1: Feature flag en tenants
-- ============================================================
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS feat_tienda BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.tenants.feat_tienda IS
  'Habilita la tienda pública (/tienda) para este tenant';

-- ============================================================
-- PASO 2: Campos ecommerce en productos
-- Todos con defaults seguros: nada se publica automáticamente
-- ============================================================

-- Flag de publicación (opt-in explícito)
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS ecommerce_visible BOOLEAN DEFAULT false;

-- Slug para URL amigable (/tienda/goma-110-70-12)
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS ecommerce_slug TEXT;

-- Descripción larga para la tienda (opcional, fallback a productos.descripcion)
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS ecommerce_descripcion TEXT;

-- Orden de aparición en el catálogo (menor = primero)
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS ecommerce_orden INTEGER DEFAULT 0;

COMMENT ON COLUMN public.productos.ecommerce_visible IS
  'Si true, el producto aparece en la tienda pública del tenant';
COMMENT ON COLUMN public.productos.ecommerce_slug IS
  'URL slug para la tienda pública. Debe ser único por tenant.';
COMMENT ON COLUMN public.productos.ecommerce_descripcion IS
  'Descripción larga para la tienda. Si NULL, se usa productos.descripcion';
COMMENT ON COLUMN public.productos.ecommerce_orden IS
  'Orden de aparición en la tienda. 0 = default (orden alfabético)';

-- ============================================================
-- PASO 3: Constraint de slug único por tenant
-- ============================================================
-- Solo aplica cuando el slug NO es NULL (productos sin slug no colisionan)
CREATE UNIQUE INDEX IF NOT EXISTS idx_productos_ecommerce_slug_tenant
  ON public.productos (tenant_id, ecommerce_slug)
  WHERE ecommerce_slug IS NOT NULL;

-- Índice para queries de la tienda pública
CREATE INDEX IF NOT EXISTS idx_productos_ecommerce_visible
  ON public.productos (tenant_id, ecommerce_visible)
  WHERE ecommerce_visible = true;

-- ============================================================
-- PASO 4: Función auxiliar para generar slugs
-- ============================================================
CREATE OR REPLACE FUNCTION public.slugify(input_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  result TEXT;
BEGIN
  -- Convertir a minúsculas
  result := lower(input_text);
  
  -- Reemplazar acentos/diacríticos comunes en español
  result := translate(result,
    'áàâãäéèêëíìîïóòôõöúùûüñç',
    'aaaaaeeeeiiiioooooouuuunc');
  
  -- Reemplazar cualquier carácter no alfanumérico con guión
  result := regexp_replace(result, '[^a-z0-9]+', '-', 'g');
  
  -- Eliminar guiones al inicio y final
  result := trim(both '-' from result);
  
  -- Limitar longitud a 120 caracteres
  result := left(result, 120);
  
  RETURN result;
END;
$function$;

COMMENT ON FUNCTION public.slugify(TEXT) IS
  'Convierte texto a URL slug (lowercase, sin acentos, guiones). Inmutable.';

-- ============================================================
-- PASO 5: RPC para obtener la config de tienda por dominio
-- Extiende get_tenant_por_dominio con campos de tienda
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_tienda_config(p_dominio TEXT)
RETURNS TABLE(
  tenant_id UUID,
  nombre TEXT,
  logo_url TEXT,
  telefono TEXT,
  feat_tienda BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    t.id AS tenant_id,
    t.nombre,
    t.logo_url,
    t.telefono,
    COALESCE(t.feat_tienda, false) AS feat_tienda
  FROM tenants t
  WHERE t.dominio = p_dominio
    AND t.activo = true
  LIMIT 1;
$function$;

-- Permitir que usuarios anónimos llamen esta función
GRANT EXECUTE ON FUNCTION public.get_tienda_config(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_tienda_config(TEXT) TO authenticated;

COMMENT ON FUNCTION public.get_tienda_config(TEXT) IS
  'Retorna la configuración de tienda para un dominio dado. Accesible por anon.';

-- ============================================================
-- PASO 6: RPC para listar productos de la tienda (paginado)
-- SECURITY DEFINER: bypasea RLS, filtra internamente por tenant
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_productos_tienda(
  p_dominio TEXT,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0,
  p_search TEXT DEFAULT NULL,
  p_marca TEXT DEFAULT NULL,
  p_tipo TEXT DEFAULT NULL
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
      COALESCE(p.ecommerce_orden, 0) AS ecommerce_orden
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
    c.total_count
  FROM counted c
  ORDER BY
    c.ecommerce_orden ASC,
    c.descripcion ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

-- Permitir que usuarios anónimos llamen esta función
GRANT EXECUTE ON FUNCTION public.get_productos_tienda(TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_productos_tienda(TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.get_productos_tienda IS
  'Lista productos publicados en la tienda de un tenant. Paginado. Accesible por anon.';

-- ============================================================
-- PASO 7: RPC para obtener un producto por slug
-- ============================================================
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
  referencia TEXT
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
    p.referencia
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

-- Permitir que usuarios anónimos llamen esta función
GRANT EXECUTE ON FUNCTION public.get_producto_tienda_por_slug(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_producto_tienda_por_slug(TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.get_producto_tienda_por_slug IS
  'Retorna un producto publicado por su slug. Accesible por anon.';

-- ============================================================
-- PASO 8: RPC para obtener marcas y tipos disponibles en la tienda
-- (para filtros del sidebar/barra de búsqueda)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_filtros_tienda(p_dominio TEXT)
RETURNS TABLE(
  marcas JSON,
  tipos JSON
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
    RETURN QUERY SELECT v_marcas, v_tipos;
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

  RETURN QUERY SELECT v_marcas, v_tipos;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_filtros_tienda(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_filtros_tienda(TEXT) TO authenticated;

COMMENT ON FUNCTION public.get_filtros_tienda IS
  'Retorna marcas y tipos con productos publicados para los filtros de la tienda.';

-- ============================================================
-- VALIDACIÓN POST-MIGRACIÓN
-- Ejecutar estas queries para verificar que todo está correcto
-- ============================================================

-- 1. Verificar columnas nuevas en productos
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'productos'
--   AND column_name LIKE 'ecommerce_%'
-- ORDER BY ordinal_position;

-- 2. Verificar feat_tienda en tenants
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'tenants'
--   AND column_name = 'feat_tienda';

-- 3. Verificar que las funciones existen
-- SELECT proname, prokind
-- FROM pg_proc
-- WHERE proname IN (
--   'slugify',
--   'get_tienda_config',
--   'get_productos_tienda',
--   'get_producto_tienda_por_slug',
--   'get_filtros_tienda'
-- );

-- 4. Verificar que anon tiene permisos
-- SELECT grantee, routine_name, privilege_type
-- FROM information_schema.routine_privileges
-- WHERE routine_name IN (
--   'get_tienda_config',
--   'get_productos_tienda',
--   'get_producto_tienda_por_slug',
--   'get_filtros_tienda'
-- )
-- AND grantee = 'anon';

-- 5. Test rápido: debería retornar vacío (ningún producto publicado aún)
-- SELECT * FROM get_productos_tienda('repuestos-morla.pages.dev');
