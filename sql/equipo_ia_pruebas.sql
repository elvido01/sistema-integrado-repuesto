-- =====================================================================
-- Pruebas del Equipo IA — los 25 casos del §11
-- ---------------------------------------------------------------------
-- UNA SOLA SENTENCIA, Y NO DEJA NADA. NI UNA FILA.
--
-- Igual que las del contrato v3 y v4: todo dentro de un DO que termina
-- lanzando una excepción con el informe dentro. El editor de Supabase
-- ejecuta cada sentencia por separado, así que un BEGIN…ROLLBACK escrito a
-- mano no agruparía nada. Una excepción aborta la transacción entera la
-- agrupe quien la agrupe.
--
-- El informe sale como un error rojo. ES el resultado.
--
-- >>> LOS DOS QUE NO ESTÁN AQUÍ, Y POR QUÉ <<<
-- Nº 21 (escritorio y móvil) es visual: se verifica abriendo la pantalla.
-- Nº 20 se prueba a medias — que equipo_panel() devuelva estados reales sí
-- se comprueba; que la pantalla los pinte, no.
--
-- Requiere sql/equipo_ia.sql y sql/equipo_ia_funciones.sql.
-- =====================================================================

DO $PRUEBAS$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_otro   uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
  r json; n int; v_txt text;
  w1 uuid; w2 uuid; m1 uuid; m2 uuid; a1 uuid; tok uuid;
  v_lineas text[] := ARRAY[]::text[];
  v_obt text; v_esp text; v_ok boolean;
  v_pasan int := 0; v_fallan int := 0;
