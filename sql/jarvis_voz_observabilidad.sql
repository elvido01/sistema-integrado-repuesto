-- =====================================================================
-- JARVIS: OIR BIEN, Y PODER MEDIR POR QUE OYO MAL
-- ---------------------------------------------------------------------
-- (2026-08-17) Hoy la nota de voz la transcribe el NAVEGADOR
-- (window.SpeechRecognition, JarvisAdminAssistant.jsx:12). Por eso
-- "autorizalo" llego partido en "autoriza lo", y por eso nunca va a
-- entender Pruss, Loncin, millero ni catalina: no sabe que existen.
-- No es que Jarvis razone mal — esta oyendo mal.
--
-- Esto prepara la base para que transcriba un modelo en el servidor, con
-- un glosario del negocio, y para poder DEMOSTRAR si mejoro o no.
--
-- NO SE CREA NINGUNA TABLA NUEVA. Se amplian las que ya estan:
--   * ai_agent_runs   — ya guarda provider, model, tokens, costo, duracion,
--                       status, error_message y metadata. Le faltaban las
--                       columnas de VOZ y la categoria del error.
--   * equipo_agentes  — ya guarda proveedor/modelo del cerebro. Le faltaban
--                       las ranuras de transcripcion y de voz hablada.
--
-- La regla de oro del encargo: el modelo es una pieza intercambiable. Por
-- eso los tres modelos (cerebro, oido, voz) viven en la fila del agente y
-- no en el codigo: cambiarlos es un UPDATE, no un despliegue.
--
-- Idempotente / re-ejecutable. Correr en PRODUCCION.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Las tres ranuras de modelo (Fase 17)
-- ---------------------------------------------------------------------
ALTER TABLE public.equipo_agentes
  ADD COLUMN IF NOT EXISTS modelo_transcripcion text,
  ADD COLUMN IF NOT EXISTS modelo_voz           text;

COMMENT ON COLUMN public.equipo_agentes.modelo_transcripcion IS
  'Modelo de audio->texto (STT). Vacio = el que traiga la Edge Function por '
  'variable de entorno. Cambiarlo aqui NO exige desplegar.';
COMMENT ON COLUMN public.equipo_agentes.modelo_voz IS
  'Modelo de texto->voz (TTS). Vacio = la voz del navegador, como hasta ahora.';

-- ---------------------------------------------------------------------
-- 2. Memoria corta de la conversacion (Fase 5)
-- ---------------------------------------------------------------------
-- "Busca la cotizacion de Sander" ... "mandala a facturar". Entre las dos
-- frases hay que recordar que "la" es CT-000097. Ese estado vive con la
-- sesion, que es exactamente lo que ya representa ai_chat_sessions — no
-- hace falta tabla nueva.
--
-- Es un objeto CHICO y de forma fija: cliente/cotizacion/producto/factura
-- activos, ultima accion y objetivo. No es un resumen de la charla ni un
-- baul: si crece, empieza a viajar basura en cada pregunta y el modelo se
-- agarra de lo viejo.
ALTER TABLE public.ai_chat_sessions
  ADD COLUMN IF NOT EXISTS estado jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.ai_chat_sessions.estado IS
  'Memoria corta: {cliente_id, cliente_nombre, cotizacion_id, cotizacion_numero, '
  'producto_id, producto_nombre, factura_numero, ultima_accion, objetivo}. Lo '
  'que resuelve "esa", "la" y "mandala a facturar". Lo escribe el servidor con '
  'lo que DEVOLVIERON las herramientas, nunca con lo que dijo el modelo.';

-- ---------------------------------------------------------------------
-- 3. Observabilidad (Fases 12, 13 y 21)
-- ---------------------------------------------------------------------
-- Se agregan como COLUMNAS y no dentro de metadata porque son justo por lo
-- que se va a filtrar y agrupar: "cuantas ordenes de voz fallaron por STT
-- esta semana" tiene que ser un WHERE, no un recorrido de jsonb.
ALTER TABLE public.ai_agent_runs
  ADD COLUMN IF NOT EXISTS fuente               text,      -- 'texto' | 'voz'
  ADD COLUMN IF NOT EXISTS modulo               text,      -- panel abierto
  ADD COLUMN IF NOT EXISTS intencion            text,      -- lo que se entendio
  ADD COLUMN IF NOT EXISTS herramienta          text,      -- tool elegida
  ADD COLUMN IF NOT EXISTS error_categoria      text,
  ADD COLUMN IF NOT EXISTS transcripcion_modelo text,
  ADD COLUMN IF NOT EXISTS transcripcion_ms     integer,
  ADD COLUMN IF NOT EXISTS audio_segundos       numeric,
  ADD COLUMN IF NOT EXISTS herramienta_ms       integer;

