-- =====================================================================
-- DESPERTAR AL ATENDEDOR DE NUBE
-- ---------------------------------------------------------------------
-- (2026-08-13) La Edge Function `equipo-nube` sabe atender la cola, pero
-- alguien tiene que llamarla. Aqui van las dos formas, y hacen falta las
-- dos por razones distintas:
--
--   1. UN DISPARADOR, al encolar. Es el que da la sensacion de que el
--      agente contesta al momento. Sin esto habria que esperar al
--      siguiente minuto para cualquier cosa.
--
--   2. UN CRON cada minuto, de red de seguridad. Es el que recoge lo que
--      el disparador no pudo: la funcion se quedo sin tiempo a media
--      cola, la llamada HTTP se perdio, un mensaje quedo reclamado por
--      alguien que se murio y hay que reintentarlo cuando venza.
--
-- El disparador solo es la via rapida. El cron es el que garantiza que
-- nada se queda tirado, y por eso no se quita "porque ya hay disparador".
--
-- >>> POR QUE A NIVEL DE SENTENCIA Y NO DE FILA <<<
-- Un `INSERT ... SELECT` que encola cinco mensajes dispararia cinco
-- llamadas HTTP a la misma funcion, que se pelearian por la misma cola.
-- Con FOR EACH STATEMENT se llama una vez, entren uno o cien.
--
-- >>> ANTES DE EJECUTAR <<<
-- Reemplaza los tres marcadores:
--   __SUPABASE_URL__   https://TUPROYECTO.supabase.co
--   __ANON_KEY__       la anon key (publica, la del bundle web)
--   __CRON_SECRET__    el valor de EQUIPO_NUBE_SECRET en los secretos
--
-- El mismo patron que sql/ai_ceo_weekly_monthly_cron.sql.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- 1. LA LLAMADA
-- ------------------------------------------------------------
-- pg_net encola la peticion y vuelve enseguida: ni el disparador ni el
-- cron se quedan esperando a que el modelo termine de pensar. Si esto
-- fuera sincrono, encolar un trabajo bloquearia la transaccion de quien
-- lo encola durante lo que tarde OpenAI en contestar.
CREATE OR REPLACE FUNCTION public.equipo_nube_llamar()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT net.http_post(
    url     := '__SUPABASE_URL__/functions/v1/equipo-nube',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer __ANON_KEY__',
      'x-cron-secret', '__CRON_SECRET__'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 5000
  )
$$;

REVOKE ALL ON FUNCTION public.equipo_nube_llamar() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 2. EL DISPARADOR
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.equipo_nube_despertar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Solo si algo de lo que acaba de entrar es para un agente de nube.
  -- Un trabajo para el Comercial-Creativo no despierta a nadie aqui: lo
  -- atiende su worker, y llamar seria gastar una peticion para que la
  -- funcion mire una cola que no es suya.
  IF EXISTS (
    SELECT 1 FROM nuevas n
    WHERE n.to_agent IN (SELECT jsonb_array_elements_text(public.equipo_nube_agentes()))
      AND n.status = 'pending'
  ) THEN
    PERFORM public.equipo_nube_llamar();
  END IF;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.equipo_nube_despertar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_equipo_nube_despertar ON public.equipo_mensajes;
CREATE TRIGGER trg_equipo_nube_despertar
  AFTER INSERT ON public.equipo_mensajes
  REFERENCING NEW TABLE AS nuevas
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.equipo_nube_despertar();

-- ------------------------------------------------------------
-- 3. LA RONDA DE SEGURIDAD
-- ------------------------------------------------------------
-- Solo llama si hay algo que hacer. Un cron que despierta una funcion
-- cada minuto durante todo el dia para que mire una cola vacia son 1.440
-- invocaciones diarias de nada.
CREATE OR REPLACE FUNCTION public.equipo_nube_ronda()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_n integer;
BEGIN
  SELECT public.equipo_nube_pendientes() INTO v_n;
  IF v_n > 0 THEN
    PERFORM public.equipo_nube_llamar();
    RETURN 'llamada, ' || v_n || ' pendiente(s)';
  END IF;
  RETURN 'nada que hacer';
END $$;

REVOKE ALL ON FUNCTION public.equipo_nube_ronda() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  PERFORM cron.unschedule('equipo-nube-ronda');
EXCEPTION WHEN OTHERS THEN NULL;   -- no existia
END $$;

SELECT cron.schedule('equipo-nube-ronda', '* * * * *', $CRON$SELECT public.equipo_nube_ronda()$CRON$);

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('equipo_ia_nube_cron.sql');
  END IF;
END $$;
