-- =====================================================================
-- VERIFICADOR DE LA PRUEBA FÍSICA
-- ---------------------------------------------------------------------
-- Se corre DESPUÉS de usar el teléfono. Lee lo que la app dejó de verdad
-- y produce la evidencia de los pasos 8, 9 y 12 sin tener que mirar
-- tablas a mano.
--
-- >>> NO TOCA NADA <<<
-- Reclama el mensaje con chat_tomar_v5 para enseñar QUÉ recibe Hermes, y
-- después lo deshace entero con una excepción. El mensaje se queda
-- pendiente y el Hermes de verdad lo tomará como si nadie hubiera pasado.
--
-- >>> LO QUE SE REDACTA <<<
-- El sha256 sale cortado, la ruta de almacenamiento sin el nombre del
-- archivo y del media_token solo se dice que existe y cuánto mide. Este
-- informe se pega en un chat: no puede llevar nada que sirva para bajar
-- un audio.
--
--   supabase db query --linked -f sql/hermes_movil_verificar.sql
-- =====================================================================

DO $VERIFICAR$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_otro   uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
  c record; m record; t record;
  v_l text[] := ARRAY[]::text[];
  n int; v_ok boolean; v_pasan int := 0; v_fallan int := 0;
  v_json text;

BEGIN
  -- ── EL ÚLTIMO MENSAJE DE VOZ QUE MANDÓ EL TELÉFONO ────────────────
  -- Las DOS superficies, no solo el movil. La esfera del navegador manda
  -- por otro camino (hermes_escribir_voz) y deja source_surface en NULL:
  -- filtrar por 'mobile' hacia invisible una nota grabada desde la web y
  -- este verificador contestaba 'no hay ningun mensaje' con el audio ya
  -- subido. Un verificador que no ve la mitad de los casos es peor que no
  -- tener verificador.
  SELECT * INTO c FROM public.hermes_chat
  WHERE tenant_id = v_tenant
    AND rol = 'usuario'
    AND message_type IN ('voice','mixed','image','document')
  ORDER BY id DESC LIMIT 1;

  IF c.id IS NULL THEN
    RAISE EXCEPTION '%', chr(10) || chr(10)
      || '  NO HAY NINGUN MENSAJE DEL TELEFONO TODAVIA.' || chr(10) || chr(10)
      || '  Graba una nota de voz por cualquiera de las dos:' || chr(10)
      || '    · la esfera de MotoFlow en el navegador' || chr(10)
      || '    · la app: Mas > Hermes' || chr(10) || chr(10)
      || '  y vuelve a correr esto.' || chr(10);
  END IF;

  SELECT * INTO m FROM public.hermes_media WHERE mensaje_id = c.id ORDER BY created_at LIMIT 1;

  -- ══ PASO 8 · EL MENSAJE v5, CAMPO POR CAMPO ═══════════════════════
  v_l := v_l || ('  ── PASO 8 · EL MENSAJE QUE CREO LA APP ──────────────────');
  v_l := v_l || ('    id ................. ' || c.id);
  v_l := v_l || ('    message_type ....... ' || COALESCE(c.message_type,'(nulo)'));
  v_l := v_l || ('    media_id ........... ' || COALESCE(c.media_id::text,'(nulo)'));
  v_l := v_l || ('    mime_type .......... ' || COALESCE(m.mime_type,'(sin medio)'));
  v_l := v_l || ('    duration_ms ........ ' || COALESCE(m.duration_ms::text,'(no aplica)'));
  v_l := v_l || ('    size_bytes ......... ' || COALESCE(m.size_bytes::text,'-')
                 || COALESCE(' (' || round(m.size_bytes/1024.0,1)::text || ' KB)', ''));
  v_l := v_l || ('    sha256 ............. ' || COALESCE(left(m.sha256,12) || '… (' || length(m.sha256) || ' hex)','-'));
  v_l := v_l || ('    conversation_key ... ' || COALESCE(c.conversation_key,'(nulo)'));
  v_l := v_l || ('    context_epoch ...... ' || COALESCE(c.context_epoch::text,'(nulo)'));
  v_l := v_l || ('    origin_platform .... ' || COALESCE(c.origin_platform,'(nulo)'));
  v_l := v_l || ('    origin_chat_id ..... ' || COALESCE(left(c.origin_chat_id,20) || '…','(nulo)'));
  v_l := v_l || ('    origin_message_id .. ' || COALESCE(c.origin_message_id,'(nulo)'));
  v_l := v_l || ('    source_surface ..... ' || COALESCE(c.source_surface,'(nulo)'));
  v_l := v_l || ('    client_platform .... ' || COALESCE(c.client_platform,'(nulo)'));
  v_l := v_l || ('    app_version ........ ' || COALESCE(c.app_version,'(nulo)'));
  v_l := v_l || ('    client_message_id .. ' || COALESCE(c.client_message_id,'(nulo)'));
  v_l := v_l || ('    bucket ............. ' || COALESCE(m.bucket,'-'));
  v_l := v_l || ('    storage_path ....... ' || COALESCE(split_part(m.storage_path,'/',1) || '/…/(oculto)','-'));
  v_l := v_l || '';

  -- Los diez campos que pediste comprobar, uno a uno.
  v_ok := c.message_type IS NOT NULL AND c.media_id IS NOT NULL
      AND m.mime_type IS NOT NULL AND m.size_bytes > 0
      AND m.sha256 ~ '^[0-9a-f]{64}$'
      AND c.conversation_key = 'agent:main:morla:tenant:' || v_tenant::text
      AND c.context_epoch IS NOT NULL
      AND c.origin_chat_id IS NOT NULL AND c.origin_message_id = c.id::text;
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_l := v_l || ((CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END)
    || ' 8 · Los diez campos del mensaje v5 estan completos');

  -- El transporte tiene que ser motoflow SIEMPRE. La superficie cambia
  -- segun por donde entro, y las dos son validas.
  v_ok := (c.origin_platform = 'motoflow');
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_l := v_l || ((CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END)
    || ' 8b · El transporte es motoflow · superficie: '
    || COALESCE(c.source_surface, 'web (la esfera)'));

  -- ══ PASO 9 · LO QUE RECIBE HERMES ═════════════════════════════════
  -- Se reclama de verdad para enseñarlo, y se deshace al final.
  v_l := v_l || '';
  v_l := v_l || ('  ── PASO 9 · LO QUE ENTREGA chat_tomar_v5 ────────────────');

  SELECT * INTO t FROM hermes.chat_tomar_v5(5) WHERE id = c.id;

  IF t.id IS NULL THEN
    v_fallan := v_fallan+1;
    v_l := v_l || '  FALLA 9 · chat_tomar_v5 NO devolvio este mensaje';
    v_l := v_l || '         (¿ya lo tomo Hermes? mira estado en hermes_chat)';
  ELSE
    v_l := v_l || ('    message_type ....... ' || COALESCE(t.message_type,'-'));
    v_l := v_l || ('    media_kind ......... ' || COALESCE(t.media_kind,'-'));
    v_l := v_l || ('    mime_type .......... ' || COALESCE(t.mime_type,'-'));
    v_l := v_l || ('    duration_ms ........ ' || COALESCE(t.duration_ms::text,'-'));
    v_l := v_l || ('    size_bytes ......... ' || COALESCE(t.size_bytes::text,'-'));
    v_l := v_l || ('    sha256 ............. ' || COALESCE(left(t.sha256,12) || '…','-'));
    v_l := v_l || ('    claim_token ........ ' || CASE WHEN t.claim_token IS NOT NULL
                     THEN 'presente (no se imprime)' ELSE '(NULO)' END);
    v_l := v_l || ('    lease_until ........ ' || COALESCE(to_char(t.lease_until,'HH24:MI:SS'),'-'));
    v_l := v_l || ('    media_token ........ ' || CASE WHEN t.media_token IS NOT NULL
                     THEN 'presente, ' || length(t.media_token) || ' caracteres (no se imprime)'
                     ELSE '(NULO)' END);
    v_l := v_l || ('    media_token_expira . ' || COALESCE(to_char(t.media_token_expira,'HH24:MI:SS'),'-'));
    v_l := v_l || ('    medios (cuantos) ... ' || jsonb_array_length(COALESCE(t.medios,'[]'::jsonb)));
    v_l := v_l || ('    source_surface ..... ' || COALESCE(t.source_surface,'-'));
    v_l := v_l || '';

    v_ok := t.media_token IS NOT NULL AND t.claim_token IS NOT NULL
        AND t.mime_type IS NOT NULL AND t.sha256 IS NOT NULL
        AND t.media_token_expira > now();
    IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
    v_l := v_l || ((CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END)
      || ' 9 · Hermes recibe permiso, hash y MIME: puede descargar el audio');

    -- El permiso funciona de verdad, no solo existe.
    DECLARE r json;
    BEGIN
      r := hermes.media_canjear(t.media_token);
      v_ok := COALESCE((r ->> 'ok')::boolean, false);
      v_l := v_l || ((CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END)
        || ' 9b · El permiso CANJEA: bucket=' || COALESCE(r ->> 'bucket','-')
        || ', kind=' || COALESCE(r ->> 'media_kind','-'));
      IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
    END;
  END IF;

  -- ══ PASO 12 · OTRO TENANT NO LLEGA AL AUDIO ═══════════════════════
  v_l := v_l || '';
  v_l := v_l || ('  ── PASO 12 · AISLAMIENTO ENTRE EMPRESAS ─────────────────');

  -- La política de storage compara la primera carpeta con get_user_tenant().
  v_ok := (split_part(m.storage_path,'/',1) = v_tenant::text);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_l := v_l || ((CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END)
    || ' 12a · El archivo esta en la carpeta de ESTA empresa');

  SELECT count(*)::int INTO n FROM storage.buckets
  WHERE id IN ('hermes-voz','hermes-medios') AND public = false;
  v_ok := (n = 2);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_l := v_l || ((CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END)
    || ' 12b · Los dos buckets siguen PRIVADOS');

  SELECT count(*)::int INTO n FROM pg_policies
  WHERE schemaname='storage' AND tablename='objects'
    AND policyname IN ('hermes_voz_select','hermes_medios_select')
    AND qual LIKE '%get_user_tenant%';
  v_ok := (n = 2);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_l := v_l || ((CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END)
    || ' 12c · La lectura del bucket la filtra get_user_tenant()');

  -- Y la fila del medio tampoco se ve desde otra empresa: la RLS de
  -- hermes_media compara tenant_id con get_user_tenant().
  SELECT count(*)::int INTO n FROM pg_policies
  WHERE schemaname='public' AND tablename='hermes_media' AND qual LIKE '%get_user_tenant%';
  v_ok := (n >= 1);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_l := v_l || ((CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END)
    || ' 12d · hermes_media tambien filtra por empresa');

  -- ══ EL JSON REDACTADO, PARA PEGAR EN EL CONTRATO ══════════════════
  v_json := jsonb_pretty(jsonb_build_object(
    'id', c.id,
    'message_type', c.message_type,
    'texto', left(COALESCE(c.texto,''), 60),
    'conversation_key', c.conversation_key,
    'context_epoch', c.context_epoch,
    'origin_platform', c.origin_platform,
    'origin_chat_id', '«redactado»',
    'origin_message_id', c.origin_message_id,
    'source_surface', c.source_surface,
    'client_platform', c.client_platform,
    'app_version', c.app_version,
    'client_message_id', '«redactado»',
    'media_id', '«uuid»',
    'media_kind', m.media_kind,
    'mime_type', m.mime_type,
    'codec', m.codec,
    'duration_ms', m.duration_ms,
    'size_bytes', m.size_bytes,
    'sha256', left(m.sha256,12) || '…',
    'bucket', m.bucket,
    'storage_path', split_part(m.storage_path,'/',1) || '/…',
    'media_token', '«se entrega una sola vez»',
    'transcription_status', m.transcription_status));

  RAISE EXCEPTION '%',
    chr(10) || chr(10)
    || '══════ VERIFICACION DE LA PRUEBA FISICA ══════' || chr(10)
    || '  mensaje #' || c.id || ' · ' || to_char(c.creado_en,'DD/MM HH24:MI')
    || ' · ' || COALESCE(c.source_surface, 'web')
    || COALESCE(' (' || c.client_platform || ')', '') || chr(10) || chr(10)
    || array_to_string(v_l, chr(10)) || chr(10) || chr(10)
    || '  ── JSON REAL, REDACTADO ─────────────────────────────────' || chr(10)
    || v_json || chr(10) || chr(10)
    || '  ' || CASE WHEN v_fallan = 0 THEN 'TODO EN VERDE' ELSE 'HAY FALLOS' END
    || '  ·  pasan ' || v_pasan || ', fallan ' || v_fallan || chr(10) || chr(10)
    || '  (el reclamo se deshizo: el mensaje sigue pendiente para Hermes)' || chr(10);
END $VERIFICAR$;
