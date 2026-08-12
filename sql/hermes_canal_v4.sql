-- =====================================================================
-- Canal MotoFlow ↔ Hermes — contrato v4
-- ---------------------------------------------------------------------
-- Dos cosas, y nada más:
--
--   1. FENCING. Cada toma de un mensaje genera un `claim_token` nuevo y
--      un `lease_until` explícito. Las operaciones que escriben aceptan
--      el token y rechazan al worker cuyo claim ya fue reemplazado.
--      Con chat_renovar() un worker que sigue vivo puede estirar su
--      arrendamiento en vez de perderlo por tardar.
--
--   2. CORTE DE CONTEXTO. `conversation_key` NO cambia nunca —es lo que
--      mantiene unidas WebUI, MotoFlow y el WhatsApp autorizado— y el
--      botón "Nueva conversación" avanza un `context_epoch`. La historia
--      se conserva entera en la base; lo único que cambia es qué se le
--      da de contexto al modelo.
--
-- >>> LAS FIRMAS VIEJAS SE QUEDAN <<<
-- chat_estado(id, detalle), chat_error(id, error) y chat_responder(id,
-- texto, acciones) siguen existiendo y funcionando igual. Hermes puede
-- migrar función por función. Ver §9 sobre por qué las nuevas NO llevan
-- valor por defecto en el token.
--
-- >>> REVERSIBLE <<<
-- sql/hermes_canal_v4_revertir.sql deshace esto y deja el canal en v3.
--
-- Requiere hermes_canal_v3.sql aplicado.
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. QUE v3 ESTÉ PUESTO
-- ------------------------------------------------------------
DO $$ BEGIN
  IF to_regprocedure('hermes.chat_tomar(integer)') IS NULL THEN
    RAISE EXCEPTION 'Falta aplicar hermes_canal_v3.sql primero: no existe hermes.chat_tomar()';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1. COLUMNAS NUEVAS
-- ------------------------------------------------------------
ALTER TABLE public.hermes_chat
  -- Identidad del claim. Cambia en CADA toma. Es lo que distingue al
  -- worker que tiene el mensaje ahora del que lo tuvo antes y no se
  -- enteró de que lo perdió.
  ADD COLUMN IF NOT EXISTS claim_token   uuid,
  -- Hasta cuándo vale ese claim. En v3 el vencimiento era implícito
  -- (`procesando_en + 5 min`), así que no había forma de renovarlo sin
  -- mentir sobre cuándo se tomó. Explícito, se puede estirar.
  ADD COLUMN IF NOT EXISTS lease_until   timestamptz,
  -- A qué tramo de la conversación pertenece este mensaje. Deliberadamente
  -- SIN valor por defecto: lo rellena el trigger leyendo la conversación,
  -- y así cualquier camino de inserción —hermes_escribir, chat_responder,
  -- SQL a mano, el WhatsApp que venga— queda sellado igual sin tener que
  -- acordarse. Un DEFAULT 1 se aplicaría antes del trigger y le taparía
  -- el dato bueno.
  ADD COLUMN IF NOT EXISTS context_epoch integer;

-- Todo lo que ya existe pertenece a la primera época.
UPDATE public.hermes_chat SET context_epoch = 1 WHERE context_epoch IS NULL;

-- No hay índice nuevo. El primer impulso fue uno sobre `lease_until`, y no
-- serviría: la condición real es COALESCE(lease_until, procesando_en + 5min)
-- y un índice sobre la columna a secas no la cubre. Lo que sí la cubre ya
-- existe desde v3 — hermes_chat_cola, sobre (conversation_key, estado,
-- creado_en) — porque las filas en 'procesando' son siempre un puñado y
-- llegar a ellas por ahí es suficiente.

-- ------------------------------------------------------------
-- 2. LA CONVERSACIÓN COMO ENTIDAD PROPIA
-- ------------------------------------------------------------
-- Hasta ahora la conversación solo existía como un texto repetido en cada
-- fila. La época actual necesita un sitio donde vivir que no dependa de
-- que haya mensajes: justo después de un corte no hay ninguno.
CREATE TABLE IF NOT EXISTS public.hermes_conversaciones (
  tenant_id        uuid        NOT NULL,
  conversation_key text        NOT NULL,
  context_epoch    integer     NOT NULL DEFAULT 1,
  cortado_en       timestamptz,
  cortado_por      uuid,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, conversation_key)
);

-- Se expone por PostgREST como cualquier tabla de public: sin RLS, un
-- tenant vería las conversaciones de los demás. Solo lectura y solo la
-- suya; escribir es cosa de las funciones SECURITY DEFINER.
ALTER TABLE public.hermes_conversaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hermes_conversaciones_tenant ON public.hermes_conversaciones;
CREATE POLICY hermes_conversaciones_tenant
  ON public.hermes_conversaciones FOR SELECT
  USING (tenant_id = public.get_user_tenant());

-- Explícito y no por herencia: los permisos por defecto de una tabla
-- nueva dependen de la configuración del proyecto, y que la pantalla
-- pueda leer su época no debería depender de eso.
GRANT SELECT ON public.hermes_conversaciones TO authenticated;

