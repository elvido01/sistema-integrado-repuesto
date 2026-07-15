-- =====================================================================
-- DETECTOR DE LLEGADA — solicitudes de piezas agotadas
-- ---------------------------------------------------------------------
-- Cuando un cliente pide una pieza que no hay (solicitudes_clientes,
-- estado 'abierta'/'solicitado'), este detector avisa SOLO cuando esa
-- pieza vuelve a haber en existencia, para que le des seguimiento al
-- cliente y cierres la venta.
--
-- El stock NO es una columna: existencia = SUMA del kardex
-- public.inventario_movimientos (ENTRADA/SALIDA, cantidad con signo).
-- Por eso el detector se pega al kardex: cualquier entrada real de
-- mercancía (compra, ajuste, devolución) dispara la detección, venga de
-- donde venga (web, extensión, móvil).
--
-- Qué hace al detectar la llegada:
--   1) Sella la solicitud: available_at, notification_created_at, estado='notificada'.
--   2) Crea una notificación PERSISTENTE (campana, tipo 'stock_disponible')
--      para el equipo del tenant — te recuerda después, no se esfuma.
--
-- Idempotente: solo actúa donde available_at IS NULL y no duplica
-- notificaciones. Filtra migración histórica (legacy_id) para no spamear.
-- =====================================================================

BEGIN;

-- ------------------------------------------------------------
-- 0) Índice para que el trigger sea barato (busca por producto abierto)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_solicitudes_open_producto
  ON public.solicitudes_clientes (tenant_id, producto_id)
  WHERE estado IN ('abierta', 'solicitado') AND producto_id IS NOT NULL;

-- ------------------------------------------------------------
-- 1) Helper compartido: sella una solicitud + notifica al equipo
--    Usado por el trigger (caso código) y por la RPC (caso texto libre).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._notificar_llegada_solicitud(
  p_sol_id uuid,
  p_tenant uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_sol   record;
  v_desc  text;
BEGIN
  -- Bloqueo de la fila para evitar doble notificación en concurrencia
  SELECT *
    INTO v_sol
  FROM public.solicitudes_clientes
  WHERE id = p_sol_id
    AND tenant_id = p_tenant
    AND available_at IS NULL
    AND estado IN ('abierta', 'solicitado')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_sol.producto_id IS NOT NULL THEN
    SELECT descripcion INTO v_desc FROM public.productos WHERE id = v_sol.producto_id;
  END IF;
  v_desc := COALESCE(NULLIF(BTRIM(v_desc), ''), NULLIF(BTRIM(v_sol.producto_texto), ''), 'Producto');

  UPDATE public.solicitudes_clientes
     SET available_at            = now(),
         notification_created_at = now(),
         estado                  = 'notificada'
   WHERE id = p_sol_id;

  -- Notificación persistente para todos los usuarios del tenant
  -- (equipo pequeño; garantiza que el dueño la vea). Sin duplicar.
  INSERT INTO public.notificaciones (tipo, titulo, mensaje, user_id, solicitud_id, producto_id, tenant_id)
  SELECT
    'stock_disponible',
    '📦 Llegó pieza pedida: ' || v_desc,
    'Cliente: ' || COALESCE(NULLIF(BTRIM(v_sol.cliente_nombre), ''), NULLIF(BTRIM(v_sol.customer_name_snapshot), ''), 'sin registrar')
      || ' pidió ' || COALESCE(v_sol.cantidad_solicitada, 1)
      || ' und. Ya hay existencia — dale seguimiento para cerrar la venta.',
    pr.id,
    v_sol.id,
    v_sol.producto_id,
    p_tenant
  FROM public.profiles pr
  WHERE pr.tenant_id = p_tenant
    AND NOT EXISTS (
      SELECT 1 FROM public.notificaciones n
      WHERE n.solicitud_id = v_sol.id
        AND n.tipo = 'stock_disponible'
        AND n.user_id = pr.id
    );

  RETURN true;
END;
$$;

-- ------------------------------------------------------------
-- 2) Trigger de detección sobre el kardex
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_detectar_llegada_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- El WHEN del trigger ya filtra cantidad>0, producto_id y no-migración.
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_id IN
    SELECT id
    FROM public.solicitudes_clientes
    WHERE tenant_id = NEW.tenant_id
      AND producto_id = NEW.producto_id
      AND estado IN ('abierta', 'solicitado')
      AND available_at IS NULL
  LOOP
    PERFORM public._notificar_llegada_solicitud(v_id, NEW.tenant_id);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_detectar_llegada_stock ON public.inventario_movimientos;
