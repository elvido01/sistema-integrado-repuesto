-- ============================================================
-- Grupos de Productos Equivalentes (Fase 1 + 2)
-- ============================================================
-- Permite agrupar productos que el cliente final considera intercambiables
-- (ej: "BATERIA 5 HOSUYA" y "YTX5A-BS BATERIA 5 H-LEAD" son ambos
-- baterias tamaño 5 para moto — el cliente compra uno u otro).
--
-- Por que importa:
--   - Al recomendar compras, el motor suma rotacion combinada del grupo
--     (no por SKU individual) -> evita duplicar stock
--   - En ventas, si el primario esta agotado, sugiere el equivalente
--     -> no se pierde la venta
--   - Mejora rotacion del inventario -> libera capital -> baja CxP
--
-- Fase 1: tagueo MANUAL
-- Fase 2: SUGERENCIAS por similitud de texto (pg_trgm, gratis, sin LLM)
-- Idempotente.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ────────────────────────────────────────────────
-- 1) Tabla producto_grupos
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.producto_grupos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, nombre)
);

ALTER TABLE public.producto_grupos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS producto_grupos_tenant ON public.producto_grupos;
CREATE POLICY producto_grupos_tenant ON public.producto_grupos
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

CREATE INDEX IF NOT EXISTS idx_producto_grupos_tenant
  ON public.producto_grupos(tenant_id);

-- ────────────────────────────────────────────────
-- 2) Tabla producto_grupo_miembros
-- ────────────────────────────────────────────────
-- 1 producto = 1 grupo (PK por producto_id). Si querés cambiar de grupo,
-- borrar la fila y volver a insertar. Evita conflictos de demanda compartida.
CREATE TABLE IF NOT EXISTS public.producto_grupo_miembros (
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  grupo_id    UUID NOT NULL REFERENCES public.producto_grupos(id) ON DELETE CASCADE,
  prioridad   INT  DEFAULT 1,    -- 1 = preferido (mas margen / mejor calidad), 2 = sustituto, etc
  notas       TEXT,
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (producto_id)
);

ALTER TABLE public.producto_grupo_miembros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pgm_tenant ON public.producto_grupo_miembros;
CREATE POLICY pgm_tenant ON public.producto_grupo_miembros
  FOR ALL TO authenticated
  USING (
    grupo_id IN (SELECT id FROM public.producto_grupos WHERE tenant_id = public.get_user_tenant())
  )
  WITH CHECK (
    grupo_id IN (SELECT id FROM public.producto_grupos WHERE tenant_id = public.get_user_tenant())
  );

CREATE INDEX IF NOT EXISTS idx_pgm_grupo ON public.producto_grupo_miembros(grupo_id);
CREATE INDEX IF NOT EXISTS idx_pgm_producto ON public.producto_grupo_miembros(producto_id);

-- ────────────────────────────────────────────────
-- 3) Indice GIN trigram para sugerencias por similitud (rapido)
-- ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_productos_descripcion_trgm
  ON public.productos USING GIN (descripcion gin_trgm_ops);