-- Una fila por conversación que ya exista, en la época 1.
INSERT INTO public.hermes_conversaciones (tenant_id, conversation_key)
SELECT DISTINCT c.tenant_id, c.conversation_key
FROM public.hermes_chat c
WHERE c.conversation_key IS NOT NULL
ON CONFLICT (tenant_id, conversation_key) DO NOTHING;

-- ------------------------------------------------------------
-- 3. CUÁNTO DURA UN ARRENDAMIENTO
-- ------------------------------------------------------------
-- En un solo sitio. El número aparecía en cuatro lugares distintos de
-- chat_tomar() y ahora aparecería en seis; el día que alguien lo cambie
-- en cinco de ellos, la cola se rompe de una forma que no da error.
-- IMMUTABLE y SQL: el planificador la inlinea, no cuesta nada.
CREATE OR REPLACE FUNCTION hermes.chat_lease()
RETURNS interval LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT interval '5 minutes' $$;

REVOKE ALL ON FUNCTION hermes.chat_lease() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.chat_lease() TO hermes_readonly;

-- ------------------------------------------------------------
-- 4. EL TRIGGER, AHORA TAMBIÉN SELLA LA ÉPOCA
-- ------------------------------------------------------------
-- Sella solo si viene NULL. chat_responder() manda la época de la
-- pregunta a propósito: una respuesta pertenece al tramo en el que se
-- preguntó, aunque entre medias alguien haya pulsado "Nueva conversación".
-- Si no, la respuesta aparecería sola en el tramo nuevo, sin la pregunta.
CREATE OR REPLACE FUNCTION public.hermes_chat_sincronizar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.rol = 'hermes' THEN NEW.estado := 'respondido'; NEW.respondido := true; END IF;

    IF NEW.context_epoch IS NULL AND NEW.conversation_key IS NOT NULL THEN
      SELECT k.context_epoch INTO NEW.context_epoch
      FROM public.hermes_conversaciones k
      WHERE k.tenant_id = NEW.tenant_id
        AND k.conversation_key = NEW.conversation_key;

      IF NEW.context_epoch IS NULL THEN
        -- Conversación que nace con este mensaje.
        INSERT INTO public.hermes_conversaciones (tenant_id, conversation_key)
        VALUES (NEW.tenant_id, NEW.conversation_key)
        ON CONFLICT (tenant_id, conversation_key) DO NOTHING;
        NEW.context_epoch := 1;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- Quién mandó: el que cambió. Si cambiaron los dos, manda `estado`.
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    NEW.respondido := (NEW.estado = 'respondido');
  ELSIF NEW.respondido IS DISTINCT FROM OLD.respondido THEN
    NEW.estado := CASE WHEN NEW.respondido THEN 'respondido' ELSE NEW.estado END;
  END IF;

  IF NEW.estado = 'respondido' AND NEW.respondido_en IS NULL THEN
    NEW.respondido_en := now();
  END IF;
  RETURN NEW;
END $$;

-- ------------------------------------------------------------
-- 5. TOMAR TRABAJO, CON TOKEN Y ARRENDAMIENTO EXPLÍCITO
-- ------------------------------------------------------------
-- Hay que borrarla antes: gana tres columnas de salida y CREATE OR
-- REPLACE no puede cambiar el tipo de retorno (42P13). Dentro de la
-- transacción, así que no hay instante en que no exista para nadie.
DROP FUNCTION IF EXISTS hermes.chat_tomar(integer);

