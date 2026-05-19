-- ============================================================
-- Cron jobs: Reportes Semanal + Mensual
-- ============================================================
-- WEEKLY: Domingos 20:00 DR → lunes 00:00 UTC
-- MONTHLY: 1ro de cada mes 01:00 UTC = último día anterior 21:00 DR
--
-- Reemplaza placeholders antes de aplicar:
--   __SUPABASE_URL__, __CRON_SECRET__, __ANON_KEY__
-- ============================================================

-- Limpieza si ya existían
DO $$
DECLARE v_jobid BIGINT;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'motoflow_weekly_insights';
  IF v_jobid IS NOT NULL THEN PERFORM cron.unschedule(v_jobid); END IF;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'motoflow_monthly_insights';
  IF v_jobid IS NOT NULL THEN PERFORM cron.unschedule(v_jobid); END IF;
END$$;

-- Weekly: Lunes 00:00 UTC (Domingo 20:00 DR)
SELECT cron.schedule(
  'motoflow_weekly_insights',
  '0 0 * * 1',
  $cron$
  SELECT extensions.http_post(
    url := '__SUPABASE_URL__/functions/v1/motoflow-daily-insights',
    headers := jsonb_build_object(
      'Authorization', 'Bearer __ANON_KEY__',
      'x-cron-secret', '__CRON_SECRET__',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('force', false, 'report_type', 'weekly'),
    timeout_milliseconds := 180000
  );
  $cron$
);

-- Monthly: Día 1 01:00 UTC (último día del mes anterior 21:00 DR)
SELECT cron.schedule(
  'motoflow_monthly_insights',
  '0 1 1 * *',
  $cron$
  SELECT extensions.http_post(
    url := '__SUPABASE_URL__/functions/v1/motoflow-daily-insights',
    headers := jsonb_build_object(
      'Authorization', 'Bearer __ANON_KEY__',
      'x-cron-secret', '__CRON_SECRET__',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('force', false, 'report_type', 'monthly'),
    timeout_milliseconds := 180000
  );
  $cron$
);

-- Verificar
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname IN ('motoflow_daily_insights','motoflow_weekly_insights','motoflow_monthly_insights')
ORDER BY jobname;
