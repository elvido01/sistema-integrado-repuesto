-- =====================================================================
-- Equipo IA — las puertas
-- ---------------------------------------------------------------------
-- Dos juegos de funciones, y la diferencia importa:
--
--   hermes.equipo_*   las usan los agentes. Van en el esquema `hermes`
--                     porque ahí es donde tiene permiso hermes_readonly.
--   public.equipo_*   las usa la pantalla. Comprueban correo y empresa.
--
-- Ninguna tabla tiene INSERT ni UPDATE concedido. Todo pasa por aquí, que
-- es donde vive quién-puede-qué. Escribir directo no es una alternativa
-- más lenta: no existe.
--
-- El patrón de reclamación es el mismo que hermes.chat_tomar() del
-- contrato v4 —FOR UPDATE SKIP LOCKED, claim_token, arrendamiento— y no
-- por parecido: es el que ya está probado en producción con 41 pruebas.
--
-- Requiere sql/equipo_ia.sql.
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

DO $$ BEGIN
  IF to_regclass('public.equipo_mensajes') IS NULL THEN
    RAISE EXCEPTION 'Falta aplicar sql/equipo_ia.sql primero.';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 0. CUÁNTO DURA UN ARRENDAMIENTO AQUÍ
-- ------------------------------------------------------------
-- Más largo que el del chat: preparar una promoción con copy y concepto
-- de arte no cabe en cinco minutos, y perder el trabajo a medias sería
-- rehacerlo entero.
CREATE OR REPLACE FUNCTION hermes.equipo_lease()
RETURNS interval LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT interval '15 minutes' $$;

