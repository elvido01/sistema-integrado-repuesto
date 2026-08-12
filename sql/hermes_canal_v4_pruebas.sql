-- =====================================================================
-- Pruebas del contrato v4 — fencing y corte de contexto
-- ---------------------------------------------------------------------
-- UNA SOLA SENTENCIA, Y NO DEJA NADA. NI UNA FILA.
--
-- Igual que las de v3: todo va dentro de un DO que termina lanzando una
-- excepción con el informe dentro. El editor de Supabase ejecuta cada
-- sentencia por separado, así que un BEGIN…ROLLBACK escrito a mano no
-- agruparía nada y los mensajes de prueba se quedarían en producción.
-- Una excepción aborta la transacción entera la agrupe quien la agrupe:
-- el rollback deja de depender de mí y pasa a depender de Postgres.
--
-- El informe sale como un error. Se ve como un error, pero es el
-- resultado.
--
-- Requiere hermes_canal_v4.sql aplicado.
-- Las 21 de v3 tienen que seguir pasando: hermes_canal_v3_pruebas.sql.
--
-- >>> NOTA SOBRE EL TIEMPO <<<
-- Dentro de una transacción now() no avanza: vale lo mismo en la primera
-- línea y en la última. Por eso el vencimiento no se espera, se escribe:
-- se le pone al arrendamiento una fecha pasada y se comprueba qué hace
-- la cola con ella. Es la misma condición que evaluaría cinco minutos
-- después, sin tardar cinco minutos.
--
-- >>> LO QUE NO CABE AQUÍ <<<
-- Dos workers de verdad peleándose por la cola necesitan dos conexiones;
-- dentro de una sola transacción no hay concurrencia que probar. Eso va
-- en scripts/hermes-prueba-concurrencia.mjs (npm run hermes:concurrencia),
-- que además comprueba que los claim_token que reparte son distintos.
-- =====================================================================

DO $PRUEBAS$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_conv   text := 'agent:main:morla:tenant:00000000-0000-0000-0000-000000000001';
  v_conv3  text := 'agent:main:morla:PRUEBA-CORTE-CONTEXTO';
  m1 bigint; mA bigint; mB bigint; mC bigint;
  tok1 uuid; tok2 uuid; lease1 timestamptz; lease2 timestamptz;
  r json; n int; v_txt text;
  v_epoca_real integer;
  v_lineas text[] := ARRAY[]::text[];
  v_obt    text;
  v_ok     boolean;
  v_pasan  int := 0;
  v_fallan int := 0;
