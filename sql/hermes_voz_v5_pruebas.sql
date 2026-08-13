-- =====================================================================
-- Pruebas del canal de voz v5
-- ---------------------------------------------------------------------
-- UNA SOLA SENTENCIA, Y NO DEJA NADA. NI UNA FILA. NI UN OBJETO.
--
-- El informe sale como un ERROR ROJO. ES EL RESULTADO — igual que las de
-- v3, v4 y las del Equipo IA. El editor de Supabase ejecuta cada sentencia
-- por separado, así que un BEGIN…ROLLBACK a mano no agruparía nada; una
-- excepción sí aborta la transacción entera.
--
-- >>> LO QUE ESTAS PRUEBAS NO PUEDEN COMPROBAR <<<
-- Que el micrófono grabe, que Chrome suba el archivo y que Hermes
-- transcriba. Eso no vive en la base. Lo de aquí es el contrato: los
-- límites, el aislamiento, la idempotencia y el fencing.
--
-- Requiere sql/hermes_voz_v5.sql.
-- =====================================================================

DO $PRUEBAS$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_otro   uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
  v_uid    uuid;
  v_mail   text;
  v_conv   text;
  r json; n int; t record;
  v_media  uuid; v_media2 uuid; v_msg bigint; v_tok text; v_claim uuid;
  v_ruta   text := v_tenant::text || '/2026-08/prueba_v5_audio';
  v_sha    text := repeat('a', 64);
  v_sha2   text := repeat('b', 64);
  v_lineas text[] := ARRAY[]::text[];
  v_obt text; v_esp text; v_ok boolean;
  v_pasan int := 0; v_fallan int := 0;
