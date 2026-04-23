-- ============================================================
-- INTEGRACIÓN FISCAL MULTI-PROVEEDOR
-- Permite que cada tenant conecte su propia API de facturación
-- electrónica (Alegra, FacturaDigital, etc.)
-- ============================================================

-- 1. Tabla de integraciones fiscales (una por tenant)
CREATE TABLE IF NOT EXISTS public.integraciones_fiscales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  proveedor TEXT NOT NULL DEFAULT 'alegra',  -- alegra, factura_digital, etc.
  config JSONB NOT NULL DEFAULT '{}',        -- credenciales según proveedor
  activo BOOLEAN NOT NULL DEFAULT false,
  modo TEXT NOT NULL DEFAULT 'pruebas',      -- pruebas | produccion
  ultimo_test TIMESTAMPTZ,                   -- última prueba de conexión exitosa
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)                          -- un tenant = una integración activa
);

-- 2. Tabla de documentos fiscales (vincula facturas con emisión fiscal)
CREATE TABLE IF NOT EXISTS public.documentos_fiscales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  factura_id UUID NOT NULL REFERENCES public.facturas(id) ON DELETE CASCADE,
  proveedor TEXT NOT NULL,                    -- alegra, factura_digital, etc.
  tipo_documento TEXT NOT NULL DEFAULT 'factura', -- factura, nota_credito, nota_debito
  estado TEXT NOT NULL DEFAULT 'pendiente',   -- pendiente, procesando, emitido, rechazado, error

  -- Datos del proveedor
  proveedor_invoice_id TEXT,                  -- ID de la factura en el proveedor
  proveedor_number TEXT,                      -- Número asignado por el proveedor
  ncf TEXT,                                   -- NCF / e-NCF generado
  track_id TEXT,                              -- Track ID de la DGII (si aplica)

  -- Payloads para auditoría
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,

  -- Timestamps
  emitted_at TIMESTAMPTZ,
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Agregar columnas de sync a tablas existentes
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS fiscal_contact_id TEXT;  -- ID del contacto en proveedor fiscal

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS fiscal_item_id TEXT;     -- ID del producto en proveedor fiscal

-- 4. Índices
CREATE INDEX IF NOT EXISTS idx_documentos_fiscales_tenant ON public.documentos_fiscales(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documentos_fiscales_factura ON public.documentos_fiscales(factura_id);
CREATE INDEX IF NOT EXISTS idx_documentos_fiscales_estado ON public.documentos_fiscales(estado);
CREATE INDEX IF NOT EXISTS idx_integraciones_fiscales_tenant ON public.integraciones_fiscales(tenant_id);

-- 5. RLS
ALTER TABLE public.integraciones_fiscales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_fiscales ENABLE ROW LEVEL SECURITY;

-- Políticas para integraciones_fiscales (solo admins del tenant)
CREATE POLICY "integ_fiscal_select" ON public.integraciones_fiscales
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "integ_fiscal_insert" ON public.integraciones_fiscales
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "integ_fiscal_update" ON public.integraciones_fiscales
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "integ_fiscal_delete" ON public.integraciones_fiscales
  FOR DELETE TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Políticas para documentos_fiscales (lectura para todos del tenant, escritura via Edge Function)
CREATE POLICY "doc_fiscal_select" ON public.documentos_fiscales
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "doc_fiscal_insert" ON public.documentos_fiscales
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "doc_fiscal_update" ON public.documentos_fiscales
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- 6. Trigger updated_at
CREATE OR REPLACE TRIGGER update_integraciones_fiscales_updated_at
  BEFORE UPDATE ON public.integraciones_fiscales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_documentos_fiscales_updated_at
  BEFORE UPDATE ON public.documentos_fiscales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. Superadmin access (para que tú puedas ver todas las integraciones)
CREATE POLICY "integ_fiscal_superadmin_select" ON public.integraciones_fiscales
  FOR SELECT TO authenticated
  USING (is_superadmin());

CREATE POLICY "doc_fiscal_superadmin_select" ON public.documentos_fiscales
  FOR SELECT TO authenticated
  USING (is_superadmin());
