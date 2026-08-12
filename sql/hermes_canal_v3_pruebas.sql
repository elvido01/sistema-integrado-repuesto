-- =====================================================================
-- Pruebas del contrato v3
-- ---------------------------------------------------------------------
-- CORRE SOBRE PRODUCCIÓN Y NO DEJA NADA. Todo va dentro de una
-- transacción que termina en ROLLBACK: se insertan mensajes de mentira,
-- se comprueba el comportamiento y se deshace entero. Ni una fila queda.
--
-- Requiere hermes_canal_v3.sql aplicado. Si no lo está, la primera prueba
-- falla diciendo qué falta.
--
-- >>> QUÉ NO SE PRUEBA AQUÍ Y POR QUÉ <<<
--
-- Nº 2 (dos workers a la vez) necesita DOS conexiones de verdad: dentro de
-- una sola transacción no hay concurrencia que probar. Va aparte, en
-- scripts/hermes-prueba-concurrencia.mjs.
--
-- Nº 15 a 20 son de Hermes: cruces entre WebUI, MotoFlow y WhatsApp, y
-- reinicio del gateway. MotoFlow solo ve su canal — afirmar que pasan
-- sería inventarme evidencia de algo que no puedo observar.
--
-- Lo que sí queda probado aquí: 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
-- 14 y 21.
-- =====================================================================

BEGIN;

