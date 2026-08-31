-- ============================================================
-- LA RONDA CUENTA EN GRANDE
-- ============================================================
-- El creativo contestó por fin —por la nube, con la API— y el borrador se
-- perdió al guardarlo:
--
--   function hermes.equipo_encargar_a(uuid, unknown, bigint, text) does not exist
--
-- El trigger que lleva el borrador a la mesa del dueño pasa la ronda así:
--
--   (SELECT count(*) + 1 FROM public.equipo_mensajes m WHERE ...)
--
-- `count(*)` es **bigint**. El parámetro estaba declarado `integer`, y de
-- bigint a integer Postgres NO convierte sola para elegir función: la
-- conversión existe, pero es de asignación, no implícita. Así que no
-- encontraba candidata y abortaba la transacción entera — con el borrador
-- dentro. Tres intentos, tres respuestas del modelo pagadas y tiradas.
--
-- Se podía arreglar poniendo un `::int` en la llamada. No se hace: eso deja
-- la trampa armada para el siguiente que pase una cuenta. El parámetro pasa
-- a `bigint`, que acepta las dos cosas —de integer a bigint sí convierte
-- sola— y el problema deja de existir en vez de esquivarse.
--
-- Y se hace con DROP explícito antes del CREATE. Cambiar la lista de
-- argumentos con CREATE OR REPLACE no reemplaza: duplica. Eso ya reventó
-- hoy en la cara del dueño al pulsar Autorizar.
--
-- Idempotente.
-- ============================================================

DROP FUNCTION IF EXISTS hermes.equipo_encargar_a(uuid, text, int, text);
DROP FUNCTION IF EXISTS hermes.equipo_encargar_a(uuid, text);

CREATE OR REPLACE FUNCTION hermes.equipo_encargar_a(
  p_trabajo_id uuid,
  p_agente     text   DEFAULT 'comercial_creativo',
  p_ronda      bigint DEFAULT 1,
  p_nota       text   DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_w    record;
  v_m    record;
  v_tipo text;
  v_id   uuid;
  v_idem text;
  v_pet  text;
BEGIN
  IF p_agente NOT IN ('jarvis', 'comercial_creativo') THEN
    RAISE EXCEPTION 'A ese agente no se le encargan trabajos: %', p_agente;
  END IF;

  SELECT * INTO v_w FROM public.equipo_trabajos WHERE id = p_trabajo_id;
  IF v_w.id IS NULL THEN
    RAISE EXCEPTION 'El trabajo % no existe', p_trabajo_id;
  END IF;

  v_idem := 'encargo:' || p_trabajo_id::text || ':' || p_agente
            || CASE WHEN COALESCE(p_ronda, 1) > 1 THEN ':r' || p_ronda::text ELSE '' END;

  SELECT m.id, m.status INTO v_m FROM public.equipo_mensajes m
  WHERE m.tenant_id = v_w.tenant_id AND m.idempotency_key = v_idem;

  IF v_m.id IS NOT NULL THEN
    -- Muerto: se revive. Esto es lo que hace que "pídeselo otra vez a Hermes"
    -- —lo que cualquiera intenta primero— sirva de algo.
    IF v_m.status IN ('failed', 'cancelled') THEN
      UPDATE public.equipo_mensajes
         SET status = 'pending', attempts = 0, error = NULL,
             claim_token = NULL, lease_until = NULL
       WHERE id = v_m.id;

      UPDATE public.equipo_trabajos
         SET estado = 'pending', error = NULL, terminado_en = NULL
       WHERE id = v_w.id;

      PERFORM pg_notify('equipo_ia', json_build_object(
        'tipo', 'encargo_revivido', 'trabajo_id', v_w.id,
        'para', p_agente, 'tenant_id', v_w.tenant_id)::text);

      RETURN json_build_object('ok', true, 'revivido', true, 'duplicado', false,
                               'mensaje_id', v_m.id, 'para', p_agente,
                               'estado_anterior', v_m.status);
    END IF;

    -- Vivo: no se toca. Aquí la idempotencia sí es lo que hace falta.
    RETURN json_build_object('ok', true, 'duplicado', true, 'revivido', false,
                             'mensaje_id', v_m.id, 'estado', v_m.status);
  END IF;

  v_tipo := CASE WHEN v_w.tipo = 'promocion' AND p_agente = 'comercial_creativo'
                 THEN 'creative_request' ELSE 'delegation' END;

  v_pet := v_w.peticion || COALESCE(E'\n\n' || p_nota, '');

  INSERT INTO public.equipo_mensajes
    (tenant_id, trabajo_id, conversation_key, context_epoch, correlation_id,
     profundidad, from_agent, to_agent, message_type, status, priority,
     summary, payload, idempotency_key)
  VALUES
    (v_w.tenant_id, v_w.id, v_w.conversation_key, v_w.context_epoch, v_w.id,
     1, 'hermes', p_agente, v_tipo, 'pending', 5,
     left(v_w.titulo, 200),
     jsonb_build_object('texto', v_pet, 'tipo', v_w.tipo, 'titulo', v_w.titulo,
                        'ronda', COALESCE(p_ronda, 1)),
     v_idem)
  RETURNING id INTO v_id;

  PERFORM pg_notify('equipo_ia', json_build_object(
    'tipo', 'encargo_nuevo', 'trabajo_id', v_w.id,
    'para', p_agente, 'tenant_id', v_w.tenant_id)::text);

  RETURN json_build_object('ok', true, 'duplicado', false, 'revivido', false,
                           'mensaje_id', v_id, 'para', p_agente, 'tipo', v_tipo,
                           'ronda', COALESCE(p_ronda, 1));
END $fn$;

DO $g$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['hermes_readonly','equipo_worker'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION hermes.equipo_encargar_a(uuid,text,bigint,text) TO %I', r);
    END IF;
  END LOOP;
END $g$;

SELECT public.registrar_migracion('la_ronda_cuenta_en_grande.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Contar filas del catálogo no prueba nada: hay que resolver las TRES formas
-- en que se la llama de verdad — dos argumentos, ronda entera, y ronda de
-- count(*), que es la que reventó.
SELECT json_build_object(
 'cuantas_hay', (SELECT count(*) FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='hermes' AND p.proname='equipo_encargar_a'),
 'firma', (SELECT pg_get_function_identity_arguments(p.oid) FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='hermes' AND p.proname='equipo_encargar_a'),
 'resuelve_dos_args', to_regprocedure('hermes.equipo_encargar_a(uuid,text)') IS NOT NULL,
 'resuelve_con_int', to_regprocedure('hermes.equipo_encargar_a(uuid,text,int,text)') IS NOT NULL,
 'resuelve_con_bigint', to_regprocedure('hermes.equipo_encargar_a(uuid,text,bigint,text)') IS NOT NULL
) AS r;
