-- ============================================================
-- FIX 1: Notificaciones — filtrar por tenant
-- FIX 2: Numeración secuencial — tenant-aware
-- ============================================================

-- ──────────────────────────────────────────────────────
-- FIX 1A: RLS en notificaciones
-- ──────────────────────────────────────────────────────
ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE notificaciones SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_select_own" ON notificaciones;
DROP POLICY IF EXISTS "notif_insert_own" ON notificaciones;
DROP POLICY IF EXISTS "notif_update_own" ON notificaciones;
DROP POLICY IF EXISTS "Allow public read access" ON notificaciones;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON notificaciones;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON notificaciones;

CREATE POLICY "notif_select_own" ON notificaciones FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "notif_insert_system" ON notificaciones FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "notif_update_own" ON notificaciones FOR UPDATE TO authenticated
USING (user_id = auth.uid());

-- ──────────────────────────────────────────────────────
-- FIX 1B: fn_notificar_solicitudes_abiertas_diaria — solo notificar al tenant correcto
-- ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_notificar_solicitudes_abiertas_diaria()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _tenant RECORD;
  _usr RECORD;
  _count INTEGER;
  _items TEXT;
BEGIN
  -- Iterar por cada tenant
  FOR _tenant IN SELECT id FROM tenants WHERE activo = true LOOP

    -- Contar solicitudes abiertas de este tenant
    SELECT COUNT(*) INTO _count
    FROM solicitudes_clientes
    WHERE estado = 'abierta'
      AND tenant_id = _tenant.id;

    IF _count = 0 THEN CONTINUE; END IF;

    -- Construir lista de items
    SELECT string_agg(
      COALESCE(sc.cliente_nombre, '') || ' — ' || COALESCE(sc.producto_texto, '') || ' (Cant: ' || sc.cantidad_solicitada || ')',
      E'\n'
    ) INTO _items
    FROM solicitudes_clientes sc
    WHERE sc.estado = 'abierta'
      AND sc.tenant_id = _tenant.id
    LIMIT 10;

    -- Notificar solo a usuarios de ESTE tenant
    FOR _usr IN
      SELECT id FROM profiles WHERE tenant_id = _tenant.id
    LOOP
      -- Evitar duplicados del mismo día
      IF NOT EXISTS (
        SELECT 1 FROM notificaciones
        WHERE user_id = _usr.id
          AND tipo = 'resumen_diario'
          AND created_at::date = CURRENT_DATE
      ) THEN
        INSERT INTO notificaciones (tipo, titulo, mensaje, user_id, tenant_id)
        VALUES (
          'resumen_diario',
          'Resumen diario: ' || _count || ' solicitud(es) abierta(s)',
          'Las siguientes solicitudes siguen pendientes: ' || E'\n' || _items,
          _usr.id,
          _tenant.id
        );
      END IF;
    END LOOP;

  END LOOP;
END;
$$;

-- ──────────────────────────────────────────────────────
-- FIX 1C: fn_stock_trigger — solo notificar al tenant del producto
-- ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_stock_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _sol RECORD;
  _usr RECORD;
  _prod RECORD;
  _tenant_id UUID;
BEGIN
  IF NEW.tipo != 'ENTRADA' THEN RETURN NEW; END IF;

  -- Obtener tenant del producto
  SELECT tenant_id INTO _tenant_id FROM productos WHERE id = NEW.producto_id;
  IF _tenant_id IS NULL THEN RETURN NEW; END IF;

  -- Buscar solicitudes abiertas para este producto en este tenant
  FOR _sol IN
    SELECT sc.id, sc.cliente_nombre, sc.cantidad_solicitada
    FROM solicitudes_clientes sc
    WHERE sc.producto_id = NEW.producto_id
      AND sc.estado = 'abierta'
      AND sc.tenant_id = _tenant_id
  LOOP
    SELECT descripcion INTO _prod FROM productos WHERE id = NEW.producto_id;

    -- Notificar solo a usuarios del mismo tenant
    FOR _usr IN
      SELECT id FROM profiles WHERE tenant_id = _tenant_id
    LOOP
      INSERT INTO notificaciones (tipo, titulo, mensaje, user_id, solicitud_id, producto_id, tenant_id)
      VALUES (
        'stock_disponible',
        'Stock disponible: ' || COALESCE(_prod.descripcion, ''),
        'Cliente: ' || _sol.cliente_nombre || ' solicitó ' || _sol.cantidad_solicitada || ' und.',
        _usr.id,
        _sol.id,
        NEW.producto_id,
        _tenant_id
      );
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$;


-- ──────────────────────────────────────────────────────
-- FIX 2: Numeración secuencial por tenant
-- ──────────────────────────────────────────────────────

-- 2A: get_next_factura_numero — busca MAX para el tenant actual
DROP FUNCTION IF EXISTS get_next_factura_numero();
CREATE OR REPLACE FUNCTION get_next_factura_numero()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant UUID;
  _next BIGINT;
BEGIN
  _tenant := get_user_tenant();

  SELECT COALESCE(MAX(numero), 0) + 1 INTO _next
  FROM facturas
  WHERE tenant_id = _tenant;

  RETURN _next;
END;
$$;

GRANT EXECUTE ON FUNCTION get_next_factura_numero() TO authenticated;