COMMENT ON COLUMN public.ai_agent_runs.error_categoria IS
  'Para separar culpas sin adivinar: STT_ERROR (oyo mal), CONTEXT_ERROR (le '
  'falto saber que pantalla), INTENT_ERROR (entendio otra cosa), ENTITY_ERROR '
  '(no resolvio el cliente/cotizacion), TOOL_ERROR (la herramienta fallo), '
  'BACKEND_ERROR (fallo Supabase o el proveedor). Sin esto, "Jarvis falla" no '
  'se puede arreglar: no se sabe cual de las seis capas fallo.';

-- La transcripcion se guarda en metadata->>'transcripcion', NO en columna:
-- es texto libre del usuario y no se filtra por el. Ahi mismo van tambien
-- las entidades detectadas y los argumentos ya limpios de la tool.

CREATE INDEX IF NOT EXISTS ix_ai_agent_runs_jarvis_voz
  ON public.ai_agent_runs (tenant_id, fuente, created_at DESC)
  WHERE agent_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_ai_agent_runs_error_cat
  ON public.ai_agent_runs (tenant_id, error_categoria, created_at DESC)
  WHERE error_categoria IS NOT NULL;

-- ---------------------------------------------------------------------
-- 4. Las metricas, ya masticadas (Fase 13)
-- ---------------------------------------------------------------------
-- security_invoker: cada quien ve lo suyo, la RLS de ai_agent_runs manda.
DROP VIEW IF EXISTS public.v_jarvis_metricas;
CREATE VIEW public.v_jarvis_metricas
WITH (security_invoker = true) AS
SELECT
  tenant_id,
  date_trunc('day', created_at)::date         AS dia,
  COALESCE(fuente, 'texto')                   AS fuente,
  model                                       AS modelo_cerebro,
  transcripcion_modelo,
  count(*)                                    AS interacciones,
  count(*) FILTER (WHERE status = 'success')  AS exitosas,
  count(*) FILTER (WHERE status <> 'success') AS fallidas,
  count(*) FILTER (WHERE herramienta IS NOT NULL)          AS con_herramienta,
  count(*) FILTER (WHERE error_categoria = 'STT_ERROR')    AS err_oido,
  count(*) FILTER (WHERE error_categoria = 'INTENT_ERROR') AS err_intencion,
  count(*) FILTER (WHERE error_categoria = 'ENTITY_ERROR') AS err_entidad,
  count(*) FILTER (WHERE error_categoria = 'TOOL_ERROR')   AS err_herramienta,
  count(*) FILTER (WHERE error_categoria = 'BACKEND_ERROR')AS err_backend,
  round(avg(duration_ms))                     AS ms_promedio,
  round(avg(transcripcion_ms))                AS ms_transcripcion,
  round(avg(audio_segundos), 1)               AS audio_seg_promedio,
  round(sum(cost_usd)::numeric, 4)            AS costo_usd,
  round((sum(cost_usd) / NULLIF(count(*), 0))::numeric, 6) AS costo_por_interaccion
FROM public.ai_agent_runs
WHERE agent_name IS NOT NULL
GROUP BY 1, 2, 3, 4, 5;

COMMENT ON VIEW public.v_jarvis_metricas IS
  'Jarvis por dia, fuente y modelo. Sirve para lo que pidio el dueño: comparar '
  'dos cerebros con datos y no con impresiones. Al cambiar el modelo en '
  'equipo_agentes, las filas nuevas salen con el nombre nuevo y se comparan '
  'lado a lado sin tocar codigo.';

GRANT SELECT ON public.v_jarvis_metricas TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. Las 100 interacciones, para decidir con datos (Fase 21)
-- ---------------------------------------------------------------------
-- Devuelve las ultimas N con lo minimo para juzgarlas a mano: que se dijo,
-- que entendio, que hizo y como acabo. La idea es sentarse a leerlas y
-- poner la categoria del error donde este vacia — de ahi sale si hace falta
-- subir el cerebro o si el problema sigue siendo el oido.
CREATE OR REPLACE FUNCTION public.jarvis_revisar_interacciones(
  p_limite integer DEFAULT 100,
  p_fuente text    DEFAULT NULL      -- 'voz' | 'texto' | NULL = ambas
)
RETURNS TABLE (
  run_id            uuid,
  cuando            timestamptz,
  fuente            text,
  modulo            text,
  dijo              text,
  entendio          text,
  herramienta       text,
  resultado         text,
  error_categoria   text,
  ms_total          integer,
  modelo_cerebro    text,
  modelo_oido       text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    r.id,
    r.created_at,
    COALESCE(r.fuente, 'texto'),
    r.modulo,
    COALESCE(r.metadata->>'transcripcion', r.input_summary),
    r.intencion,
    r.herramienta,
    COALESCE(r.status, '?') || COALESCE(' · ' || r.error_message, ''),
    r.error_categoria,
    r.duration_ms,
    r.model,
    r.transcripcion_modelo
  FROM public.ai_agent_runs r
  WHERE r.tenant_id = public.get_user_tenant()
    AND r.agent_name IS NOT NULL
    AND (p_fuente IS NULL OR COALESCE(r.fuente,'texto') = p_fuente)
  ORDER BY r.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limite, 100), 1), 500);
