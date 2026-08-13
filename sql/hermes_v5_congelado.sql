-- =====================================================================
-- CANDADO DEL CONTRATO v5 — la firma queda congelada
-- ---------------------------------------------------------------------
-- (2026-08-13) "congela el contrato v5 exactamente como está. No cambies
-- nuevamente la firma ni la forma de chat_tomar_v5; cualquier cambio
-- posterior debe hacerse mediante un contrato v6 paralelo."
--
-- >>> POR QUÉ HACE FALTA UN CANDADO Y NO UNA NOTA <<<
-- Ya cambié esa firma una vez —de v5 a v5.1— y lo hice porque nadie la
-- consumía todavía. Ese razonamiento era correcto ENTONCES y es peligroso
-- AHORA: la próxima vez que alguien piense "total, si esto no lo usa
-- nadie", habrá un gateway en producción escuchando.
--
-- Un comentario en un archivo no frena eso. Esto sí: la prueba se pone en
-- rojo con un mensaje que dice exactamente qué hacer.
--
-- >>> QUÉ HACER CUANDO ESTE CANDADO SE ROMPA <<<
-- NO actualices la lista de abajo para que vuelva a pasar. Eso es
-- desactivar la alarma. Lo correcto:
--
--   1. Deja hermes.chat_tomar_v5 EXACTAMENTE como está.
--   2. Crea hermes.chat_tomar_v6 con la forma nueva.
--   3. Anuncia v6 en hermes.chat_capacidades().
--   4. Deja convivir las dos hasta que el gateway migre.
--
-- Se corre solo: no cambia nada, solo comprueba. Vale como prueba de
-- regresión en cada despliegue.
-- =====================================================================

DO $CANDADO$
DECLARE
  -- La firma tal cual quedó el 13/08/2026, verificada contra producción.
  -- 34 columnas. Ni una más, ni una menos, ni en otro orden.
  v_esperada text :=
    'TABLE(id bigint, texto text, pantalla jsonb, creado_en timestamp with time zone, '
    || 'user_id uuid, usuario text, email text, rol text, conversation_key text, '
    || 'estado text, intentos smallint, origin_platform text, origin_chat_id text, '
    || 'origin_message_id text, claim_token uuid, lease_until timestamp with time zone, '
    || 'context_epoch integer, message_type text, media_id uuid, media_kind text, '
    || 'mime_type text, codec text, size_bytes bigint, duration_ms integer, sha256 text, '
    || 'storage_path text, media_token text, media_token_expira timestamp with time zone, '
    || 'source_surface text, client_platform text, device_id text, app_version text, '
    || 'client_message_id text, medios jsonb)';
  v_real   text;
  v_args   text;
  v_v4     text;
  v_lineas text[] := ARRAY[]::text[];
  v_pasan int := 0; v_fallan int := 0;
  v_ok boolean;
BEGIN
  -- ══ 1 · chat_tomar_v5 EXISTE Y CON UN SOLO ARGUMENTO ══════════════
  SELECT pg_get_function_result(p.oid), pg_get_function_identity_arguments(p.oid)
    INTO v_real, v_args
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'hermes' AND p.proname = 'chat_tomar_v5';

  v_ok := (v_args = 'p_limite integer');
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || '  1 · chat_tomar_v5 recibe exactamente (p_limite integer)'
    || chr(10) || '         obtuvo: ' || COALESCE(v_args, '(NO EXISTE)'));

  -- ══ 2 · LA FORMA DE LA TABLA, COLUMNA POR COLUMNA ═════════════════
  v_ok := (v_real IS NOT DISTINCT FROM v_esperada);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || '  2 · La forma de chat_tomar_v5 NO cambio'
    || CASE WHEN v_ok THEN '' ELSE
         chr(10) || '         esperaba: ' || v_esperada
      || chr(10) || '         obtuvo  : ' || COALESCE(v_real, '(NO EXISTE)') END);

  -- ══ 3 · LAS OTRAS FUNCIONES DEL CONTRATO SIGUEN AHÍ ═══════════════
  v_ok := to_regprocedure('hermes.chat_transcripcion(bigint,uuid,text,text)') IS NOT NULL
      AND to_regprocedure('hermes.chat_responder_voz(bigint,text,jsonb,uuid,uuid,text)') IS NOT NULL
      AND to_regprocedure('hermes.chat_media_registrar(bigint,uuid,text,text,bigint,integer,text,text,jsonb)') IS NOT NULL
      AND to_regprocedure('hermes.media_canjear(text)') IS NOT NULL;
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || '  3 · chat_transcripcion, chat_responder_voz, chat_media_registrar y media_canjear');

  -- ══ 4 · V4 INTACTO ════════════════════════════════════════════════
  SELECT pg_get_function_result(p.oid) INTO v_v4
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'hermes' AND p.proname = 'chat_tomar';

  v_ok := v_v4 LIKE 'TABLE(id bigint, texto text, pantalla jsonb%'
      AND v_v4 NOT LIKE '%medios%'
      AND v_v4 NOT LIKE '%source_surface%';
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || '  4 · v4 sigue siendo v4: chat_tomar NO gano columnas de v5');

  -- ══ 5 · HERMES PUEDE LLAMAR LO QUE TIENE QUE LLAMAR ═══════════════
  v_ok := has_function_privilege('hermes_readonly','hermes.chat_tomar_v5(integer)','EXECUTE')
      AND has_function_privilege('hermes_readonly','hermes.chat_capacidades()','EXECUTE')
      AND has_function_privilege('hermes_readonly','hermes.chat_responder_voz(bigint,text,jsonb,uuid,uuid,text)','EXECUTE');
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || '  5 · hermes_readonly puede tomar, consultar capacidades y responder');

  -- ══ 6 · Y NO PUEDE LLAMAR LO QUE NO DEBE ══════════════════════════
  -- media_canjear es de la Edge Function. Si esto se pone en rojo es que
  -- alguien "desbloqueo" a Hermes con un GRANT: no lo desbloquea, le da
  -- media ruta y le deja gastar los usos de un permiso ajeno.
  v_ok := NOT has_function_privilege('hermes_readonly','hermes.media_canjear(text)','EXECUTE');
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || '  6 · hermes_readonly NO puede canjear permisos de medios (es de la Edge Function)');

  RAISE EXCEPTION '%',
    chr(10) || chr(10)
    || '══════ CANDADO DEL CONTRATO v5 ══════' || chr(10) || chr(10)
    || array_to_string(v_lineas, chr(10)) || chr(10) || chr(10)
    || '  ' || CASE WHEN v_fallan = 0 THEN 'CONTRATO INTACTO' ELSE 'EL CONTRATO CAMBIO' END
    || '  ·  pasan ' || v_pasan || ', fallan ' || v_fallan || chr(10) || chr(10)
    || CASE WHEN v_fallan = 0 THEN '' ELSE
         '  >>> NO ACTUALICES LA LISTA DE ESTE ARCHIVO PARA QUE VUELVA A PASAR <<<' || chr(10)
      || '  Eso es desactivar la alarma. Lo correcto:' || chr(10)
      || '    1. Deja chat_tomar_v5 exactamente como estaba.' || chr(10)
      || '    2. Crea chat_tomar_v6 con la forma nueva.' || chr(10)
      || '    3. Anuncia v6 en chat_capacidades().' || chr(10)
      || '    4. Deja convivir las dos hasta que el gateway migre.' || chr(10) || chr(10) END
    || '  (esta prueba no cambia nada: solo mira)' || chr(10);
END $CANDADO$;
