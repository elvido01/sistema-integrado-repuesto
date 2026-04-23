-- ═���═════════════════════════════════════════════════════════════════
-- Solicitudes de Compras (Caminero Motors) - Tabla + RLS + Triggers
-- ══════════════════════���════════════════════════════════════════════

-- 1. Agregar campos de vehículo a productos (nullable, solo se usan para motos)
ALTER TABLE productos ADD COLUMN IF NOT EXISTS chasis TEXT;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS motor TEXT;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS anio INTEGER;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS condicion TEXT DEFAULT 'NUEVA';

-- 2. Crear tabla solicitudes_compras
CREATE TABLE IF NOT EXISTS solicitudes_compras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  numero BIGINT GENERATED ALWAYS AS IDENTITY,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  estado TEXT NOT NULL DEFAULT 'Pendiente'
    CHECK (estado IN ('Pendiente', 'Aprobada', 'Facturando', 'Completada', 'Anulada')),

  -- Cliente
  cliente_id UUID REFERENCES clientes(id),
  cliente_nombre TEXT,
  cliente_rnc TEXT,

  -- Vehículo (auto-llenado desde producto)
  producto_id UUID REFERENCES productos(id),
  chasis TEXT,
  motor TEXT,
  marca TEXT,
  modelo TEXT,
  color TEXT,
  anio INTEGER,
  condicion TEXT DEFAULT 'NUEVA' CHECK (condicion IN ('NUEVA', 'USADA')),

  -- Financiamiento
  valor_contado NUMERIC(12,2) DEFAULT 0,
  inicial NUMERIC(12,2) DEFAULT 0,
  financiamiento NUMERIC(12,2) DEFAULT 0,
  adicional NUMERIC(12,2) DEFAULT 0,
  tiempo_meses INTEGER DEFAULT 0,
  tasa_interes NUMERIC(5,2) DEFAULT 0,
  total_pagares NUMERIC(12,2) DEFAULT 0,
  cuota_mensual NUMERIC(12,2) DEFAULT 0,
  fecha_vencimiento DATE,
  incluye_placa BOOLEAN DEFAULT false,

  -- Meta
  vendedor_id UUID,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID DEFAULT auth.uid()
);

-- 3. Habilitar RLS
ALTER TABLE solicitudes_compras ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS
DROP POLICY IF EXISTS "solicitudes_compras_tenant_select" ON solicitudes_compras;
CREATE POLICY "solicitudes_compras_tenant_select" ON solicitudes_compras
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "solicitudes_compras_tenant_insert" ON solicitudes_compras;
CREATE POLICY "solicitudes_compras_tenant_insert" ON solicitudes_compras
  FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "solicitudes_compras_tenant_update" ON solicitudes_compras;
CREATE POLICY "solicitudes_compras_tenant_update" ON solicitudes_compras
  FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "solicitudes_compras_tenant_delete" ON solicitudes_compras;
CREATE POLICY "solicitudes_compras_tenant_delete" ON solicitudes_compras
  FOR DELETE USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "solicitudes_compras_superadmin" ON solicitudes_compras;
CREATE POLICY "solicitudes_compras_superadmin" ON solicitudes_compras
  FOR ALL USING (is_superadmin());

-- 5. Trigger auto updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_solicitudes_compras ON solicitudes_compras;
CREATE TRIGGER set_updated_at_solicitudes_compras
  BEFORE UPDATE ON solicitudes_compras
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 6. Índices
CREATE INDEX IF NOT EXISTS idx_solicitudes_compras_tenant ON solicitudes_compras(tenant_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_compras_estado ON solicitudes_compras(estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_compras_fecha ON solicitudes_compras(fecha DESC);

-- 7. Compatibilidad: si la tabla ya existe sin cliente_rnc, agregarla
ALTER TABLE solicitudes_compras ADD COLUMN IF NOT EXISTS cliente_rnc TEXT;

NOTIFY pgrst, 'reload schema';
