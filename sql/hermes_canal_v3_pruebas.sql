-- =====================================================================
-- Pruebas del contrato v3
-- ---------------------------------------------------------------------
-- UNA SOLA SENTENCIA, Y NO DEJA NADA. NI UNA FILA.
--
-- El editor de Supabase ejecuta cada sentencia por separado, así que un
-- BEGIN…ROLLBACK escrito a mano NO agrupa nada: los mensajes de prueba se
-- habrían quedado en producción, que es justo lo que había prometido que
-- no pasaría. Por eso ahora todo es un único bloque que termina lanzando
-- una excepción con el informe dentro.
--
-- Una excepción aborta la transacción entera, la agrupe quien la agrupe:
-- el rollback deja de depender de que yo lo escriba bien y pasa a
-- depender de Postgres. El informe sale en el mensaje de error — se ve
-- como un error, pero es el resultado.
--
-- Requiere hermes_canal_v3.sql aplicado.
--
-- >>> QUÉ NO SE PRUEBA AQUÍ Y POR QUÉ <<<
-- Nº 2 (dos workers a la vez) necesita DOS conexiones reales: dentro de
-- una sola no hay concurrencia que probar. Va en
-- scripts/hermes-prueba-concurrencia.mjs.
--
-- Nº 15 a 20 son de Hermes: cruces entre WebUI, MotoFlow y WhatsApp, y
-- reinicio del gateway. MotoFlow solo ve su canal — afirmar que pasan
-- sería inventarme evidencia de algo que no puedo observar.
--
-- Aquí quedan probadas: 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14 y 21.
-- =====================================================================

DO $PRUEBAS$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_otro   uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';   -- MotoPréstamos
  v_conv   text := 'agent:main:morla:tenant:00000000-0000-0000-0000-000000000001';
  v_conv2  text := 'agent:main:morla:PRUEBA-SEGUNDA-CONVERSACION';
  m1 bigint; m2 bigint; m3 bigint; mo bigint;
  r  json; n int; v_txt text;
  -- El informe se arma en memoria. Una tabla temporal no sirve: lo que
  -- escribiera dentro de este bloque se iría con la misma excepción que
  -- garantiza que no quede basura.
  v_lineas text[] := ARRAY[]::text[];
  v_obt    text;
  v_ok     boolean;
  v_pasan  int := 0;
  v_fallan int := 0;
