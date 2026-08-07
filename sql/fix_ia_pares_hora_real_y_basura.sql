-- =====================================================================
-- Los pares de entrenamiento salieron mal: hora falsa y material inservible
-- ---------------------------------------------------------------------
-- (2026-08-07) Corrección de ia_aprende_de_las_respuestas_humanas.sql, que
-- recuperó 319 pares pero casi la mitad mal emparejados.
--
-- >>> PROBLEMA 1: TODOS LOS MENSAJES TIENEN LA MISMA HORA <<<
-- El espejo de WhatsApp guarda en created_at la hora en que ÉL corrió, no
-- la hora del mensaje. Una conversación entera entra con la misma marca:
--
--   22:52:22.524  user   "Buenos días"
--   22:52:22.524  agent  "Gracias por comunicarte..."
--   22:52:22.524  user   "Tienen goma Michelin..."
--
-- El emparejado ordenaba por created_at, así que ordenaba por nada. De ahí
-- que el 47% de las respuestas quedara pegada a varias preguntas: la misma
-- "ESTA BIEN NEGRA GRACIAS" contestando tres cosas distintas.
--
-- La hora de verdad sí está guardada, en raw_data.pre:
--
--   "[10:25 a.m., 6/8/2026] +1 (829) 428-0306:"
--
-- Se extrae de ahí a una columna propia, enviado_en, y se ordena por esa.
--
-- >>> PROBLEMA 2: LA MITAD NO SON CONVERSACIONES DE VENTA <<<
-- Entre los pares recuperados hay 24 respuestas que son "[Nota de voz]",
-- 11 que son "[Imagen]", el saludo automático del bot, y conversaciones
-- personales del dueño que no tienen nada que ver con repuestos.
--
-- Entrenar a Hermes con eso le enseña a contestar "[Nota de voz]". Se
-- descartan los casos evidentes y se deja marcado el resto para revisar:
-- distinguir una charla familiar de una venta no lo puede hacer una regla,
-- y adivinar mal aquí sale caro.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) LA HORA REAL
-- ------------------------------------------------------------
ALTER TABLE public.sales_messages
  ADD COLUMN IF NOT EXISTS enviado_en timestamptz;

-- Saca la hora del prefijo que guarda el espejo. Si no hay, vale created_at
-- (los mensajes que entran por webhook sí traen su hora correcta).
CREATE OR REPLACE FUNCTION public._omni_hora_real(p_raw jsonb, p_fallback timestamptz)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_pre  text := p_raw ->> 'pre';
  m      text[];
  v_h    int;
BEGIN
  IF v_pre IS NULL THEN RETURN p_fallback; END IF;

  -- [10:25 a.m., 6/8/2026]  ·  día/mes/año, formato dominicano
  m := regexp_match(v_pre, '\[(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?,\s*(\d{1,2})/(\d{1,2})/(\d{4})\]', 'i');
  IF m IS NULL THEN RETURN p_fallback; END IF;

  v_h := m[1]::int;
  IF lower(m[3]) = 'p' AND v_h < 12 THEN v_h := v_h + 12; END IF;
  IF lower(m[3]) = 'a' AND v_h = 12 THEN v_h := 0; END IF;

  RETURN (make_date(m[6]::int, m[5]::int, m[4]::int)
          + make_time(v_h, m[2]::int, 0)) AT TIME ZONE 'America/Santo_Domingo';
EXCEPTION WHEN OTHERS THEN
  RETURN p_fallback;
END $$;

-- Que se llene sola de aquí en adelante.
CREATE OR REPLACE FUNCTION public._trg_omni_enviado_en()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.enviado_en := public._omni_hora_real(NEW.raw_data, COALESCE(NEW.created_at, now()));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_omni_enviado_en ON public.sales_messages;
CREATE TRIGGER trg_omni_enviado_en
BEFORE INSERT ON public.sales_messages
FOR EACH ROW EXECUTE FUNCTION public._trg_omni_enviado_en();

UPDATE public.sales_messages
SET enviado_en = public._omni_hora_real(raw_data, created_at)
WHERE enviado_en IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_messages_conv_enviado
  ON public.sales_messages (conversation_id, enviado_en);

-- ------------------------------------------------------------
-- 2) QUÉ SIRVE COMO EJEMPLO Y QUÉ NO
-- ------------------------------------------------------------
-- Conservadora a propósito: descarta solo lo que es basura SEGURA. Decidir
-- si una charla es personal o una venta no lo puede hacer una regla, y
-- botar conversaciones buenas por adivinar cuesta más que dejar alguna mala.
CREATE OR REPLACE FUNCTION public._ia_sirve_de_ejemplo(p_texto text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(btrim(p_texto), '') <> ''
     -- marcadores de adjunto: "[Nota de voz]", "[Imagen]", "[Video]".
     -- Son 24 y 11 de los pares recuperados. El contenido nunca viajó, así
     -- que enseñan a contestar "[Nota de voz]" y nada más.
     AND btrim(p_texto) !~ '^\[[^\]]{1,30}\]$'
     -- el saludo automático del bot: no es una persona contestando
     AND btrim(p_texto) !~* '^gracias por (comunicarte|escribirnos)'
     -- un "ok" suelto no enseña a vender repuestos
     AND length(btrim(p_texto)) >= 3
$$;

-- ------------------------------------------------------------
-- 3) BORRAR LOS PARES MAL HECHOS Y REHACERLOS
-- ------------------------------------------------------------
-- Se limpian TODOS los human_reply del backfill anterior: como el orden
-- estaba mal, no hay forma de saber cuáles quedaron bien.
UPDATE public.sales_ai_training_logs
SET human_reply = NULL
WHERE metadata ->> 'via' = 'backfill';

