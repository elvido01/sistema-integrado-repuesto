-- ============================================================
-- MÓDULO: Solicitudes por Producto Agotado
-- Migración completa — pegar en Supabase SQL Editor
-- ============================================================

-- 1. TABLA: solicitudes_clientes
CREATE TABLE IF NOT EXISTS public.solicitudes_clientes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- Cliente (uno de los dos bloques)
  cliente_id       uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nombre   text,
  cliente_telefono text,

  -- Producto (uno de los dos bloques)
  producto_id      uuid REFERENCES public.productos(id) ON DELETE SET NULL,
  producto_texto   text,

  cantidad_solicitada numeric,
  notas               text,

  estado text NOT NULL DEFAULT 'abierta'
    CHECK (estado IN ('abierta','notificada','cerrada')),

  creado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Índices útiles
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado      ON public.solicitudes_clientes(estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_producto_id ON public.solicitudes_clientes(producto_id);

-- 2. TABLA: notificaciones
CREATE TABLE IF NOT EXISTS public.notificaciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),

  tipo       text NOT NULL DEFAULT 'stock_disponible',
  titulo     text NOT NULL,
  mensaje    text,

  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  solicitud_id  uuid REFERENCES public.solicitudes_clientes(id) ON DELETE CASCADE,
  producto_id   uuid REFERENCES public.productos(id) ON DELETE SET NULL,

  visto_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_user_visto ON public.notificaciones(user_id, visto_at);

-- 3. RLS — solicitudes_clientes
ALTER TABLE public.solicitudes_clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solicitudes_select" ON public.solicitudes_clientes
  FOR SELECT USING (true);

CREATE POLICY "solicitudes_insert" ON public.solicitudes_clientes
  FOR INSERT WITH CHECK (auth.uid() = creado_por);

CREATE POLICY "solicitudes_update" ON public.solicitudes_clientes
  FOR UPDATE USING (true);

-- 4. RLS — notificaciones
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notificaciones_select" ON public.notificaciones
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notificaciones_update" ON public.notificaciones
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "notificaciones_insert" ON public.notificaciones
  FOR INSERT WITH CHECK (true);   -- el trigger inserta con SECURITY DEFINER

-- 5. FUNCIÓN + TRIGGER — detección automática de reingreso de stock
CREATE OR REPLACE FUNCTION public.fn_check_stock_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sol     RECORD;
  _usr     RECORD;
  _stock   numeric;
  _desc    text;
BEGIN
  -- Solo procesar entradas positivas
  IF NEW.tipo <> 'ENTRADA' OR NEW.cantidad <= 0 THEN
    RETURN NEW;
  END IF;

  -- ¿Hay solicitudes abiertas para este producto?
  IF NOT EXISTS (
    SELECT 1 FROM solicitudes_clientes
    WHERE producto_id = NEW.producto_id
      AND estado = 'abierta'
  ) THEN
    RETURN NEW;
  END IF;

  -- Calcular stock actual (reutilizamos la función existente)
  SELECT get_stock_actual(NEW.producto_id) INTO _stock;

  -- Si stock sigue <= 0 no hacer nada
  IF _stock IS NULL OR _stock <= 0 THEN
    RETURN NEW;
  END IF;

  -- Obtener descripción del producto
  SELECT descripcion INTO _desc
    FROM productos WHERE id = NEW.producto_id;

  -- Recorrer solicitudes abiertas de este producto
  FOR _sol IN
    SELECT id, cliente_nombre, cliente_id
      FROM solicitudes_clientes
     WHERE producto_id = NEW.producto_id
       AND estado = 'abierta'
  LOOP
    -- Insertar notificación para CADA usuario del sistema
    FOR _usr IN
      SELECT id FROM profiles
    LOOP
      INSERT INTO notificaciones (tipo, titulo, mensaje, user_id, solicitud_id, producto_id)
      VALUES (
        'stock_disponible',
        '¡Producto disponible!',
        'El producto "' || COALESCE(_desc, 'N/D') || '" ya tiene stock (' || _stock || ' uds). '
          || 'Solicitado por: ' || COALESCE(
              (SELECT nombre FROM clientes WHERE id = _sol.cliente_id),
              _sol.cliente_nombre,
              'Desconocido'
            ),
        _usr.id,
        _sol.id,
        NEW.producto_id
      );
    END LOOP;

    -- Marcar solicitud como notificada
    UPDATE solicitudes_clientes SET estado = 'notificada' WHERE id = _sol.id;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Trigger
DROP TRIGGER IF EXISTS trg_stock_reentry_notify ON public.inventario_movimientos;
CREATE TRIGGER trg_stock_reentry_notify
  AFTER INSERT ON public.inventario_movimientos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_check_stock_notify();

-- 6. Habilitar Realtime para notificaciones
ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;
