-- ============================================================
-- Modulo Disen~o Pro (estilo Canva) para AI CEO — ENTERPRISE
-- ============================================================
-- 2 tablas:
--   design_templates   — Plantillas pre-armadas (sistema)
--   design_documents   — Disen~os guardados por cada tenant
--
-- Cada disen~o se guarda como JSON (formato Polotno) en el campo
-- `content`. El thumbnail/imagen final se guarda en Supabase
-- Storage (bucket 'designs') y solo guardamos la URL.
-- ============================================================

-- ────────────────────────────────────────────────
-- 1) design_templates — plantillas del sistema
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.design_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT UNIQUE NOT NULL,          -- ej: 'oferta-del-dia'
  name         TEXT NOT NULL,
  category     TEXT NOT NULL CHECK (category IN ('oferta','nuevo','promo','reposicion','comunicado','comparativa','catalogo','story','banner','agradecimiento')),
  format       TEXT NOT NULL CHECK (format IN ('post_square','post_landscape','story_vertical')),
  width        INTEGER NOT NULL,
  height       INTEGER NOT NULL,
  preview_url  TEXT,                          -- thumbnail PNG/JPG
  content      JSONB NOT NULL,                -- documento Polotno
  description  TEXT,
  variables    TEXT[],                        -- ej: ARRAY['producto_nombre','producto_precio','producto_foto']
  is_active    BOOLEAN DEFAULT true,
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_design_templates_active ON public.design_templates(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_design_templates_category ON public.design_templates(category, is_active);

-- Lectura publica (autenticados pueden ver todas las plantillas activas).
ALTER TABLE public.design_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS design_templates_read ON public.design_templates;
CREATE POLICY design_templates_read ON public.design_templates
  FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS design_templates_write_admin ON public.design_templates;
CREATE POLICY design_templates_write_admin ON public.design_templates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true));

GRANT SELECT ON public.design_templates TO authenticated;
GRANT ALL ON public.design_templates TO service_role;

-- ────────────────────────────────────────────────
-- 2) design_documents — disen~os de cada tenant
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.design_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  template_id     UUID REFERENCES public.design_templates(id) ON DELETE SET NULL,
  producto_id     UUID REFERENCES public.productos(id) ON DELETE SET NULL,
  name            TEXT NOT NULL DEFAULT 'Disen~o sin nombre',
  format          TEXT,                       -- copia del template para filtros rapidos
  width           INTEGER,
  height          INTEGER,
  content         JSONB NOT NULL,             -- documento Polotno editable
  thumbnail_url   TEXT,                       -- preview pequen~o (storage)
  rendered_url    TEXT,                       -- imagen final exportada (storage)
  status          TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador','listo','publicado','archivado')),
  generated_by_ai BOOLEAN DEFAULT false,
  ai_prompt       TEXT,                       -- si fue generado con IA
  published_to    TEXT[],                     -- ['instagram','facebook','whatsapp']
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_design_documents_tenant ON public.design_documents(tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_design_documents_status ON public.design_documents(tenant_id, status, updated_at DESC);

ALTER TABLE public.design_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS design_documents_tenant_rw ON public.design_documents;
CREATE POLICY design_documents_tenant_rw ON public.design_documents
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.design_documents TO authenticated;
GRANT ALL ON public.design_documents TO service_role;

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.touch_design_documents_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_design_documents_updated_at ON public.design_documents;
CREATE TRIGGER trg_design_documents_updated_at
  BEFORE UPDATE ON public.design_documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_design_documents_updated_at();

-- ────────────────────────────────────────────────
-- 3) Bucket de Storage para imagenes finales
-- ────────────────────────────────────────────────
-- Esto se debe correr en Supabase Storage manualmente o via API:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('designs', 'designs', true)
--   ON CONFLICT (id) DO NOTHING;
-- (Lo creamos via el dashboard de Storage)

