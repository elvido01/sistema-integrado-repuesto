-- ============================================================
-- MÓDULO: Notificaciones de Créditos Vencidos
-- Migración — pegar en Supabase SQL Editor y ejecutar
-- ============================================================

-- 1. Agregar columna cliente_id a notificaciones (para saber a qué cliente pertenece)
--    Se omite REFERENCES para compatibilidad entre entornos con esquemas diferentes.
ALTER TABLE public.notificaciones
  ADD COLUMN IF NOT EXISTS cliente_id uuid;

CREATE INDEX IF NOT EXISTS idx_notificaciones_cliente_id
  ON public.notificaciones(cliente_id);

CREATE INDEX IF NOT EXISTS idx_notificaciones_tipo_fecha
  ON public.notificaciones(tipo, created_at);

-- 2. FUNCIÓN: Revisa créditos vencidos y genera notificaciones
--    Se llama desde el frontend una vez por sesión/día.
--    No genera duplicados: verifica si ya existe notificación hoy para ese cliente+usuario.
CREATE OR REPLACE FUNCTION public.fn_check_creditos_vencidos(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cliente RECORD;
  _hoy date := CURRENT_DATE;
  _count integer := 0;
  _tenant uuid;
BEGIN
  -- Obtener tenant_id del usuario
  SELECT tenant_id INTO _tenant FROM profiles WHERE id = p_user_id;
  IF _tenant IS NULL THEN
    RETURN 0;
  END IF;

  -- Buscar clientes con facturas de crédito vencidas y saldo pendiente
  FOR _cliente IN
    SELECT 
      c.id AS cliente_id,
      c.nombre AS cliente_nombre,
      c.telefono AS cliente_telefono,
      COUNT(f.id) AS num_facturas_vencidas,
      SUM(f.monto_pendiente) AS total_pendiente
    FROM facturas f
    JOIN clientes c ON c.id = f.cliente_id
    WHERE f.monto_pendiente > 0
      AND f.dias_credito > 0
      AND f.fecha IS NOT NULL
      AND (f.fecha::date + f.dias_credito) < _hoy
      AND c.tenant_id = _tenant
      -- Evitar duplicados: no crear si ya existe notificación HOY para este cliente+usuario
      AND NOT EXISTS (
        SELECT 1 FROM notificaciones n
        WHERE n.tipo = 'credito_vencido'
          AND n.cliente_id = c.id
          AND n.user_id = p_user_id
          AND n.created_at::date = _hoy
      )
    GROUP BY c.id, c.nombre, c.telefono
  LOOP
    INSERT INTO notificaciones (tipo, titulo, mensaje, user_id, cliente_id, tenant_id)
    VALUES (
      'credito_vencido',
      '⚠️ Crédito Vencido: ' || _cliente.cliente_nombre,
      _cliente.num_facturas_vencidas || ' factura(s) vencida(s) — Total pendiente: RD$ ' || 
        TO_CHAR(_cliente.total_pendiente, 'FM999,999,990.00') || 
        CASE 
          WHEN _cliente.cliente_telefono IS NOT NULL AND _cliente.cliente_telefono <> '' 
          THEN ' — Tel: ' || _cliente.cliente_telefono 
          ELSE '' 
        END,
      p_user_id,
      _cliente.cliente_id,
      _tenant
    );
    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;

-- 3. Permisos para que usuarios autenticados puedan ejecutar la función
GRANT EXECUTE ON FUNCTION public.fn_check_creditos_vencidos(uuid) TO authenticated;
