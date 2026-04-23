-- ══════════════════════════════════════════════════════════════════
-- Cartas de Ruta (Caminero Motors) - Tabla + RLS
-- ══════════════════════════════════════════════════════════════════

-- 1. Crear tabla cartas_ruta
CREATE TABLE IF NOT EXISTS cartas_ruta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  solicitud_id UUID,
  solicitud_numero TEXT,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Cliente
  cliente_nombre TEXT NOT NULL,
  cliente_cedula TEXT,

  -- Vehículo
  tipo TEXT DEFAULT 'MOTOCICLETA',
  marca TEXT,
  modelo TEXT,
  color TEXT,
  anio INTEGER,
  chasis TEXT NOT NULL,
  motor TEXT,
  placa TEXT DEFAULT 'TRAMITE',
  condicion TEXT DEFAULT 'NUEVA' CHECK (condicion IN ('NUEVA', 'USADA')),

  -- Financiamiento
  inicial NUMERIC(12,2) DEFAULT 0,
  cuota_mensual NUMERIC(12,2) DEFAULT 0,
  tiempo_meses INTEGER DEFAULT 0,
  valor_contado NUMERIC(12,2) DEFAULT 0,
  descripcion_factura TEXT,

  -- Cláusulas
  clausulas TEXT,

  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID DEFAULT auth.uid()
);

-- 2. Habilitar RLS
ALTER TABLE cartas_ruta ENABLE ROW LEVEL SECURITY;

-- 3. Políticas RLS
DROP POLICY IF EXISTS "cartas_ruta_tenant_select" ON cartas_ruta;
CREATE POLICY "cartas_ruta_tenant_select" ON cartas_ruta
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "cartas_ruta_tenant_insert" ON cartas_ruta;
CREATE POLICY "cartas_ruta_tenant_insert" ON cartas_ruta
  FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "cartas_ruta_tenant_update" ON cartas_ruta;
CREATE POLICY "cartas_ruta_tenant_update" ON cartas_ruta
  FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "cartas_ruta_tenant_delete" ON cartas_ruta;
CREATE POLICY "cartas_ruta_tenant_delete" ON cartas_ruta
  FOR DELETE USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "cartas_ruta_superadmin" ON cartas_ruta;
CREATE POLICY "cartas_ruta_superadmin" ON cartas_ruta
  FOR ALL USING (is_superadmin());

-- 4. Función y Trigger auto updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_cartas_ruta ON cartas_ruta;
CREATE TRIGGER set_updated_at_cartas_ruta
  BEFORE UPDATE ON cartas_ruta
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. Índices
CREATE INDEX IF NOT EXISTS idx_cartas_ruta_tenant ON cartas_ruta(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cartas_ruta_chasis ON cartas_ruta(chasis);
CREATE INDEX IF NOT EXISTS idx_cartas_ruta_solicitud ON cartas_ruta(solicitud_id);
CREATE INDEX IF NOT EXISTS idx_cartas_ruta_fecha ON cartas_ruta(fecha DESC);

-- ══════════════════════════════════════════════════════════════════
-- Migración: vincular cartas_ruta con facturas/ventas
-- ══════════════════════════════════════════════════════════════════

-- 6. Agregar columnas para vincular con la venta
ALTER TABLE cartas_ruta ADD COLUMN IF NOT EXISTS venta_id UUID;
ALTER TABLE cartas_ruta ADD COLUMN IF NOT EXISTS venta_numero TEXT;
ALTER TABLE cartas_ruta ADD COLUMN IF NOT EXISTS fecha_emision_original DATE DEFAULT CURRENT_DATE;

-- 7. Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_cartas_ruta_venta ON cartas_ruta(venta_id);
CREATE INDEX IF NOT EXISTS idx_cartas_ruta_venta_numero ON cartas_ruta(venta_numero);
CREATE INDEX IF NOT EXISTS idx_cartas_ruta_cedula ON cartas_ruta(cliente_cedula);
CREATE INDEX IF NOT EXISTS idx_cartas_ruta_nombre ON cartas_ruta(cliente_nombre);

-- 8. Una venta solo puede tener UNA carta de ruta (1:1)
--    Nota: cada motocicleta = una venta individual
ALTER TABLE cartas_ruta
  DROP CONSTRAINT IF EXISTS cartas_ruta_venta_unique;
ALTER TABLE cartas_ruta
  ADD CONSTRAINT cartas_ruta_venta_unique UNIQUE (venta_id);
