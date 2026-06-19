-- =============================================
-- Gastos diarios
-- Salidas de efectivo registradas directamente desde el dashboard.
-- =============================================

CREATE TABLE IF NOT EXISTS public.gastos_diarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo_gasto TEXT NOT NULL DEFAULT 'Operativo',
  monto NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monto >= 0),
  descripcion TEXT NOT NULL,
  usuario_id UUID REFERENCES auth.users(id),
  anulado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gastos_diarios_tenant_fecha
  ON public.gastos_diarios (tenant_id, fecha);

ALTER TABLE public.gastos_diarios
  ADD COLUMN IF NOT EXISTS tipo_gasto TEXT NOT NULL DEFAULT 'Operativo';

CREATE INDEX IF NOT EXISTS idx_gastos_diarios_tenant_tipo
  ON public.gastos_diarios (tenant_id, tipo_gasto);

ALTER TABLE public.gastos_diarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant users can read gastos_diarios" ON public.gastos_diarios;
CREATE POLICY "Tenant users can read gastos_diarios"
  ON public.gastos_diarios FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Tenant users can insert gastos_diarios" ON public.gastos_diarios;
CREATE POLICY "Tenant users can insert gastos_diarios"
  ON public.gastos_diarios FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Tenant users can update gastos_diarios" ON public.gastos_diarios;
CREATE POLICY "Tenant users can update gastos_diarios"
  ON public.gastos_diarios FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gastos_diarios TO authenticated;

ALTER TABLE public.cierres_caja
  ADD COLUMN IF NOT EXISTS total_gastos_diarios NUMERIC(12,2) DEFAULT 0;
