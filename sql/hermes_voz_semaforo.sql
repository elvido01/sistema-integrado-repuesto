-- =====================================================================
-- SEMÁFORO DE LA VOZ — ¿ya la tomó Hermes?
-- ---------------------------------------------------------------------
-- (2026-08-13) El transporte de voz está aplicado y probado en MotoFlow,
-- pero el adaptador de Hermes todavía no había llamado a chat_tomar_v5
-- ni una vez. Este archivo contesta esa pregunta sin discutirla: mira la
-- base y dice si el audio se movió o no.
--
-- >>> POR QUÉ ESTE ARCHIVO Y NO PREGUNTAR <<<
-- "Ya está implementado" y "está corriendo en producción" son dos cosas
-- distintas, y la diferencia entre las dos no se resuelve conversando.
-- Cada criterio de aquí es un hecho que deja rastro en una tabla:
--
--   · un media_token emitido  → alguien llamó a chat_tomar_v5 con adjuntos
--   · transcription_status ok → alguien bajó el audio y lo pasó por STT
--   · el mensaje respondido   → el turno se cerró
--   · tts_status ok           → la respuesta volvió hablada
--
-- Ninguno se puede fingir desde MotoFlow: los cuatro los escribe el otro
-- lado, con su propio claim_token.
--
-- Se corre solo y no cambia nada. Sirve igual antes (para ver qué falta)
-- que después (para dar la voz por cerrada).
-- =====================================================================

DO $SEMAFORO$
DECLARE
  s          text := '';
  nl         text := chr(10);
  r          record;
  n_tokens   int;
  n_pend     int;
  n_stt      int;
  n_tts      int;
  n_audios   int;
  v_verde    int := 0;
  v_rojo     int := 0;
BEGIN
  -- ── 1 · ¿SE LLAMÓ A chat_tomar_v5 ALGUNA VEZ? ────────────────────
  -- La prueba más barata y la que no admite interpretación: la base
  -- emite un permiso de descarga por cada adjunto que entrega. Si esta
  -- cuenta es 0, el bucle del adaptador nunca pidió medios.
  SELECT count(*) INTO n_tokens FROM public.hermes_media_tokens;
  IF n_tokens > 0 THEN v_verde := v_verde+1; ELSE v_rojo := v_rojo+1; END IF;
  s := s || CASE WHEN n_tokens > 0 THEN '  ok   ' ELSE '  FALTA' END
        || '  1 · media_tokens emitidos: ' || n_tokens
        || CASE WHEN n_tokens = 0
                THEN nl || '            (0 = chat_tomar_v5 no se ha llamado nunca)' ELSE '' END || nl;

  -- ── 2 · ¿BAJÓ EL AUDIO Y LO TRANSCRIBIÓ? ─────────────────────────
  SELECT count(*) FILTER (WHERE origen = 'usuario'),
         count(*) FILTER (WHERE origen = 'usuario' AND transcription_status = 'ok')
    INTO n_audios, n_stt
  FROM public.hermes_media WHERE deleted_at IS NULL;
  IF n_audios > 0 AND n_stt = n_audios THEN v_verde := v_verde+1; ELSE v_rojo := v_rojo+1; END IF;
  s := s || CASE WHEN n_audios > 0 AND n_stt = n_audios THEN '  ok   ' ELSE '  FALTA' END
        || '  2 · transcritos por Hermes: ' || n_stt || ' de ' || n_audios || ' audios' || nl;

  -- ── 3 · ¿SE CERRÓ EL TURNO? ──────────────────────────────────────
  SELECT count(*) INTO n_pend
  FROM public.hermes_chat
  WHERE rol = 'usuario' AND estado = 'pendiente' AND message_type <> 'text';
  IF n_pend = 0 THEN v_verde := v_verde+1; ELSE v_rojo := v_rojo+1; END IF;
  s := s || CASE WHEN n_pend = 0 THEN '  ok   ' ELSE '  FALTA' END
        || '  3 · notas de voz sin responder: ' || n_pend || nl;

  -- ── 4 · ¿CONTESTÓ HABLANDO? ──────────────────────────────────────
  -- Este NO bloquea: responder por escrito a una nota de voz es válido.
  -- Se informa para saber si el TTS llegó a usarse alguna vez.
  SELECT count(*) INTO n_tts
  FROM public.hermes_media WHERE origen = 'hermes' AND tts_status = 'ok' AND deleted_at IS NULL;
  s := s || '  ' || CASE WHEN n_tts > 0 THEN 'ok   ' ELSE '·    ' END
        || '  4 · respuestas habladas (TTS) de Hermes: ' || n_tts
        || CASE WHEN n_tts = 0 THEN '   (no bloquea)' ELSE '' END || nl;

  -- ── EL DETALLE, PARA SABER QUÉ ESTÁ ESPERANDO ────────────────────
  IF n_pend > 0 THEN
    s := s || nl || '  ── lo que sigue en la cola ──' || nl;
    FOR r IN
      SELECT c.id, c.message_type, c.intentos, c.creado_en,
             (c.claim_token IS NOT NULL) AS reclamado,
             m.duration_ms, m.mime_type, m.transcription_status
      FROM public.hermes_chat c
      LEFT JOIN public.hermes_media m ON m.mensaje_id = c.id
      WHERE c.rol = 'usuario' AND c.estado = 'pendiente' AND c.message_type <> 'text'
      ORDER BY c.id
    LOOP
      s := s || '     #' || r.id || '  ' || rpad(r.message_type, 6)
             || COALESCE(r.duration_ms::text || 'ms', 'sin audio')
             || '  ' || COALESCE(r.mime_type, '-')
             || '  stt=' || COALESCE(r.transcription_status, '-')
             || '  intentos=' || r.intentos
             || '  reclamado=' || r.reclamado
             || '  · ' || to_char(r.creado_en, 'DD/MM HH24:MI') || nl;
    END LOOP;
  END IF;

  -- ── EL LATIDO ────────────────────────────────────────────────────
  -- Late ≠ toma. El proceso puede estar vivo con el bucle de toma
  -- caído, que es justo el caso que hubo el 13/08.
  s := s || nl;
  FOR r IN SELECT tenant_id, ultimo FROM public.hermes_presencia ORDER BY ultimo DESC LIMIT 3 LOOP
    s := s || '  latido: ' || r.tenant_id || '  hace '
           || COALESCE(EXTRACT(epoch FROM (now() - r.ultimo))::int::text, '?') || 's' || nl;
  END LOOP;

  RAISE EXCEPTION '%',
    nl || nl
    || '══════ SEMÁFORO DE LA VOZ ══════' || nl || nl
    || s || nl
    || '  ' || CASE WHEN v_rojo = 0 THEN 'LA VOZ ESTÁ CERRADA DE PUNTA A PUNTA'
                    ELSE 'TODAVÍA NO: el audio no ha pasado por Hermes' END
    || '   ·  verde ' || v_verde || ', falta ' || v_rojo || nl || nl
    || CASE WHEN v_rojo = 0 THEN '' ELSE
         '  Del lado de MotoFlow no queda nada por hacer: el audio está' || nl
      || '  subido, registrado y encolado. Falta que el adaptador llame a' || nl
      || '  hermes.chat_tomar_v5() y baje los medios con su media_token.' || nl || nl END
    || '  (esta prueba no cambia nada: solo mira)' || nl;
END $SEMAFORO$;
