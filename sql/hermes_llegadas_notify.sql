-- =====================================================================
-- AVISO EN TIEMPO REAL A HERMES CUANDO LLEGA MERCANCÍA PEDIDA
-- ---------------------------------------------------------------------
-- La DETECCIÓN ya es automática: el trigger del kardex
-- (detector_llegada_solicitudes.sql) marca la solicitud con
-- estado='notificada' con CUALQUIER entrada de mercancía (compra, ajuste,
-- devolución), sin botones. Lo que faltaba era el empuje hacia Hermes:
-- hasta ahora Hermes solo se enteraba si consultaba la vista.
--
-- Este script agrega un trigger sobre solicitudes_clientes que, en el
-- momento en que una solicitud pasa a 'notificada', publica un aviso por
-- el canal Postgres 'hermes_llegadas' (LISTEN/NOTIFY) con los datos para
-- redactar el mensaje al cliente. Hermes lo escucha por la MISMA conexión
-- psycopg2 que ya usa (LISTEN funciona con hermes_readonly; no requiere
-- permisos de escritura).
--
-- Payload (JSON): evento, solicitud_id, tenant_id, empresa, cliente,
-- telefono, producto, codigo, cantidad, available_at.
-- ⚠ El canal es global: llegan avisos de TODOS los tenants → Hermes debe
--   ignorar los payload con tenant_id distinto de Morla.
-- El aviso se entrega al hacer COMMIT la entrada (no hay falsos avisos de
-- transacciones que se revierten). Si Hermes estaba desconectado, se pone
-- al día consultando hermes.hermes_llegadas_pendientes al reconectar.
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.hermes_notify_llegada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  SELECT jsonb_build_object(
    'evento',       'llegada_solicitud',
    'solicitud_id', NEW.id,
    'tenant_id',    NEW.tenant_id,
    'empresa',      ce.nombre,
    'cliente',      COALESCE(cl.nombre, NEW.cliente_nombre, NEW.customer_name_snapshot),
    'telefono',     COALESCE(cl.telefono, NEW.cliente_telefono, NEW.phone_normalized),
    'producto',     COALESCE(p.descripcion, NEW.producto_texto),
    'codigo',       p.codigo,
    'cantidad',     NEW.cantidad_solicitada,
    'available_at', NEW.available_at
  )
  INTO v_payload
  FROM (SELECT 1) _
  LEFT JOIN public.productos p       ON p.id = NEW.producto_id
  LEFT JOIN public.clientes cl       ON cl.id = NEW.cliente_id
  LEFT JOIN public.config_empresa ce ON ce.tenant_id = NEW.tenant_id;

  PERFORM pg_notify('hermes_llegadas', v_payload::text);
  RETURN NEW;
END;
$$;

-- Dispara solo en la TRANSICIÓN a 'notificada' (no en re-updates de la fila)
DROP TRIGGER IF EXISTS trg_hermes_notify_llegada_upd ON public.solicitudes_clientes;
CREATE TRIGGER trg_hermes_notify_llegada_upd
  AFTER UPDATE OF estado ON public.solicitudes_clientes
  FOR EACH ROW
  WHEN (NEW.estado = 'notificada' AND OLD.estado IS DISTINCT FROM 'notificada')
  EXECUTE FUNCTION public.hermes_notify_llegada();

DROP TRIGGER IF EXISTS trg_hermes_notify_llegada_ins ON public.solicitudes_clientes;
CREATE TRIGGER trg_hermes_notify_llegada_ins
  AFTER INSERT ON public.solicitudes_clientes
  FOR EACH ROW
  WHEN (NEW.estado = 'notificada')
  EXECUTE FUNCTION public.hermes_notify_llegada();

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('hermes_llegadas_notify.sql');
  END IF;
END $$;

SELECT 'Canal hermes_llegadas activo: NOTIFY al pasar una solicitud a notificada' AS status;