CREATE OR REPLACE FUNCTION hermes.chat_tomar(p_limite integer DEFAULT 1)
RETURNS TABLE (
  id bigint, texto text, pantalla jsonb, creado_en timestamptz,
  user_id uuid, usuario text, email text, rol text,
  conversation_key text, estado text, intentos smallint,
  origin_platform text, origin_chat_id text, origin_message_id text,
  claim_token uuid, lease_until timestamptz, context_epoch integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  RETURN QUERY
  WITH candidatos AS (
    SELECT
      c.id,
      -- Uno por conversación dentro de esta misma llamada: el NOT EXISTS
      -- de abajo mira el estado ANTERIOR al UPDATE y por sí solo dejaría
      -- salir juntos los dos pendientes de una misma conversación.
      row_number() OVER (PARTITION BY c.conversation_key
                         ORDER BY c.creado_en, c.id) AS puesto
    FROM public.hermes_chat c
    WHERE c.tenant_id = v_tenant
      AND c.rol = 'usuario'
      AND c.intentos < 3
      AND (
        c.estado = 'pendiente'
        -- El arrendamiento vencido. COALESCE porque una fila tomada por
        -- código de v3 —justo antes de esta migración— tiene
        -- procesando_en pero no lease_until, y sin esto se quedaría
        -- colgada para siempre en 'procesando'.
        OR (c.estado = 'procesando'
            AND COALESCE(c.lease_until,
                         c.procesando_en + hermes.chat_lease()) <= now())
      )
      -- Y no se le quita el trabajo a un worker que sigue vivo.
      AND NOT EXISTS (
            SELECT 1 FROM public.hermes_chat o
            WHERE o.tenant_id = c.tenant_id
              AND o.conversation_key IS NOT DISTINCT FROM c.conversation_key
              AND o.rol = 'usuario'
              AND o.id <> c.id
              AND o.estado = 'procesando'
              AND COALESCE(o.lease_until,
                           o.procesando_en + hermes.chat_lease()) > now()
          )
  ),
  elegidos AS (
    SELECT c.id
    FROM public.hermes_chat c
    -- `k.id` y no `id`: RETURNS TABLE (id …) hace que `id` sea también
    -- una variable de PL/pgSQL y sin calificar es ambiguo.
    WHERE c.id IN (SELECT k.id FROM candidatos k WHERE k.puesto = 1)
    ORDER BY c.creado_en, c.id
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 1), 10))
  ),
  tomados AS (
    UPDATE public.hermes_chat c
    SET estado = 'procesando',
        procesando_en = now(),
        recibido_en = COALESCE(c.recibido_en, now()),
        intentos = c.intentos + 1,
        estado_detalle = NULL,
        -- LO QUE HACE EL FENCING. Token nuevo en cada toma: el worker
        -- anterior conserva el suyo, que a partir de aquí ya no vale
        -- para nada. No hace falta que se entere ni que esté vivo.
        claim_token = gen_random_uuid(),
        lease_until = now() + hermes.chat_lease()
    FROM elegidos e
    WHERE c.id = e.id
    RETURNING c.*
  )
  SELECT t.id, t.texto, t.pantalla, t.creado_en,
         t.user_id, p.full_name, p.email, p.role,
         t.conversation_key, t.estado, t.intentos,
         t.origin_platform, t.origin_chat_id, t.origin_message_id,
         t.claim_token, t.lease_until, t.context_epoch
  FROM tomados t
  LEFT JOIN public.profiles p ON p.id = t.user_id AND p.tenant_id = t.tenant_id
  ORDER BY t.creado_en;
END $$;

