-- ============================================================
-- Tabla: secuencias_ncf
-- Gestión de Números de Comprobantes Fiscales (DGII - RD)
-- Compatible con el sistema multi-tenant (usa get_user_tenant())
-- ============================================================

CREATE TABLE IF NOT EXISTS secuencias_ncf (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) DEFAULT public.get_user_tenant(),

  -- Datos de la secuencia
  tipo_ncf VARCHAR(2) NOT NULL,          -- 01, 02, 03, 04, 11, 12, 13, 14, 15, 16, 17
  serie VARCHAR(5) NOT NULL DEFAULT '',   -- Ej: "B"
  secuencia_desde INTEGER NOT NULL,       -- Ej: 222
  secuencia_hasta INTEGER NOT NULL,       -- Ej: 500
  ultimo_emitido INTEGER NOT NULL DEFAULT 0, -- Último NCF emitido (editable para saltar)

  -- Fechas
  fecha_solicitud DATE NOT NULL,
  fecha_vencimiento DATE NOT NULL,

  -- Nombre comercial bajo el cual se emiten
  nombre_emisor VARCHAR(200) NOT NULL,    -- Por defecto el nombre de la empresa

  -- Alerta
  alerta_cuando_queden INTEGER DEFAULT 10, -- Notificar cuando queden X comprobantes

  -- Estado
  activo BOOLEAN DEFAULT true,

  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_secuencias_ncf_tenant ON secuencias_ncf(tenant_id);
CREATE INDEX IF NOT EXISTS idx_secuencias_ncf_tipo ON secuencias_ncf(tipo_ncf, activo);

-- RLS
ALTER TABLE secuencias_ncf ENABLE ROW LEVEL SECURITY;

-- Políticas usando get_user_tenant() (patrón estándar del sistema)
CREATE POLICY "tenant_select_secuencias_ncf" ON secuencias_ncf
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant());

CREATE POLICY "tenant_insert_secuencias_ncf" ON secuencias_ncf
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant());

CREATE POLICY "tenant_update_secuencias_ncf" ON secuencias_ncf
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

CREATE POLICY "tenant_delete_secuencias_ncf" ON secuencias_ncf
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant());

-- ============================================================
-- Función: get_next_ncf
-- Obtiene el siguiente NCF disponible y actualiza ultimo_emitido
-- ============================================================
CREATE OR REPLACE FUNCTION get_next_ncf(p_tipo_ncf VARCHAR)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_secuencia secuencias_ncf%ROWTYPE;
  v_siguiente INTEGER;
  v_ncf_completo VARCHAR;
  v_restantes INTEGER;
  v_tenant UUID;
BEGIN
  -- Obtener tenant del usuario actual
  v_tenant := public.get_user_tenant();

  -- Buscar la secuencia activa para este tipo
  SELECT * INTO v_secuencia
  FROM secuencias_ncf
  WHERE tipo_ncf = p_tipo_ncf
    AND activo = true
    AND fecha_vencimiento >= CURRENT_DATE
    AND tenant_id = v_tenant
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE; -- Lock the row

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No hay secuencia NCF activa para el tipo ' || p_tipo_ncf);
  END IF;

  -- Calcular el siguiente número
  IF v_secuencia.ultimo_emitido = 0 OR v_secuencia.ultimo_emitido < v_secuencia.secuencia_desde THEN
    v_siguiente := v_secuencia.secuencia_desde;
  ELSE
    v_siguiente := v_secuencia.ultimo_emitido + 1;
  END IF;

  -- Verificar que no exceda el rango
  IF v_siguiente > v_secuencia.secuencia_hasta THEN
    RETURN json_build_object('success', false, 'error', 'La secuencia NCF tipo ' || p_tipo_ncf || ' se ha agotado');
  END IF;

  -- Construir el NCF completo: B + tipo_ncf + número con padding a 8 dígitos
  v_ncf_completo := v_secuencia.serie || p_tipo_ncf || LPAD(v_siguiente::TEXT, 8, '0');

  -- Actualizar el último emitido
  UPDATE secuencias_ncf
  SET ultimo_emitido = v_siguiente,
      updated_at = NOW()
  WHERE id = v_secuencia.id;

  -- Calcular restantes
  v_restantes := v_secuencia.secuencia_hasta - v_siguiente;

  RETURN json_build_object(
    'success', true,
    'ncf', v_ncf_completo,
    'numero', v_siguiente,
    'restantes', v_restantes,
    'alerta_cuando_queden', v_secuencia.alerta_cuando_queden,
    'nombre_emisor', v_secuencia.nombre_emisor,
    'secuencia_id', v_secuencia.id
  );
END;
$$;