-- ────────────────────────────────────────────────
-- 4) RPC: get_equivalentes_producto
-- ────────────────────────────────────────────────
-- Devuelve los OTROS miembros del mismo grupo del producto dado,
-- con su existencia actual, ventas 30d y margen.
CREATE OR REPLACE FUNCTION public.get_equivalentes_producto(
  p_producto_id UUID
)
RETURNS TABLE(
  producto_id   UUID,
  codigo        TEXT,
  descripcion   TEXT,
  prioridad     INT,
  existencia    NUMERIC,
  ventas_30d    NUMERIC,
  costo         NUMERIC,
  precio        NUMERIC,
  margen_pct    NUMERIC,
  grupo_id      UUID,
  grupo_nombre  TEXT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_tenant UUID;
  v_grupo  UUID;
BEGIN
  v_tenant := public.get_user_tenant();
  IF v_tenant IS NULL THEN RETURN; END IF;

  -- Encontrar grupo del producto
  SELECT m.grupo_id INTO v_grupo
  FROM public.producto_grupo_miembros m
  JOIN public.producto_grupos g ON g.id = m.grupo_id
  WHERE m.producto_id = p_producto_id
    AND g.tenant_id = v_tenant;

  IF v_grupo IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.codigo::TEXT,
    p.descripcion::TEXT,
    m.prioridad,
    COALESCE(public.get_stock_actual(p.id), 0)::NUMERIC,
    COALESCE((
      SELECT SUM(fd.cantidad)
      FROM public.facturas_detalle fd
      JOIN public.facturas f ON f.id = fd.factura_id
      WHERE fd.producto_id = p.id
        AND f.tenant_id = v_tenant
        AND f.estado <> 'Anulada'
        AND f.fecha >= CURRENT_DATE - 30
    ), 0)::NUMERIC,
    COALESCE(p.costo, 0)::NUMERIC,
    COALESCE(p.precio, 0)::NUMERIC,
    CASE WHEN p.precio > 0 AND p.costo > 0 AND p.precio > p.costo
         THEN ROUND(((p.precio - p.costo) / p.precio * 100)::NUMERIC, 1)
         ELSE 0 END,
    g.id,
    g.nombre::TEXT
  FROM public.producto_grupo_miembros m
  JOIN public.productos p ON p.id = m.producto_id
  JOIN public.producto_grupos g ON g.id = m.grupo_id
  WHERE m.grupo_id = v_grupo
    AND m.producto_id <> p_producto_id     -- excluir el mismo
  ORDER BY m.prioridad ASC, p.descripcion ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_equivalentes_producto(UUID) TO authenticated, service_role;

-- ────────────────────────────────────────────────
-- 5) RPC: get_demanda_grupo
-- ────────────────────────────────────────────────
-- Suma rotacion y existencia combinada de TODOS los miembros del grupo.
-- Para que el motor de compra inteligente trate al grupo como un solo bucket.
CREATE OR REPLACE FUNCTION public.get_demanda_grupo(
  p_grupo_id UUID,
  p_dias     INT DEFAULT 30
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_tenant       UUID;
  v_total_vendido NUMERIC := 0;
  v_total_stock  NUMERIC := 0;
  v_total_costo  NUMERIC := 0;
  v_miembros     INT     := 0;
BEGIN
  v_tenant := public.get_user_tenant();

  SELECT
    COUNT(*),
    COALESCE(SUM(public.get_stock_actual(p.id)), 0),
    COALESCE(SUM(p.costo), 0)
    INTO v_miembros, v_total_stock, v_total_costo
  FROM public.producto_grupo_miembros m
  JOIN public.productos p ON p.id = m.producto_id
  JOIN public.producto_grupos g ON g.id = m.grupo_id
  WHERE m.grupo_id = p_grupo_id
    AND g.tenant_id = v_tenant;

  SELECT COALESCE(SUM(fd.cantidad), 0)
    INTO v_total_vendido
  FROM public.facturas_detalle fd
  JOIN public.facturas f ON f.id = fd.factura_id
  JOIN public.producto_grupo_miembros m ON m.producto_id = fd.producto_id
  WHERE m.grupo_id = p_grupo_id
    AND f.tenant_id = v_tenant
    AND f.estado <> 'Anulada'
    AND f.fecha >= CURRENT_DATE - p_dias;

  RETURN json_build_object(
    'grupo_id',         p_grupo_id,
    'miembros',         v_miembros,
    'vendido_periodo',  v_total_vendido,
    'stock_combinado',  v_total_stock,
    'costo_promedio',   CASE WHEN v_miembros > 0 THEN v_total_costo / v_miembros ELSE 0 END,
    'dias',             p_dias
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_demanda_grupo(UUID, INT) TO authenticated, service_role;

-- ────────────────────────────────────────────────
-- 6) RPC: sugerir_grupos_por_similitud
-- ────────────────────────────────────────────────
-- Detecta pares de productos cuyas descripciones son similares (trigram)
-- pero AUN no estan en ningun grupo. Usado por la UI de "Sugerencias".
--
-- p_min_similarity: 0 a 1. Default 0.4 (40% similar minimo).
--   0.3 = muchas sugerencias, algunas falsos positivos
--   0.4 = balance recomendado
--   0.6 = pocas sugerencias, alta precision
CREATE OR REPLACE FUNCTION public.sugerir_grupos_por_similitud(
  p_tenant_id      UUID DEFAULT NULL,
  p_min_similarity NUMERIC DEFAULT 0.4,
  p_limit          INT DEFAULT 50
)
RETURNS TABLE(
  producto_a_id   UUID,
  codigo_a        TEXT,
  descripcion_a   TEXT,
  producto_b_id   UUID,
  codigo_b        TEXT,
  descripcion_b   TEXT,
  similitud       NUMERIC,
  ventas_combinadas_30d NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_tenant UUID;
BEGIN
  v_tenant := COALESCE(p_tenant_id, public.get_user_tenant());
  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    pa.id AS producto_a_id,
    pa.codigo::TEXT AS codigo_a,
    pa.descripcion::TEXT AS descripcion_a,
    pb.id AS producto_b_id,
    pb.codigo::TEXT AS codigo_b,
    pb.descripcion::TEXT AS descripcion_b,
    ROUND(similarity(pa.descripcion, pb.descripcion)::NUMERIC, 2) AS similitud,
    (
      COALESCE((SELECT SUM(fd.cantidad)
                FROM public.facturas_detalle fd
                JOIN public.facturas f ON f.id = fd.factura_id
                WHERE fd.producto_id = pa.id
                  AND f.fecha >= CURRENT_DATE - 30
                  AND f.estado <> 'Anulada'), 0)
      +
      COALESCE((SELECT SUM(fd.cantidad)
                FROM public.facturas_detalle fd
                JOIN public.facturas f ON f.id = fd.factura_id
                WHERE fd.producto_id = pb.id
                  AND f.fecha >= CURRENT_DATE - 30
                  AND f.estado <> 'Anulada'), 0)
    )::NUMERIC AS ventas_combinadas_30d
  FROM public.productos pa
  JOIN public.productos pb
    ON  pa.tenant_id = pb.tenant_id
    AND pa.id < pb.id                                          -- evitar duplicar (a,b) y (b,a)
    AND similarity(pa.descripcion, pb.descripcion) >= p_min_similarity
  WHERE pa.tenant_id = v_tenant
    AND pa.activo IS NOT FALSE
    AND pb.activo IS NOT FALSE
    -- ambos NO deben estar ya en algun grupo
    AND NOT EXISTS (SELECT 1 FROM public.producto_grupo_miembros m WHERE m.producto_id = pa.id)
    AND NOT EXISTS (SELECT 1 FROM public.producto_grupo_miembros m WHERE m.producto_id = pb.id)
  ORDER BY similitud DESC, ventas_combinadas_30d DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sugerir_grupos_por_similitud(UUID, NUMERIC, INT) TO authenticated, service_role;

-- ────────────────────────────────────────────────
-- 7) RPC helper: crear_grupo_con_productos
-- ────────────────────────────────────────────────
-- Atomico: crea el grupo + agrega productos en una sola llamada.
-- Si algun producto ya esta en otro grupo, lo MUEVE al nuevo.
CREATE OR REPLACE FUNCTION public.crear_grupo_con_productos(
  p_nombre      TEXT,
  p_descripcion TEXT,
  p_producto_ids UUID[],
  p_prioridades  INT[] DEFAULT NULL  -- mismo length que producto_ids; default todos prioridad 1
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant   UUID;
  v_grupo_id UUID;
  v_i        INT;
BEGIN
  v_tenant := public.get_user_tenant();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin tenant'; END IF;
  IF p_nombre IS NULL OR length(trim(p_nombre)) = 0 THEN
    RAISE EXCEPTION 'Nombre del grupo requerido';
  END IF;
  IF p_producto_ids IS NULL OR array_length(p_producto_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Se requieren al menos 2 productos para formar un grupo';
  END IF;

  -- Borrar membresia previa de cualquier producto que ya este en otro grupo
  DELETE FROM public.producto_grupo_miembros m
  WHERE m.producto_id = ANY(p_producto_ids)
    AND m.grupo_id IN (SELECT id FROM public.producto_grupos WHERE tenant_id = v_tenant);

  -- Crear grupo
  INSERT INTO public.producto_grupos (tenant_id, nombre, descripcion)
  VALUES (v_tenant, trim(p_nombre), p_descripcion)
  RETURNING id INTO v_grupo_id;

  -- Insertar miembros
  FOR v_i IN 1..array_length(p_producto_ids, 1) LOOP
    INSERT INTO public.producto_grupo_miembros (producto_id, grupo_id, prioridad)
    VALUES (
      p_producto_ids[v_i],
      v_grupo_id,
      CASE
        WHEN p_prioridades IS NULL THEN 1
        WHEN array_length(p_prioridades, 1) < v_i THEN 1
        ELSE p_prioridades[v_i]
      END
    );
  END LOOP;

  RETURN v_grupo_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_grupo_con_productos(TEXT, TEXT, UUID[], INT[]) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'producto_grupos_equivalentes listo' AS status,
       (SELECT count(*) FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('producto_grupos','producto_grupo_miembros')) AS tablas,
       (SELECT count(*) FROM pg_proc
        WHERE proname IN ('get_equivalentes_producto','get_demanda_grupo',
                          'sugerir_grupos_por_similitud','crear_grupo_con_productos')) AS rpcs;
