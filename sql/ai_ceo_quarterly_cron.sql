-- ============================================================
-- Cron quarterly: Reporte Estratégico Trimestral
-- ============================================================
-- Corre el 1ro de Enero, Abril, Julio y Octubre a las 02:00 UTC
-- (= 22:00 DR del último día del trimestre anterior).
-- Genera reporte trimestral con todos los sub-agentes
-- + agente Estrategia exclusivo.
-- ============================================================

DO $$
DECLARE v_jobid BIGINT;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'motoflow_quarterly_insights';
  IF v_jobid IS NOT NULL THEN PERFORM cron.unschedule(v_jobid); END IF;
END$$;

-- Día 1 de Ene/Abr/Jul/Oct, 02:00 UTC
SELECT cron.schedule(
  'motoflow_quarterly_insights',
  '0 2 1 1,4,7,10 *',
  $cron$
  SELECT extensions.http_post(
    url := '__SUPABASE_URL__/functions/v1/motoflow-daily-insights',
    headers := jsonb_build_object(
      'Authorization', 'Bearer __ANON_KEY__',
      'x-cron-secret', '__CRON_SECRET__',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('force', true, 'report_type', 'quarterly'),
    timeout_milliseconds := 240000
  );
  $cron$
);

SELECT jobid, jobname, schedule, active FROM cron.job
WHERE jobname LIKE 'motoflow_%_insights' ORDER BY jobname;
