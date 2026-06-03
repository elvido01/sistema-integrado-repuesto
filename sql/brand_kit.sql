-- ============================================================
-- Brand Kit — Identidad visual del negocio (multi-tenant)
-- ============================================================
-- Permite que cada cliente del SaaS guarde su logo, paleta de
-- colores, tipografias y eslogan. Se usa en el modulo Disen~o
-- Pro para insertar el logo y aplicar colores con un click.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.brand_kit (
  tenant_id    UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre       TEXT,
  eslogan      TEXT,
  logo_url     TEXT,
  -- Hasta 8 colores hex (#rrggbb). Primer color = primario.
  colores      TEXT[] DEFAULT ARRAY[]::TEXT[],
  -- Tipografias preferidas (nombres de fuente Google Fonts u otras).
  fuente_titulos TEXT,
  fuente_cuerpo  TEXT,
  -- Datos de contacto que aparecen en plantillas tipo banner/footer.
  telefono     TEXT,
  direccion    TEXT,
  horario      TEXT,
  website      TEXT,
  instagram    TEXT,
  facebook     TEXT,
  whatsapp     TEXT,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.brand_kit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brand_kit_tenant_rw ON public.brand_kit;
CREATE POLICY brand_kit_tenant_rw ON public.brand_kit
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_kit TO authenticated;
GRANT ALL ON public.brand_kit TO service_role;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_brand_kit_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_brand_kit_updated_at ON public.brand_kit;
CREATE TRIGGER trg_brand_kit_updated_at
  BEFORE UPDATE ON public.brand_kit
  FOR EACH ROW EXECUTE FUNCTION public.touch_brand_kit_updated_at();

-- Seed: para Repuestos Morla, valores que ya tiene la empresa.
INSERT INTO public.brand_kit (tenant_id, nombre, eslogan, colores, telefono, direccion, horario)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'REPUESTOS MORLA',
  'Tu repuesto de confianza',
  ARRAY['#dc2626','#0f172a','#facc15','#ffffff','#10b981','#06b6d4']::TEXT[],
  '809-390-5965',
  'Av. Duarte, esq. Baldemiro Rijo, Higuey, Rep. Dom.',
  'Lun-Sab 8am - 6pm'
)
ON CONFLICT (tenant_id) DO NOTHING;
