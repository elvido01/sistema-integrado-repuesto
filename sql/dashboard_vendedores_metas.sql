-- Dashboard movil para vendedores:
-- 1) Meta mensual por vendedor, definida por gerencia.
-- 2) Productos foco para empujar ventas o rotar inventario.

CREATE TABLE IF NOT EXISTS public.vendedor_metas_mensuales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  periodo DATE NOT NULL,
  meta NUMERIC NOT NULL DEFAULT 0 CHECK (meta >= 0),
  meta_empresa_snapshot NUMERIC DEFAULT 0,
  nota TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, periodo)
);

CREATE INDEX IF NOT EXISTS idx_vendedor_metas_mensuales_tenant_periodo
  ON public.vendedor_metas_mensuales (tenant_id, periodo);

CREATE INDEX IF NOT EXISTS idx_vendedor_metas_mensuales_user_periodo
  ON public.vendedor_metas_mensuales (user_id, periodo);

COMMENT ON TABLE public.vendedor_metas_mensuales IS
  'Metas mensuales individuales para el dashboard movil de vendedores.';

COMMENT ON COLUMN public.vendedor_metas_mensuales.periodo IS
  'Primer dia del mes de la meta. Ejemplo: 2026-06-01.';

CREATE TABLE IF NOT EXISTS public.dashboard_productos_foco (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  producto_id UUID REFERENCES public.productos(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('semana', 'rotacion')),
  titulo TEXT NOT NULL,
  mensaje TEXT,
  objetivo_unidades NUMERIC CHECK (objetivo_unidades IS NULL OR objetivo_unidades >= 0),
  fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_fin DATE,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_productos_foco_tenant_tipo_fecha
  ON public.dashboard_productos_foco (tenant_id, tipo, activo, fecha_inicio, fecha_fin);

COMMENT ON TABLE public.dashboard_productos_foco IS
  'Productos destacados en el dashboard movil: producto de la semana y producto para rotar inventario.';

ALTER TABLE public.vendedor_metas_mensuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_productos_foco ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendedor_metas_select_same_tenant ON public.vendedor_metas_mensuales;
CREATE POLICY vendedor_metas_select_same_tenant
ON public.vendedor_metas_mensuales
FOR SELECT
TO authenticated
USING (
  tenant_id = (
    SELECT p.tenant_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
  )
);

DROP POLICY IF EXISTS vendedor_metas_write_same_tenant ON public.vendedor_metas_mensuales;
CREATE POLICY vendedor_metas_write_same_tenant
ON public.vendedor_metas_mensuales
FOR ALL
TO authenticated
USING (
  tenant_id = (
    SELECT p.tenant_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
  )
)
WITH CHECK (
  tenant_id = (
    SELECT p.tenant_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
  )
);

DROP POLICY IF EXISTS dashboard_productos_foco_select_same_tenant ON public.dashboard_productos_foco;
CREATE POLICY dashboard_productos_foco_select_same_tenant
ON public.dashboard_productos_foco
FOR SELECT
TO authenticated
USING (
  tenant_id = (
    SELECT p.tenant_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
  )
);

DROP POLICY IF EXISTS dashboard_productos_foco_write_same_tenant ON public.dashboard_productos_foco;
CREATE POLICY dashboard_productos_foco_write_same_tenant
ON public.dashboard_productos_foco
FOR ALL
TO authenticated
USING (
  tenant_id = (
    SELECT p.tenant_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
  )
)
WITH CHECK (
  tenant_id = (
    SELECT p.tenant_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
  )
);

DROP TRIGGER IF EXISTS update_vendedor_metas_mensuales_updated_at ON public.vendedor_metas_mensuales;
CREATE TRIGGER update_vendedor_metas_mensuales_updated_at
BEFORE UPDATE ON public.vendedor_metas_mensuales
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_dashboard_productos_foco_updated_at ON public.dashboard_productos_foco;
CREATE TRIGGER update_dashboard_productos_foco_updated_at
BEFORE UPDATE ON public.dashboard_productos_foco
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendedor_metas_mensuales TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_productos_foco TO authenticated, service_role;
