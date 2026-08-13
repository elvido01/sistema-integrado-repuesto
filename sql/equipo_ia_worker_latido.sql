-- =====================================================================
-- Quién está atendiendo la cola, y con qué cuenta
-- ---------------------------------------------------------------------
-- (2026-08-13) "no se ve dónde seleccionar la suscripción diferente".
--
-- Y no se ve porque no puede estar ahí. La cuenta de Claude no vive en
-- MotoFlow: vive en la sesión de Claude Code de la máquina que corre el
-- worker. Un desplegable en el navegador no puede iniciar sesión en un
-- programa que corre en otra parte, y fingir que sí sería peor que no
-- tenerlo: elegirías una cuenta y contestaría otra.
--
-- Lo que sí se puede, y es lo que faltaba: que el worker DIGA con quién
-- está trabajando, y que la pantalla lo enseñe. La pregunta deja de ser
-- "cuál elijo aquí" y pasa a ser "cuál está puesta y cómo la cambio".
--
-- >>> Y ALGO QUE LA PANTALLA DECÍA MAL <<<
-- El diálogo daba a entender que solo la suscripción necesita worker. No:
-- LA COLA SIEMPRE lo necesita, pongas el motor que pongas. Lo que cambia
-- con cada motor es de dónde sale el modelo y quién paga. El único Jarvis
-- que contesta sin worker es el del botón flotante, que es otra cosa.
--
-- >>> POR QUÉ UNA RPC APARTE Y NO DENTRO DE equipo_panel <<<
-- Porque equipo_panel ya se reescribió una vez entera para agregarle tres
-- columnas. Una tercera copia de noventa líneas para colgarle un dato es
-- comprar una divergencia segura a cambio de un viaje de red.
--
-- Requiere sql/equipo_ia.sql.
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. EL LATIDO
-- ------------------------------------------------------------
-- Una fila por agente. No es un historial: es "quién está ahora". Lo que
-- pasó antes ya está en equipo_mensajes.
CREATE TABLE IF NOT EXISTS public.equipo_workers (
  tenant_id  uuid NOT NULL REFERENCES public.config_empresa(tenant_id) ON DELETE CASCADE,
  agente     text NOT NULL CHECK (agente IN ('hermes', 'jarvis', 'comercial_creativo')),
  -- Con qué cuenta de Claude contesta. NULL cuando el motor es de clave de
  -- API: ahí no hay cuenta personal, hay credito.
  cuenta     text,
  plan       text,
  -- En qué máquina. Con dos PC atendiendo, "la cuenta X" no basta para
  -- saber cuál apagar.
  maquina    text,
  motor      text,
  modelo     text,
  version    text,
  visto_en   timestamptz NOT NULL DEFAULT now(),
  arranco_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, agente)
);

ALTER TABLE public.equipo_workers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS equipo_workers_duenio ON public.equipo_workers;
CREATE POLICY equipo_workers_duenio ON public.equipo_workers
  FOR SELECT USING (tenant_id = public.get_user_tenant() AND public.equipo_ia_permitido());

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.equipo_workers FROM anon, authenticated;
GRANT SELECT ON public.equipo_workers TO authenticated;

-- ------------------------------------------------------------
-- 2. EL WORKER SE ANUNCIA
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION hermes.equipo_latido(
  p_agente  text,
  p_cuenta  text DEFAULT NULL,
  p_plan    text DEFAULT NULL,
  p_maquina text DEFAULT NULL,
  p_motor   text DEFAULT NULL,
  p_modelo  text DEFAULT NULL,
  p_version text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_nuevo  boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.equipo_agentes
                 WHERE tenant_id = v_tenant AND clave = btrim(COALESCE(p_agente, ''))) THEN
    RAISE EXCEPTION 'Ese agente no existe: %', p_agente;
  END IF;

  INSERT INTO public.equipo_workers
    (tenant_id, agente, cuenta, plan, maquina, motor, modelo, version)
  VALUES
    (v_tenant, p_agente, NULLIF(btrim(COALESCE(p_cuenta,'')),''),
     NULLIF(btrim(COALESCE(p_plan,'')),''), NULLIF(btrim(COALESCE(p_maquina,'')),''),
     p_motor, p_modelo, p_version)
  ON CONFLICT (tenant_id, agente) DO UPDATE
    SET cuenta = EXCLUDED.cuenta, plan = EXCLUDED.plan, maquina = EXCLUDED.maquina,
        motor = EXCLUDED.motor, modelo = EXCLUDED.modelo, version = EXCLUDED.version,
        visto_en = now(),
        -- Si el worker se reinicia, la máquina o la cuenta cambian: eso es
        -- un arranque nuevo, no el mismo proceso latiendo.
        arranco_en = CASE
          WHEN public.equipo_workers.maquina IS DISTINCT FROM EXCLUDED.maquina
            OR public.equipo_workers.cuenta IS DISTINCT FROM EXCLUDED.cuenta
          THEN now() ELSE public.equipo_workers.arranco_en END
  RETURNING (arranco_en = visto_en) INTO v_nuevo;

  RETURN json_build_object('ok', true, 'arranque', v_nuevo);
END $$;

REVOKE ALL ON FUNCTION hermes.equipo_latido(text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.equipo_latido(text,text,text,text,text,text,text) TO hermes_readonly;

-- ------------------------------------------------------------
-- 3. LO QUE VE LA PANTALLA
-- ------------------------------------------------------------
-- `conectado` se calcula aquí y no en el navegador: el reloj del que mira
-- la pantalla no tiene por qué estar en hora, y el de la base sí.
CREATE OR REPLACE FUNCTION public.equipo_workers_estado()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid := public.get_user_tenant(); v_out json;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RETURN '[]'::json;
  END IF;

  SELECT COALESCE(json_agg(w ORDER BY w.agente), '[]'::json) INTO v_out FROM (
    SELECT agente, cuenta, plan, maquina, motor, modelo, version,
           visto_en, arranco_en,
           -- Dos minutos. El worker late cada minuto, así que un latido
           -- perdido no lo da por muerto, pero dos sí.
           (visto_en > now() - interval '2 minutes') AS conectado,
           EXTRACT(epoch FROM (now() - visto_en))::int AS hace_segundos
    FROM public.equipo_workers
    WHERE tenant_id = v_tenant
  ) w;

  RETURN v_out;
END $$;

REVOKE ALL ON FUNCTION public.equipo_workers_estado() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_workers_estado() TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('equipo_ia_worker_latido.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verificación (vacío hasta que arranque un worker):
SELECT agente, COALESCE(cuenta,'(clave de API)') AS cuenta, maquina, motor,
       visto_en, (visto_en > now() - interval '2 minutes') AS conectado
FROM public.equipo_workers
WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
