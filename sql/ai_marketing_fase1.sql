-- ============================================================
-- MORLA AI CEO — Módulo Marketing IA / YouTube (Fase 1)
-- ============================================================
-- 4 tablas (ai_marketing_settings, ai_marketing_campaigns,
-- ai_marketing_content, ai_product_content_history)
-- + RPC get_marketing_candidates (análisis con validaciones)
-- + bucket de Storage 'ai-marketing' para imágenes generadas.
--
-- Convención: tenant_id + RLS con get_user_tenant() (igual que
-- el resto del módulo AI CEO). Idempotente.
-- ============================================================

-- ────────────────────────────────────────────────
-- 1) ai_marketing_settings — 1 fila por tenant
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_marketing_settings (
  tenant_id            UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  negocio_nombre       TEXT    DEFAULT 'Repuestos Morla',
  tono                 TEXT    DEFAULT 'dominicano, cercano, profesional y vendedor',
  whatsapp_numero      TEXT,
  permitir_sin_imagen  BOOLEAN DEFAULT FALSE,
  max_imagenes_por_dia INT     DEFAULT 5,
  canales_default      TEXT[]  DEFAULT ARRAY['reel','whatsapp','instagram'],
  reglas_extra         TEXT,
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────
-- 2) ai_marketing_campaigns — sesión/día de trabajo
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_marketing_campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre       TEXT,
  fecha        DATE NOT NULL DEFAULT CURRENT_DATE,
  estado       TEXT NOT NULL DEFAULT 'borrador'
                 CHECK (estado IN ('borrador','activa','finalizada')),
  producto_ids UUID[] DEFAULT '{}',
  canales      TEXT[] DEFAULT '{}',
  modo_prueba  BOOLEAN DEFAULT TRUE,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────