BEGIN
  -- ── Que la migración esté puesta ──────────────────────────────────
  IF to_regprocedure('hermes.chat_tomar(integer)') IS NULL THEN
    RAISE EXCEPTION 'Falta aplicar hermes_canal_v3.sql: no existe hermes.chat_tomar()';
  END IF;

  -- Los mensajes reales que ya estén pendientes estorbarían: se apartan
  -- solo dentro de esta transacción, que se deshace al final.
  UPDATE public.hermes_chat SET estado = 'respondido'
  WHERE rol = 'usuario' AND estado IN ('pendiente', 'procesando');

  -- ══════════════════════════════════════════════════════════════════
  -- 1 · chat_responder dos veces con el mismo id → UNA burbuja
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado)
  VALUES (v_tenant, 'usuario', 'prueba 1', v_conv, 'pendiente') RETURNING id INTO m1;
  PERFORM hermes.chat_tomar(1);

  r := hermes.chat_responder(m1, 'primera respuesta');
  r := hermes.chat_responder(m1, 'segunda respuesta');

  SELECT count(*)::int INTO n FROM public.hermes_chat
  WHERE rol = 'hermes' AND responde_a = m1;
  v_obt := n || ' respuesta | duplicado=' || (r ->> 'duplicado');
  v_ok := ('1 respuesta | duplicado=true' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || '  1 · ' || 'Responder dos veces deja una sola respuesta'
    || chr(10) || '         esperaba: ' || '1 respuesta | duplicado=true'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- ══════════════════════════════════════════════════════════════════
  -- 3 · Dos mensajes seguidos de la misma conversación → EN ORDEN
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado, creado_en)
  VALUES (v_tenant, 'usuario', 'prueba 3 primero', v_conv, 'pendiente', now() - interval '2 min')
  RETURNING id INTO m1;
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado, creado_en)
  VALUES (v_tenant, 'usuario', 'prueba 3 segundo', v_conv, 'pendiente', now() - interval '1 min')
  RETURNING id INTO m2;

  -- Se piden 5: aunque haya dos pendientes, solo puede salir el primero.
  SELECT count(*)::int INTO n FROM hermes.chat_tomar(5);
  SELECT texto INTO v_txt FROM public.hermes_chat WHERE estado = 'procesando' LIMIT 1;
  v_obt := n || ' | ' || COALESCE(v_txt, '(ninguno)');
  v_ok := ('1 | prueba 3 primero' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || '  3 · ' || 'Una conversación entrega de a uno, el más viejo primero'
    || chr(10) || '         esperaba: ' || '1 | prueba 3 primero'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- ══════════════════════════════════════════════════════════════════
  -- 4 · Dos conversaciones distintas → EN PARALELO
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado)
  VALUES (v_tenant, 'usuario', 'prueba 4 otra conversación', v_conv2, 'pendiente')
  RETURNING id INTO m3;

  SELECT count(*)::int INTO n FROM hermes.chat_tomar(5);
  v_obt := n::text;
  v_ok := ('1' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || '  4 · ' || 'Otra conversación avanza aunque la primera esté ocupada'
    || chr(10) || '         esperaba: ' || '1'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- Se cierran para no estorbar a las siguientes
  PERFORM hermes.chat_responder(m1, 'cerrando 3');
  PERFORM hermes.chat_responder(m3, 'cerrando 4');
  UPDATE public.hermes_chat SET estado = 'respondido' WHERE id = m2;

  -- ══════════════════════════════════════════════════════════════════
  -- 5 · Worker muerto → el arrendamiento de 5 min lo rescata
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat
    (tenant_id, rol, texto, conversation_key, estado, procesando_en, intentos)
  VALUES (v_tenant, 'usuario', 'prueba 5 abandonado', v_conv, 'procesando',
          now() - interval '9 minutes', 1)
  RETURNING id INTO m1;

  SELECT count(*)::int INTO n FROM hermes.chat_tomar(1);
  v_obt := n || ' tomado | intentos=' || (SELECT intentos FROM public.hermes_chat WHERE id = m1);
  v_ok := ('1 tomado | intentos=2' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || '  5 · ' || 'Un mensaje abandonado hace 9 min vuelve a la cola'
    || chr(10) || '         esperaba: ' || '1 tomado | intentos=2'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- Y que uno tomado hace 1 minuto NO se rescata (sigue vivo)
  UPDATE public.hermes_chat SET estado = 'procesando', procesando_en = now() WHERE id = m1;
  SELECT count(*)::int INTO n FROM hermes.chat_tomar(1);
  v_obt := n::text;
  v_ok := ('0' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || '  5 · ' || 'Un mensaje tomado hace 1 min NO se le quita al worker vivo'
    || chr(10) || '         esperaba: ' || '0'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));
  UPDATE public.hermes_chat SET estado = 'respondido' WHERE id = m1;

  -- ══════════════════════════════════════════════════════════════════
  -- 6 · Tres errores → sale de la cola
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado)
  VALUES (v_tenant, 'usuario', 'prueba 6 fallona', v_conv, 'pendiente') RETURNING id INTO m1;

  PERFORM hermes.chat_tomar(1); PERFORM hermes.chat_error(m1, 'fallo 1');
  PERFORM hermes.chat_tomar(1); PERFORM hermes.chat_error(m1, 'fallo 2');
  PERFORM hermes.chat_tomar(1); PERFORM hermes.chat_error(m1, 'fallo 3');

  SELECT count(*)::int INTO n FROM hermes.chat_tomar(1);
  SELECT estado || ' | ' || intentos || ' | ' || COALESCE(ultimo_error, '(sin error)')
  INTO v_txt FROM public.hermes_chat WHERE id = m1;
  v_obt := n || ' tomados | ' || v_txt;
  v_ok := ('0 tomados | error | 3 | fallo 3' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || '  6 · ' || 'Tras 3 fallos sale de la cola y conserva el motivo'
    || chr(10) || '         esperaba: ' || '0 tomados | error | 3 | fallo 3'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- ══════════════════════════════════════════════════════════════════
  -- 7 · Reconexión: lo tomado y no respondido se recupera
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat
    (tenant_id, rol, texto, conversation_key, estado, procesando_en, intentos)
  VALUES (v_tenant, 'usuario', 'prueba 7 reconexión', v_conv, 'procesando',
          now() - interval '6 minutes', 1)
  RETURNING id INTO m1;
  SELECT count(*)::int INTO n FROM hermes.chat_tomar(1);
  r := hermes.chat_responder(m1, 'terminada tras reconectar');
  SELECT count(*)::int INTO n FROM public.hermes_chat WHERE rol = 'hermes' AND responde_a = m1;
  v_obt := n::text;
  v_ok := ('1' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || '  7 · ' || 'Tras reconectar se termina el pendiente sin duplicar'
    || chr(10) || '         esperaba: ' || '1'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- ══════════════════════════════════════════════════════════════════
  -- 8 · Respuesta tardía: se acepta igual
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat
    (tenant_id, rol, texto, conversation_key, estado, procesando_en, creado_en)
  VALUES (v_tenant, 'usuario', 'prueba 8 tardía', v_conv, 'procesando',
          now() - interval '3 minutes', now() - interval '3 minutes')
  RETURNING id INTO m1;
  r := hermes.chat_responder(m1, 'llegué tarde pero llegué');
  SELECT estado INTO v_txt FROM public.hermes_chat WHERE id = m1;
  v_obt := v_txt || ' | duplicado=' || (r ->> 'duplicado');
  v_ok := ('respondido | duplicado=false' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || '  8 · ' || 'Una respuesta de 3 minutos se acepta'
    || chr(10) || '         esperaba: ' || 'respondido | duplicado=false'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- ══════════════════════════════════════════════════════════════════
  -- 9 · Acción sin confirmar nace como propuesta
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado)
  VALUES (v_tenant, 'usuario', 'prueba 9 cotización', v_conv, 'pendiente') RETURNING id INTO m1;
  PERFORM hermes.chat_tomar(1);
  r := hermes.chat_responder(m1, 'te preparo la venta',
        jsonb_build_object('tipo', 'preparar_venta',
          'lineas', jsonb_build_array(jsonb_build_object('codigo', '52JK0442', 'cantidad', 1))));
  SELECT acciones ->> 'estado' INTO v_txt FROM public.hermes_chat
  WHERE id = (r ->> 'respuesta_id')::bigint;
  v_obt := COALESCE(v_txt, '(nulo)');
  v_ok := ('propuesta' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || '  9 · ' || 'Una acción sin estado nace como propuesta, no ejecutada'
    || chr(10) || '         esperaba: ' || 'propuesta'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- Y un código inventado rebota antes de llegar a la pantalla
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado)
  VALUES (v_tenant, 'usuario', 'prueba 9b código falso', v_conv, 'pendiente') RETURNING id INTO m1;
  PERFORM hermes.chat_tomar(1);
  BEGIN
    PERFORM hermes.chat_responder(m1, 'venta con código inventado',
      jsonb_build_object('tipo', 'preparar_venta',
        'lineas', jsonb_build_array(jsonb_build_object('codigo', 'NO-EXISTE-XYZ', 'cantidad', 1))));
    v_txt := 'no rebotó';
  EXCEPTION WHEN OTHERS THEN v_txt := 'rebotó';
  END;
  v_obt := v_txt;
  v_ok := ('rebotó' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || '  9 · ' || 'Un código que no existe rebota antes de llegar a la pantalla'
    || chr(10) || '         esperaba: ' || 'rebotó'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));
  UPDATE public.hermes_chat SET estado = 'respondido' WHERE id = m1;

  -- ══════════════════════════════════════════════════════════════════
  -- 11 · Aislamiento entre tenants
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado)
  VALUES (v_otro, 'usuario', 'prueba 11 de otra empresa',
          'agent:main:tenant:tenant:' || v_otro::text, 'pendiente')
  RETURNING id INTO mo;

  SELECT count(*)::int INTO n FROM hermes.chat_tomar(5);
  v_obt := n::text;
  v_ok := ('0' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 11 · ' || 'chat_tomar no ve mensajes de otro tenant'
    || chr(10) || '         esperaba: ' || '0'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  BEGIN
    PERFORM hermes.chat_responder(mo, 'no debería poder');
    v_txt := 'lo respondió';
  EXCEPTION WHEN OTHERS THEN v_txt := 'lo rechazó';
  END;
  v_obt := v_txt;
  v_ok := ('lo rechazó' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 11 · ' || 'chat_responder rechaza un mensaje de otro tenant'
    || chr(10) || '         esperaba: ' || 'lo rechazó'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  SELECT count(*)::int INTO n FROM hermes.chat_pendientes(50)
  WHERE texto = 'prueba 11 de otra empresa';
  v_obt := n::text;
  v_ok := ('0' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 11 · ' || 'chat_pendientes tampoco lo enseña'
    || chr(10) || '         esperaba: ' || '0'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- ══════════════════════════════════════════════════════════════════
  -- 10 · El estado no retrocede desde respondido
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado)
  VALUES (v_tenant, 'usuario', 'prueba 10 terminal', v_conv, 'pendiente') RETURNING id INTO m1;
  PERFORM hermes.chat_tomar(1);
  PERFORM hermes.chat_responder(m1, 'terminado');
  r := hermes.chat_error(m1, 'intento de marcar error después de responder');
  SELECT estado INTO v_txt FROM public.hermes_chat WHERE id = m1;
  v_obt := v_txt || ' | cambiado=' || (r ->> 'cambiado');
  v_ok := ('respondido | cambiado=false' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 10 · ' || 'Respondido es terminal: un error posterior no lo mueve'
    || chr(10) || '         esperaba: ' || 'respondido | cambiado=false'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- ══════════════════════════════════════════════════════════════════
  -- 12 · respondido y estado nunca se separan
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado)
  VALUES (v_tenant, 'usuario', 'prueba 12 sincronía', v_conv, 'pendiente') RETURNING id INTO m1;
  -- Código VIEJO: escribe respondido a pelo, sin saber que existe estado
  UPDATE public.hermes_chat SET respondido = true WHERE id = m1;
  SELECT estado INTO v_txt FROM public.hermes_chat WHERE id = m1;
  v_obt := v_txt;
  v_ok := ('respondido' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 12 · ' || 'Código viejo que escribe respondido mueve el estado'
    || chr(10) || '         esperaba: ' || 'respondido'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado)
  VALUES (v_tenant, 'usuario', 'prueba 12b sincronía', v_conv, 'pendiente') RETURNING id INTO m1;
  UPDATE public.hermes_chat SET estado = 'respondido' WHERE id = m1;
  SELECT respondido::text INTO v_txt FROM public.hermes_chat WHERE id = m1;
  v_obt := v_txt;
  v_ok := ('true' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 12 · ' || 'Y al revés: mover el estado mueve respondido'
    || chr(10) || '         esperaba: ' || 'true'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- ══════════════════════════════════════════════════════════════════
  -- 13 · chat_estado solo toca el detalle
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado)
  VALUES (v_tenant, 'usuario', 'prueba 13 detalle', v_conv, 'pendiente') RETURNING id INTO m1;
  PERFORM hermes.chat_tomar(1);
  r := hermes.chat_estado(m1, 'consultando el catálogo');
  SELECT estado || ' | ' || COALESCE(estado_detalle, '(vacío)')
  INTO v_txt FROM public.hermes_chat WHERE id = m1;
  v_obt := v_txt;
  v_ok := ('procesando | consultando el catálogo' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 13 · ' || 'chat_estado cambia el detalle sin mover el estado'
    || chr(10) || '         esperaba: ' || 'procesando | consultando el catálogo'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- Avisar de algo ya terminado no revienta
  PERFORM hermes.chat_responder(m1, 'ya está');
  r := hermes.chat_estado(m1, 'sigo trabajando');
  v_obt := 'cambiado=' || (r ->> 'cambiado');
  v_ok := ('cambiado=false' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 13 · ' || 'Avisar del detalle tras responder no lanza excepción'
    || chr(10) || '         esperaba: ' || 'cambiado=false'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- ══════════════════════════════════════════════════════════════════
  -- 14 · Un mensaje perdido se recoge al arrancar
  -- ══════════════════════════════════════════════════════════════════
  -- Simula el NOTIFY perdido: la fila existe y nadie la tomó.
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado, creado_en)
  VALUES (v_tenant, 'usuario', 'prueba 14 aviso perdido', v_conv, 'pendiente', now() - interval '1 hour')
  RETURNING id INTO m1;
  SELECT count(*)::int INTO n FROM hermes.chat_tomar(1);
  v_obt := n::text;
  v_ok := ('1' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 14 · ' || 'Un mensaje de hace una hora sin aviso se recoge igual'
    || chr(10) || '         esperaba: ' || '1'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));
  PERFORM hermes.chat_responder(m1, 'recogido al arrancar');

  -- ══════════════════════════════════════════════════════════════════
  -- 21 · El CRM de clientes no roza la conversación del agente
  -- ══════════════════════════════════════════════════════════════════
  -- La primera versión comparaba textos iguales entre sales_messages y
  -- hermes_chat, y falló con 6 coincidencias. Ninguna era contaminación:
  -- Elvido escribió "?" en MotoFlow y seis clientes escribieron "?" por
  -- WhatsApp en meses distintos. Comparar textos atrapa cualquier "hola",
  -- "ok" o "?" y no prueba nada.
  --
  -- La invariante de verdad es estructural: un mensaje del CRM entraría
  -- sin usuario de MotoFlow y sin declararse como de MotoFlow. Eso no
  -- lo produce ninguna coincidencia.
  SELECT count(*)::int INTO n
  FROM public.hermes_chat c
  WHERE c.tenant_id = v_tenant
    AND c.rol = 'usuario'
    AND (c.origin_platform IS DISTINCT FROM 'motoflow' OR c.user_id IS NULL);
  v_obt := n::text;
  v_ok := ('0' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 21 · ' || 'Todo lo que hay en hermes_chat se declaró de MotoFlow y tiene usuario'
    || chr(10) || '         esperaba: ' || '0'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- Y el cruce temporal: un texto igual DENTRO DE CINCO MINUTOS del
  -- mensaje del cliente sí sería sospechoso. La casualidad no acierta
  -- también la hora.
  SELECT count(*)::int INTO n
  FROM public.hermes_chat c
  JOIN public.sales_messages sm
    ON sm.tenant_id = c.tenant_id
   AND btrim(sm.message_text) = btrim(c.texto)
   AND sm.created_at BETWEEN c.creado_en - interval '5 minutes'
                         AND c.creado_en + interval '5 minutes'
  WHERE c.tenant_id = v_tenant AND c.rol = 'usuario';
  v_obt := n::text;
  v_ok := ('0' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 21 · ' || 'Ningún mensaje del CRM apareció en hermes_chat a la misma hora'
    || chr(10) || '         esperaba: ' || '0'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- ── EL INFORME ─────────────────────────────────────
  -- Va como excepción a propósito. No es que algo haya salido mal: es la
  -- única forma de estar seguro de que nada de lo de arriba se guarda.
  --
  -- Sin barras invertidas: chr(10) es un salto de línea y no depende de
  -- cómo cada editor trate los escapes al copiar y pegar.
  RAISE EXCEPTION '%',
    chr(10) || chr(10)
    || '══════ PRUEBAS DEL CONTRATO v3 ══════' || chr(10) || chr(10)
    || array_to_string(v_lineas, chr(10)) || chr(10) || chr(10)
    || '  ' || CASE WHEN v_fallan = 0 THEN 'TODO EN VERDE' ELSE 'HAY FALLOS' END
    || '  ·  pasan ' || v_pasan || ', fallan ' || v_fallan || chr(10) || chr(10)
    || '  (nada de esto se guardó: esta excepción lo deshace todo)' || chr(10);
END $PRUEBAS$;
