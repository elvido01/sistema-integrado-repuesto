-- =====================================================================
-- Pruebas del canal móvil (v5.1)
-- ---------------------------------------------------------------------
-- UNA SOLA SENTENCIA, Y NO DEJA NADA. El informe sale como ERROR ROJO.
--
-- Lo que NO se prueba aquí: la cámara, el micrófono, el push y la red del
-- teléfono. Eso no vive en la base y no se simula.
-- =====================================================================

DO $PRUEBAS$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_otro   uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
  v_uid uuid; v_mail text; v_conv text;
  r json; n int; t record;
  v_img uuid; v_doc uuid; v_msg bigint; v_cmid text := 'm-prueba-movil-001';
  v_ruta text; v_ruta2 text;
  v_lineas text[] := ARRAY[]::text[];
  v_obt text; v_esp text; v_ok boolean;
  v_pasan int := 0; v_fallan int := 0;
BEGIN
  IF to_regprocedure('public.hermes_movil_escribir(text,text,uuid[],jsonb,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Falta aplicar sql/hermes_movil_v5_1.sql';
  END IF;

  SELECT u.id, u.email INTO v_uid, v_mail
  FROM auth.users u JOIN public.profiles p ON p.id = u.id
  WHERE p.tenant_id = v_tenant LIMIT 1;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No hay usuario con perfil en Morla.'; END IF;

  IF to_regclass('public.usuario_tenant_activo') IS NOT NULL THEN
    DELETE FROM public.usuario_tenant_activo WHERE user_id = v_uid;
  END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'email', v_mail, 'role','authenticated')::text, true);

  v_conv  := 'agent:main:morla:tenant:' || v_tenant::text;
  v_ruta  := v_tenant::text || '/2026-08/prueba_movil_img';
  v_ruta2 := v_tenant::text || '/2026-08/prueba_movil_doc';

  -- ══ 1 · V4 Y V5 SIGUEN EN PIE ═════════════════════════════════════
  v_obt := (to_regprocedure('hermes.chat_tomar(integer)') IS NOT NULL)::text || '/' ||
           (to_regprocedure('hermes.chat_tomar_v5(integer)') IS NOT NULL)::text;
  v_esp := 'true/true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  1 · v4 y v5 conviven'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 2 · EL BUCKET DE MEDIOS ES PRIVADO ════════════════════════════
  SELECT public::text || '/' || (file_size_limit = 26214400)::text INTO v_obt
  FROM storage.buckets WHERE id = 'hermes-medios';
  v_esp := 'false/true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  2 · hermes-medios es PRIVADO, 25 MB'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 3 · NO SE ADMITEN EJECUTABLES ═════════════════════════════════
  SELECT (NOT ('application/vnd.android.package-archive' = ANY(allowed_mime_types)))::text
      || '/' || (NOT ('application/x-msdownload' = ANY(allowed_mime_types)))::text INTO v_obt
  FROM storage.buckets WHERE id = 'hermes-medios';
  v_esp := 'true/true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  3 · Un .apk o un .exe no entran al chat'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES
    ('hermes-medios', v_ruta,  v_uid, jsonb_build_object('size', 400000, 'mimetype','image/jpeg')),
    ('hermes-medios', v_ruta2, v_uid, jsonb_build_object('size', 900000, 'mimetype','application/pdf'));

  -- ══ 4 · UNA RUTA DE OTRA EMPRESA SE RECHAZA ═══════════════════════
  BEGIN
    PERFORM public.hermes_medio_registrar(v_otro::text||'/x', 'image', 'image/jpeg', 400000, repeat('c',64));
    v_obt := 'lo dejo pasar';
  EXCEPTION WHEN OTHERS THEN v_obt := 'rechazado';
  END;
  v_esp := 'rechazado';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  4 · Aislamiento entre empresas'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 5 · UN EJECUTABLE DISFRAZADO SE RECHAZA ═══════════════════════
  BEGIN
    PERFORM public.hermes_medio_registrar(v_ruta, 'document', 'application/x-msdownload', 400000, repeat('c',64));
    v_obt := 'lo dejo pasar';
  EXCEPTION WHEN OTHERS THEN v_obt := 'rechazado';
  END;
  v_esp := 'rechazado';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  5 · Un MIME de ejecutable no pasa el registro'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 6 · EL NOMBRE SE SANEA EN LA BASE ═════════════════════════════
  r := public.hermes_medio_registrar(v_ruta, 'image', 'image/jpeg', 400000,
        repeat('c',64), '../../etc/passwd', 1200, 900);
  v_img := (r ->> 'media_id')::uuid;
  -- Se comprueba la PROPIEDAD, no la cadena exacta: lo que importa es que
  -- no queden barras ni puntos seguidos, no en qué acaba convertido. Con
  -- la cadena literal la prueba salió en rojo con el saneado funcionando
  -- —el colapso de '..' corre DESPUÉS de sustituir las barras—.
  v_obt := ((r ->> 'safe_display_name') !~ '/')::text || '/' ||
           ((r ->> 'safe_display_name') !~ '\.\.')::text || '/' ||
           (length(r ->> 'safe_display_name') > 0)::text;
  v_esp := 'true/true/true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  6 · El nombre del archivo se sanea aqui, no en el telefono'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  r := public.hermes_medio_registrar(v_ruta2, 'document', 'application/pdf', 900000,
        repeat('d',64), 'factura agosto.pdf');
  v_doc := (r ->> 'media_id')::uuid;

  -- ══ 7 · MANDAR TEXTO + IMAGEN + DOCUMENTO ═════════════════════════
  r := public.hermes_movil_escribir(v_cmid, '¿Qué pieza es esta?',
        ARRAY[v_img, v_doc], NULL, 'dev-prueba-01', '1.4.0', 'android');
  v_msg := (r ->> 'id')::bigint;
  v_obt := (r ->> 'message_type') || '/' || (r ->> 'medios') || '/' || (r ->> 'conversation_key');
  v_esp := 'mixed/2/' || v_conv;
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  7 · Texto + imagen + documento, en la conversacion de SIEMPRE'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 8 · LA SUPERFICIE QUEDA MARCADA, EL TRANSPORTE NO CAMBIA ══════
  SELECT c.origin_platform || '/' || c.source_surface || '/' || c.client_platform
      || '/' || c.device_id || '/' || c.app_version INTO v_obt
  FROM public.hermes_chat c WHERE c.id = v_msg;
  v_esp := 'motoflow/mobile/android/dev-prueba-01/1.4.0';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  8 · origin_platform sigue siendo motoflow; la superficie es mobile'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 9 · IDEMPOTENCIA: EL REINTENTO NO DUPLICA ═════════════════════
  r := public.hermes_movil_escribir(v_cmid, '¿Qué pieza es esta?',
        ARRAY[v_img, v_doc], NULL, 'dev-prueba-01', '1.4.0', 'android');
  SELECT count(*)::int INTO n FROM public.hermes_chat WHERE client_message_id = v_cmid;
  v_obt := (r ->> 'duplicado') || '/' || ((r ->> 'id')::bigint = v_msg)::text || '/' || n::text;
  v_esp := 'true/true/1';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  9 · Reintentar con el mismo id NO crea otro mensaje'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 10 · SIN IDENTIFICADOR DE CLIENTE NO SE MANDA ═════════════════
  BEGIN
    PERFORM public.hermes_movil_escribir(NULL, 'hola', NULL, NULL, 'dev', '1.0', 'ios');
    v_obt := 'lo dejo pasar';
  EXCEPTION WHEN OTHERS THEN v_obt := 'rechazado';
  END;
  v_esp := 'rechazado';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 10 · Sin client_message_id no hay idempotencia, y no se acepta'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 11 · UN ARCHIVO YA MANDADO NO SE REUTILIZA ════════════════════
  BEGIN
    PERFORM public.hermes_movil_escribir('m-otro-001', 'reusando', ARRAY[v_img],
                                          NULL, 'dev', '1.0', 'ios');
    v_obt := 'lo dejo pasar';
  EXCEPTION WHEN OTHERS THEN v_obt := 'rechazado';
  END;
  v_esp := 'rechazado';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 11 · Un archivo ya enviado no se cuelga de otro mensaje'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 12 · LA COLA ENTREGA TODOS LOS MEDIOS Y SU PERMISO ════════════
  SELECT * INTO t FROM hermes.chat_tomar_v5(5) WHERE id = v_msg;
  v_obt := t.source_surface || '/' || jsonb_array_length(t.medios)::text || '/' ||
           (t.medios -> 0 ->> 'media_token' IS NOT NULL)::text || '/' ||
           (t.medios -> 1 ->> 'media_token' IS NOT NULL)::text;
  v_esp := 'mobile/2/true/true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 12 · Hermes recibe los DOS medios, cada uno con su permiso'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 13 · CADA PERMISO SIRVE PARA SU ARCHIVO ═══════════════════════
  r := hermes.media_canjear(t.medios -> 1 ->> 'media_token');
  v_obt := (r ->> 'ok') || '/' || (r ->> 'bucket') || '/' || (r ->> 'media_kind');
  v_esp := 'true/hermes-medios/document';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 13 · El permiso dice de que bucket sacar el archivo'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 14 · EL HISTORIAL DEL MÓVIL NO FILTRA NADA ════════════════════
  -- Sin claim_token, sin lease. Es la comprobación de que el teléfono no
  -- recibe lo que no le toca.
  r := public.hermes_movil_historial(NULL, 10);
  v_obt := ((r::text ILIKE '%claim_token%') OR (r::text ILIKE '%lease_until%'))::text;
  v_esp := 'false';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 14 · El historial del movil NO lleva claim_token ni lease'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 15 · Y SÍ LLEVA LOS MEDIOS ════════════════════════════════════
  SELECT jsonb_array_length((x -> 'medios')::jsonb)::text INTO v_obt
  FROM json_array_elements(r -> 'mensajes') x
  WHERE (x ->> 'id')::bigint = v_msg;
  v_esp := '2';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 15 · El telefono recibe los adjuntos para pintarlos'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 16 · REGISTRO DE DISPOSITIVO ══════════════════════════════════
  r := public.hermes_dispositivo_registrar('dev-prueba-01', 'ExponentPushToken[AAA]',
                                            'android', '1.4.0', 'Moto G');
  SELECT (push_token IS NOT NULL)::text || '/' || autorizado::text INTO v_obt
  FROM public.hermes_dispositivos WHERE device_id = 'dev-prueba-01' AND tenant_id = v_tenant;
  v_esp := 'true/true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 16 · El dispositivo queda registrado con su token'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 17 · UN TOKEN REASIGNADO SE SUELTA DEL ANTERIOR ═══════════════
  -- Pasa de verdad al reinstalar: el mismo token va a otro dispositivo.
  -- Sin esto, los avisos de esta empresa siguen llegando al teléfono viejo.
  PERFORM public.hermes_dispositivo_registrar('dev-prueba-02', 'ExponentPushToken[AAA]',
                                               'ios', '1.4.0', 'iPhone');
  SELECT count(*)::int INTO n FROM public.hermes_dispositivos
  WHERE push_token = 'ExponentPushToken[AAA]';
  v_obt := n::text;
  v_esp := '1';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 17 · Un token de push solo vive en UN dispositivo'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 18 · CERRAR SESIÓN SUELTA EL TOKEN ════════════════════════════
  PERFORM public.hermes_dispositivo_revocar('dev-prueba-02');
  SELECT (push_token IS NULL)::text || '/' || (revocado_en IS NOT NULL)::text INTO v_obt
  FROM public.hermes_dispositivos WHERE device_id = 'dev-prueba-02' AND tenant_id = v_tenant;
  v_esp := 'true/true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 18 · Cerrar sesion revoca el aviso a ese telefono'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 19 · NADIE ESCRIBE LAS TABLAS NUEVAS A MANO ═══════════════════
  SELECT count(*)::int INTO n
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name='hermes_dispositivos'
    AND grantee IN ('anon','authenticated')
    AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');
  v_obt := n::text;
  v_esp := '0';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 19 · Los dispositivos solo se tocan por RPC'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 20 · LA ÉPOCA NO CAMBIA LA CONVERSACIÓN ═══════════════════════
  DECLARE v_ep_antes int; v_ep_despues int; v_conv_despues text;
  BEGIN
    SELECT context_epoch INTO v_ep_antes FROM public.hermes_conversaciones
    WHERE tenant_id = v_tenant AND conversation_key = v_conv;
    PERFORM public.hermes_nuevo_contexto(NULL);
    SELECT context_epoch, conversation_key INTO v_ep_despues, v_conv_despues
    FROM public.hermes_conversaciones
    WHERE tenant_id = v_tenant AND conversation_key = v_conv;
    v_obt := (v_ep_despues > COALESCE(v_ep_antes,1))::text || '/' || (v_conv_despues = v_conv)::text;
  END;
  v_esp := 'true/true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 20 · "Nueva conversacion" avanza la epoca y CONSERVA la clave'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  RAISE EXCEPTION '%',
    chr(10) || chr(10)
    || '══════ PRUEBAS DEL CANAL MOVIL v5.1 ══════' || chr(10) || chr(10)
    || '  sesion: ' || v_mail || chr(10)
    || '  conversacion: ' || v_conv || chr(10) || chr(10)
    || array_to_string(v_lineas, chr(10)) || chr(10) || chr(10)
    || '  ' || CASE WHEN v_fallan = 0 THEN 'TODO EN VERDE' ELSE 'HAY FALLOS' END
    || '  ·  pasan ' || v_pasan || ', fallan ' || v_fallan || chr(10) || chr(10)
    || '  (nada se guardo: la excepcion lo deshace todo)' || chr(10)
    || '  (camara, microfono, push y red del telefono NO se prueban aqui)' || chr(10);
END $PRUEBAS$;
