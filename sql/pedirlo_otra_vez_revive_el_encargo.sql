-- ============================================================
-- PEDIRLO OTRA VEZ REVIVE EL ENCARGO
-- ============================================================
-- El dueño le pidió a Hermes que reenviara la promoción del tanque. Hermes
-- contestó, literalmente:
--
--   "La promoción del código GX9036 fue enviada nuevamente al
--    Comercial-Creativo."
--
-- No se envió nada. El encargo seguía en `failed` con sus tres intentos
-- gastados, y se quedó ahí otros cuarenta minutos mientras el dueño esperaba
-- delante de la pantalla.
--
-- Hermes no mintió: `equipo_encargar_a` le devolvió `ok: true`. La función es
-- idempotente —pedir dos veces lo mismo no abre dos encargos, y eso está
-- bien— pero no distinguía entre "ya está en marcha" y "ya fracasó". Veía la
-- clave repetida y devolvía `duplicado: true` para las dos cosas.
--
-- La idempotencia protege de duplicar TRABAJO. Un encargo muerto no es
-- trabajo: es un hueco. Y el hueco había que rellenarlo a mano, con un botón
-- de Reintentar que hay que saber que existe y en qué pantalla está.
--
-- Ahora: si el encargo previo murió (failed o cancelled), pedirlo otra vez lo
-- REVIVE —intentos a cero, turno suelto— y se dice que se revivió, no que
-- estaba duplicado. Si sigue vivo, se comporta como antes.
--
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION hermes.equipo_encargar_a(
  p_trabajo_id uuid,
  p_agente     text DEFAULT 'comercial_creativo',
  p_ronda      int  DEFAULT 1,
  p_nota       text DEFAULT NULL)
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
        'GRANT EXECUTE ON FUNCTION hermes.equipo_encargar_a(uuid,text,int,text) TO %I', r);
    END IF;
  END LOOP;
END $g$;

SELECT public.registrar_migracion('pedirlo_otra_vez_revive_el_encargo.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT json_build_object(
 'sigue_habiendo_una_sola', (SELECT count(*) FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='hermes' AND p.proname='equipo_encargar_a'),
 'sabe_revivir', (SELECT pg_get_functiondef(p.oid) LIKE '%revivido%'
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='hermes' AND p.proname='equipo_encargar_a')
) AS r;