-- 2B: get_next_compra_numero — busca MAX para el tenant actual
DROP FUNCTION IF EXISTS get_next_compra_numero();
CREATE OR REPLACE FUNCTION get_next_compra_numero()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant UUID;
  _next BIGINT;
BEGIN
  _tenant := get_user_tenant();

  SELECT COALESCE(MAX(
    CASE
      WHEN numero ~ '^\d+$' THEN numero::bigint
      WHEN numero ~ '^OC-' THEN REPLACE(numero, 'OC-', '')::bigint
      ELSE 0
    END
  ), 0) + 1 INTO _next
  FROM compras
  WHERE tenant_id = _tenant;

  RETURN 'OC-' || LPAD(_next::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION get_next_compra_numero() TO authenticated;

-- 2C: get_next_orden_compra_numero — busca MAX para el tenant actual
DROP FUNCTION IF EXISTS get_next_orden_compra_numero();
CREATE OR REPLACE FUNCTION get_next_orden_compra_numero()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant UUID;
  _next BIGINT;
BEGIN
  _tenant := get_user_tenant();

  SELECT COALESCE(MAX(
    CASE
      WHEN numero ~ '^\d+$' THEN numero::bigint
      WHEN numero ~ '^ORD-' THEN REPLACE(numero, 'ORD-', '')::bigint
      ELSE 0
    END
  ), 0) + 1 INTO _next
  FROM ordenes_compra
  WHERE tenant_id = _tenant;

  RETURN 'ORD-' || LPAD(_next::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION get_next_orden_compra_numero() TO authenticated;

-- 2D: get_next_cotizacion_numero
DROP FUNCTION IF EXISTS get_next_cotizacion_numero();
CREATE OR REPLACE FUNCTION get_next_cotizacion_numero()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant UUID;
  _next BIGINT;
BEGIN
  _tenant := get_user_tenant();

  SELECT COALESCE(MAX(
    CASE
      WHEN numero ~ '^\d+$' THEN numero::bigint
      WHEN numero ~ '^CT-' THEN REPLACE(numero, 'CT-', '')::bigint
      ELSE 0
    END
  ), 0) + 1 INTO _next
  FROM cotizaciones
  WHERE tenant_id = _tenant;

  RETURN 'CT-' || LPAD(_next::text, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION get_next_cotizacion_numero() TO authenticated;

-- 2E: get_next_entrada_numero
DROP FUNCTION IF EXISTS get_next_entrada_numero();
CREATE OR REPLACE FUNCTION get_next_entrada_numero()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant UUID;
  _next BIGINT;
BEGIN
  _tenant := get_user_tenant();

  SELECT COALESCE(MAX(
    CASE
      WHEN numero ~ '^\d+$' THEN numero::bigint
      WHEN numero ~ '^EN-' THEN REPLACE(numero, 'EN-', '')::bigint
      ELSE 0
    END
  ), 0) + 1 INTO _next
  FROM entradas_inventario
  WHERE tenant_id = _tenant;

  RETURN 'EN-' || LPAD(_next::text, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION get_next_entrada_numero() TO authenticated;

-- 2F: get_next_salida_numero
DROP FUNCTION IF EXISTS get_next_salida_numero();
CREATE OR REPLACE FUNCTION get_next_salida_numero()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant UUID;
  _next BIGINT;
BEGIN
  _tenant := get_user_tenant();

  SELECT COALESCE(MAX(
    CASE
      WHEN numero ~ '^\d+$' THEN numero::bigint
      WHEN numero ~ '^SA-' THEN REPLACE(numero, 'SA-', '')::bigint
      ELSE 0
    END
  ), 0) + 1 INTO _next
  FROM salidas_inventario
  WHERE tenant_id = _tenant;

  RETURN 'SA-' || LPAD(_next::text, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION get_next_salida_numero() TO authenticated;

-- 2G: get_next_recibo_ingreso_numero
DROP FUNCTION IF EXISTS get_next_recibo_ingreso_numero();
CREATE OR REPLACE FUNCTION get_next_recibo_ingreso_numero()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant UUID;
  _next BIGINT;
BEGIN
  _tenant := get_user_tenant();

  SELECT COALESCE(MAX(
    CASE
      WHEN numero ~ '^\d+$' THEN numero::bigint
      WHEN numero ~ '^RI-' THEN REPLACE(numero, 'RI-', '')::bigint
      ELSE 0
    END
  ), 0) + 1 INTO _next
  FROM recibos_ingreso
  WHERE tenant_id = _tenant;

  RETURN 'RI-' || LPAD(_next::text, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION get_next_recibo_ingreso_numero() TO authenticated;

-- 2H: get_next_pago_suplidor_numero
DROP FUNCTION IF EXISTS get_next_pago_suplidor_numero();
CREATE OR REPLACE FUNCTION get_next_pago_suplidor_numero()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant UUID;
  _next BIGINT;
BEGIN
  _tenant := get_user_tenant();

  SELECT COALESCE(MAX(
    CASE
      WHEN numero ~ '^\d+$' THEN numero::bigint
      WHEN numero ~ '^PS-' THEN REPLACE(numero, 'PS-', '')::bigint
      ELSE 0
    END
  ), 0) + 1 INTO _next
  FROM pagos_suplidores
  WHERE tenant_id = _tenant;

  RETURN 'PS-' || LPAD(_next::text, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION get_next_pago_suplidor_numero() TO authenticated;