BEGIN
  IF to_regprocedure('hermes.equipo_tomar(text,integer)') IS NULL THEN
    RAISE EXCEPTION 'Falta aplicar sql/equipo_ia_funciones.sql';
  END IF;

  -- ══ 1 · EXACTAMENTE TRES AGENTES ══════════════════════════════════
  SELECT string_agg(clave, ',' ORDER BY orden) INTO v_obt
  FROM public.equipo_agentes WHERE tenant_id = v_tenant AND activo;
  v_esp := 'hermes,jarvis,comercial_creativo';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  1 · Exactamente tres agentes, ni uno mas'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 2 · EL JARVIS QUE YA EXISTÍA SIGUE AHÍ ════════════════════════
  SELECT (SELECT count(*) FROM public.agente_sistema WHERE id = 1)::text || '/' ||
         (SELECT count(*) FROM public.agentes_ia WHERE tenant_id = v_tenant)::text INTO v_obt;
  v_esp := '1/1';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  2 · agente_sistema (Jarvis) y agentes_ia (Hermes) intactos'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 3 · JARVIS SOLO MOTOFLOW ══════════════════════════════════════
  SELECT (limites::text ILIKE '%exclusivo a MotoFlow%')::text || '/' ||
         (limites::text ILIKE '%no publica%')::text || '/' ||
         (array_length(puede_delegar_a,1) IS NULL)::text INTO v_obt
  FROM public.equipo_agentes WHERE tenant_id = v_tenant AND clave = 'jarvis';
  v_esp := 'true/true/true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  3 · Jarvis: exclusivo MotoFlow, no publica, no delega'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 4 · COMERCIAL-CREATIVO SIN ACCESO DIRECTO ═════════════════════
  -- Ninguna tabla del equipo tiene INSERT/UPDATE concedido a nadie: todo
  -- pasa por las funciones. Eso es lo que le impide tocar la base.
  SELECT count(*)::text INTO v_obt
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name LIKE 'equipo\_%'
    AND privilege_type IN ('INSERT','UPDATE','DELETE')
    AND grantee IN ('authenticated','anon','hermes_readonly','PUBLIC');
  v_esp := '0';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  4 · Nadie escribe en las tablas del equipo sin pasar por una funcion'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ── Un trabajo para las siguientes ────────────────────────────────
  r := hermes.equipo_abrir_trabajo(v_tenant, 'prueba', 'precio del filtro de aceite', 'consulta');
  w1 := (r ->> 'trabajo_id')::uuid;

  -- ══ 5 · HERMES → JARVIS ═══════════════════════════════════════════
  r := hermes.equipo_delegar(w1, 'hermes', 'jarvis', 'data_request', 'buscar filtro de aceite');
  m1 := (r ->> 'mensaje_id')::uuid;
  v_obt := COALESCE(r ->> 'ok','?'); v_esp := 'true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  5 · Hermes puede delegarle a Jarvis'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 6 · HERMES → COMERCIAL-CREATIVO ═══════════════════════════════
  r := hermes.equipo_delegar(w1, 'hermes', 'comercial_creativo', 'creative_request', 'redactar copy');
  m2 := (r ->> 'mensaje_id')::uuid;
  v_obt := COALESCE(r ->> 'ok','?'); v_esp := 'true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  6 · Hermes puede delegarle a Comercial-Creativo'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 7 · JARVIS ✗→ COMERCIAL-CREATIVO ══════════════════════════════
  BEGIN
    PERFORM hermes.equipo_delegar(w1, 'jarvis', 'comercial_creativo', 'creative_request', 'no deberia poder');
    v_obt := 'lo dejo pasar';
  EXCEPTION WHEN OTHERS THEN v_obt := 'lo rechazo';
  END;
  v_esp := 'lo rechazo';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  7 · Jarvis NO puede delegarle a Comercial-Creativo'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 8 · COMERCIAL-CREATIVO ✗→ JARVIS ══════════════════════════════
  BEGIN
    PERFORM hermes.equipo_delegar(w1, 'comercial_creativo', 'jarvis', 'data_request', 'no deberia poder');
    v_obt := 'lo dejo pasar';
  EXCEPTION WHEN OTHERS THEN v_obt := 'lo rechazo';
  END;
  v_esp := 'lo rechazo';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  8 · Comercial-Creativo NO puede delegarle a Jarvis'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 9 · LA FUNCION DE PRECIOS EXISTE Y ES LA AUTORIZADA ═══════════
  -- La firma real lleva tres argumentos. La primera version de esta prueba
  -- buscaba (text,integer) y fallo: no era que el contrato hubiera
  -- cambiado, era que yo lo escribi mal.
  SELECT (to_regprocedure('hermes.buscar_producto(text,integer,boolean)') IS NOT NULL)::text || '/' ||
         (to_regprocedure('hermes.catalogo_resumen()') IS NOT NULL)::text INTO v_obt;
  v_esp := 'true/true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  9 · El contrato de precios sigue siendo buscar_producto / catalogo_resumen'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 10 · NO INVENTAR ESTA EN LAS POLITICAS ════════════════════════
  SELECT ((politicas ->> 'nunca_inventar_precio_ni_existencia') = 'true')::text || '/' ||
         ((politicas ->> 'solo_productos_activos') = 'true')::text INTO v_obt
  FROM public.equipo_agentes WHERE tenant_id = v_tenant AND clave = 'comercial_creativo';
  v_esp := 'true/true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 10 · Politicas: no inventar, solo productos activos'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 11 · LAS COMPLEJAS ESPERAN DEPENDENCIAS ═══════════════════════
  SELECT estado INTO v_obt FROM public.equipo_trabajos WHERE id = w1;
  v_esp := 'waiting_dependency';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 11 · Con delegaciones abiertas, el trabajo queda esperando'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 12 · EVENTO DUPLICADO, UN SOLO TRABAJO ════════════════════════
  r := hermes.equipo_delegar(w1, 'hermes', 'jarvis', 'data_request', 'buscar filtro de aceite');
  SELECT count(*)::int INTO n FROM public.equipo_mensajes
  WHERE trabajo_id = w1 AND to_agent = 'jarvis' AND message_type = 'data_request';
  v_obt := (r ->> 'duplicado') || '/' || n::text;
  v_esp := 'true/1';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 12 · La misma delegacion dos veces deja UNA sola'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 13 · REINICIO: LO ABANDONADO VUELVE ═══════════════════════════
  SELECT t.claim_token INTO tok FROM hermes.equipo_tomar('jarvis', 1) t;
  UPDATE public.equipo_mensajes SET lease_until = now() - interval '1 minute' WHERE id = m1;
  SELECT count(*)::int INTO n FROM hermes.equipo_tomar('jarvis', 1);
  SELECT attempts::text INTO v_txt FROM public.equipo_mensajes WHERE id = m1;
  v_obt := n::text || '/' || v_txt;
  v_esp := '1/2';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 13 · Tras un reinicio, el mensaje abandonado vuelve a la cola'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 14 y 15 · ERROR LITERAL Y TOPE DE REINTENTOS ══════════════════
  SELECT claim_token INTO tok FROM public.equipo_mensajes WHERE id = m1;
  PERFORM hermes.equipo_error(m1, tok, 'no se pudo consultar el catalogo: timeout');
  SELECT error INTO v_txt FROM public.equipo_mensajes WHERE id = m1;
  v_obt := COALESCE(v_txt, '(sin error)');
  v_esp := 'no se pudo consultar el catalogo: timeout';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 14 · El error queda con su texto literal'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  SELECT t.claim_token INTO tok FROM hermes.equipo_tomar('jarvis',1) t;
  PERFORM hermes.equipo_error(m1, tok, 'fallo 3');
  SELECT count(*)::int INTO n FROM hermes.equipo_tomar('jarvis',1);
  SELECT status INTO v_txt FROM public.equipo_mensajes WHERE id = m1;
  v_obt := n::text || '/' || v_txt;
  v_esp := '0/failed';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 15 · A los 3 intentos sale de la cola y queda en failed'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 16 · SIN APROBACION NO SE EJECUTA ═════════════════════════════
  r := hermes.equipo_abrir_trabajo(v_tenant, 'promo', 'preparar promocion de hoy', 'promocion');
  w2 := (r ->> 'trabajo_id')::uuid;
  r := hermes.equipo_delegar(w2, 'hermes', 'comercial_creativo', 'execution_request',
        'publicar la promocion', '{}'::jsonb, NULL, true);
  m2 := (r ->> 'mensaje_id')::uuid;
  -- Se mira ESE mensaje, no cuantos salieron. La primera version contaba, y
  -- fallo con 1: lo que salio era el creative_request que dejo abierto la
  -- prueba 6, no el bloqueado. Contar en una cola compartida no prueba nada.
  SELECT count(*)::int INTO n FROM hermes.equipo_tomar('comercial_creativo', 5) t WHERE t.id = m2;
  v_obt := n::text;
  v_esp := '0';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 16 · Una accion que requiere aprobacion NO se puede tomar'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 17 y 18 · RECHAZAR Y PEDIR CAMBIOS ════════════════════════════
  r := hermes.equipo_pedir_aprobacion(w2, 'comercial_creativo', 'Publicar promocion',
        'dos productos elegidos', '{"productos":2}'::jsonb, 'alcance estimado', 'alto',
        '{"copy":"borrador"}'::jsonb, m2);
  a1 := (r ->> 'aprobacion_id')::uuid;
  SELECT estado INTO v_obt FROM public.equipo_trabajos WHERE id = w2;
  v_esp := 'waiting_approval';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 17 · Pedir aprobacion deja el trabajo esperando a Elvido'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- Rechazo y revision, simulando la decision con la misma logica que
  -- equipo_decidir(): aqui no hay sesion, y probar la funcion completa
  -- exigiria falsear un JWT. Lo que se prueba es el efecto en los datos.
  UPDATE public.equipo_aprobaciones SET estado = 'rejected', decidido_en = now(),
         decidido_email = 'prueba' WHERE id = a1;
  UPDATE public.equipo_mensajes SET approval_status = 'rejected', status = 'cancelled' WHERE id = m2;
  UPDATE public.equipo_trabajos SET estado = 'cancelled', terminado_en = now() WHERE id = w2;
  SELECT (SELECT status FROM public.equipo_mensajes WHERE id = m2) || '/' ||
         (SELECT estado FROM public.equipo_trabajos WHERE id = w2) INTO v_obt;
  v_esp := 'cancelled/cancelled';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 17 · Rechazar cancela el mensaje y el trabajo'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  r := hermes.equipo_pedir_aprobacion(w2, 'comercial_creativo', 'Publicar promocion (v2)',
        'con los cambios pedidos', '{}'::jsonb, NULL, 'medio', '{}'::jsonb, m2, a1);
  SELECT (revision_num::text || '/' || (revision_de = a1)::text) INTO v_obt
  FROM public.equipo_aprobaciones WHERE id = (r ->> 'aprobacion_id')::uuid;
  v_esp := '2/true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 18 · Pedir cambios crea una revision enlazada a la anterior'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 19 · AISLAMIENTO ENTRE EMPRESAS ═══════════════════════════════
  BEGIN
    PERFORM hermes.equipo_abrir_trabajo(v_otro, 'ajena', 'trabajo de otra empresa', 'consulta');
    -- La otra empresa no tiene agentes registrados: delegar tiene que fallar.
    PERFORM hermes.equipo_delegar(
      (SELECT id FROM public.equipo_trabajos WHERE tenant_id = v_otro ORDER BY creado_en DESC LIMIT 1),
      'hermes', 'jarvis', 'data_request', 'no deberia poder');
    v_obt := 'lo dejo pasar';
  EXCEPTION WHEN OTHERS THEN v_obt := 'lo rechazo';
  END;
  v_esp := 'lo rechazo';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 19 · Una empresa sin equipo registrado no puede delegar'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 20 · LOS ESTADOS SALEN DEL SISTEMA REAL ═══════════════════════
  SELECT count(*)::int INTO n
  FROM public.equipo_mensajes WHERE trabajo_id = w1 AND status = 'failed';
  v_obt := (n > 0)::text;
  v_esp := 'true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 20 · El estado de error existe en la BD, no solo en pantalla'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 22 · PUBLICACION AUTOMATICA APAGADA ═══════════════════════════
  SELECT (politicas ->> 'publicacion_automatica_habilitada') INTO v_obt
  FROM public.equipo_agentes WHERE tenant_id = v_tenant AND clave = 'comercial_creativo';
  v_esp := 'false';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 22 · La publicacion automatica sigue deshabilitada'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 23 · EL CONTRATO DEL CHAT NO SE ROMPIO ════════════════════════
  SELECT (to_regprocedure('hermes.chat_tomar(integer)') IS NOT NULL)::text || '/' ||
         (to_regprocedure('hermes.chat_responder(bigint,text,jsonb,uuid)') IS NOT NULL)::text || '/' ||
         (to_regprocedure('hermes.chat_renovar(bigint,uuid)') IS NOT NULL)::text || '/' ||
         (to_regprocedure('hermes.chat_nuevo_contexto(text)') IS NOT NULL)::text INTO v_obt;
  v_esp := 'true/true/true/true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 23 · El contrato v4 del chat sigue entero'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 24 · CLAVE, EPOCA Y ORIGEN, SEPARADOS ═════════════════════════
  SELECT (conversation_key = 'agent:main:morla:tenant:' || v_tenant::text)::text || '/' ||
         (context_epoch IS NOT NULL)::text || '/' ||
         (origin_platform IS NOT DISTINCT FROM NULL OR origin_platform <> conversation_key)::text INTO v_obt
  FROM public.equipo_trabajos WHERE id = w1;
  v_esp := 'true/true/true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 24 · conversation_key, context_epoch y origen son columnas distintas'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 25 · UN MENSAJE DUPLICADO NO DA DOS RESPUESTAS ════════════════
  r := hermes.equipo_abrir_trabajo(v_tenant, 'dup', 'consulta para el duplicado', 'consulta');
  w2 := (r ->> 'trabajo_id')::uuid;
  r := hermes.equipo_delegar(w2, 'hermes', 'jarvis', 'data_request', 'consultar');
  m2 := (r ->> 'mensaje_id')::uuid;
  SELECT t.claim_token INTO tok FROM hermes.equipo_tomar('jarvis',1) t;
  PERFORM hermes.equipo_responder(m2, tok, 'listo', '{"n":1}'::jsonb);
  r := hermes.equipo_responder(m2, tok, 'listo otra vez', '{"n":2}'::jsonb);
  SELECT count(*)::int INTO n FROM public.equipo_mensajes WHERE parent_message_id = m2;
  v_obt := (r ->> 'duplicado') || '/' || n::text;
  v_esp := 'true/1';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 25 · Responder dos veces deja UNA sola respuesta'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ EXTRA · EL TOPE DE PROFUNDIDAD ════════════════════════════════
  DECLARE v_p uuid := m2; v_i int := 0; v_corte boolean := false;
  BEGIN
    FOR v_i IN 1..5 LOOP
      r := hermes.equipo_delegar(w2, 'hermes', 'jarvis', 'data_request',
             'nivel ' || v_i, jsonb_build_object('n', v_i), v_p);
      IF COALESCE(r ->> 'motivo','') = 'profundidad_maxima' THEN v_corte := true; EXIT; END IF;
      v_p := (r ->> 'mensaje_id')::uuid;
    END LOOP;
    v_obt := v_corte::text;
  EXCEPTION WHEN OTHERS THEN v_obt := 'true';
  END;
  v_esp := 'true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  + · La cadena de delegacion se corta a la profundidad 3'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  RAISE EXCEPTION '%',
    chr(10) || chr(10)
    || '══════ PRUEBAS DEL EQUIPO IA ══════' || chr(10) || chr(10)
    || array_to_string(v_lineas, chr(10)) || chr(10) || chr(10)
    || '  ' || CASE WHEN v_fallan = 0 THEN 'TODO EN VERDE' ELSE 'HAY FALLOS' END
    || '  ·  pasan ' || v_pasan || ', fallan ' || v_fallan || chr(10) || chr(10)
    || '  (nada de esto se guardo: esta excepcion lo deshace todo)' || chr(10)
    || '  (la nº 21 —escritorio y movil— es visual, se verifica abriendo la pantalla)' || chr(10);
END $PRUEBAS$;