$$;

REVOKE EXECUTE ON FUNCTION public.jarvis_revisar_interacciones(integer, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.jarvis_revisar_interacciones(integer, text) TO authenticated, service_role;

-- Poner la culpa a mano despues de leer una interaccion.
CREATE OR REPLACE FUNCTION public.jarvis_marcar_error(
  p_run_id    uuid,
  p_categoria text,
  p_nota      text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_n integer;
BEGIN
  IF p_categoria IS NOT NULL AND p_categoria NOT IN
     ('STT_ERROR','CONTEXT_ERROR','INTENT_ERROR','ENTITY_ERROR','TOOL_ERROR','BACKEND_ERROR')
  THEN
    RAISE EXCEPTION 'Categoria no valida: %. Use STT_ERROR, CONTEXT_ERROR, INTENT_ERROR, ENTITY_ERROR, TOOL_ERROR o BACKEND_ERROR', p_categoria;
  END IF;

  UPDATE public.ai_agent_runs
     SET error_categoria = p_categoria,
         metadata = COALESCE(metadata, '{}'::jsonb)
                    || jsonb_build_object('revisado_por', auth.uid(),
                                          'revisado_en', now(),
                                          'nota_revision', p_nota)
   WHERE id = p_run_id
     AND tenant_id = public.get_user_tenant();   -- nunca fuera de su empresa
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.jarvis_marcar_error(uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.jarvis_marcar_error(uuid, text, text) TO authenticated, service_role;

DO $mig$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('jarvis_voz_observabilidad.sql');
  END IF;
END $mig$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================================
-- VERIFICACION — las 5 deben decir OK
-- =====================================================================
WITH chequeos AS (
  SELECT 1 AS n, 'ranuras de modelo (transcripcion y voz)' AS chequeo,
         (SELECT count(*)::text FROM information_schema.columns
           WHERE table_schema='public' AND table_name='equipo_agentes'
             AND column_name IN ('modelo_transcripcion','modelo_voz')) AS resultado, '2' AS esperado
  UNION ALL
  SELECT 2, 'columnas de observabilidad en ai_agent_runs',
         (SELECT count(*)::text FROM information_schema.columns
           WHERE table_schema='public' AND table_name='ai_agent_runs'
             AND column_name IN ('fuente','modulo','intencion','herramienta','error_categoria',
                                 'transcripcion_modelo','transcripcion_ms','audio_segundos','herramienta_ms')), '9'
  UNION ALL
  SELECT 3, 'vista de metricas',
         (SELECT count(*)::text FROM information_schema.views
           WHERE table_schema='public' AND table_name='v_jarvis_metricas'), '1'
  UNION ALL
  SELECT 4, 'funcion para revisar las 100 interacciones',
         (to_regprocedure('public.jarvis_revisar_interacciones(integer,text)') IS NOT NULL)::text, 'true'
  UNION ALL
  SELECT 5, 'memoria corta de sesion',(SELECT count(*)::text FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_chat_sessions' AND column_name='estado'), '1' UNION ALL SELECT 6, 'funcion para marcar la categoria del error',
         (to_regprocedure('public.jarvis_marcar_error(uuid,text,text)') IS NOT NULL)::text, 'true'
)
SELECT n, chequeo, resultado, esperado,
       CASE WHEN resultado = esperado THEN 'OK' ELSE '*** FALLO ***' END AS estado
FROM chequeos ORDER BY n;

-- Para elegir el modelo de oido de Jarvis (ejemplos, NO se corren solos):
--   UPDATE equipo_agentes SET modelo_transcripcion = 'gpt-4o-mini-transcribe'
--    WHERE clave = 'jarvis' AND tenant_id = '...';
--   UPDATE equipo_agentes SET modelo_transcripcion = NULL   -- vuelve al default
--    WHERE clave = 'jarvis' AND tenant_id = '...';
