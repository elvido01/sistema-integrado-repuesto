-- ============================================================
-- Cron job: motoflow-daily-insights
-- ============================================================
-- Corre el agente "Márgenes Diarios" todos los días a las 6:30am
-- hora República Dominicana (10:30 UTC). Procesa TODOS los tenants
-- que tengan 'margenes_diarios' habilitado en tenant_credit_plan.
--
-- Antes de aplicar:
--   1. Edita la línea CRON_SECRET con el valor real configurado
--      en Supabase secrets como DAILY_INSIGHTS_CRON_SECRET.
--   2. Edita SUPABASE_URL si cambia el ref del proyecto.
--   3. Edita ANON_KEY con el anon key del proyecto.
-- ============================================================

-- Extensiones (pg_cron y pg_net) ya están enabled — no recrearlas
-- (genera errores de privilegios en Supabase managed).

-- ────────────────────────────────────────────────
-- Limpieza si ya existía
-- ────────────────────────────────────────────────
DO $$
DECLARE
  v_jobid BIGINT;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'motoflow_daily_insights';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END$$;

-- ────────────────────────────────────────────────
-- Programar nuevo job
-- ────────────────────────────────────────────────
-- Reemplaza los placeholders:
--   __SUPABASE_URL__   = https://zdvxowpuklbypweyqqki.supabase.co
--   __CRON_SECRET__    = valor de DAILY_INSIGHTS_CRON_SECRET (Supabase secret)
--   __ANON_KEY__       = anon key del proyecto (necesario para pasar el JWT gateway)

SELECT cron.schedule(
  'motoflow_daily_insights',
  '30 10 * * *',  -- 10:30 UTC = 6:30am DR
  $cron$
  SELECT extensions.http_post(
    url := '__SUPABASE_URL__/functions/v1/motoflow-daily-insights',
    headers := jsonb_build_object(
      'Authorization', 'Bearer __ANON_KEY__',
      'x-cron-secret', '__CRON_SECRET__',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('force', false),
    timeout_milliseconds := 120000
  );
  $cron$
);

-- ────────────────────────────────────────────────
-- Verificar
-- ────────────────────────────────────────────────
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'motoflow_daily_insights';