BEGIN
  IF to_regprocedure('hermes.chat_tomar_v5(integer)') IS NULL THEN
    RAISE EXCEPTION 'Falta aplicar sql/hermes_voz_v5.sql';
  END IF;

  SELECT u.id, u.email INTO v_uid, v_mail
  FROM auth.users u JOIN public.profiles p ON p.id = u.id
  WHERE p.tenant_id = v_tenant LIMIT 1;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No hay ningún usuario con perfil en Morla.'; END IF;

  IF to_regclass('public.usuario_tenant_activo') IS NOT NULL THEN
    DELETE FROM public.usuario_tenant_activo WHERE user_id = v_uid;
  END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'email', v_mail, 'role','authenticated')::text, true);

  v_conv := 'agent:main:morla:tenant:' || v_tenant::text;

  -- ══ 1 · V4 SIGUE INTACTO ══════════════════════════════════════════
  -- Lo primero, porque es lo que no se puede romper. Si esto falla, da
  -- igual todo lo demás: hay un gateway en marcha ahí fuera.
  v_obt := (to_regprocedure('hermes.chat_tomar(integer)') IS NOT NULL)::text || '/' ||
           (to_regprocedure('hermes.chat_responder(bigint,text,jsonb,uuid)') IS NOT NULL)::text || '/' ||
           (to_regprocedure('hermes.chat_renovar(bigint,uuid)') IS NOT NULL)::text;
  v_esp := 'true/true/true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  1 · v4 sigue entero: chat_tomar, chat_responder y chat_renovar'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 2 · LOS MENSAJES VIEJOS SON 'text' ════════════════════════════
  SELECT count(*)::int INTO n FROM public.hermes_chat WHERE message_type IS NULL;
  v_obt := n::text;
  v_esp := '0';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  2 · Ningun mensaje viejo se quedo sin tipo'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 3 · EL BUCKET ES PRIVADO ══════════════════════════════════════
  SELECT (public = false)::text || '/' || (file_size_limit = 8388608)::text INTO v_obt
  FROM storage.buckets WHERE id = 'hermes-voz';
  v_esp := 'false/true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  3 · El bucket es PRIVADO y con tope de tamaño'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 4 · UNA RUTA DE OTRA EMPRESA SE RECHAZA ═══════════════════════
  BEGIN
    PERFORM public.hermes_voz_registrar(v_otro::text || '/x/y', 'audio/webm', 1000, 3000, v_sha);
    v_obt := 'lo dejo pasar';
  EXCEPTION WHEN OTHERS THEN v_obt := 'rechazado';
  END;
  v_esp := 'rechazado';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  4 · No se registra un audio en la carpeta de otra empresa'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 5 · SIN ARCHIVO SUBIDO NO HAY REGISTRO ════════════════════════
  -- La ruta todavía no existe en storage.objects.
  BEGIN
    PERFORM public.hermes_voz_registrar(v_ruta, 'audio/webm', 1000, 3000, v_sha);
    v_obt := 'lo dejo pasar';
  EXCEPTION WHEN OTHERS THEN v_obt := 'rechazado';
  END;
  v_esp := 'rechazado';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  5 · Una ruta inventada no se registra'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- Se sube el objeto de mentira (se deshace con todo lo demás).
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('hermes-voz', v_ruta, v_uid,
          jsonb_build_object('size', 48000, 'mimetype', 'audio/webm'));

  -- ══ 6 · MIME NO ADMITIDO ══════════════════════════════════════════
  BEGIN
    PERFORM public.hermes_voz_registrar(v_ruta, 'application/pdf', 48000, 3000, v_sha);
    v_obt := 'lo dejo pasar';
  EXCEPTION WHEN OTHERS THEN v_obt := 'rechazado';
  END;
  v_esp := 'rechazado';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  6 · Un PDF disfrazado de audio se rechaza'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 7 · TAMAÑO DECLARADO QUE NO COINCIDE ══════════════════════════
  BEGIN
    PERFORM public.hermes_voz_registrar(v_ruta, 'audio/webm', 999, 3000, v_sha);
    v_obt := 'lo dejo pasar';
  EXCEPTION WHEN OTHERS THEN v_obt := 'rechazado';
  END;
  v_esp := 'rechazado';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  7 · El tamano declarado tiene que ser el del archivo'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 8 · DURACIÓN POR ENCIMA DEL MÁXIMO ════════════════════════════
  BEGIN
    PERFORM public.hermes_voz_registrar(v_ruta, 'audio/webm', 48000, 130000, v_sha);
    v_obt := 'lo dejo pasar';
  EXCEPTION WHEN OTHERS THEN v_obt := 'rechazado';
  END;
  v_esp := 'rechazado';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  8 · Mas de 120 segundos no entra'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 9 · UN sha256 CON MALA FORMA ══════════════════════════════════
  BEGIN
    PERFORM public.hermes_voz_registrar(v_ruta, 'audio/webm', 48000, 3000, 'no-es-un-hash');
    v_obt := 'lo dejo pasar';
  EXCEPTION WHEN OTHERS THEN v_obt := 'rechazado';
  END;
  v_esp := 'rechazado';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  9 · El sha256 tiene que ser un sha256'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 10 · EL REGISTRO BUENO ════════════════════════════════════════
  r := public.hermes_voz_registrar(v_ruta, 'audio/webm', 48000, 4200, v_sha, 'opus');
  v_media := (r ->> 'media_id')::uuid;
  v_obt := (v_media IS NOT NULL)::text || '/' || (r ->> 'duplicado') || '/' || (r ->> 'conversation_key');
  v_esp := 'true/false/' || v_conv;
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 10 · Se registra, y en la conversacion de SIEMPRE'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 11 · IDEMPOTENCIA POR HASH ════════════════════════════════════
  r := public.hermes_voz_registrar(v_ruta, 'audio/webm', 48000, 4200, v_sha, 'opus');
  v_obt := (r ->> 'duplicado') || '/' || ((r ->> 'media_id')::uuid = v_media)::text;
  v_esp := 'true/true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 11 · Reintentar la subida NO crea un segundo audio'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 12 · MANDARLO ═════════════════════════════════════════════════
  r := public.hermes_escribir_voz(v_media, NULL, NULL);
  v_msg := (r ->> 'id')::bigint;
  SELECT c.message_type || '/' || (c.media_id = v_media)::text || '/' ||
         (c.conversation_key = v_conv)::text || '/' || c.estado INTO v_obt
  FROM public.hermes_chat c WHERE c.id = v_msg;
  v_esp := 'voice/true/true/pendiente';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 12 · Entra a la cola como voz, misma conversacion'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 13 · DOS PESTAÑAS NO MANDAN DOS MENSAJES ══════════════════════
  r := public.hermes_escribir_voz(v_media, NULL, NULL);
  SELECT count(*)::int INTO n FROM public.hermes_chat WHERE media_id = v_media;
  v_obt := (r ->> 'duplicado') || '/' || n::text;
  v_esp := 'true/1';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 13 · Mandar el mismo audio dos veces deja UN mensaje'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 14 · LO ENVIADO YA NO SE DESCARTA ═════════════════════════════
  r := public.hermes_voz_descartar(v_media);
  v_obt := (r ->> 'ok');
  v_esp := 'false';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 14 · Un audio ya enviado no se borra: es la conversacion'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 15 · chat_tomar_v5 RECLAMA Y ENTREGA EL PERMISO ═══════════════
  SELECT * INTO t FROM hermes.chat_tomar_v5(5) WHERE id = v_msg;
  v_claim := t.claim_token;
  v_tok   := t.media_token;
  v_obt := t.message_type || '/' || (t.media_id = v_media)::text || '/' ||
           (t.claim_token IS NOT NULL)::text || '/' || (t.media_token IS NOT NULL)::text
           || '/' || t.mime_type;
  v_esp := 'voice/true/true/true/audio/webm';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 15 · chat_tomar_v5 entrega el audio y su permiso'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 16 · DE LA TABLA NO SE SACA EL PERMISO ════════════════════════
  -- Solo se guarda el sha256. Con la tabla volcada no se descarga nada.
  SELECT count(*)::int INTO n FROM public.hermes_media_tokens
  WHERE token_sha256 = v_tok;          -- el token EN CLARO no está guardado
  v_obt := n::text;
  v_esp := '0';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 16 · El token en claro NO esta en la tabla, solo su hash'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 17 · CANJEAR EL PERMISO ═══════════════════════════════════════
  r := hermes.media_canjear(v_tok);
  v_obt := (r ->> 'ok') || '/' || (r ->> 'storage_path');
  v_esp := 'true/' || v_ruta;
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 17 · El permiso bueno devuelve la ruta del audio'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 18 · UN PERMISO INVENTADO NO VALE ═════════════════════════════
  r := hermes.media_canjear('me-lo-invento:' || v_media::text);
  v_obt := (r ->> 'ok') || '/' || (r ->> 'motivo');
  v_esp := 'false/token_desconocido';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 18 · Un permiso inventado se rechaza'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 19 · Y UNO VENCIDO TAMPOCO ════════════════════════════════════
  -- now() está congelado dentro de la transacción: se vence a mano.
  UPDATE public.hermes_media_tokens SET expira_en = now() - interval '1 minute'
  WHERE media_id = v_media;
  r := hermes.media_canjear(v_tok);
  v_obt := (r ->> 'ok') || '/' || (r ->> 'motivo');
  v_esp := 'false/token_vencido';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 19 · Un permiso vencido ya no descarga nada'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 20 · OTRO WORKER NO REGISTRA EL TTS DE ESTE TURNO ═════════════
  r := hermes.chat_media_registrar(v_msg, gen_random_uuid(), v_tenant::text || '/tts/x.mp3',
                                   'audio/mpeg', 2000, 1500, v_sha2);
  v_obt := (r ->> 'ok') || '/' || (r ->> 'motivo') || '/' || (r ->> 'abandonar');
  v_esp := 'false/claim_reemplazado/true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 20 · Con otro claim no se cuelga audio a este turno'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 21 · EL TTS BUENO ═════════════════════════════════════════════
  r := hermes.chat_media_registrar(v_msg, v_claim, v_tenant::text || '/tts/x.mp3',
                                   'audio/mpeg', 2000, 1500, v_sha2);
  v_media2 := (r ->> 'media_id')::uuid;
  v_obt := (r ->> 'ok') || '/' || (v_media2 IS NOT NULL)::text;
  v_esp := 'true/true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 21 · Con SU claim, el audio de la respuesta se registra'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 22 · RESPONDER CON TEXTO Y VOZ ════════════════════════════════
  r := hermes.chat_responder_voz(v_msg, 'Sí, aquí estoy.', NULL, v_claim, v_media2);
  SELECT c.texto || '/' || c.message_type || '/' || (c.media_id = v_media2)::text INTO v_obt
  FROM public.hermes_chat c WHERE c.id = (r ->> 'respuesta_id')::bigint;
  v_esp := 'Sí, aquí estoy./mixed/true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 22 · La respuesta lleva el texto Y el audio, correlacionados'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 23 · RESPONDER DOS VECES NO DUPLICA EL TEXTO ══════════════════
  r := hermes.chat_responder_voz(v_msg, 'Sí, aquí estoy.', NULL, v_claim, v_media2);
  SELECT count(*)::int INTO n FROM public.hermes_chat
  WHERE rol = 'hermes' AND responde_a = v_msg;
  v_obt := (r ->> 'duplicado') || '/' || n::text;
  v_esp := 'true/1';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 23 · Reintentar el TTS no duplica la respuesta escrita'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 24 · LA TRANSCRIPCIÓN VUELVE Y SE VE ══════════════════════════
  r := hermes.chat_transcripcion(v_msg, v_claim, 'Hola Hermes, ¿estás ahí?', 'ok');
  SELECT c.texto INTO v_obt FROM public.hermes_chat c WHERE c.id = v_msg;
  v_esp := 'Hola Hermes, ¿estás ahí?';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 24 · El marcador "(nota de voz)" se cambia por lo que se dijo'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 25 · NADIE ESCRIBE hermes_media POR LA PUERTA DE ATRÁS ════════
  SELECT count(*)::int INTO n
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name IN ('hermes_media','hermes_media_tokens')
    AND grantee IN ('anon','authenticated')
    AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');
  v_obt := n::text;
  v_esp := '0';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 25 · anon y authenticated no escriben audios ni permisos'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 26 · LOS PERMISOS NI SIQUIERA SE LEEN ═════════════════════════
  SELECT count(*)::int INTO n
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'hermes_media_tokens'
    AND grantee IN ('anon','authenticated');
  v_obt := n::text;
  v_esp := '0';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 26 · La tabla de permisos no la lee ningun navegador'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 27 · LAS CAPACIDADES SE ANUNCIAN ══════════════════════════════
  r := hermes.chat_capacidades();
  v_obt := (r ->> 'contrato') || '/' || (r ->> 'voz') || '/' ||
           (r ->> 'transcripcion_en_motoflow');
  v_esp := '5/true/false';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 27 · El canal anuncia v5 y que NO transcribe el'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 28 · UN WORKER V4 SIGUE PUDIENDO TOMAR UN MENSAJE DE VOZ ══════
  -- Lo importante de la retrocompatibilidad: no es que v4 exista, es que
  -- sigue funcionando sobre una cola que ahora tiene audio.
  UPDATE public.hermes_chat SET estado='pendiente', claim_token=NULL, lease_until=NULL,
         respondido=false WHERE id = v_msg;
  DELETE FROM public.hermes_chat WHERE rol='hermes' AND responde_a = v_msg;
  SELECT count(*)::int INTO n FROM hermes.chat_tomar(5) x WHERE x.id = v_msg;
  v_obt := n::text;
  v_esp := '1';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 28 · Un worker v4 toma un mensaje de voz sin enterarse'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  RAISE EXCEPTION '%',
    chr(10) || chr(10)
    || '══════ PRUEBAS DEL CANAL DE VOZ v5 ══════' || chr(10) || chr(10)
    || '  sesion de prueba: ' || v_mail || chr(10)
    || '  conversacion    : ' || v_conv || chr(10) || chr(10)
    || array_to_string(v_lineas, chr(10)) || chr(10) || chr(10)
    || '  ' || CASE WHEN v_fallan = 0 THEN 'TODO EN VERDE' ELSE 'HAY FALLOS' END
    || '  ·  pasan ' || v_pasan || ', fallan ' || v_fallan || chr(10) || chr(10)
    || '  (nada de esto se guardo: la excepcion deshace hasta el objeto' || chr(10)
    || '   de storage que se inserto para probar)' || chr(10)
    || '  (que el microfono grabe y que Hermes transcriba NO se prueba' || chr(10)
    || '   aqui: eso no vive en la base)' || chr(10);
END $PRUEBAS$;
