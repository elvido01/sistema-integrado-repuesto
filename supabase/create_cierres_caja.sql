-- =============================================
-- Tabla: cierres_caja
-- Almacena los cierres de caja diarios
-- =============================================

CREATE TABLE IF NOT EXISTS cierres_caja (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha DATE NOT NULL,
  turno INTEGER NOT NULL DEFAULT 1,
  cajero_id UUID REFERENCES auth.users(id),
  cajero_nombre TEXT,
  total_ventas NUMERIC(12,2) DEFAULT 0,
  total_ventas_contado NUMERIC(12,2) DEFAULT 0,
  total_ventas_credito NUMERIC(12,2) DEFAULT 0,
  total_itbis NUMERIC(12,2) DEFAULT 0,
  total_descuento NUMERIC(12,2) DEFAULT 0,
  total_devoluciones NUMERIC(12,2) DEFAULT 0,
  total_recibos NUMERIC(12,2) DEFAULT 0,
  cambio_entregado NUMERIC(12,2) DEFAULT 0,
  efectivo_en_caja NUMERIC(12,2) DEFAULT 0,
  total_desglose NUMERIC(12,2) DEFAULT 0,
  diferencia NUMERIC(12,2) DEFAULT 0,
  desglose JSONB DEFAULT '{}',
  usuario_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE cierres_caja ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cierres_caja"
  ON cierres_caja FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert cierres_caja"
  ON cierres_caja FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update cierres_caja"
  ON cierres_caja FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
