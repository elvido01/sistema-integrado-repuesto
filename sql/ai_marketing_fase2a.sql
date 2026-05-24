-- ============================================================
-- MORLA AI CEO — Marketing IA Fase 2a (Métricas y Aprendizaje)
-- ============================================================
-- Núcleo SIN OAuth: registro manual de publicaciones, métricas
-- manuales, motor de impacto en ventas (datos propios) y
-- aprendizaje del agente.
--
-- 6 tablas: social_accounts, social_account_secrets, social_posts,
-- social_post_metrics, ai_marketing_sales_impact, ai_marketing_learning
-- + RPC compute_marketing_impact (SQL puro, sin costo).
-- Convención: tenant_id + RLS get_user_tenant(). Idempotente.
-- ============================================================

-- ────────────────────────────────────────────────
-- 1) social_accounts — cuenta conectada (SIN tokens)
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL CHECK (platform IN ('youtube','instagram','tiktok','facebook','whatsapp')),
  account_name        TEXT,
  external_account_id TEXT,
  status              TEXT NOT NULL DEFAULT 'connected'
                        CHECK (status IN ('connected','disconnected','error','manual')),
  connected_at        TIMESTAMPTZ DEFAULT NOW(),
  meta                JSONB DEFAULT '{}'::jsonb,
  UNIQUE (tenant_id, platform, external_account_id)
);

-- ────────────────────────────────────────────────
-- 1.b) social_account_secrets — tokens (SOLO service_role)
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_account_secrets (
  account_id    UUID PRIMARY KEY REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  access_token  TEXT,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────
-- 2) social_posts — cada publicación (IA o manual)
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  content_id      UUID REFERENCES public.ai_marketing_content(id) ON DELETE SET NULL,
  producto_id     UUID REFERENCES public.productos(id) ON DELETE SET NULL,  -- null = contenido general
  campaign_id     UUID REFERENCES public.ai_marketing_campaigns(id) ON DELETE SET NULL,
  platform        TEXT NOT NULL CHECK (platform IN ('youtube','instagram','tiktok','facebook','whatsapp')),
  post_type       TEXT,   -- reel | short | video | post | story | wa_status | carousel
  estilo_guion    TEXT,   -- problema_solucion | producto_hablando | mecanico_explica | antes_despues | consejo | oferta | educativo | testimonio
  external_post_id TEXT,
  external_url    TEXT,
  title           TEXT,
  description     TEXT,
  script_used     TEXT,
  thumbnail_url   TEXT,
  published_at    TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'publicado'
                    CHECK (status IN ('publicado','borrador','archivado')),
  is_general      BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_tenant ON public.social_posts(tenant_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_producto ON public.social_posts(tenant_id, producto_id);

-- ────────────────────────────────────────────────
-- 3) social_post_metrics — snapshot de métricas
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_post_metrics (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  post_id           UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  captured_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  views             BIGINT DEFAULT 0,
  likes             BIGINT DEFAULT 0,
  comments          BIGINT DEFAULT 0,
  shares            BIGINT DEFAULT 0,
  saves             BIGINT DEFAULT 0,
  clicks            BIGINT DEFAULT 0,
  reach             BIGINT DEFAULT 0,
  impressions       BIGINT DEFAULT 0,
  engagement_rate   NUMERIC(6,2) DEFAULT 0,
  performance_score NUMERIC(12,2) DEFAULT 0,
  origen            TEXT DEFAULT 'manual',   -- manual | api
  raw_data          JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_metrics_post ON public.social_post_metrics(post_id, captured_at DESC);

-- ────────────────────────────────────────────────
-- 4) ai_marketing_sales_impact — impacto estimado
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_marketing_sales_impact (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  post_id            UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  producto_id        UUID REFERENCES public.productos(id) ON DELETE SET NULL,
  rango_dias         INT NOT NULL DEFAULT 7,
  units_before       NUMERIC DEFAULT 0,
  units_after        NUMERIC DEFAULT 0,
  revenue_before     NUMERIC DEFAULT 0,
  revenue_after      NUMERIC DEFAULT 0,
  utilidad_before    NUMERIC DEFAULT 0,
  utilidad_after     NUMERIC DEFAULT 0,
  wa_quotes_after    INT DEFAULT 0,
  sales_impact_score NUMERIC(12,2) DEFAULT 0,
  clasificacion      TEXT,   -- excelente | bueno | regular | bajo | no_funciono
  estimado           BOOLEAN DEFAULT TRUE,
  computed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, rango_dias)
);