CREATE TRIGGER trg_detectar_llegada_stock
AFTER INSERT ON public.inventario_movimientos
FOR EACH ROW
WHEN (NEW.cantidad > 0 AND NEW.producto_id IS NOT NULL AND NEW.legacy_id IS NULL)
EXECUTE FUNCTION public.fn_detectar_llegada_stock();

-- ------------------------------------------------------------
-- 3) RPC para el caso "texto libre" (pieza sin código en el catálogo)
--    La página de Compras la llama con las solicitudes que casó por
--    descripción/notas al guardar la factura de compra.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_llegada_solicitudes(p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_id uuid;
  v_count int := 0;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar tenant activo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'notificadas', 0);
  END IF;

  FOREACH v_id IN ARRAY p_ids LOOP
    IF public._notificar_llegada_solicitud(v_id, v_tenant) THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'notificadas', v_count);
END;
$$;

-- ------------------------------------------------------------
-- 4) RPC para cerrar el ciclo: "ya le avisé al cliente"
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marcar_cliente_avisado(p_solicitud_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_user uuid := auth.uid();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar tenant activo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.solicitudes_clientes
     SET customer_notified_at = now(),
         notified_by = v_user
   WHERE id = p_solicitud_id
     AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solicitud no encontrada');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ------------------------------------------------------------
-- 5) Vista para HERMES: piezas que llegaron y falta avisar al cliente
--    security_invoker=true → un usuario normal ve solo su empresa;
--    Hermes (service_role por psycopg2) filtra por tenant_id.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.hermes_llegadas_pendientes
WITH (security_invoker = true) AS
SELECT
  sc.tenant_id,
  ce.nombre                                                      AS empresa,
  sc.id                                                          AS solicitud_id,
  sc.cliente_id,
  COALESCE(cl.nombre, sc.cliente_nombre, sc.customer_name_snapshot) AS cliente,
  COALESCE(cl.telefono, sc.cliente_telefono, sc.phone_normalized)   AS telefono,
  sc.producto_id,
  COALESCE(p.descripcion, sc.producto_texto)                     AS producto,
  p.codigo,
  sc.cantidad_solicitada,
  sc.available_at,
  round(extract(epoch FROM (now() - sc.available_at)) / 3600.0, 1) AS horas_desde_llegada,
  sc.source_channel,
  sc.source_conversation_id,
  sc.notas
FROM public.solicitudes_clientes sc
LEFT JOIN public.productos p ON p.id = sc.producto_id
LEFT JOIN public.clientes cl ON cl.id = sc.cliente_id
LEFT JOIN public.config_empresa ce ON ce.tenant_id = sc.tenant_id
WHERE sc.estado = 'notificada'
  AND sc.available_at IS NOT NULL
  AND sc.customer_notified_at IS NULL
ORDER BY sc.available_at ASC;

-- ------------------------------------------------------------
-- 6) Permisos
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public._notificar_llegada_solicitud(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._notificar_llegada_solicitud(uuid, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.registrar_llegada_solicitudes(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.marcar_cliente_avisado(uuid) TO authenticated, service_role;

GRANT SELECT ON public.hermes_llegadas_pendientes TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('detector_llegada_solicitudes.sql');
  END IF;
END $$;

COMMIT;

SELECT 'detector_llegada_solicitudes listo (trigger kardex + notificación + vista Hermes)' AS status;