REVOKE ALL ON FUNCTION hermes.chat_tomar(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.chat_tomar(integer) TO hermes_readonly;

-- ------------------------------------------------------------
-- 6. RENOVAR EL ARRENDAMIENTO
-- ------------------------------------------------------------
-- Un worker que lleva cuatro minutos razonando está vivo, no colgado.
-- Sin esto la única forma de no perder el mensaje era que el trabajo
-- durara menos de cinco minutos siempre — que no es una garantía, es
-- una esperanza.
--
-- Renueva también si el arrendamiento YA venció, mientras nadie lo haya
-- retomado. Si el token todavía coincide es que el mensaje sigue siendo
-- suyo: nadie perdió nada por que llegara tarde.
CREATE OR REPLACE FUNCTION hermes.chat_renovar(p_mensaje_id bigint, p_claim_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_fila   record;
  v_actual record;
BEGIN
  IF p_claim_token IS NULL THEN
    RAISE EXCEPTION 'chat_renovar necesita el claim_token que devolvió chat_tomar()';
  END IF;

  UPDATE public.hermes_chat c
  SET lease_until = now() + hermes.chat_lease()
  WHERE c.tenant_id = v_tenant
    AND c.id = p_mensaje_id
    AND c.estado = 'procesando'
    AND c.claim_token = p_claim_token
  RETURNING c.id, c.lease_until INTO v_fila;

  IF v_fila.id IS NOT NULL THEN
    RETURN json_build_object(
      'ok', true, 'renovado', true,
      'lease_until', v_fila.lease_until,
      'restan_segundos', round(extract(epoch FROM v_fila.lease_until - now()))::int);
  END IF;

  -- No se pudo. Decir POR QUÉ importa: "sigue trabajando" y "para ya, el
  -- mensaje es de otro" son cosas distintas para el que pregunta.
  SELECT c.estado, c.claim_token INTO v_actual
  FROM public.hermes_chat c
  WHERE c.tenant_id = v_tenant AND c.id = p_mensaje_id;

  -- El orden de las preguntas importa. Primero el estado y luego el token:
  -- al revés, un mensaje que ya volvió a la cola —y que por tanto tiene el
  -- claim_token en NULL— se reportaría como "te lo quitaron", que no es lo
  -- que pasó y manda a buscar un culpable que no existe.
  IF v_actual.estado IS NULL THEN
    RETURN json_build_object('ok', false, 'renovado', false,
                             'motivo', 'inexistente');
  ELSIF v_actual.estado = 'respondido' THEN
    RETURN json_build_object('ok', false, 'renovado', false,
                             'motivo', 'ya_respondido', 'abandonar', true);
  ELSIF v_actual.estado <> 'procesando' THEN
    RETURN json_build_object('ok', false, 'renovado', false,
                             'motivo', 'no_esta_en_proceso',
                             'estado', v_actual.estado, 'abandonar', true);
  ELSE
    RETURN json_build_object('ok', false, 'renovado', false,
                             'motivo', 'claim_reemplazado',
                             'abandonar', true);
  END IF;
END $$;

REVOKE ALL ON FUNCTION hermes.chat_renovar(bigint, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.chat_renovar(bigint, uuid) TO hermes_readonly;

-- ------------------------------------------------------------
-- 7. FALLAR — VERSIÓN VIEJA, AJUSTADA
-- ------------------------------------------------------------
-- Misma firma y mismo comportamiento; solo suelta además el claim, para
-- que el reintento salga con token nuevo y el worker que falló no
-- conserve una llave que ya no abre nada.
CREATE OR REPLACE FUNCTION hermes.chat_error(p_mensaje_id bigint, p_error text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_fila   record;
BEGIN
  UPDATE public.hermes_chat
  SET estado = CASE WHEN intentos >= 3 THEN 'error' ELSE 'pendiente' END,
      error_en = now(),
      ultimo_error = left(btrim(COALESCE(p_error, 'sin detalle')), 500),
      estado_detalle = NULL,
      procesando_en = NULL,
      claim_token = NULL,
      lease_until = NULL
  WHERE tenant_id = v_tenant AND id = p_mensaje_id AND estado <> 'respondido'
  RETURNING id, estado, intentos INTO v_fila;

  IF v_fila.id IS NULL THEN
    RETURN json_build_object('ok', true, 'cambiado', false,
                             'motivo', 'ya respondido o inexistente');
  END IF;

  RETURN json_build_object('ok', true, 'cambiado', true,
                           'estado', v_fila.estado, 'intentos', v_fila.intentos,
                           'reintentable', v_fila.estado = 'pendiente');
END $$;

-- ------------------------------------------------------------
-- 8. RESPONDER — VERSIÓN VIEJA, AJUSTADA
-- ------------------------------------------------------------
-- Igual que en v3 salvo dos cosas: suelta el arrendamiento al terminar y
-- la respuesta hereda la época de la pregunta.
CREATE OR REPLACE FUNCTION hermes.chat_responder(
  p_mensaje_id bigint, p_texto text, p_acciones jsonb DEFAULT NULL::jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant  uuid := '00000000-0000-0000-0000-000000000001';
  v_malos   text;
  v_estado  text;
  v_conv    text;
  v_epoca   integer;
  v_previa  bigint;
  v_nueva   bigint;
BEGIN
  IF COALESCE(btrim(p_texto), '') = '' THEN RAISE EXCEPTION 'Respuesta vacía'; END IF;

  SELECT estado, conversation_key, context_epoch
  INTO v_estado, v_conv, v_epoca
  FROM public.hermes_chat
  WHERE tenant_id = v_tenant AND id = p_mensaje_id;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'El mensaje % no existe en este tenant', p_mensaje_id;
  END IF;

  IF v_estado = 'respondido' THEN
    SELECT id INTO v_previa
    FROM public.hermes_chat
    WHERE tenant_id = v_tenant AND rol = 'hermes' AND responde_a = p_mensaje_id
    LIMIT 1;
    RETURN json_build_object('ok', true, 'duplicado', true, 'respuesta_id', v_previa);
  END IF;

  -- Los códigos se comprueban AQUÍ, mientras Hermes todavía puede
  -- corregirlos. Si se descubriera al abrir la factura, el mostrador
  -- vería una pantalla a medio llenar y nadie sabría por qué.
  IF p_acciones IS NOT NULL AND p_acciones ->> 'tipo' = 'preparar_venta' THEN
    SELECT string_agg(DISTINCT quote_literal(x.cod), ', ')
    INTO v_malos
    FROM (
      SELECT btrim(e ->> 'codigo') AS cod
      FROM jsonb_array_elements(COALESCE(p_acciones -> 'lineas', '[]'::jsonb)) e
    ) x
    WHERE COALESCE(x.cod, '') = ''
       OR NOT EXISTS (
            SELECT 1 FROM public.productos p
            WHERE p.tenant_id = v_tenant AND p.codigo = x.cod
          );

    IF v_malos IS NOT NULL THEN
      RAISE EXCEPTION
        'Estos códigos no existen en el catálogo: %. Usa el "codigo" exacto de la vista de productos, copiado tal cual.',
        v_malos;
    END IF;
  END IF;

  IF p_acciones IS NOT NULL AND p_acciones ->> 'estado' IS NULL THEN
    p_acciones := p_acciones || jsonb_build_object('estado', 'propuesta');
  END IF;

  INSERT INTO public.hermes_chat
    (tenant_id, rol, texto, acciones, responde_a, conversation_key,
     origin_platform, context_epoch)
  VALUES
    (v_tenant, 'hermes', btrim(p_texto), p_acciones, p_mensaje_id, v_conv,
     'hermes', v_epoca)
  RETURNING id INTO v_nueva;

  UPDATE public.hermes_chat
  SET estado = 'respondido', respondido_en = now(), estado_detalle = NULL,
      lease_until = NULL
  WHERE tenant_id = v_tenant AND id = p_mensaje_id;

  RETURN json_build_object('ok', true, 'duplicado', false, 'respuesta_id', v_nueva);

EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_previa
    FROM public.hermes_chat
    WHERE tenant_id = v_tenant AND rol = 'hermes' AND responde_a = p_mensaje_id
    LIMIT 1;
    RETURN json_build_object('ok', true, 'duplicado', true, 'respuesta_id', v_previa);
END $$;

-- ------------------------------------------------------------
-- 9. LAS VERSIONES CON TOKEN
-- ------------------------------------------------------------
-- >>> POR QUÉ EL TOKEN NO LLEVA `DEFAULT NULL` <<<
-- Sería lo cómodo, y rompería el canal. Con un DEFAULT, una llamada de
-- tres argumentos encajaría a la vez en chat_responder(bigint,text,jsonb)
-- y en chat_responder(bigint,text,jsonb,uuid DEFAULT NULL), y Postgres
-- contesta
--
--     42725: function hermes.chat_responder(bigint, text, jsonb) is not unique
--
-- Es exactamente la mina que v3 desactivó al borrar la sobrecarga de dos
-- argumentos. Sin DEFAULT, cada aridad tiene una sola candidata: las
-- llamadas viejas van a la vieja y las de cuatro a la nueva.
--
-- >>> LA REGLA DEL FENCING, EN UNA FRASE <<<
-- Manda el token, no el reloj. Si el token sigue coincidiendo, el mensaje
-- todavía es de ese worker aunque su arrendamiento haya vencido: nadie se
-- lo quitó y su respuesta es la buena. Si el token NO coincide, otro ya
-- se hizo cargo y lo que traiga el viejo se descarta sin escribir nada.
-- Rechazar por reloj tiraría a la basura respuestas correctas por llegar
-- tarde; rechazar por identidad no tira ninguna.

-- 9a. Progreso con token — y ADEMÁS renueva
-- Decir en qué anda es prueba de vida. Un worker que reporta cada pocos
-- segundos no debería perder el mensaje por reportar. La versión de dos
-- argumentos NO renueva: sin token no hay forma de saber quién habla.
CREATE OR REPLACE FUNCTION hermes.chat_estado(
  p_mensaje_id bigint, p_detalle text, p_claim_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_fila   record;
  v_actual record;
BEGIN
  IF p_claim_token IS NULL THEN
    RAISE EXCEPTION 'chat_estado con token necesita el claim_token de chat_tomar(); para la forma sin token usa chat_estado(id, detalle)';
  END IF;

  UPDATE public.hermes_chat c
  SET estado_detalle = left(btrim(COALESCE(p_detalle, '')), 120),
      lease_until = now() + hermes.chat_lease()
  WHERE c.tenant_id = v_tenant
    AND c.id = p_mensaje_id
    AND c.estado = 'procesando'
    AND c.claim_token = p_claim_token
  RETURNING c.id, c.estado, c.estado_detalle, c.lease_until INTO v_fila;

  IF v_fila.id IS NOT NULL THEN
    RETURN json_build_object(
      'ok', true, 'cambiado', true, 'estado', v_fila.estado,
      'detalle', v_fila.estado_detalle, 'renovado', true,
      'lease_until', v_fila.lease_until);
  END IF;

  SELECT c.estado, c.claim_token INTO v_actual
  FROM public.hermes_chat c
  WHERE c.tenant_id = v_tenant AND c.id = p_mensaje_id;

  -- Estado primero, token después: ver la nota en chat_renovar().
  IF v_actual.estado IS NULL THEN
    RETURN json_build_object('ok', false, 'cambiado', false, 'motivo', 'inexistente');
  ELSIF v_actual.estado <> 'procesando' THEN
    RETURN json_build_object('ok', false, 'cambiado', false,
                             'motivo', CASE WHEN v_actual.estado = 'respondido'
                                            THEN 'ya_respondido'
                                            ELSE 'no_esta_en_proceso' END,
                             'estado', v_actual.estado, 'abandonar', true);
  ELSE
    -- Sin esto, el worker viejo pisaría en la pantalla el "buscando en el
    -- catálogo" del worker que sí está trabajando. Se ve, y confunde.
    RETURN json_build_object('ok', false, 'cambiado', false,
                             'motivo', 'claim_reemplazado', 'abandonar', true);
  END IF;
END $$;

REVOKE ALL ON FUNCTION hermes.chat_estado(bigint, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.chat_estado(bigint, text, uuid) TO hermes_readonly;

-- 9b. Fallar con token
-- Aquí el fencing no es cosmético: sin él, el worker viejo devolvería a
-- 'pendiente' un mensaje que el worker nuevo tiene en la mano, y el
-- nuevo terminaría respondiendo un mensaje que la cola cree libre.
CREATE OR REPLACE FUNCTION hermes.chat_error(
  p_mensaje_id bigint, p_error text, p_claim_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_actual record;
BEGIN
  IF p_claim_token IS NULL THEN
    RAISE EXCEPTION 'chat_error con token necesita el claim_token de chat_tomar(); para la forma sin token usa chat_error(id, error)';
  END IF;

  SELECT c.estado, c.claim_token INTO v_actual
  FROM public.hermes_chat c
  WHERE c.tenant_id = v_tenant AND c.id = p_mensaje_id
  FOR UPDATE;

  IF v_actual.estado IS NULL THEN
    RETURN json_build_object('ok', false, 'cambiado', false, 'motivo', 'inexistente');
  END IF;

  -- Ya terminado: lo dice la versión de dos argumentos, sin drama.
  IF v_actual.estado = 'respondido' THEN
    RETURN hermes.chat_error(p_mensaje_id, p_error);
  END IF;

  -- Sin dueño. Pasa cuando el propio worker ya reportó el fallo y reintenta
  -- el aviso: chat_error suelta el claim, así que la segunda llamada llega
  -- con un token que no encaja con nadie. No es un relevo y decir
  -- "claim_reemplazado" mandaría a buscar un worker rival que no existe.
  IF v_actual.claim_token IS NULL THEN
    RETURN json_build_object('ok', true, 'cambiado', false,
                             'motivo', 'claim_ya_liberado',
                             'estado', v_actual.estado);
  END IF;

  IF v_actual.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN json_build_object('ok', false, 'cambiado', false,
                             'motivo', 'claim_reemplazado', 'abandonar', true);
  END IF;

  RETURN hermes.chat_error(p_mensaje_id, p_error);
END $$;

REVOKE ALL ON FUNCTION hermes.chat_error(bigint, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.chat_error(bigint, text, uuid) TO hermes_readonly;

-- 9c. Responder con token
CREATE OR REPLACE FUNCTION hermes.chat_responder(
  p_mensaje_id bigint, p_texto text, p_acciones jsonb, p_claim_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_actual record;
  v_previa bigint;
  v_res    json;
  v_venc   boolean;
BEGIN
  IF p_claim_token IS NULL THEN
    RAISE EXCEPTION 'chat_responder con token necesita el claim_token de chat_tomar(); para la forma sin token usa chat_responder(id, texto, acciones)';
  END IF;

  SELECT c.estado, c.claim_token, c.lease_until INTO v_actual
  FROM public.hermes_chat c
  WHERE c.tenant_id = v_tenant AND c.id = p_mensaje_id;

  IF v_actual.estado IS NULL THEN
    RAISE EXCEPTION 'El mensaje % no existe en este tenant', p_mensaje_id;
  END IF;

  -- Ya contestado: sigue siendo un duplicado, coincida el token o no. Se
  -- avisa de las dos cosas porque significan cosas distintas —"llegaste
  -- segundo" y "esto ya no era tuyo"— y el que reintenta querrá saber.
  IF v_actual.estado = 'respondido' THEN
    SELECT id INTO v_previa
    FROM public.hermes_chat
    WHERE tenant_id = v_tenant AND rol = 'hermes' AND responde_a = p_mensaje_id
    LIMIT 1;
    RETURN json_build_object(
      'ok', true, 'duplicado', true, 'respuesta_id', v_previa,
      'reemplazado', (v_actual.claim_token IS DISTINCT FROM p_claim_token));
  END IF;

  IF v_actual.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN json_build_object('ok', false, 'duplicado', false,
                             'motivo', 'claim_reemplazado', 'abandonar', true);
  END IF;

  -- El token coincide: es suyo. Se acepta aunque haya vencido, y se
  -- devuelve el aviso para que quede en los registros del gateway — un
  -- worker que responde sistemáticamente vencido está pidiendo un
  -- arrendamiento más largo o un chat_renovar() en medio.
  v_venc := (v_actual.lease_until IS NOT NULL AND v_actual.lease_until <= now());

  v_res := hermes.chat_responder(p_mensaje_id, p_texto, p_acciones);
  -- El cast de vuelta a json va explícito: jsonb || jsonb da jsonb, y no
  -- conviene depender de que exista una conversión automática al tipo de
  -- retorno.
  RETURN (v_res::jsonb || jsonb_build_object('lease_vencido', v_venc))::json;
END $$;

REVOKE ALL ON FUNCTION hermes.chat_responder(bigint, text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.chat_responder(bigint, text, jsonb, uuid) TO hermes_readonly;

-- ------------------------------------------------------------
-- 10. CORTAR EL CONTEXTO
-- ------------------------------------------------------------
-- El núcleo. No comprueba permisos: eso lo hacen las dos puertas de
-- abajo, cada una con su forma de saber de qué tenant se trata.
--
-- IDEMPOTENTE, y no con una ventana de tiempo: cortar un contexto que
-- todavía está vacío no hace nada. Pulsar el botón cinco veces seguidas
-- deja una sola época nueva, porque tras el primer corte no hay ningún
-- mensaje en la época actual y las otras cuatro llamadas no tienen nada
-- que cortar.
CREATE OR REPLACE FUNCTION hermes.cortar_contexto(
  p_tenant uuid, p_conversation_key text, p_por uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_epoca integer;
  v_hay   integer;
BEGIN
  IF COALESCE(btrim(p_conversation_key), '') = '' THEN
    RAISE EXCEPTION 'Falta la conversation_key';
  END IF;

  INSERT INTO public.hermes_conversaciones (tenant_id, conversation_key)
  VALUES (p_tenant, p_conversation_key)
  ON CONFLICT (tenant_id, conversation_key) DO NOTHING;

  -- FOR UPDATE es lo que hace que dos cortes simultáneos no avancen dos
  -- épocas. Sin él, los dos leerían la época 3, los dos escribirían 4, y
  -- el usuario que pulsó una vez se encontraría con dos cortes o con uno
  -- perdido según el orden.
  SELECT k.context_epoch INTO v_epoca
  FROM public.hermes_conversaciones k
  WHERE k.tenant_id = p_tenant AND k.conversation_key = p_conversation_key
  FOR UPDATE;

  SELECT count(*)::int INTO v_hay
  FROM public.hermes_chat c
  WHERE c.tenant_id = p_tenant
    AND c.conversation_key = p_conversation_key
    AND c.context_epoch = v_epoca;

  IF v_hay = 0 THEN
    RETURN json_build_object(
      'ok', true, 'cortado', false, 'epoca', v_epoca,
      'conversation_key', p_conversation_key,
      'motivo', 'el contexto actual ya estaba vacío');
  END IF;

  UPDATE public.hermes_conversaciones
  SET context_epoch = v_epoca + 1, cortado_en = now(), cortado_por = p_por
  WHERE tenant_id = p_tenant AND conversation_key = p_conversation_key;

  RETURN json_build_object(
    'ok', true, 'cortado', true,
    'epoca', v_epoca + 1, 'epoca_anterior', v_epoca,
    'mensajes_archivados', v_hay,
    'conversation_key', p_conversation_key);
END $$;

REVOKE ALL ON FUNCTION hermes.cortar_contexto(uuid, text, uuid) FROM PUBLIC;

-- 10a. La puerta de la pantalla — el botón "Nueva conversación"
CREATE OR REPLACE FUNCTION public.hermes_nuevo_contexto(p_conversation_key text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_conv   text;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión'; END IF;

  -- La misma fórmula que hermes_escribir(). Fija por tenant.
  v_conv := 'agent:main:' ||
            CASE WHEN v_tenant = '00000000-0000-0000-0000-000000000001'::uuid
                 THEN 'morla' ELSE 'tenant' END
            || ':tenant:' || v_tenant::text;

  -- Se acepta que la manden, pero solo la suya. Sin esto, cualquier
  -- usuario con sesión podría borrarle el contexto a otra empresa
  -- mandando su clave.
  IF p_conversation_key IS NOT NULL AND btrim(p_conversation_key) <> v_conv THEN
    RAISE EXCEPTION 'Esa conversación no es de esta empresa';
  END IF;

  RETURN hermes.cortar_contexto(v_tenant, v_conv, auth.uid());
END $$;

-- 10b. La puerta de Hermes — para un "/nuevo" desde cualquier canal
CREATE OR REPLACE FUNCTION hermes.chat_nuevo_contexto(p_conversation_key text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  RETURN hermes.cortar_contexto(v_tenant, btrim(p_conversation_key), NULL);
END $$;

REVOKE ALL ON FUNCTION hermes.chat_nuevo_contexto(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.chat_nuevo_contexto(text) TO hermes_readonly;

-- 10c. Mirar la época actual sin cortar nada
CREATE OR REPLACE FUNCTION hermes.chat_contexto(p_conversation_key text)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT json_build_object(
           'conversation_key', k.conversation_key,
           'epoca', k.context_epoch,
           'cortado_en', k.cortado_en,
           'mensajes_en_esta_epoca', (
             SELECT count(*) FROM public.hermes_chat c
             WHERE c.tenant_id = k.tenant_id
               AND c.conversation_key = k.conversation_key
               AND c.context_epoch = k.context_epoch))
  FROM public.hermes_conversaciones k
  WHERE k.tenant_id = '00000000-0000-0000-0000-000000000001'
    AND k.conversation_key = btrim(p_conversation_key);
$$;

REVOKE ALL ON FUNCTION hermes.chat_contexto(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.chat_contexto(text) TO hermes_readonly;

-- ------------------------------------------------------------
-- 11. ESCRIBIR — MISMA FIRMA, AHORA DENTRO DE UNA ÉPOCA
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hermes_escribir(
  p_texto text,
  p_pantalla jsonb DEFAULT NULL::jsonb,
  p_origin_chat_id text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_texto  text := btrim(p_texto);
  v_id     bigint;
  v_prev   record;
  v_pantalla jsonb := p_pantalla;
  v_cands  jsonb;
  v_conv   text;
  v_epoca  integer;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión'; END IF;
  IF COALESCE(v_texto, '') = '' THEN RAISE EXCEPTION 'Mensaje vacío'; END IF;

  -- Fija por tenant, no por navegador: la comparten WebUI, MotoFlow y el
  -- WhatsApp autorizado. Ni este botón ni "Nueva conversación" la parten.
  v_conv := 'agent:main:' ||
            CASE WHEN v_tenant = '00000000-0000-0000-0000-000000000001'::uuid
                 THEN 'morla' ELSE 'tenant' END
            || ':tenant:' || v_tenant::text;

  SELECT k.context_epoch INTO v_epoca
  FROM public.hermes_conversaciones k
  WHERE k.tenant_id = v_tenant AND k.conversation_key = v_conv;

  IF v_epoca IS NULL THEN
    INSERT INTO public.hermes_conversaciones (tenant_id, conversation_key)
    VALUES (v_tenant, v_conv)
    ON CONFLICT (tenant_id, conversation_key) DO NOTHING;
    v_epoca := 1;
  END IF;

  -- El anti-dictado, acotado a la época actual: un fragmento de antes de
  -- un corte no debe absorber al primer mensaje del contexto nuevo.
  SELECT c.id, c.texto INTO v_prev
  FROM public.hermes_chat c
  WHERE c.tenant_id = v_tenant
    AND c.user_id IS NOT DISTINCT FROM auth.uid()
    AND c.rol = 'usuario'
    AND c.estado = 'pendiente'
    AND c.context_epoch = v_epoca
    AND c.creado_en > now() - interval '10 seconds'
  ORDER BY c.creado_en DESC, c.id DESC
  LIMIT 1;

  IF v_prev.id IS NOT NULL THEN
    IF v_prev.texto = v_texto THEN
      RETURN json_build_object('id', v_prev.id, 'enviado', true, 'repetido', true);
    END IF;
    -- El dictado manda trozos que crecen: "tenemos", "tenemos motul"…
    IF starts_with(v_texto, v_prev.texto) THEN
      UPDATE public.hermes_chat SET estado = 'respondido', respondido = true
      WHERE id = v_prev.id;
    END IF;
  END IF;

  IF v_tenant = '00000000-0000-0000-0000-000000000001'::uuid
     AND v_texto ~* '(precio|costo|cuánto|cuanto|vale|cotiz|tien|teng|tenem|hay |queda|disponib|existencia|stock|inventario|busca|búsca|consigue|vend|cobr|factur)'
  THEN
    BEGIN
      SELECT jsonb_agg(to_jsonb(b)) INTO v_cands
      FROM (SELECT codigo, descripcion, marca, precio, existencia, ubicacion
            FROM hermes.buscar_producto(v_texto, 6)) b;
    EXCEPTION WHEN OTHERS THEN
      v_cands := NULL;
    END;

    IF v_cands IS NOT NULL THEN
      v_pantalla := COALESCE(v_pantalla, '{}'::jsonb) || jsonb_build_object(
        'candidatos', v_cands,
        'candidatos_son',
          'Resultados REALES de hermes.buscar_producto sobre esta pregunta, ya consultados por MotoFlow. ' ||
          'Precio y existencia salen de la base en este instante: puedes citarlos sin volver a consultar. ' ||
          'Van ordenados por cuánto encajan; el primero no siempre es el bueno, elige tú. ' ||
          'Si ninguno encaja, dilo y busca con hermes.buscar_producto(otro_texto).');
    END IF;
  END IF;

  INSERT INTO public.hermes_chat
    (tenant_id, user_id, rol, texto, pantalla, conversation_key,
     origin_platform, origin_chat_id, estado, context_epoch)
  VALUES
    (v_tenant, auth.uid(), 'usuario', v_texto, v_pantalla, v_conv,
     'motoflow', COALESCE(p_origin_chat_id, auth.uid()::text), 'pendiente', v_epoca)
  RETURNING id INTO v_id;

  UPDATE public.hermes_chat SET origin_message_id = v_id::text WHERE id = v_id;

  -- Mínimo a propósito: Postgres corta el payload en 8000 bytes y la
  -- conexión se cae entera si se pasa.
  PERFORM pg_notify('hermes_chat', json_build_object(
    'id', v_id, 'tenant_id', v_tenant, 'conversation_key', v_conv,
    'context_epoch', v_epoca,
    'origin_platform', 'motoflow', 'texto', left(v_texto, 300))::text);

  RETURN json_build_object('id', v_id, 'enviado', true,
                           'conversation_key', v_conv, 'context_epoch', v_epoca);
END $function$;

-- ------------------------------------------------------------
-- 12. LA COLA, PARA MIRARLA
-- ------------------------------------------------------------
-- Gana columnas, no pierde ninguna. Sigue siendo SOLO consulta: quien
-- procesa usa chat_tomar().
DROP FUNCTION IF EXISTS hermes.chat_pendientes(integer);

CREATE OR REPLACE FUNCTION hermes.chat_pendientes(p_limite integer DEFAULT 10)
RETURNS TABLE (
  id bigint, texto text, pantalla jsonb, creado_en timestamptz,
  user_id uuid, usuario text, email text, rol text,
  conversation_key text, estado text, intentos smallint,
  lease_until timestamptz, lease_vigente boolean, context_epoch integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id, c.texto, c.pantalla, c.creado_en,
         c.user_id, p.full_name, p.email, p.role,
         c.conversation_key, c.estado, c.intentos,
         c.lease_until,
         (c.estado = 'procesando'
          AND COALESCE(c.lease_until, c.procesando_en + hermes.chat_lease()) > now()),
         c.context_epoch
  FROM public.hermes_chat c
  LEFT JOIN public.profiles p
         ON p.id = c.user_id AND p.tenant_id = c.tenant_id
  WHERE c.tenant_id = '00000000-0000-0000-0000-000000000001'
    AND c.rol = 'usuario'
    AND c.estado IN ('pendiente', 'procesando')
  ORDER BY c.creado_en
  LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 10), 50));
$$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('hermes_canal_v4.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