-- 3) ai_marketing_content — pieza de contenido (multi-formato)
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_marketing_content (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id       UUID REFERENCES public.ai_marketing_campaigns(id) ON DELETE SET NULL,
  producto_id       UUID REFERENCES public.productos(id) ON DELETE CASCADE,
  -- Contenido generado (una fila = propuesta completa de un producto)
  titulo_youtube    TEXT,
  descripcion_seo   TEXT,
  guion_8s          JSONB DEFAULT '[]'::jsonb,   -- escenas <=8s (Veo 3)
  guion_15s         JSONB DEFAULT '[]'::jsonb,
  guion_30s         JSONB DEFAULT '[]'::jsonb,
  copy_instagram    TEXT,
  copy_facebook     TEXT,
  texto_whatsapp    TEXT,
  cta               TEXT,
  sugerencia_visual TEXT,
  idea_miniatura    TEXT,
  canal_recomendado TEXT,
  imagenes          JSONB DEFAULT '[]'::jsonb,    -- [{url, tipo, cost_usd, created_at}]
  estado            TEXT NOT NULL DEFAULT 'borrador'
                      CHECK (estado IN ('borrador','aprobado','publicado','descartado')),
  incompleto        BOOLEAN DEFAULT FALSE,
  flags             JSONB DEFAULT '{}'::jsonb,    -- sin_imagen, sin_precio, sin_existencia, modo_encargo
  version           INT DEFAULT 1,
  provider          TEXT,
  model             TEXT,
  cost_usd          NUMERIC(10,5) DEFAULT 0,
  fecha_programada  DATE,                          -- calendario
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_mkt_content_tenant_estado
  ON public.ai_marketing_content(tenant_id, estado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_mkt_content_producto
  ON public.ai_marketing_content(tenant_id, producto_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_mkt_content_calendario
  ON public.ai_marketing_content(tenant_id, fecha_programada);

-- ────────────────────────────────────────────────
-- 4) ai_product_content_history — historial por producto
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_product_content_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  producto_id UUID REFERENCES public.productos(id) ON DELETE CASCADE,
  content_id  UUID REFERENCES public.ai_marketing_content(id) ON DELETE CASCADE,
  accion      TEXT NOT NULL,   -- generado | regenerado | aprobado | publicado | descartado | imagen_generada
  snapshot    JSONB DEFAULT '{}'::jsonb,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_prod_content_hist
  ON public.ai_product_content_history(tenant_id, producto_id, created_at DESC);

-- ────────────────────────────────────────────────
-- RLS + Policies (tenant_id = get_user_tenant())
-- ────────────────────────────────────────────────
ALTER TABLE public.ai_marketing_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_marketing_campaigns        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_marketing_content          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_product_content_history    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_mkt_settings_tenant ON public.ai_marketing_settings;
CREATE POLICY ai_mkt_settings_tenant ON public.ai_marketing_settings
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS ai_mkt_campaigns_tenant ON public.ai_marketing_campaigns;
CREATE POLICY ai_mkt_campaigns_tenant ON public.ai_marketing_campaigns
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS ai_mkt_content_tenant ON public.ai_marketing_content;
CREATE POLICY ai_mkt_content_tenant ON public.ai_marketing_content
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS ai_mkt_hist_tenant ON public.ai_product_content_history;
CREATE POLICY ai_mkt_hist_tenant ON public.ai_product_content_history
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_marketing_settings     TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_marketing_campaigns     TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_marketing_content       TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_product_content_history TO authenticated, service_role;

-- ────────────────────────────────────────────────
-- RPC: get_marketing_candidates
-- ────────────────────────────────────────────────
-- Devuelve productos clasificados para marketing, aplicando
-- validaciones:
--   * Excluye productos sin precio (precio <= 0).
--   * Excluye sin imagen salvo p_permitir_sin_imagen = true.
--   * existencia = 0  -> modo 'encargo'; existencia > 0 -> 'normal'.
-- Clasificación: recien_llegados, alta_existencia, baja_rotacion,
-- buen_margen, mas_vendidos. Reutiliza get_stock_actual() y
-- facturas_detalle/facturas (mismo patrón que get_marketing_summary).
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_marketing_candidates(
  p_tenant_id          UUID,
  p_permitir_sin_imagen BOOLEAN DEFAULT FALSE,
  p_limit              INT DEFAULT 8
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_result JSON;
BEGIN
  WITH base AS (
    SELECT
      p.id,
      p.codigo,
      p.descripcion,
      p.precio,
      p.costo,
      p.imagen_url,
      p.created_at,
      public.get_stock_actual(p.id) AS existencia,
      CASE WHEN p.precio > 0 AND p.costo > 0
           THEN ROUND(((p.precio - p.costo) / p.precio * 100)::NUMERIC, 1)
           ELSE NULL END AS margen_pct,
      COALESCE((
        SELECT SUM(fd.cantidad)
        FROM public.facturas_detalle fd
        JOIN public.facturas f ON f.id = fd.factura_id
        WHERE fd.producto_id = p.id
          AND f.tenant_id = p_tenant_id
          AND f.fecha >= CURRENT_DATE - INTERVAL '30 days'
          AND f.estado <> 'Anulada'
      ), 0) AS vendidos_30d,
      COALESCE((
        SELECT SUM(fd.cantidad)
        FROM public.facturas_detalle fd
        JOIN public.facturas f ON f.id = fd.factura_id
        WHERE fd.producto_id = p.id
          AND f.tenant_id = p_tenant_id
          AND f.fecha >= CURRENT_DATE - INTERVAL '60 days'
          AND f.estado <> 'Anulada'
      ), 0) AS vendidos_60d
    FROM public.productos p
    WHERE p.tenant_id = p_tenant_id
      AND COALESCE(p.activo, true) = true
      AND p.precio > 0                                   -- validación: sin precio fuera
      AND (p_permitir_sin_imagen OR (p.imagen_url IS NOT NULL AND p.imagen_url <> ''))  -- validación: imagen
  ),
  enriched AS (
    SELECT b.*,
      (b.imagen_url IS NOT NULL AND b.imagen_url <> '') AS tiene_imagen,
      CASE WHEN b.existencia > 0 THEN 'normal' ELSE 'encargo' END AS modo,
      ROUND((b.existencia * COALESCE(b.costo,0))::NUMERIC, 2) AS capital_inmovilizado
    FROM base b
  )
  SELECT json_build_object(
    'fecha', CURRENT_DATE,
    'recien_llegados', (
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT * FROM enriched
        WHERE created_at >= CURRENT_DATE - INTERVAL '21 days'
        ORDER BY created_at DESC LIMIT p_limit
      ) t),
    'alta_existencia', (
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT * FROM enriched
        WHERE existencia > 10
        ORDER BY existencia DESC LIMIT p_limit
      ) t),
    'baja_rotacion', (
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT * FROM enriched
        WHERE existencia > 5 AND vendidos_60d < 3
        ORDER BY capital_inmovilizado DESC LIMIT p_limit
      ) t),
    'buen_margen', (
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT * FROM enriched
        WHERE margen_pct >= 30 AND existencia > 0
        ORDER BY margen_pct DESC LIMIT p_limit
      ) t),
    'mas_vendidos', (
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT * FROM enriched
        WHERE vendidos_30d > 0
        ORDER BY vendidos_30d DESC LIMIT p_limit
      ) t)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_marketing_candidates(UUID, BOOLEAN, INT)
  TO authenticated, service_role;

-- ────────────────────────────────────────────────
-- Storage bucket para imágenes generadas por IA
-- ────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('ai-marketing', 'ai-marketing', true)
ON CONFLICT (id) DO NOTHING;

-- Lectura pública (las imágenes se comparten en redes) + escritura
-- desde la app autenticada. El edge function sube con service_role.
DROP POLICY IF EXISTS "ai_marketing_public_read" ON storage.objects;
CREATE POLICY "ai_marketing_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'ai-marketing');

DROP POLICY IF EXISTS "ai_marketing_auth_write" ON storage.objects;
CREATE POLICY "ai_marketing_auth_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ai-marketing');

-- ────────────────────────────────────────────────
-- Verificación
-- ────────────────────────────────────────────────
SELECT 'tablas creadas' AS check, count(*) AS n
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('ai_marketing_settings','ai_marketing_campaigns',
                     'ai_marketing_content','ai_product_content_history');
