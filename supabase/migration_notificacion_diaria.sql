-- ============================================================
-- MÓDULO: Notificación diaria de solicitudes abiertas (9 AM)
-- Migración — pegar en Supabase SQL Editor si es necesario
-- ============================================================

-- 1. Habilitar pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- 2. FUNCIÓN: Genera notificaciones para todos los usuarios del sistema
--    con un resumen de las solicitudes abiertas pendientes.
CREATE OR REPLACE FUNCTION public.fn_notificar_solicitudes_abiertas_diaria()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total       integer;
  _detalle     text;
  _usr         RECORD;
  _titulo      text;
  _mensaje     text;
BEGIN
  -- 1. Contar solicitudes abiertas
  SELECT count(*) INTO _total
    FROM solicitudes_clientes
   WHERE estado = 'abierta';

  -- Si no hay solicitudes abiertas, no hacer nada
  IF _total = 0 THEN
    RETURN;
  END IF;

  -- 2. Construir el detalle con cada solicitud abierta
  SELECT string_agg(
    '• ' || COALESCE(sc.cliente_nombre, 'Sin nombre') || ' — ' ||
    COALESCE(p.descripcion, sc.producto_texto, 'Producto N/D') ||
    ' (Cant: ' || COALESCE(sc.cantidad_solicitada::text, '?') || ')',
    E'\n'
    ORDER BY sc.created_at ASC
  )
  INTO _detalle
  FROM solicitudes_clientes sc
  LEFT JOIN productos p ON p.id = sc.producto_id
  WHERE sc.estado = 'abierta';

  -- 3. Armar título y mensaje
  _titulo := '📋 Resumen diario: ' || _total || ' solicitud(es) abierta(s)';
  _mensaje := 'Las siguientes solicitudes siguen pendientes:' || E'\n' || _detalle;

  -- 4. Insertar una notificación para CADA usuario del sistema
  FOR _usr IN
    SELECT id FROM profiles
  LOOP
    INSERT INTO notificaciones (tipo, titulo, mensaje, user_id)
    VALUES (
      'resumen_diario',
      _titulo,
      _mensaje,
      _usr.id
    );
  END LOOP;
END;
$$;

-- 3. CRON JOB: Ejecutar todos los días a las 9:00 AM (UTC-4 = 13:00 UTC)
--    Horario: Rep. Dominicana (AST / UTC-4)
SELECT cron.schedule(
  'notificacion-diaria-solicitudes-abiertas',    -- nombre del job
  '0 13 * * *',                                   -- 13:00 UTC = 9:00 AM AST
  $$SELECT public.fn_notificar_solicitudes_abiertas_diaria()$$
);

-- Para verificar el cron job:
-- SELECT * FROM cron.job;

-- Para ejecutar manualmente (prueba):
-- SELECT public.fn_notificar_solicitudes_abiertas_diaria();

-- Para ver el historial de ejecuciones:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- Para desactivar el job:
-- SELECT cron.unschedule('notificacion-diaria-solicitudes-abiertas');
