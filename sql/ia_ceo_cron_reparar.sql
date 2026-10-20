-- =====================================================================
-- IA CEO: LAS TAREAS AUTOMÁTICAS VUELVEN A CORRER (20/10/2026)
-- ---------------------------------------------------------------------
-- El IA CEO no piensa desde el 23/08/2026: sus 4 tareas de pg_cron
-- (diaria 6:30 am, semanal, mensual y trimestral) llaman a
-- extensions.http_post, que ya no existe en la base, y fallan todos los
-- días sin que nadie lo vea. La función motoflow-daily-insights sí
-- funciona (probada a mano el 20/10: 15 s, US$0.005).
--
-- Se cambia solo el nombre de la función por net.http_post (pg_net, la
-- que usan los demás cron del sistema). El resto del comando (URL,
-- encabezados, clave) se deja tal cual: no se escribe ningún secreto aquí.
-- =====================================================================

DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid, jobname, command FROM cron.job
            WHERE command ILIKE '%extensions.http_post%'
              AND jobname IN ('motoflow_daily_insights', 'motoflow_weekly_insights',
                              'motoflow_monthly_insights', 'motoflow_quarterly_insights')
  LOOP
    PERFORM cron.alter_job(j.jobid, command := replace(j.command, 'extensions.http_post', 'net.http_post'));
    RAISE NOTICE 'reparado %', j.jobname;
  END LOOP;
END $$;

SELECT public.registrar_migracion('ia_ceo_cron_reparar.sql');

-- Verificación: ninguno debe seguir con extensions.http_post
SELECT jobname, schedule, active, command ILIKE '%net.http_post%' AS usa_pg_net
  FROM cron.job WHERE jobname LIKE 'motoflow_%insights';
