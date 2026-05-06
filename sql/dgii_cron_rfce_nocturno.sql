-- ============================================================
-- Cron nocturno: enviar RFCE (Resumen Facturas Consumo Tipo 32)
-- a DGII cada noche para tenants en Producción.
-- ============================================================
-- Ejecuta diariamente a las 23:00 hora servidor (UTC).
-- Para retail high-volume (Repuestos Morla, Repuestos Caminero)
-- el RFCE batch evita enviar miles de e-CF Tipo 32 individualmente.
--
-- REQUISITOS PREVIOS:
--   1. Extensiones pg_cron y pg_net habilitadas en el proyecto.
--   2. La master key DGII_MASTER_KEY ya configurada en edge function.
--   3. Cada tenant configurado con proveedor='dgii_directo' y ambiente='Produccion'.
--   4. Cada tenant tiene su .p12 cargado y secuencias e-NCF activas.
--
-- INSTRUCCIONES PARA ACTIVARLO (cuando esten en produccion):
--   - Reemplazar <SUPABASE_URL> y <SERVICE_ROLE_KEY> con valores reales.
--   - Descomentar el bloque de cron.schedule.
--   - Verificar la tabla cron.job para confirmar que quedó programado.
--
-- Mientras tanto, este archivo deja la infraestructura preparada
-- pero el cron NO se activa automaticamente.
-- ============================================================

-- 1. Habilitar extensiones (idempotente)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Tabla de configuracion del cron (1 fila por tenant)
-- ------------------------------------------------------------
-- Asi cada tenant decide si quiere RFCE automatico y a que hora.
-- Si no hay fila, no se ejecuta para ese tenant (opt-in explicito).
CREATE TABLE IF NOT EXISTS public.dgii_rfce_cron_config (
  tenant_id     uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  activo        boolean NOT NULL DEFAULT false,
  hora_local    int NOT NULL DEFAULT 23,    -- 0-23 hora local DR (UTC-4)
  ambiente      text NOT NULL DEFAULT 'Produccion',  -- 'Produccion' tipico
  ultima_corrida timestamptz,
  ultimo_resultado jsonb,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  CONSTRAINT hora_valida CHECK (hora_local >= 0 AND hora_local <= 23)
);

-- 3. Funcion SQL que dispara el RFCE para todos los tenants activos
-- ------------------------------------------------------------
-- Llama al edge function emitir-fiscal con action='dgii_enviar_rfce'.
-- Para que la llamada lleve la identidad correcta del tenant, usa
-- el JWT firmado con service_role + un header custom X-Tenant-Id.
-- (El edge function debera honrar X-Tenant-Id cuando viene de service_role.)

CREATE OR REPLACE FUNCTION public.dgii_disparar_rfce_nocturno()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  v_tenant RECORD;
  v_url    text;
  v_key    text;
  v_body   jsonb;
  v_request_id bigint;
  v_inicio timestamptz := now() - interval '1 day';
  v_fin    timestamptz := now();
BEGIN
  -- Lee credenciales de variables de Postgres (configuradas via SET CONFIG)
  -- Mas seguro que hardcodearlas.
  v_url := current_setting('app.supabase_url', true);
  v_key := current_setting('app.service_role_key', true);
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'app.supabase_url o app.service_role_key no configurados. Setea con: ALTER DATABASE postgres SET app.supabase_url = ''https://...''';
    RETURN;
  END IF;

  FOR v_tenant IN
    SELECT c.tenant_id, c.ambiente
    FROM public.dgii_rfce_cron_config c
    JOIN public.integraciones_fiscales i
      ON i.tenant_id = c.tenant_id
     AND i.proveedor = 'dgii_directo'
     AND i.activo = true
    WHERE c.activo = true
  LOOP
    v_body := jsonb_build_object(
      'action', 'dgii_enviar_rfce',
      'fecha_inicio', v_inicio::text,
      'fecha_fin', v_fin::text,
      'service_tenant_id', v_tenant.tenant_id  -- el edge function debe honrar esto
    );

    SELECT INTO v_request_id net.http_post(
      url := v_url || '/functions/v1/emitir-fiscal',
      body := v_body,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_key,
        'Content-Type',  'application/json',
        'X-Tenant-Id',   v_tenant.tenant_id::text
      )
    );

    UPDATE public.dgii_rfce_cron_config
       SET ultima_corrida = now(),
           ultimo_resultado = jsonb_build_object('request_id', v_request_id, 'fecha_inicio', v_inicio, 'fecha_fin', v_fin),
           updated_at = now()
     WHERE tenant_id = v_tenant.tenant_id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dgii_disparar_rfce_nocturno() TO postgres;

-- 4. Registrar el cron — 23:00 UTC (= 19:00 hora local DR)
-- ------------------------------------------------------------
-- Para cambiar la hora, usa:
--   SELECT cron.schedule('dgii_rfce_nocturno', '<crontab>', '<comando>');
-- Cron syntax: '<min> <hora> <dia_mes> <mes> <dia_semana>'
-- '0 23 * * *' = todos los dias a las 23:00 UTC
--
-- DESCOMENTA ESTAS LINEAS CUANDO ESTES LISTO PARA ACTIVARLO:

-- SELECT cron.schedule(
--   'dgii_rfce_nocturno',
--   '0 23 * * *',
--   $cron$ SELECT public.dgii_disparar_rfce_nocturno(); $cron$
-- );

-- 5. Para verificar el estado del cron
-- ------------------------------------------------------------
-- SELECT * FROM cron.job WHERE jobname = 'dgii_rfce_nocturno';
-- SELECT * FROM cron.job_run_details WHERE jobid = <id> ORDER BY start_time DESC LIMIT 10;

-- 6. Para activar el cron para un tenant especifico
-- ------------------------------------------------------------
-- INSERT INTO public.dgii_rfce_cron_config (tenant_id, activo, hora_local, ambiente)
-- VALUES ('<tenant_id_morla>', true, 23, 'Produccion');

-- 7. Para correr manualmente (testing)
-- ------------------------------------------------------------
-- SELECT public.dgii_disparar_rfce_nocturno();

NOTIFY pgrst, 'reload schema';