-- ------------------------------------------------------------
-- 1. ABRIR UN TRABAJO  (§6)
-- ------------------------------------------------------------
-- Lo llama la pantalla cuando Elvido pide algo, y también Hermes cuando lo
-- que entra por el chat merece coordinación.
CREATE OR REPLACE FUNCTION hermes.equipo_abrir_trabajo(
  p_tenant           uuid,
  p_titulo           text,
  p_peticion         text,
  p_tipo             text DEFAULT 'consulta',
  p_conversation_key text DEFAULT NULL,
  p_context_epoch    integer DEFAULT NULL,
  p_origin_platform  text DEFAULT NULL,
  p_origin_chat_id   text DEFAULT NULL,
  p_origin_message_id text DEFAULT NULL,
  p_solicitado_por   uuid DEFAULT NULL,
  p_idempotency_key  text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_conv  text;
  v_epoca integer;
  v_id    uuid;
  v_idem  text;
  v_msg   uuid;
BEGIN
  IF COALESCE(btrim(p_peticion), '') = '' THEN
    RAISE EXCEPTION 'La petición viene vacía';
  END IF;

  -- La clave canónica del tenant, la misma que emite hermes_escribir().
  v_conv := COALESCE(NULLIF(btrim(COALESCE(p_conversation_key, '')), ''),
                     'agent:main:' ||
                     CASE WHEN p_tenant = '00000000-0000-0000-0000-000000000001'::uuid
                          THEN 'morla' ELSE 'tenant' END
                     || ':tenant:' || p_tenant::text);

  -- La época sale de la conversación, no se inventa: un trabajo abierto
  -- después de "Nueva conversación" pertenece al tramo nuevo.
  SELECT k.context_epoch INTO v_epoca
  FROM public.hermes_conversaciones k
  WHERE k.tenant_id = p_tenant AND k.conversation_key = v_conv;
  v_epoca := COALESCE(p_context_epoch, v_epoca, 1);

  v_idem := COALESCE(NULLIF(btrim(COALESCE(p_idempotency_key, '')), ''),
                     'trabajo:' || md5(p_tenant::text || v_conv || v_epoca::text || btrim(p_peticion)));

  -- El mismo evento dos veces devuelve el trabajo que ya existe (§6-E).
  SELECT m.trabajo_id INTO v_id
  FROM public.equipo_mensajes m
  WHERE m.tenant_id = p_tenant AND m.idempotency_key = v_idem;

  IF v_id IS NOT NULL THEN
    RETURN json_build_object('ok', true, 'duplicado', true, 'trabajo_id', v_id);
  END IF;

  INSERT INTO public.equipo_trabajos
    (tenant_id, conversation_key, context_epoch, origin_platform, origin_chat_id,
     origin_message_id, solicitado_por, titulo, peticion, tipo)
  VALUES
    (p_tenant, v_conv, v_epoca, p_origin_platform, p_origin_chat_id,
     p_origin_message_id, p_solicitado_por, left(btrim(p_titulo), 160), btrim(p_peticion),
     CASE WHEN p_tipo IN ('consulta','promocion','seguimiento','compleja') THEN p_tipo ELSE 'consulta' END)
  RETURNING id INTO v_id;

  -- La petición de la persona queda como el primer mensaje del hilo: sin
  -- ella, la auditoría empieza a mitad de la historia.
  INSERT INTO public.equipo_mensajes
    (tenant_id, trabajo_id, conversation_key, context_epoch, correlation_id,
     profundidad, from_agent, to_agent, message_type, status, summary, payload, idempotency_key)
  VALUES
    (p_tenant, v_id, v_conv, v_epoca, v_id,
     0, 'elvido', 'hermes', 'user_request', 'completed',
     left(btrim(p_peticion), 200), jsonb_build_object('texto', btrim(p_peticion)), v_idem)
  RETURNING id INTO v_msg;

  PERFORM pg_notify('equipo_ia', json_build_object(
    'tipo', 'trabajo_nuevo', 'trabajo_id', v_id, 'tenant_id', p_tenant)::text);

  RETURN json_build_object('ok', true, 'duplicado', false,
                           'trabajo_id', v_id, 'mensaje_id', v_msg,
                           'conversation_key', v_conv, 'context_epoch', v_epoca);
END $$;

REVOKE ALL ON FUNCTION hermes.equipo_abrir_trabajo(uuid,text,text,text,text,integer,text,text,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.equipo_abrir_trabajo(uuid,text,text,text,text,integer,text,text,text,uuid,text) TO hermes_readonly;

-- ------------------------------------------------------------
-- 2. DELEGAR  (§4)
-- ------------------------------------------------------------
-- Quién puede delegarle a quién lo decide el trigger, no esta función. Lo
-- que sí se decide aquí es la profundidad y la idempotencia.
CREATE OR REPLACE FUNCTION hermes.equipo_delegar(
  p_trabajo_id      uuid,
  p_from            text,
  p_to              text,
  p_message_type    text,
  p_summary         text,
  p_payload         jsonb DEFAULT '{}'::jsonb,
  p_parent          uuid DEFAULT NULL,
  p_requires_approval boolean DEFAULT false,
  p_priority        smallint DEFAULT 5,
  p_idempotency_key text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_t     record;
  v_prof  smallint := 0;
  v_corr  uuid;
  v_idem  text;
  v_id    uuid;
  v_prev  uuid;
BEGIN
  SELECT * INTO v_t FROM public.equipo_trabajos WHERE id = p_trabajo_id;
  IF v_t.id IS NULL THEN RAISE EXCEPTION 'El trabajo % no existe', p_trabajo_id; END IF;
  IF v_t.estado IN ('completed','cancelled','expired') THEN
    RETURN json_build_object('ok', false, 'motivo', 'trabajo_cerrado', 'estado', v_t.estado);
  END IF;

  v_corr := v_t.id;
  IF p_parent IS NOT NULL THEN
    SELECT m.profundidad + 1, m.correlation_id INTO v_prof, v_corr
    FROM public.equipo_mensajes m WHERE m.id = p_parent;
    v_prof := COALESCE(v_prof, 0);
    v_corr := COALESCE(v_corr, v_t.id);
  END IF;

  -- El tope de profundidad. La columna tiene su CHECK, pero rebotar con un
  -- error de restricción no dice qué pasó; esto sí.
  IF v_prof > 3 THEN
    RETURN json_build_object('ok', false, 'motivo', 'profundidad_maxima',
      'detalle', 'La cadena de delegación llegó a 3. Se corta aquí para no dar vueltas.');
  END IF;

  v_idem := COALESCE(NULLIF(btrim(COALESCE(p_idempotency_key, '')), ''),
                     md5(p_trabajo_id::text || p_from || p_to || p_message_type ||
                         COALESCE(p_parent::text, '') || COALESCE(p_payload::text, '')));

  SELECT id INTO v_prev FROM public.equipo_mensajes
  WHERE tenant_id = v_t.tenant_id AND idempotency_key = v_idem;
  IF v_prev IS NOT NULL THEN
    RETURN json_build_object('ok', true, 'duplicado', true, 'mensaje_id', v_prev);
  END IF;

  INSERT INTO public.equipo_mensajes
    (tenant_id, trabajo_id, conversation_key, context_epoch, correlation_id,
     parent_message_id, profundidad, from_agent, to_agent, message_type,
     status, priority, summary, payload, requires_approval,
     approval_status, idempotency_key)
  VALUES
    (v_t.tenant_id, v_t.id, v_t.conversation_key, v_t.context_epoch, v_corr,
     p_parent, v_prof, p_from, p_to, p_message_type,
     'pending', GREATEST(1, LEAST(COALESCE(p_priority, 5), 9)),
     left(btrim(p_summary), 200), COALESCE(p_payload, '{}'::jsonb), COALESCE(p_requires_approval, false),
     CASE WHEN COALESCE(p_requires_approval, false) THEN 'pending' END, v_idem)
  RETURNING id INTO v_id;

  UPDATE public.equipo_trabajos
  SET estado = 'waiting_dependency',
      iniciado_en = COALESCE(iniciado_en, now())
  WHERE id = v_t.id AND estado IN ('pending','claimed','processing');

  PERFORM pg_notify('equipo_ia', json_build_object(
    'tipo', 'delegacion', 'trabajo_id', v_t.id, 'mensaje_id', v_id,
    'para', p_to, 'tenant_id', v_t.tenant_id)::text);

  RETURN json_build_object('ok', true, 'duplicado', false,
                           'mensaje_id', v_id, 'profundidad', v_prof);
END $$;

REVOKE ALL ON FUNCTION hermes.equipo_delegar(uuid,text,text,text,text,jsonb,uuid,boolean,smallint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.equipo_delegar(uuid,text,text,text,text,jsonb,uuid,boolean,smallint,text) TO hermes_readonly;

-- ------------------------------------------------------------
-- 3. TOMAR TRABAJO  (§4, §5)
-- ------------------------------------------------------------
-- Mismo patrón que hermes.chat_tomar(): reclamación atómica, token nuevo
-- en cada toma, arrendamiento explícito y rescate del abandonado.
CREATE OR REPLACE FUNCTION hermes.equipo_tomar(
  p_agente text, p_limite integer DEFAULT 1)
RETURNS TABLE (
  id uuid, trabajo_id uuid, correlation_id uuid, parent_message_id uuid,
  from_agent text, message_type text, summary text, payload jsonb,
  priority smallint, profundidad smallint, attempts smallint,
  conversation_key text, context_epoch integer,
  claim_token uuid, lease_until timestamptz,
  peticion text, trabajo_tipo text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_agente NOT IN ('hermes','jarvis','comercial_creativo') THEN
    RAISE EXCEPTION 'Agente desconocido: %', p_agente;
  END IF;

  RETURN QUERY
  WITH elegidos AS (
    SELECT m.id
    FROM public.equipo_mensajes m
    WHERE m.to_agent = p_agente
      AND m.attempts < 3
      AND (
        m.status = 'pending'
        OR (m.status IN ('claimed','processing')
            AND COALESCE(m.lease_until, m.claimed_at + hermes.equipo_lease()) <= now())
      )
      -- Lo que espera aprobación no se trabaja. Es el freno del §9: una
      -- acción importante no se ejecuta por su cuenta.
      AND NOT (m.requires_approval AND COALESCE(m.approval_status, 'pending') <> 'approved')
    ORDER BY m.priority, m.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 1), 5))
  ),
  tomados AS (
    UPDATE public.equipo_mensajes m
    SET status = 'processing',
        claimed_at = now(),
        claim_token = gen_random_uuid(),
        lease_until = now() + hermes.equipo_lease(),
        attempts = m.attempts + 1
    FROM elegidos e
    WHERE m.id = e.id
    RETURNING m.*
  )
  SELECT t.id, t.trabajo_id, t.correlation_id, t.parent_message_id,
         t.from_agent, t.message_type, t.summary, t.payload,
         t.priority, t.profundidad, t.attempts,
         t.conversation_key, t.context_epoch,
         t.claim_token, t.lease_until,
         w.peticion, w.tipo
  FROM tomados t
  JOIN public.equipo_trabajos w ON w.id = t.trabajo_id
  ORDER BY t.priority, t.created_at;
END $$;

REVOKE ALL ON FUNCTION hermes.equipo_tomar(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.equipo_tomar(text,integer) TO hermes_readonly;

-- ------------------------------------------------------------
-- 4. RENOVAR
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION hermes.equipo_renovar(p_mensaje_id uuid, p_claim_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_hasta timestamptz; v_estado text; v_tok uuid;
BEGIN
  UPDATE public.equipo_mensajes m
  SET lease_until = now() + hermes.equipo_lease()
  WHERE m.id = p_mensaje_id AND m.status = 'processing' AND m.claim_token = p_claim_token
  RETURNING m.lease_until INTO v_hasta;

  IF v_hasta IS NOT NULL THEN
    RETURN json_build_object('ok', true, 'renovado', true, 'lease_until', v_hasta);
  END IF;

  SELECT m.status, m.claim_token INTO v_estado, v_tok
  FROM public.equipo_mensajes m WHERE m.id = p_mensaje_id;

  IF v_estado IS NULL THEN
    RETURN json_build_object('ok', false, 'renovado', false, 'motivo', 'inexistente');
  ELSIF v_estado = 'completed' THEN
    RETURN json_build_object('ok', false, 'renovado', false, 'motivo', 'ya_completado', 'abandonar', true);
  ELSIF v_estado <> 'processing' THEN
    RETURN json_build_object('ok', false, 'renovado', false,
                             'motivo', 'no_esta_en_proceso', 'estado', v_estado, 'abandonar', true);
  ELSE
    RETURN json_build_object('ok', false, 'renovado', false,
                             'motivo', 'claim_reemplazado', 'abandonar', true);
  END IF;
END $$;

REVOKE ALL ON FUNCTION hermes.equipo_renovar(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.equipo_renovar(uuid,uuid) TO hermes_readonly;

-- ------------------------------------------------------------
-- 5. RESPONDER  (§4.1, §4.2)
-- ------------------------------------------------------------
-- Cierra el mensaje que se tomó y, si toca, crea la respuesta de vuelta a
-- Hermes. Las dos cosas juntas o ninguna.
CREATE OR REPLACE FUNCTION hermes.equipo_responder(
  p_mensaje_id  uuid,
  p_claim_token uuid,
  p_summary     text,
  p_payload     jsonb DEFAULT '{}'::jsonb,
  p_tipo_respuesta text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_m    record;
  v_tipo text;
  v_resp uuid;
  v_idem text;
  v_prev uuid;
BEGIN
  SELECT * INTO v_m FROM public.equipo_mensajes WHERE id = p_mensaje_id;
  IF v_m.id IS NULL THEN RAISE EXCEPTION 'El mensaje % no existe', p_mensaje_id; END IF;

  -- Ya cerrado: se devuelve lo que hay. Reintentar no duplica (§4.2).
  IF v_m.status = 'completed' THEN
    SELECT id INTO v_prev FROM public.equipo_mensajes
    WHERE parent_message_id = p_mensaje_id AND from_agent = v_m.to_agent LIMIT 1;
    RETURN json_build_object('ok', true, 'duplicado', true, 'respuesta_id', v_prev);
  END IF;

  -- Manda el token, no el reloj: si el claim ya es de otro, esto no escribe.
  IF v_m.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN json_build_object('ok', false, 'motivo', 'claim_reemplazado', 'abandonar', true);
  END IF;

  UPDATE public.equipo_mensajes
  SET status = 'completed', completed_at = now(), lease_until = NULL, error = NULL
  WHERE id = p_mensaje_id;

  -- Un mensaje que vino de una persona no genera respuesta interna.
  IF v_m.from_agent = 'elvido' THEN
    RETURN json_build_object('ok', true, 'duplicado', false, 'respuesta_id', NULL);
  END IF;

  v_tipo := COALESCE(p_tipo_respuesta, CASE v_m.message_type
              WHEN 'data_request'      THEN 'data_result'
              WHEN 'creative_request'  THEN 'draft_result'
              WHEN 'execution_request' THEN 'execution_result'
              ELSE 'data_result' END);

  v_idem := md5('resp:' || p_mensaje_id::text);
  SELECT id INTO v_prev FROM public.equipo_mensajes
  WHERE tenant_id = v_m.tenant_id AND idempotency_key = v_idem;
  IF v_prev IS NOT NULL THEN
    RETURN json_build_object('ok', true, 'duplicado', true, 'respuesta_id', v_prev);
  END IF;

  INSERT INTO public.equipo_mensajes
    (tenant_id, trabajo_id, conversation_key, context_epoch, correlation_id,
     parent_message_id, profundidad, from_agent, to_agent, message_type,
     status, summary, payload, idempotency_key)
  VALUES
    (v_m.tenant_id, v_m.trabajo_id, v_m.conversation_key, v_m.context_epoch, v_m.correlation_id,
     v_m.id, v_m.profundidad, v_m.to_agent, v_m.from_agent, v_tipo,
     'pending', left(btrim(p_summary), 200), COALESCE(p_payload, '{}'::jsonb), v_idem)
  RETURNING id INTO v_resp;

  PERFORM pg_notify('equipo_ia', json_build_object(
    'tipo', 'respuesta', 'trabajo_id', v_m.trabajo_id, 'mensaje_id', v_resp,
    'para', v_m.from_agent, 'tenant_id', v_m.tenant_id)::text);

  RETURN json_build_object('ok', true, 'duplicado', false, 'respuesta_id', v_resp);
END $$;

REVOKE ALL ON FUNCTION hermes.equipo_responder(uuid,uuid,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.equipo_responder(uuid,uuid,text,jsonb,text) TO hermes_readonly;

-- ------------------------------------------------------------
-- 6. FALLAR  (§4.3, §4.4)
-- ------------------------------------------------------------
-- El error literal se guarda aunque el reintento salga bien: si algo falló
-- y luego funcionó, eso hay que poder verlo después.
CREATE OR REPLACE FUNCTION hermes.equipo_error(
  p_mensaje_id uuid, p_claim_token uuid, p_error text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_m record; v_final boolean;
BEGIN
  SELECT * INTO v_m FROM public.equipo_mensajes WHERE id = p_mensaje_id;
  IF v_m.id IS NULL THEN
    RETURN json_build_object('ok', false, 'motivo', 'inexistente');
  END IF;
  IF v_m.status = 'completed' THEN
    RETURN json_build_object('ok', true, 'cambiado', false, 'motivo', 'ya_completado');
  END IF;
  IF v_m.claim_token IS NOT NULL AND v_m.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN json_build_object('ok', false, 'motivo', 'claim_reemplazado', 'abandonar', true);
  END IF;

  v_final := v_m.attempts >= 3;

  UPDATE public.equipo_mensajes
  SET status = CASE WHEN v_final THEN 'failed' ELSE 'pending' END,
      error = left(btrim(COALESCE(p_error, 'sin detalle')), 1000),
      claim_token = NULL,
      lease_until = NULL
  WHERE id = p_mensaje_id;

  -- Si se agotaron los intentos, el trabajo entero se marca. Comercial-
  -- Creativo NO recibe datos inventados porque Jarvis falló (§6-D.4): sin
  -- data_result no hay delegación creativa, y el bloqueo se ve.
  IF v_final THEN
    UPDATE public.equipo_trabajos
    SET estado = 'failed', error = left(btrim(COALESCE(p_error, 'sin detalle')), 1000),
        terminado_en = now()
    WHERE id = v_m.trabajo_id;
  END IF;

  PERFORM pg_notify('equipo_ia', json_build_object(
    'tipo', 'error', 'trabajo_id', v_m.trabajo_id, 'tenant_id', v_m.tenant_id)::text);

  RETURN json_build_object('ok', true, 'cambiado', true,
                           'estado', CASE WHEN v_final THEN 'failed' ELSE 'pending' END,
                           'intentos', v_m.attempts, 'reintentable', NOT v_final);
END $$;

REVOKE ALL ON FUNCTION hermes.equipo_error(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.equipo_error(uuid,uuid,text) TO hermes_readonly;

-- ------------------------------------------------------------
-- 7. PROGRESO  (§7B)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION hermes.equipo_progreso(
  p_trabajo_id uuid, p_agente text, p_detalle text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.equipo_trabajos
  SET estado = 'processing', iniciado_en = COALESCE(iniciado_en, now())
  WHERE id = p_trabajo_id AND estado IN ('pending','claimed');

  UPDATE public.equipo_mensajes
  SET summary = left(btrim(p_detalle), 200)
  WHERE trabajo_id = p_trabajo_id AND from_agent = p_agente
    AND message_type = 'progress' AND status = 'pending';

  IF NOT FOUND THEN
    INSERT INTO public.equipo_mensajes
      (tenant_id, trabajo_id, conversation_key, context_epoch, correlation_id,
       profundidad, from_agent, to_agent, message_type, status, summary, idempotency_key)
    SELECT w.tenant_id, w.id, w.conversation_key, w.context_epoch, w.id,
           0, p_agente, 'hermes', 'progress', 'pending', left(btrim(p_detalle), 200),
           md5('prog:' || w.id::text || p_agente)
    FROM public.equipo_trabajos w WHERE w.id = p_trabajo_id
    ON CONFLICT DO NOTHING;
  END IF;

  PERFORM pg_notify('equipo_ia', json_build_object(
    'tipo', 'progreso', 'trabajo_id', p_trabajo_id)::text);
  RETURN json_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION hermes.equipo_progreso(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.equipo_progreso(uuid,text,text) TO hermes_readonly;

-- ------------------------------------------------------------
-- 8. PEDIR APROBACIÓN  (§7D, §9)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION hermes.equipo_pedir_aprobacion(
  p_trabajo_id uuid,
  p_preparado_por text,
  p_accion     text,
  p_motivo     text DEFAULT NULL,
  p_datos      jsonb DEFAULT '{}'::jsonb,
  p_impacto    text DEFAULT NULL,
  p_riesgo     text DEFAULT 'medio',
  p_contenido  jsonb DEFAULT '{}'::jsonb,
  p_mensaje_id uuid DEFAULT NULL,
  p_revision_de uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_w record; v_id uuid; v_num smallint := 1;
BEGIN
  SELECT * INTO v_w FROM public.equipo_trabajos WHERE id = p_trabajo_id;
  IF v_w.id IS NULL THEN RAISE EXCEPTION 'El trabajo % no existe', p_trabajo_id; END IF;

  IF p_revision_de IS NOT NULL THEN
    SELECT a.revision_num + 1 INTO v_num
    FROM public.equipo_aprobaciones a WHERE a.id = p_revision_de;
    v_num := COALESCE(v_num, 2);
  END IF;

  INSERT INTO public.equipo_aprobaciones
    (tenant_id, trabajo_id, mensaje_id, preparado_por, accion, motivo,
     datos_usados, impacto, riesgo, contenido, revision_de, revision_num)
  VALUES
    (v_w.tenant_id, v_w.id, p_mensaje_id, p_preparado_por, btrim(p_accion), p_motivo,
     COALESCE(p_datos, '{}'::jsonb), p_impacto,
     CASE WHEN p_riesgo IN ('bajo','medio','alto') THEN p_riesgo ELSE 'medio' END,
     COALESCE(p_contenido, '{}'::jsonb), p_revision_de, v_num)
  RETURNING id INTO v_id;

  UPDATE public.equipo_trabajos SET estado = 'waiting_approval' WHERE id = v_w.id;

  PERFORM pg_notify('equipo_ia', json_build_object(
    'tipo', 'aprobacion_pendiente', 'trabajo_id', v_w.id,
    'aprobacion_id', v_id, 'tenant_id', v_w.tenant_id)::text);

  RETURN json_build_object('ok', true, 'aprobacion_id', v_id, 'revision', v_num);
END $$;

REVOKE ALL ON FUNCTION hermes.equipo_pedir_aprobacion(uuid,text,text,text,jsonb,text,text,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.equipo_pedir_aprobacion(uuid,text,text,text,jsonb,text,text,jsonb,uuid,uuid) TO hermes_readonly;

-- ------------------------------------------------------------
-- 9. CERRAR EL TRABAJO
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION hermes.equipo_cerrar_trabajo(
  p_trabajo_id uuid, p_resultado jsonb DEFAULT '{}'::jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_pend int;
BEGIN
  SELECT count(*) INTO v_pend
  FROM public.equipo_aprobaciones
  WHERE trabajo_id = p_trabajo_id AND estado = 'pending';

  IF v_pend > 0 THEN
    RETURN json_build_object('ok', false, 'motivo', 'aprobacion_pendiente', 'pendientes', v_pend);
  END IF;

  UPDATE public.equipo_trabajos
  SET estado = 'completed', resultado = COALESCE(p_resultado, '{}'::jsonb), terminado_en = now()
  WHERE id = p_trabajo_id AND estado NOT IN ('cancelled','expired');

  PERFORM pg_notify('equipo_ia', json_build_object(
    'tipo', 'trabajo_cerrado', 'trabajo_id', p_trabajo_id)::text);
  RETURN json_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION hermes.equipo_cerrar_trabajo(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.equipo_cerrar_trabajo(uuid,jsonb) TO hermes_readonly;

-- =====================================================================
-- LAS PUERTAS DE LA PANTALLA
-- =====================================================================

-- ------------------------------------------------------------
-- 10. PEDIR ALGO AL EQUIPO
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.equipo_pedir(
  p_peticion text, p_titulo text DEFAULT NULL, p_tipo text DEFAULT 'consulta')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid := public.get_user_tenant();
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Este módulo es del dueño. Tu usuario no tiene acceso.';
  END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión'; END IF;

  RETURN hermes.equipo_abrir_trabajo(
    v_tenant,
    COALESCE(NULLIF(btrim(COALESCE(p_titulo, '')), ''), left(btrim(p_peticion), 60)),
    p_peticion, p_tipo, NULL, NULL, 'motoflow', auth.uid()::text, NULL, auth.uid(), NULL);
END $$;

-- ------------------------------------------------------------
-- 11. DECIDIR UNA APROBACIÓN  (§7D, §11.16-18)
-- ------------------------------------------------------------
-- Aprobar, rechazar o pedir cambios. Queda con usuario, correo y hora.
CREATE OR REPLACE FUNCTION public.equipo_decidir(
  p_aprobacion_id uuid, p_decision text, p_comentario text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_a      record;
  v_email  text;
  v_nueva  uuid;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Solo el dueño puede aprobar o rechazar.';
  END IF;
  IF p_decision NOT IN ('approved','rejected','changes_requested') THEN
    RAISE EXCEPTION 'Decisión inválida: %', p_decision;
  END IF;

  SELECT * INTO v_a FROM public.equipo_aprobaciones
  WHERE id = p_aprobacion_id AND tenant_id = v_tenant;

  IF v_a.id IS NULL THEN
    RAISE EXCEPTION 'Esa aprobación no existe en esta empresa.';
  END IF;
  -- Decidir dos veces no cambia la primera decisión.
  IF v_a.estado <> 'pending' THEN
    RETURN json_build_object('ok', true, 'duplicado', true, 'estado', v_a.estado);
  END IF;

  v_email := COALESCE(NULLIF(auth.jwt() ->> 'email', ''),
                      (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid()));

  UPDATE public.equipo_aprobaciones
  SET estado = p_decision, decidido_por = auth.uid(), decidido_email = v_email,
      decidido_en = now(), comentario = NULLIF(btrim(COALESCE(p_comentario, '')), '')
  WHERE id = p_aprobacion_id;

  -- El mensaje que esperaba: aprobado se destraba, rechazado se cancela.
  IF v_a.mensaje_id IS NOT NULL THEN
    UPDATE public.equipo_mensajes
    SET approval_status = p_decision,
        status = CASE WHEN p_decision = 'approved' THEN 'pending' ELSE 'cancelled' END
    WHERE id = v_a.mensaje_id;
  END IF;

  -- Pedir cambios no cierra nada: abre una revisión correlacionada.
  IF p_decision = 'changes_requested' THEN
    INSERT INTO public.equipo_aprobaciones
      (tenant_id, trabajo_id, mensaje_id, preparado_por, accion, motivo,
       datos_usados, impacto, riesgo, contenido, revision_de, revision_num)
    VALUES
      (v_a.tenant_id, v_a.trabajo_id, v_a.mensaje_id, v_a.preparado_por,
       v_a.accion, NULLIF(btrim(COALESCE(p_comentario, '')), ''),
       v_a.datos_usados, v_a.impacto, v_a.riesgo, v_a.contenido,
       v_a.id, v_a.revision_num + 1)
    RETURNING id INTO v_nueva;

    UPDATE public.equipo_trabajos SET estado = 'waiting_dependency' WHERE id = v_a.trabajo_id;
  ELSIF p_decision = 'rejected' THEN
    UPDATE public.equipo_trabajos
    SET estado = 'cancelled', terminado_en = now() WHERE id = v_a.trabajo_id;
  ELSE
    UPDATE public.equipo_trabajos
    SET estado = 'processing' WHERE id = v_a.trabajo_id AND estado = 'waiting_approval';
  END IF;

  PERFORM pg_notify('equipo_ia', json_build_object(
    'tipo', 'decision', 'trabajo_id', v_a.trabajo_id, 'decision', p_decision)::text);

  RETURN json_build_object('ok', true, 'duplicado', false,
                           'estado', p_decision, 'revision_nueva', v_nueva);
END $$;

-- ------------------------------------------------------------
-- 12. CANCELAR / REINTENTAR  (§6-D.6)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.equipo_trabajo_accion(
  p_trabajo_id uuid, p_accion text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid := public.get_user_tenant(); v_n int;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Este módulo es del dueño.';
  END IF;

  IF p_accion = 'cancelar' THEN
    UPDATE public.equipo_trabajos SET estado = 'cancelled', terminado_en = now()
    WHERE id = p_trabajo_id AND tenant_id = v_tenant
      AND estado NOT IN ('completed','cancelled');
    UPDATE public.equipo_mensajes SET status = 'cancelled'
    WHERE trabajo_id = p_trabajo_id AND status IN ('pending','claimed','processing','waiting_dependency');
    RETURN json_build_object('ok', true, 'estado', 'cancelled');

  ELSIF p_accion = 'reintentar' THEN
    -- Los intentos vuelven a cero: reintentar a mano es una decisión de una
    -- persona, no el cuarto intento automático de un worker.
    UPDATE public.equipo_mensajes
    SET status = 'pending', attempts = 0, claim_token = NULL, lease_until = NULL
    WHERE trabajo_id = p_trabajo_id AND status = 'failed';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    UPDATE public.equipo_trabajos SET estado = 'pending', error = NULL, terminado_en = NULL
    WHERE id = p_trabajo_id AND tenant_id = v_tenant;
    PERFORM pg_notify('equipo_ia', json_build_object(
      'tipo', 'reintento', 'trabajo_id', p_trabajo_id)::text);
    RETURN json_build_object('ok', true, 'estado', 'pending', 'mensajes', v_n);
  END IF;

  RAISE EXCEPTION 'Acción desconocida: %', p_accion;
END $$;

-- ------------------------------------------------------------
-- 13. TODO LO QUE LA PANTALLA NECESITA, EN UNA LLAMADA
-- ------------------------------------------------------------
-- Una sola función y no cinco: la pantalla se refresca en tiempo real y
-- cinco viajes por refresco es lo que hace que un panel se sienta lento.
CREATE OR REPLACE FUNCTION public.equipo_panel(p_limite integer DEFAULT 25)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid := public.get_user_tenant(); v_out json;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RETURN json_build_object('permitido', false);
  END IF;

  SELECT json_build_object(
    'permitido', true,
    'agentes', (
      SELECT COALESCE(json_agg(x ORDER BY x.orden), '[]'::json) FROM (
        SELECT a.clave, a.nombre, a.rol_visible, a.descripcion,
               a.capacidades, a.limites, a.politicas, a.orden,
               -- El estado sale del sistema real, no de un adorno (§7F).
               COALESCE((
                 SELECT CASE
                   WHEN bool_or(m.status = 'processing') THEN 'trabajando'
                   WHEN bool_or(m.status = 'waiting_approval') THEN 'esperando_aprobacion'
                   WHEN bool_or(m.status = 'waiting_dependency') THEN 'esperando_datos'
                   WHEN bool_or(m.status = 'failed') THEN 'error'
                   WHEN bool_or(m.status = 'pending') THEN 'trabajando'
                   ELSE 'disponible' END
                 FROM public.equipo_mensajes m
                 WHERE m.tenant_id = a.tenant_id AND m.to_agent = a.clave
                   AND m.status NOT IN ('completed','cancelled','expired')
               ), 'disponible') AS estado,
               (SELECT m.summary FROM public.equipo_mensajes m
                 WHERE m.tenant_id = a.tenant_id AND m.to_agent = a.clave
                   AND m.status IN ('pending','processing')
                 ORDER BY m.created_at DESC LIMIT 1) AS tarea_actual,
               (SELECT max(m.created_at) FROM public.equipo_mensajes m
                 WHERE m.tenant_id = a.tenant_id
                   AND (m.to_agent = a.clave OR m.from_agent = a.clave)) AS ultima_actividad,
               (SELECT count(*) FROM public.equipo_aprobaciones ap
                 WHERE ap.tenant_id = a.tenant_id AND ap.preparado_por = a.clave
                   AND ap.estado = 'pending') AS borradores_pendientes
        FROM public.equipo_agentes a
        WHERE a.tenant_id = v_tenant AND a.activo
      ) x
    ),
    'trabajos', (
      SELECT COALESCE(json_agg(t ORDER BY t.creado_en DESC), '[]'::json) FROM (
        SELECT w.id, w.titulo, w.peticion, w.tipo, w.estado, w.error,
               w.creado_en, w.iniciado_en, w.terminado_en, w.resultado,
               w.conversation_key, w.context_epoch, w.origin_platform,
               (SELECT count(*) FROM public.equipo_mensajes m WHERE m.trabajo_id = w.id) AS mensajes,
               (SELECT max(m.attempts) FROM public.equipo_mensajes m WHERE m.trabajo_id = w.id) AS intentos,
               (SELECT m.to_agent FROM public.equipo_mensajes m
                 WHERE m.trabajo_id = w.id AND m.status IN ('pending','processing')
                 ORDER BY m.created_at DESC LIMIT 1) AS esperando_a
        FROM public.equipo_trabajos w
        WHERE w.tenant_id = v_tenant
        ORDER BY w.creado_en DESC
        LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 25), 100))
      ) t
    ),
    'aprobaciones', (
      SELECT COALESCE(json_agg(ap ORDER BY ap.creado_en DESC), '[]'::json) FROM (
        SELECT a.id, a.trabajo_id, a.preparado_por, a.accion, a.motivo,
               a.datos_usados, a.impacto, a.riesgo, a.contenido, a.estado,
               a.decidido_email, a.decidido_en, a.comentario,
               a.revision_de, a.revision_num, a.creado_en,
               w.titulo AS trabajo_titulo
        FROM public.equipo_aprobaciones a
        JOIN public.equipo_trabajos w ON w.id = a.trabajo_id
        WHERE a.tenant_id = v_tenant
        ORDER BY a.creado_en DESC LIMIT 50
      ) ap
    ),
    'publicacion_automatica', false
  ) INTO v_out;

  RETURN v_out;
END $$;

-- ------------------------------------------------------------
-- 14. EL HILO DE UN TRABAJO  (§7E)
-- ------------------------------------------------------------
-- Sin `payload` crudo de los mensajes internos: la auditoría cuenta qué
-- pasó, no vuelca lo que se mandó por dentro.
CREATE OR REPLACE FUNCTION public.equipo_trabajo_detalle(p_trabajo_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid := public.get_user_tenant(); v_out json;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RETURN json_build_object('permitido', false);
  END IF;

  SELECT json_build_object(
    'permitido', true,
    'trabajo', (SELECT to_json(w) FROM public.equipo_trabajos w
                 WHERE w.id = p_trabajo_id AND w.tenant_id = v_tenant),
    'mensajes', (
      SELECT COALESCE(json_agg(m ORDER BY m.created_at), '[]'::json) FROM (
        SELECT x.id, x.from_agent, x.to_agent, x.message_type, x.status,
               x.summary, x.profundidad, x.attempts, x.error,
               x.requires_approval, x.approval_status,
               x.created_at, x.claimed_at, x.completed_at,
               x.correlation_id, x.parent_message_id,
               -- Solo lo que se puede enseñar. El resto se resume.
               CASE WHEN x.message_type IN ('data_result','draft_result','execution_result')
                    THEN x.payload ELSE NULL END AS resultado
        FROM public.equipo_mensajes x
        WHERE x.trabajo_id = p_trabajo_id AND x.tenant_id = v_tenant
      ) m
    ),
    'aprobaciones', (
      SELECT COALESCE(json_agg(a ORDER BY a.creado_en), '[]'::json)
      FROM public.equipo_aprobaciones a
      WHERE a.trabajo_id = p_trabajo_id AND a.tenant_id = v_tenant
    )
  ) INTO v_out;

  RETURN v_out;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('equipo_ia_funciones.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