CREATE TEMP TABLE resultados (
  n int, prueba text, esperado text, obtenido text, pasa boolean
) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.anotar(
  p_n int, p_prueba text, p_esperado text, p_obtenido text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO resultados VALUES (
    p_n, p_prueba, p_esperado, p_obtenido,
    p_esperado IS NOT DISTINCT FROM p_obtenido);
$$;

DO $$
DECLARE
  T   uuid := '00000000-0000-0000-0000-000000000001';
  OTRO uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';   -- MotoPréstamos
  CONV text := 'agent:main:morla:tenant:00000000-0000-0000-0000-000000000001';
  CONV2 text := 'agent:main:morla:PRUEBA-SEGUNDA-CONVERSACION';
  m1 bigint; m2 bigint; m3 bigint; mo bigint;
  r  json; n int; t text; b boolean;
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
  VALUES (T, 'usuario', 'prueba 1', CONV, 'pendiente') RETURNING id INTO m1;
  PERFORM hermes.chat_tomar(1);

  r := hermes.chat_responder(m1, 'primera respuesta');
  r := hermes.chat_responder(m1, 'segunda respuesta');

  SELECT count(*)::int INTO n FROM public.hermes_chat
  WHERE rol = 'hermes' AND responde_a = m1;
  PERFORM pg_temp.anotar(1, 'Responder dos veces deja una sola respuesta',
                         '1 respuesta | duplicado=true',
                         n || ' respuesta | duplicado=' || (r ->> 'duplicado'));

  -- ══════════════════════════════════════════════════════════════════
  -- 3 · Dos mensajes seguidos de la misma conversación → EN ORDEN
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado, creado_en)
  VALUES (T, 'usuario', 'prueba 3 primero', CONV, 'pendiente', now() - interval '2 min')
  RETURNING id INTO m1;
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado, creado_en)
  VALUES (T, 'usuario', 'prueba 3 segundo', CONV, 'pendiente', now() - interval '1 min')
  RETURNING id INTO m2;

  -- Se piden 5: aunque haya dos pendientes, solo puede salir el primero.
  SELECT count(*)::int INTO n FROM hermes.chat_tomar(5);
  SELECT texto INTO t FROM public.hermes_chat WHERE estado = 'procesando' LIMIT 1;
  PERFORM pg_temp.anotar(3, 'Una conversación entrega de a uno, el más viejo primero',
                         '1 | prueba 3 primero', n || ' | ' || COALESCE(t, '(ninguno)'));

  -- ══════════════════════════════════════════════════════════════════
  -- 4 · Dos conversaciones distintas → EN PARALELO
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado)
  VALUES (T, 'usuario', 'prueba 4 otra conversación', CONV2, 'pendiente')
  RETURNING id INTO m3;

  SELECT count(*)::int INTO n FROM hermes.chat_tomar(5);
  PERFORM pg_temp.anotar(4, 'Otra conversación avanza aunque la primera esté ocupada',
                         '1', n::text);

  -- Se cierran para no estorbar a las siguientes
  PERFORM hermes.chat_responder(m1, 'cerrando 3');
  PERFORM hermes.chat_responder(m3, 'cerrando 4');
  UPDATE public.hermes_chat SET estado = 'respondido' WHERE id = m2;

  -- ══════════════════════════════════════════════════════════════════
  -- 5 · Worker muerto → el arrendamiento de 5 min lo rescata
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat
    (tenant_id, rol, texto, conversation_key, estado, procesando_en, intentos)
  VALUES (T, 'usuario', 'prueba 5 abandonado', CONV, 'procesando',
          now() - interval '9 minutes', 1)
  RETURNING id INTO m1;

  SELECT count(*)::int INTO n FROM hermes.chat_tomar(1);
  SELECT intentos INTO b FROM (SELECT intentos = 2 AS intentos FROM public.hermes_chat WHERE id = m1) x;
  PERFORM pg_temp.anotar(5, 'Un mensaje abandonado hace 9 min vuelve a la cola',
                         '1 tomado | intentos=2',
                         n || ' tomado | intentos=' || (SELECT intentos FROM public.hermes_chat WHERE id = m1));

  -- Y que uno tomado hace 1 minuto NO se rescata (sigue vivo)
  UPDATE public.hermes_chat SET estado = 'procesando', procesando_en = now() WHERE id = m1;
  SELECT count(*)::int INTO n FROM hermes.chat_tomar(1);
  PERFORM pg_temp.anotar(5, 'Un mensaje tomado hace 1 min NO se le quita al worker vivo',
                         '0', n::text);
  UPDATE public.hermes_chat SET estado = 'respondido' WHERE id = m1;

  -- ══════════════════════════════════════════════════════════════════
  -- 6 · Tres errores → sale de la cola
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado)
  VALUES (T, 'usuario', 'prueba 6 fallona', CONV, 'pendiente') RETURNING id INTO m1;

  PERFORM hermes.chat_tomar(1); PERFORM hermes.chat_error(m1, 'fallo 1');
  PERFORM hermes.chat_tomar(1); PERFORM hermes.chat_error(m1, 'fallo 2');
  PERFORM hermes.chat_tomar(1); PERFORM hermes.chat_error(m1, 'fallo 3');

  SELECT count(*)::int INTO n FROM hermes.chat_tomar(1);
  SELECT estado || ' | ' || intentos || ' | ' || COALESCE(ultimo_error, '(sin error)')
  INTO t FROM public.hermes_chat WHERE id = m1;
  PERFORM pg_temp.anotar(6, 'Tras 3 fallos sale de la cola y conserva el motivo',
                         '0 tomados | error | 3 | fallo 3', n || ' tomados | ' || t);

  -- ══════════════════════════════════════════════════════════════════
  -- 7 · Reconexión: lo tomado y no respondido se recupera
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat
    (tenant_id, rol, texto, conversation_key, estado, procesando_en, intentos)
  VALUES (T, 'usuario', 'prueba 7 reconexión', CONV, 'procesando',
          now() - interval '6 minutes', 1)
  RETURNING id INTO m1;
  SELECT count(*)::int INTO n FROM hermes.chat_tomar(1);
  r := hermes.chat_responder(m1, 'terminada tras reconectar');
  SELECT count(*)::int INTO n FROM public.hermes_chat WHERE rol = 'hermes' AND responde_a = m1;
  PERFORM pg_temp.anotar(7, 'Tras reconectar se termina el pendiente sin duplicar',
                         '1', n::text);

  -- ══════════════════════════════════════════════════════════════════
  -- 8 · Respuesta tardía: se acepta igual
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat
    (tenant_id, rol, texto, conversation_key, estado, procesando_en, creado_en)
  VALUES (T, 'usuario', 'prueba 8 tardía', CONV, 'procesando',
          now() - interval '3 minutes', now() - interval '3 minutes')
  RETURNING id INTO m1;
  r := hermes.chat_responder(m1, 'llegué tarde pero llegué');
  SELECT estado INTO t FROM public.hermes_chat WHERE id = m1;
  PERFORM pg_temp.anotar(8, 'Una respuesta de 3 minutos se acepta',
                         'respondido | duplicado=false',
                         t || ' | duplicado=' || (r ->> 'duplicado'));

  -- ══════════════════════════════════════════════════════════════════
  -- 9 · Acción sin confirmar nace como propuesta
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado)
  VALUES (T, 'usuario', 'prueba 9 cotización', CONV, 'pendiente') RETURNING id INTO m1;
  PERFORM hermes.chat_tomar(1);
  r := hermes.chat_responder(m1, 'te preparo la venta',
        jsonb_build_object('tipo', 'preparar_venta',
          'lineas', jsonb_build_array(jsonb_build_object('codigo', '52JK0442', 'cantidad', 1))));
  SELECT acciones ->> 'estado' INTO t FROM public.hermes_chat
  WHERE id = (r ->> 'respuesta_id')::bigint;
  PERFORM pg_temp.anotar(9, 'Una acción sin estado nace como propuesta, no ejecutada',
                         'propuesta', COALESCE(t, '(nulo)'));

  -- Y un código inventado rebota antes de llegar a la pantalla
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado)
  VALUES (T, 'usuario', 'prueba 9b código falso', CONV, 'pendiente') RETURNING id INTO m1;
  PERFORM hermes.chat_tomar(1);
  BEGIN
    PERFORM hermes.chat_responder(m1, 'venta con código inventado',
      jsonb_build_object('tipo', 'preparar_venta',
        'lineas', jsonb_build_array(jsonb_build_object('codigo', 'NO-EXISTE-XYZ', 'cantidad', 1))));
    t := 'no rebotó';
  EXCEPTION WHEN OTHERS THEN t := 'rebotó';
  END;
  PERFORM pg_temp.anotar(9, 'Un código que no existe rebota antes de llegar a la pantalla',
                         'rebotó', t);
  UPDATE public.hermes_chat SET estado = 'respondido' WHERE id = m1;

  -- ══════════════════════════════════════════════════════════════════
  -- 11 · Aislamiento entre tenants
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado)
  VALUES (OTRO, 'usuario', 'prueba 11 de otra empresa',
          'agent:main:tenant:tenant:' || OTRO::text, 'pendiente')
  RETURNING id INTO mo;

  SELECT count(*)::int INTO n FROM hermes.chat_tomar(5);
  PERFORM pg_temp.anotar(11, 'chat_tomar no ve mensajes de otro tenant', '0', n::text);

  BEGIN
    PERFORM hermes.chat_responder(mo, 'no debería poder');
    t := 'lo respondió';
  EXCEPTION WHEN OTHERS THEN t := 'lo rechazó';
  END;
  PERFORM pg_temp.anotar(11, 'chat_responder rechaza un mensaje de otro tenant',
                         'lo rechazó', t);

  SELECT count(*)::int INTO n FROM hermes.chat_pendientes(50)
  WHERE texto = 'prueba 11 de otra empresa';
  PERFORM pg_temp.anotar(11, 'chat_pendientes tampoco lo enseña', '0', n::text);

  -- ══════════════════════════════════════════════════════════════════
  -- 10 · El estado no retrocede desde respondido
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado)
  VALUES (T, 'usuario', 'prueba 10 terminal', CONV, 'pendiente') RETURNING id INTO m1;
  PERFORM hermes.chat_tomar(1);
  PERFORM hermes.chat_responder(m1, 'terminado');
  r := hermes.chat_error(m1, 'intento de marcar error después de responder');
  SELECT estado INTO t FROM public.hermes_chat WHERE id = m1;
  PERFORM pg_temp.anotar(10, 'Respondido es terminal: un error posterior no lo mueve',
                         'respondido | cambiado=false',
                         t || ' | cambiado=' || (r ->> 'cambiado'));

  -- ══════════════════════════════════════════════════════════════════
  -- 12 · respondido y estado nunca se separan
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado)
  VALUES (T, 'usuario', 'prueba 12 sincronía', CONV, 'pendiente') RETURNING id INTO m1;
  -- Código VIEJO: escribe respondido a pelo, sin saber que existe estado
  UPDATE public.hermes_chat SET respondido = true WHERE id = m1;
  SELECT estado INTO t FROM public.hermes_chat WHERE id = m1;
  PERFORM pg_temp.anotar(12, 'Código viejo que escribe respondido mueve el estado',
                         'respondido', t);

  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado)
  VALUES (T, 'usuario', 'prueba 12b sincronía', CONV, 'pendiente') RETURNING id INTO m1;
  UPDATE public.hermes_chat SET estado = 'respondido' WHERE id = m1;
  SELECT respondido::text INTO t FROM public.hermes_chat WHERE id = m1;
  PERFORM pg_temp.anotar(12, 'Y al revés: mover el estado mueve respondido',
                         'true', t);

  -- ══════════════════════════════════════════════════════════════════
  -- 13 · chat_estado solo toca el detalle
  -- ══════════════════════════════════════════════════════════════════
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado)
  VALUES (T, 'usuario', 'prueba 13 detalle', CONV, 'pendiente') RETURNING id INTO m1;
  PERFORM hermes.chat_tomar(1);
  r := hermes.chat_estado(m1, 'consultando el catálogo');
  SELECT estado || ' | ' || COALESCE(estado_detalle, '(vacío)')
  INTO t FROM public.hermes_chat WHERE id = m1;
  PERFORM pg_temp.anotar(13, 'chat_estado cambia el detalle sin mover el estado',
                         'procesando | consultando el catálogo', t);

  -- Avisar de algo ya terminado no revienta
  PERFORM hermes.chat_responder(m1, 'ya está');
  r := hermes.chat_estado(m1, 'sigo trabajando');
  PERFORM pg_temp.anotar(13, 'Avisar del detalle tras responder no lanza excepción',
                         'cambiado=false', 'cambiado=' || (r ->> 'cambiado'));

  -- ══════════════════════════════════════════════════════════════════
  -- 14 · Un mensaje perdido se recoge al arrancar
  -- ══════════════════════════════════════════════════════════════════
  -- Simula el NOTIFY perdido: la fila existe y nadie la tomó.
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, conversation_key, estado, creado_en)
  VALUES (T, 'usuario', 'prueba 14 aviso perdido', CONV, 'pendiente', now() - interval '1 hour')
  RETURNING id INTO m1;
  SELECT count(*)::int INTO n FROM hermes.chat_tomar(1);
  PERFORM pg_temp.anotar(14, 'Un mensaje de hace una hora sin aviso se recoge igual',
                         '1', n::text);
  PERFORM hermes.chat_responder(m1, 'recogido al arrancar');

  -- ══════════════════════════════════════════════════════════════════
  -- 21 · El CRM de clientes no roza la conversación del agente
  -- ══════════════════════════════════════════════════════════════════
  SELECT count(*)::int INTO n
  FROM public.sales_messages sm
  WHERE sm.tenant_id = T
    AND EXISTS (SELECT 1 FROM public.hermes_chat hc
                WHERE hc.texto = sm.message_text AND hc.rol = 'usuario');
  PERFORM pg_temp.anotar(21, 'Ningún mensaje del CRM de clientes entró en hermes_chat',
                         '0', n::text);
END $$;

-- ------------------------------------------------------------
-- EL RESULTADO
-- ------------------------------------------------------------
SELECT
  n AS "nº",
  CASE WHEN pasa THEN '✓ PASA' ELSE '✗ FALLA' END AS resultado,
  prueba,
  esperado,
  obtenido
FROM resultados
ORDER BY pasa, n;

SELECT
  count(*) FILTER (WHERE pasa)        AS pasan,
  count(*) FILTER (WHERE NOT pasa)    AS fallan,
  count(*)                            AS total,
  CASE WHEN count(*) FILTER (WHERE NOT pasa) = 0
       THEN 'TODO EN VERDE'
       ELSE 'HAY FALLOS — mirar arriba, salen primero' END AS veredicto
FROM resultados;

-- Nada de esto queda. Ni una fila.
ROLLBACK;