DO $$
DECLARE v_n int;
BEGIN
  UPDATE public.sales_ai_training_logs t
  SET human_reply = r.respuesta,
      metadata = COALESCE(t.metadata, '{}'::jsonb) || jsonb_build_object('via', 'backfill_v2')
  FROM (
    SELECT t2.id,
           (
             SELECT string_agg(a.message_text, E'\n' ORDER BY a.enviado_en, a.id)
             FROM public.sales_messages a
             WHERE a.conversation_id = t2.conversation_id
               AND a.sender_type = 'agent'
               AND public._ia_sirve_de_ejemplo(a.message_text)
               AND a.enviado_en > cm.enviado_en
               AND a.enviado_en < COALESCE((
                     SELECT MIN(u.enviado_en)
                     FROM public.sales_messages u
                     WHERE u.conversation_id = t2.conversation_id
                       AND u.sender_type = 'user'
                       AND u.enviado_en > cm.enviado_en
                   ), 'infinity'::timestamptz)
           ) AS respuesta
    FROM public.sales_ai_training_logs t2
    JOIN public.sales_messages cm ON cm.id = t2.message_id
    WHERE t2.human_reply IS NULL
      AND public._ia_sirve_de_ejemplo(cm.message_text)
  ) r
  WHERE t.id = r.id
    AND COALESCE(btrim(r.respuesta), '') <> '';

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Pares rehechos con la hora real: %', v_n;
END $$;

-- ------------------------------------------------------------
-- 4) EL DISPARADOR, CON LA HORA BUENA Y EL FILTRO
-- ------------------------------------------------------------
-- El de ayer ordenaba por created_at y aceptaba cualquier texto: habría
-- seguido produciendo el mismo desorden con cada mensaje nuevo.
CREATE OR REPLACE FUNCTION public._ia_captura_respuesta_humana()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.sender_type <> 'agent' OR NOT public._ia_sirve_de_ejemplo(NEW.message_text) THEN
    RETURN NEW;
  END IF;

  UPDATE public.sales_ai_training_logs t
  SET human_reply = btrim(COALESCE(t.human_reply || E'\n', '') || NEW.message_text),
      metadata    = COALESCE(t.metadata, '{}'::jsonb)
                    || jsonb_build_object('respondido_en', now(), 'via', 'trigger_v2')
  WHERE t.id = (
    SELECT t2.id
    FROM public.sales_ai_training_logs t2
    JOIN public.sales_messages cm ON cm.id = t2.message_id
    WHERE t2.conversation_id = NEW.conversation_id
      AND cm.enviado_en < COALESCE(NEW.enviado_en, NEW.created_at, now())
    ORDER BY cm.enviado_en DESC
    LIMIT 1
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;   -- guardar el mensaje al cliente SIEMPRE gana
END $$;

-- AFTER INSERT, para que enviado_en ya venga puesto por trg_omni_enviado_en.
DROP TRIGGER IF EXISTS trg_ia_captura_respuesta ON public.sales_messages;
CREATE TRIGGER trg_ia_captura_respuesta
AFTER INSERT ON public.sales_messages
FOR EACH ROW EXECUTE FUNCTION public._ia_captura_respuesta_humana();

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_ia_pares_hora_real_y_basura.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) ¿SE ACABARON LAS RESPUESTAS REPETIDAS?
SELECT human_reply, COUNT(*) AS veces
FROM public.sales_ai_training_logs
WHERE human_reply IS NOT NULL
GROUP BY human_reply HAVING COUNT(*) > 1
ORDER BY veces DESC LIMIT 10;
-- Antes: 47% de los pares repetidos, "[Nota de voz]" 24 veces.
-- Quedan las respuestas que de verdad se repiten ("1,650", "si tengo"),
-- que son legítimas: la misma contestación a la misma pregunta.

-- 2) CUÁNTO MATERIAL LIMPIO QUEDÓ
SELECT COUNT(*) FILTER (WHERE human_reply IS NOT NULL) AS pares,
       round(avg(length(human_reply))) AS largo_promedio
FROM public.sales_ai_training_logs;

-- 3) LEER UNOS CUANTOS, QUE ES LA ÚNICA PRUEBA QUE VALE
SELECT left(customer_message, 60) AS pregunta, left(human_reply, 80) AS respuesta
FROM public.sales_ai_training_logs
WHERE human_reply IS NOT NULL
ORDER BY random() LIMIT 20;
-- Si aquí sale conversación personal en vez de clientes preguntando por
-- piezas, hay que depurar por conversación antes de entrenar nada.