CREATE INDEX IF NOT EXISTS idx_mkt_impact_tenant ON public.ai_marketing_sales_impact(tenant_id, computed_at DESC);

-- ────────────────────────────────────────────────
-- 5) ai_marketing_learning — aprendizaje del agente
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_marketing_learning (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  periodo            DATE NOT NULL DEFAULT CURRENT_DATE,
  resumen            TEXT,
  top_contenidos     JSONB DEFAULT '[]'::jsonb,
  top_productos      JSONB DEFAULT '[]'::jsonb,
  no_funcionaron     JSONB DEFAULT '[]'::jsonb,
  recomendaciones    JSONB DEFAULT '[]'::jsonb,
  productos_recomendados JSONB DEFAULT '[]'::jsonb,
  estilo_recomendado TEXT,
  canal_recomendado  TEXT,
  confianza          TEXT,   -- alta | media | baja
  provider           TEXT,
  model              TEXT,
  cost_usd           NUMERIC(10,5) DEFAULT 0,
  raw                JSONB DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_learning_tenant ON public.ai_marketing_learning(tenant_id, created_at DESC);

-- ────────────────────────────────────────────────
-- RLS + Policies
-- ────────────────────────────────────────────────
ALTER TABLE public.social_accounts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_account_secrets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_metrics        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_marketing_sales_impact  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_marketing_learning      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS social_accounts_tenant ON public.social_accounts;
CREATE POLICY social_accounts_tenant ON public.social_accounts
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

-- ⚠️ secrets: NINGUNA policy para authenticated => frontend no puede leer tokens.
--    Solo service_role (que bypassa RLS) accede.

DROP POLICY IF EXISTS social_posts_tenant ON public.social_posts;
CREATE POLICY social_posts_tenant ON public.social_posts
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS social_metrics_tenant ON public.social_post_metrics;
CREATE POLICY social_metrics_tenant ON public.social_post_metrics
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS mkt_impact_tenant ON public.ai_marketing_sales_impact;
CREATE POLICY mkt_impact_tenant ON public.ai_marketing_sales_impact
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS mkt_learning_tenant ON public.ai_marketing_learning;
CREATE POLICY mkt_learning_tenant ON public.ai_marketing_learning
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_accounts           TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_account_secrets    TO service_role;  -- ⚠️ solo backend
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_posts              TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_post_metrics       TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_marketing_sales_impact TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_marketing_learning     TO authenticated, service_role;

-- ────────────────────────────────────────────────
-- RPC: compute_marketing_impact (SQL puro, sin costo)
-- ────────────────────────────────────────────────
-- Compara ventas N días ANTES vs N días DESPUÉS de published_at.
-- Calcula performance_score y sales_impact_score con las fórmulas
-- definidas + clasificación. Todo es "impacto estimado".
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compute_marketing_impact(
  p_post_id   UUID,
  p_rango_dias INT DEFAULT 7
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_post   RECORD;
  v_pub    DATE;
  v_costo  NUMERIC := 0;
  v_units_before NUMERIC := 0; v_units_after NUMERIC := 0;
  v_rev_before NUMERIC := 0;   v_rev_after NUMERIC := 0;
  v_util_before NUMERIC := 0;  v_util_after NUMERIC := 0;
  v_wa_after INT := 0;
  v_m RECORD;
  v_perf NUMERIC := 0; v_impact NUMERIC := 0; v_clasif TEXT;
BEGIN
  SELECT * INTO v_post FROM public.social_posts WHERE id = p_post_id;
  IF NOT FOUND THEN RETURN json_build_object('error','post_no_encontrado'); END IF;

  v_pub := COALESCE(v_post.published_at::date, CURRENT_DATE);

  IF v_post.producto_id IS NOT NULL THEN
    SELECT COALESCE(SUM(fd.cantidad),0), COALESCE(SUM(fd.cantidad * fd.precio),0)
      INTO v_units_before, v_rev_before
    FROM public.facturas_detalle fd
    JOIN public.facturas f ON f.id = fd.factura_id
    WHERE fd.producto_id = v_post.producto_id
      AND f.tenant_id = v_post.tenant_id AND f.estado <> 'Anulada'
      AND f.fecha >= v_pub - p_rango_dias AND f.fecha < v_pub;

    SELECT COALESCE(SUM(fd.cantidad),0), COALESCE(SUM(fd.cantidad * fd.precio),0)
      INTO v_units_after, v_rev_after
    FROM public.facturas_detalle fd
    JOIN public.facturas f ON f.id = fd.factura_id
    WHERE fd.producto_id = v_post.producto_id
      AND f.tenant_id = v_post.tenant_id AND f.estado <> 'Anulada'
      AND f.fecha >= v_pub AND f.fecha < v_pub + p_rango_dias;

    SELECT COALESCE(costo,0) INTO v_costo FROM public.productos WHERE id = v_post.producto_id;
    v_util_before := v_rev_before - (v_units_before * v_costo);
    v_util_after  := v_rev_after  - (v_units_after  * v_costo);

    SELECT COUNT(*) INTO v_wa_after
    FROM public.cotizaciones_detalle cd
    JOIN public.cotizaciones c ON c.id = cd.cotizacion_id
    WHERE cd.producto_id = v_post.producto_id
      AND c.tenant_id = v_post.tenant_id
      AND c.fecha_cotizacion >= v_pub AND c.fecha_cotizacion < v_pub + p_rango_dias;
  END IF;

  SELECT * INTO v_m FROM public.social_post_metrics
  WHERE post_id = p_post_id ORDER BY captured_at DESC LIMIT 1;

  v_perf := COALESCE(v_m.views,0)*0.10 + COALESCE(v_m.likes,0)*1 + COALESCE(v_m.comments,0)*3
          + COALESCE(v_m.shares,0)*5 + COALESCE(v_m.saves,0)*4 + COALESCE(v_m.clicks,0)*4
          + v_units_after*10;

  v_impact := (v_units_after - v_units_before)*10 + (v_rev_after - v_rev_before)*0.01 + v_wa_after*3;

  v_clasif := CASE
    WHEN v_impact >= 90 THEN 'excelente'
    WHEN v_impact >= 70 THEN 'bueno'
    WHEN v_impact >= 50 THEN 'regular'
    WHEN v_impact >= 30 THEN 'bajo'
    ELSE 'no_funciono' END;

  INSERT INTO public.ai_marketing_sales_impact (
    tenant_id, post_id, producto_id, rango_dias, units_before, units_after,
    revenue_before, revenue_after, utilidad_before, utilidad_after,
    wa_quotes_after, sales_impact_score, clasificacion, estimado, computed_at)
  VALUES (v_post.tenant_id, p_post_id, v_post.producto_id, p_rango_dias,
    v_units_before, v_units_after, v_rev_before, v_rev_after, v_util_before, v_util_after,
    v_wa_after, ROUND(v_impact,2), v_clasif, TRUE, NOW())
  ON CONFLICT (post_id, rango_dias) DO UPDATE SET
    units_before=EXCLUDED.units_before, units_after=EXCLUDED.units_after,
    revenue_before=EXCLUDED.revenue_before, revenue_after=EXCLUDED.revenue_after,
    utilidad_before=EXCLUDED.utilidad_before, utilidad_after=EXCLUDED.utilidad_after,
    wa_quotes_after=EXCLUDED.wa_quotes_after, sales_impact_score=EXCLUDED.sales_impact_score,
    clasificacion=EXCLUDED.clasificacion, computed_at=NOW();

  IF v_m.id IS NOT NULL THEN
    UPDATE public.social_post_metrics SET performance_score = ROUND(v_perf,2) WHERE id = v_m.id;
  END IF;

  RETURN json_build_object(
    'performance_score', ROUND(v_perf,2),
    'sales_impact_score', ROUND(v_impact,2),
    'clasificacion', v_clasif,
    'units_before', v_units_before, 'units_after', v_units_after,
    'revenue_before', v_rev_before, 'revenue_after', v_rev_after,
    'utilidad_after', v_util_after, 'wa_quotes_after', v_wa_after,
    'rango_dias', p_rango_dias, 'estimado', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_marketing_impact(UUID, INT) TO authenticated, service_role;

-- ────────────────────────────────────────────────
-- Verificación
-- ────────────────────────────────────────────────
SELECT 'tablas fase2a' AS check, count(*) AS n
FROM information_schema.tables
WHERE table_schema='public' AND table_name IN
  ('social_accounts','social_account_secrets','social_posts',
   'social_post_metrics','ai_marketing_sales_impact','ai_marketing_learning');