-- ────────────────────────────────────────────────
-- 4) Seed: 10 plantillas iniciales con content placeholder
--    (Polotno schema basico: documento vacio con dimensiones)
--    Los JSON Polotno completos se diseñan en Fase 3 y se cargan
--    via UPDATE separado desde src/data/design-templates/.
-- ────────────────────────────────────────────────
INSERT INTO public.design_templates (slug, name, category, format, width, height, description, variables, sort_order, content) VALUES
  ('oferta-del-dia',            'Oferta del Dia',         'oferta',       'post_square',    1080, 1080, 'Producto destacado con precio rebajado',     ARRAY['producto_nombre','producto_precio_antes','producto_precio_ahora','producto_foto'], 1,  jsonb_build_object('width',1080,'height',1080,'pages',jsonb_build_array(jsonb_build_object('id','p1','children',jsonb_build_array())))),
  ('nuevo-producto',            'Nuevo Producto',         'nuevo',        'post_square',    1080, 1080, 'Anuncio de algo recien llegado',             ARRAY['producto_nombre','producto_descripcion','producto_foto'], 2,                                                                                jsonb_build_object('width',1080,'height',1080,'pages',jsonb_build_array(jsonb_build_object('id','p1','children',jsonb_build_array())))),
  ('promocion-2x1',             'Promocion 2x1',          'promo',        'post_square',    1080, 1080, 'Combos y promociones especiales',            ARRAY['titulo','producto_a','producto_b','producto_foto'], 3,                                                                                      jsonb_build_object('width',1080,'height',1080,'pages',jsonb_build_array(jsonb_build_object('id','p1','children',jsonb_build_array())))),
  ('reposicion-stock',          'Reposicion de Stock',    'reposicion',   'post_square',    1080, 1080, 'Ya disponible otra vez',                     ARRAY['producto_nombre','producto_foto'], 4,                                                                                                       jsonb_build_object('width',1080,'height',1080,'pages',jsonb_build_array(jsonb_build_object('id','p1','children',jsonb_build_array())))),
  ('comunicado-urgente',        'Comunicado',             'comunicado',   'post_square',    1080, 1080, 'Horarios, eventos, anuncios generales',      ARRAY['titulo','mensaje'], 5,                                                                                                                      jsonb_build_object('width',1080,'height',1080,'pages',jsonb_build_array(jsonb_build_object('id','p1','children',jsonb_build_array())))),
  ('comparativa-antes-despues', 'Comparativa',            'comparativa',  'post_landscape', 1200,  630, 'Antes/despues o vs competencia',             ARRAY['titulo','imagen_a','imagen_b'], 6,                                                                                                          jsonb_build_object('width',1200,'height',630, 'pages',jsonb_build_array(jsonb_build_object('id','p1','children',jsonb_build_array())))),
  ('catalogo-grid',             'Catalogo Grid',          'catalogo',     'post_square',    1080, 1080, 'Hasta 4 productos juntos',                   ARRAY['producto_1','producto_2','producto_3','producto_4'], 7,                                                                                     jsonb_build_object('width',1080,'height',1080,'pages',jsonb_build_array(jsonb_build_object('id','p1','children',jsonb_build_array())))),
  ('story-instagram',           'Story Instagram',        'story',        'story_vertical', 1080, 1920, 'Formato vertical para stories',              ARRAY['titulo','imagen','mensaje'], 8,                                                                                                             jsonb_build_object('width',1080,'height',1920,'pages',jsonb_build_array(jsonb_build_object('id','p1','children',jsonb_build_array())))),
  ('banner-negocio',            'Banner Negocio',         'banner',       'post_square',    1080, 1080, 'Info de contacto, horario, ubicacion',       ARRAY['nombre','telefono','direccion','horario'], 9,                                                                                               jsonb_build_object('width',1080,'height',1080,'pages',jsonb_build_array(jsonb_build_object('id','p1','children',jsonb_build_array())))),
  ('agradecimiento-cliente',    'Agradecimiento Cliente', 'agradecimiento','post_square',   1080, 1080, 'Testimonios y agradecimientos',              ARRAY['nombre_cliente','mensaje','foto_opcional'], 10,                                                                                             jsonb_build_object('width',1080,'height',1080,'pages',jsonb_build_array(jsonb_build_object('id','p1','children',jsonb_build_array()))))
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  format = EXCLUDED.format,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  description = EXCLUDED.description,
  variables = EXCLUDED.variables,
  sort_order = EXCLUDED.sort_order,
  -- NO sobreescribimos content si ya tiene un disen~o real (Fase 3+)
  content = CASE
              WHEN public.design_templates.content IS NULL OR public.design_templates.content = '{}'::jsonb
              THEN EXCLUDED.content
              ELSE public.design_templates.content
            END,
  updated_at = NOW();