BEGIN
  -- ── Que la migración esté puesta ──────────────────────────────────
  IF to_regprocedure('hermes.chat_renovar(bigint,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta aplicar hermes_canal_v4.sql: no existe hermes.chat_renovar()';
  END IF;

  -- Los mensajes reales que ya estén en cola estorbarían: chat_tomar()
  -- podría llevarse uno de ellos en vez del de la prueba. Se apartan solo
  -- dentro de esta transacción, que se deshace al final.
  UPDATE public.hermes_chat SET estado = 'respondido'
  WHERE rol = 'usuario' AND estado IN ('pendiente', 'procesando');

  -- La época real de partida, para comprobar al final que ninguna prueba
  -- la movió. Se lee, no se supone que valga 1: si algún día se corta el
  -- contexto de verdad, la prueba tiene que seguir siendo válida.
  SELECT k.context_epoch INTO v_epoca_real
  FROM public.hermes_conversaciones k
  WHERE k.tenant_id = v_tenant AND k.conversation_key = v_conv;

  -- ══════════════════════════════════════════════════════════════════
  -- 22 · El arrendamiento vence, y al vencer cambia de dueño
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado)
  VALUES (v_tenant, 'usuario', 'prueba 22 arrendamiento', v_conv, 'pendiente')
  RETURNING id INTO m1;

  SELECT t.claim_token, t.lease_until INTO tok1, lease1
  FROM hermes.chat_tomar(1) t;

  v_obt := CASE WHEN tok1 IS NULL THEN 'sin token' ELSE 'con token' END
           || ' | vence en ' || COALESCE(round(extract(epoch FROM lease1 - now()))::text, '(nulo)') || 's';
  v_ok := ('con token | vence en 300s' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 22 · ' || 'chat_tomar entrega claim_token y arrendamiento de 5 minutos'
    || chr(10) || '         esperaba: ' || 'con token | vence en 300s'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- Se le adelanta el reloj al arrendamiento: vencido hace un segundo.
  UPDATE public.hermes_chat SET lease_until = now() - interval '1 second' WHERE id = m1;

  SELECT t.claim_token, t.lease_until INTO tok2, lease2
  FROM hermes.chat_tomar(1) t;

  v_obt := CASE WHEN tok2 IS NULL THEN 'no lo rescató'
                WHEN tok2 = tok1  THEN 'rescatado con el MISMO token'
                ELSE 'rescatado con token nuevo' END
           || ' | vence en ' || COALESCE(round(extract(epoch FROM lease2 - now()))::text, '-') || 's';
  v_ok := ('rescatado con token nuevo | vence en 300s' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 22 · ' || 'Un arrendamiento vencido vuelve a la cola y estrena token'
    || chr(10) || '         esperaba: ' || 'rescatado con token nuevo | vence en 300s'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- ══════════════════════════════════════════════════════════════════
  -- 25 · Un solo token vale a la vez
  -- ══════════════════════════════════════════════════════════════════
  -- El del worker viejo ya no encaja con ninguna fila. No es que esté
  -- "caducado" en algún sitio: es que no existe.
  SELECT count(*)::int INTO n FROM public.hermes_chat
  WHERE id = m1 AND claim_token = tok1;
  v_obt := n || ' fila con el token viejo';
  v_ok := ('0 fila con el token viejo' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 25 · ' || 'Tras el relevo solo vale un token: el del worker nuevo'
    || chr(10) || '         esperaba: ' || '0 fila con el token viejo'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- ══════════════════════════════════════════════════════════════════
  -- 24 · El worker antiguo no puede tocar nada
  -- ══════════════════════════════════════════════════════════════════
  -- m1 está en manos de tok2. tok1 es el fantasma: sigue vivo en algún
  -- proceso que no se enteró de que perdió el mensaje.

  -- 24a · No pisa el detalle que se ve en pantalla
  r := hermes.chat_estado(m1, 'el viejo dice que sigue buscando', tok1);
  SELECT COALESCE(estado_detalle, '(vacío)') INTO v_txt
  FROM public.hermes_chat WHERE id = m1;
  v_obt := 'motivo=' || COALESCE(r ->> 'motivo', '(ninguno)') || ' | detalle=' || v_txt;
  v_ok := ('motivo=claim_reemplazado | detalle=(vacío)' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 24 · ' || 'chat_estado del worker viejo se rechaza y no pisa la pantalla'
    || chr(10) || '         esperaba: ' || 'motivo=claim_reemplazado | detalle=(vacío)'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- 24b · No devuelve a la cola un mensaje que otro tiene en la mano
  -- Esta es la peligrosa de verdad: sin fencing, el fantasma pone el
  -- mensaje en 'pendiente', un tercer worker lo agarra, y acaban dos
  -- respondiendo lo mismo mientras la cola cree que está libre.
  r := hermes.chat_error(m1, 'el viejo cree que falló', tok1);
  SELECT estado INTO v_txt FROM public.hermes_chat WHERE id = m1;
  v_obt := 'motivo=' || COALESCE(r ->> 'motivo', '(ninguno)') || ' | estado=' || v_txt;
  v_ok := ('motivo=claim_reemplazado | estado=procesando' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 24 · ' || 'chat_error del worker viejo NO devuelve el mensaje a la cola'
    || chr(10) || '         esperaba: ' || 'motivo=claim_reemplazado | estado=procesando'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- 24c · No escribe una respuesta
  r := hermes.chat_responder(m1, 'respuesta del worker viejo', NULL, tok1);
  SELECT count(*)::int INTO n FROM public.hermes_chat WHERE responde_a = m1;
  v_obt := 'motivo=' || COALESCE(r ->> 'motivo', '(ninguno)') || ' | respuestas=' || n;
  v_ok := ('motivo=claim_reemplazado | respuestas=0' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 24 · ' || 'chat_responder del worker viejo no escribe nada'
    || chr(10) || '         esperaba: ' || 'motivo=claim_reemplazado | respuestas=0'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- 24d · Y el que sí lo tiene, trabaja normal
  r := hermes.chat_estado(m1, 'consultando el catálogo', tok2);
  v_txt := COALESCE(r ->> 'cambiado', '?') || '/' || COALESCE(r ->> 'renovado', '?');
  r := hermes.chat_responder(m1, 'respuesta del worker bueno', NULL, tok2);
  SELECT count(*)::int INTO n FROM public.hermes_chat WHERE responde_a = m1;
  v_obt := 'estado ' || v_txt || ' | duplicado=' || COALESCE(r ->> 'duplicado', '?')
           || ' | respuestas=' || n;
  v_ok := ('estado true/true | duplicado=false | respuestas=1' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 24 · ' || 'El worker con el token bueno reporta, renueva y responde'
    || chr(10) || '         esperaba: ' || 'estado true/true | duplicado=false | respuestas=1'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- ══════════════════════════════════════════════════════════════════
  -- 23 · Renovar
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado)
  VALUES (v_tenant, 'usuario', 'prueba 23 renovación', v_conv, 'pendiente')
  RETURNING id INTO m1;
  SELECT t.claim_token INTO tok1 FROM hermes.chat_tomar(1) t;

  -- Vencido, pero nadie se lo ha quitado: sigue siendo suyo.
  UPDATE public.hermes_chat SET lease_until = now() - interval '2 minutes' WHERE id = m1;

  r := hermes.chat_renovar(m1, tok1);
  v_obt := 'renovado=' || COALESCE(r ->> 'renovado', '?')
           || ' | restan ' || COALESCE(r ->> 'restan_segundos', '-') || 's';
  v_ok := ('renovado=true | restan 300s' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 23 · ' || 'chat_renovar estira el arrendamiento vencido de su dueño'
    || chr(10) || '         esperaba: ' || 'renovado=true | restan 300s'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- Y renovado, la cola ya no se lo quita
  SELECT count(*)::int INTO n FROM hermes.chat_tomar(1);
  v_obt := n::text;
  v_ok := ('0' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 23 · ' || 'Renovado a tiempo, chat_tomar ya no lo rescata'
    || chr(10) || '         esperaba: ' || '0'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- Renovar con un token que no es el suyo
  r := hermes.chat_renovar(m1, gen_random_uuid());
  v_obt := 'renovado=' || COALESCE(r ->> 'renovado', '?')
           || ' | motivo=' || COALESCE(r ->> 'motivo', '(ninguno)')
           || ' | abandonar=' || COALESCE(r ->> 'abandonar', '(no dice)');
  v_ok := ('renovado=false | motivo=claim_reemplazado | abandonar=true' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 23 · ' || 'Renovar con un token ajeno se rechaza y manda abandonar'
    || chr(10) || '         esperaba: ' || 'renovado=false | motivo=claim_reemplazado | abandonar=true'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- Renovar algo ya terminado
  PERFORM hermes.chat_responder(m1, 'ya está', NULL, tok1);
  r := hermes.chat_renovar(m1, tok1);
  v_obt := 'motivo=' || COALESCE(r ->> 'motivo', '(ninguno)');
  v_ok := ('motivo=ya_respondido' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 23 · ' || 'Renovar un mensaje ya respondido dice por qué, sin reventar'
    || chr(10) || '         esperaba: ' || 'motivo=ya_respondido'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- ══════════════════════════════════════════════════════════════════
  -- 26 · Respuesta después del vencimiento, sin reemplazo
  -- ══════════════════════════════════════════════════════════════════
  -- Manda el token, no el reloj. Si nadie se lo quitó, la respuesta es la
  -- buena aunque llegue tarde: rechazarla dejaría al cliente sin nada
  -- para castigar a un worker por ser lento.
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado)
  VALUES (v_tenant, 'usuario', 'prueba 26 tardía con token', v_conv, 'pendiente')
  RETURNING id INTO m1;
  SELECT t.claim_token INTO tok1 FROM hermes.chat_tomar(1) t;
  UPDATE public.hermes_chat SET lease_until = now() - interval '10 minutes' WHERE id = m1;

  r := hermes.chat_responder(m1, 'tardé nueve minutos pero aquí está', NULL, tok1);
  SELECT count(*)::int INTO n FROM public.hermes_chat WHERE responde_a = m1;
  v_obt := 'ok=' || COALESCE(r ->> 'ok', '?')
           || ' | duplicado=' || COALESCE(r ->> 'duplicado', '?')
           || ' | lease_vencido=' || COALESCE(r ->> 'lease_vencido', '(no dice)')
           || ' | respuestas=' || n;
  v_ok := ('ok=true | duplicado=false | lease_vencido=true | respuestas=1' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 26 · ' || 'Respuesta vencida que nadie reemplazó: se acepta y se avisa'
    || chr(10) || '         esperaba: ' || 'ok=true | duplicado=false | lease_vencido=true | respuestas=1'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- ══════════════════════════════════════════════════════════════════
  -- 27 · Cortar el contexto
  -- ══════════════════════════════════════════════════════════════════
  UPDATE public.hermes_chat SET estado = 'respondido'
  WHERE rol = 'usuario' AND estado IN ('pendiente', 'procesando');

  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado, creado_en)
  VALUES (v_tenant, 'usuario', 'prueba 27 antes del corte A', v_conv3, 'pendiente',
          now() - interval '2 minutes')
  RETURNING id INTO mA;
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado, creado_en)
  VALUES (v_tenant, 'usuario', 'prueba 27 antes del corte B', v_conv3, 'pendiente',
          now() - interval '1 minute')
  RETURNING id INTO mB;

  -- Que el trigger los haya sellado en la época 1 sin que nadie se lo pida
  SELECT string_agg(DISTINCT context_epoch::text, ',') INTO v_txt
  FROM public.hermes_chat WHERE id IN (mA, mB);
  v_obt := COALESCE(v_txt, '(nulo)');
  v_ok := ('1' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 27 · ' || 'Un mensaje nuevo nace sellado en la época actual, sin pedirlo'
    || chr(10) || '         esperaba: ' || '1'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- Se toma A: el corte ocurre CON UN MENSAJE EN VUELO, que es como pasa
  -- de verdad —alguien pulsa "Nueva conversación" mientras Hermes piensa.
  SELECT t.id, t.claim_token INTO m1, tok1 FROM hermes.chat_tomar(1) t;

  r := hermes.chat_nuevo_contexto(v_conv3);
  v_obt := 'cortado=' || COALESCE(r ->> 'cortado', '?')
           || ' | epoca=' || COALESCE(r ->> 'epoca', '?')
           || ' | archivados=' || COALESCE(r ->> 'mensajes_archivados', '?');
  v_ok := ('cortado=true | epoca=2 | archivados=2' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 27 · ' || 'El corte avanza una época y archiva lo que había'
    || chr(10) || '         esperaba: ' || 'cortado=true | epoca=2 | archivados=2'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- El botón pulsado tres veces seguidas
  r := hermes.chat_nuevo_contexto(v_conv3);
  v_obt := 'cortado=' || COALESCE(r ->> 'cortado', '?')
           || ' | epoca=' || COALESCE(r ->> 'epoca', '?');
  v_ok := ('cortado=false | epoca=2' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 27 · ' || 'Cortar un contexto que ya está vacío no hace nada (idempotente)'
    || chr(10) || '         esperaba: ' || 'cortado=false | epoca=2'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  PERFORM hermes.chat_nuevo_contexto(v_conv3);
  PERFORM hermes.chat_nuevo_contexto(v_conv3);
  SELECT context_epoch INTO n FROM public.hermes_conversaciones
  WHERE tenant_id = v_tenant AND conversation_key = v_conv3;
  v_obt := n::text;
  v_ok := ('2' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 27 · ' || 'Cuatro cortes seguidos dejan UNA sola época nueva'
    || chr(10) || '         esperaba: ' || '2'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- ══════════════════════════════════════════════════════════════════
  -- 28 · La conversación no se parte
  -- ══════════════════════════════════════════════════════════════════
  -- El corte cambia la época, NUNCA la clave. Si cambiara la clave, el
  -- WhatsApp autorizado y la WebUI se quedarían hablando con otra
  -- conversación distinta sin que nadie se lo hubiera pedido.

  -- La respuesta al mensaje en vuelo se queda en la época de su pregunta
  PERFORM hermes.chat_responder(m1, 'contesto lo de antes del corte', NULL, tok1);
  SELECT context_epoch INTO n FROM public.hermes_chat WHERE responde_a = m1;
  v_obt := n::text;
  v_ok := ('1' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 28 · ' || 'La respuesta se queda en la época de su pregunta, no en la nueva'
    || chr(10) || '         esperaba: ' || '1'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- Y el primer mensaje de después del corte nace en la época nueva
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado)
  VALUES (v_tenant, 'usuario', 'prueba 28 después del corte', v_conv3, 'pendiente')
  RETURNING id INTO mC;
  SELECT context_epoch INTO n FROM public.hermes_chat WHERE id = mC;
  v_obt := n::text;
  v_ok := ('2' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 28 · ' || 'El primer mensaje tras el corte nace en la época nueva'
    || chr(10) || '         esperaba: ' || '2'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- La clave, intacta para todos: los de antes, la respuesta y el de después
  SELECT count(DISTINCT conversation_key)::int || ' clave | ' || count(*)::int || ' mensajes'
  INTO v_obt
  FROM public.hermes_chat
  WHERE tenant_id = v_tenant AND conversation_key = v_conv3;
  v_ok := ('1 clave | 4 mensajes' IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 28 · ' || 'Antes y después del corte, una sola conversation_key'
    || chr(10) || '         esperaba: ' || '1 clave | 4 mensajes'
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- Y nadie tocó la conversación de verdad
  SELECT context_epoch INTO n FROM public.hermes_conversaciones
  WHERE tenant_id = v_tenant AND conversation_key = v_conv;
  v_obt := COALESCE(n::text, '(sin fila)');
  v_ok := (COALESCE(v_epoca_real::text, '(sin fila)') IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan + 1; ELSE v_fallan := v_fallan + 1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END
    || ' 28 · ' || 'Cortar una conversación no toca la época de las demás'
    || chr(10) || '         esperaba: ' || COALESCE(v_epoca_real::text, '(sin fila)')
    || chr(10) || '         obtuvo  : ' || COALESCE(v_obt, '(nulo)'));

  -- ── EL INFORME ─────────────────────────────────────
  -- Va como excepción a propósito. No es que algo haya salido mal: es la
  -- única forma de estar seguro de que nada de lo de arriba se guarda.
  RAISE EXCEPTION '%',
    chr(10) || chr(10)
    || '══════ PRUEBAS DEL CONTRATO v4 ══════' || chr(10)
    || '  fencing (22-26) y corte de contexto (27-28)' || chr(10) || chr(10)
    || array_to_string(v_lineas, chr(10)) || chr(10) || chr(10)
    || '  ' || CASE WHEN v_fallan = 0 THEN 'TODO EN VERDE' ELSE 'HAY FALLOS' END
    || '  ·  pasan ' || v_pasan || ', fallan ' || v_fallan || chr(10) || chr(10)
    || '  (nada de esto se guardó: esta excepción lo deshace todo)' || chr(10)
    || '  (faltan las de v3: hermes_canal_v3_pruebas.sql, 21 en verde)' || chr(10);
END $PRUEBAS$;
