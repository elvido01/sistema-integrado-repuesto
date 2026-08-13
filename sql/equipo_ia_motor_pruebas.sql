-- =====================================================================
-- Pruebas del motor desde la pantalla
-- ---------------------------------------------------------------------
-- UNA SOLA SENTENCIA, Y NO DEJA NADA. NI UNA FILA.
--
-- Igual que las del Equipo IA y las del canal v4: todo dentro de un DO que
-- termina lanzando una excepción con el informe dentro. El editor de
-- Supabase ejecuta cada sentencia por separado, así que un BEGIN…ROLLBACK
-- escrito a mano no agruparía nada. Una excepción sí.
--
-- >>> EL INFORME SALE COMO UN ERROR ROJO. ES EL RESULTADO. <<<
--
-- >>> POR QUÉ AQUÍ SÍ HAY QUE SUPLANTAR A UN USUARIO <<<
-- Las pruebas anteriores solo tocaban funciones de `hermes`, que no miran
-- quién llama. equipo_motor() sí: es una puerta de la pantalla y lo primero
-- que hace es comprobar el correo. En el editor de SQL no hay sesión, así
-- que se arma una con set_config — local a la transacción, y la
-- transacción se deshace entera al final.
--
-- Requiere sql/equipo_ia_motor_pantalla.sql.
-- =====================================================================

DO $PRUEBAS$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid    uuid;
  v_mail   text;
  r json; n int;
  v_lineas text[] := ARRAY[]::text[];
  v_obt text; v_esp text; v_ok boolean;
  v_pasan int := 0; v_fallan int := 0;
BEGIN
  IF to_regprocedure('public.equipo_motor(text,text,text,numeric,integer)') IS NULL THEN
    RAISE EXCEPTION 'Falta aplicar sql/equipo_ia_motor_pantalla.sql';
  END IF;

  -- ── LA SESIÓN DE MENTIRA ──────────────────────────────────────────
  -- Uno de los dos correos autorizados, y que su perfil sea el de Morla:
  -- si no, get_user_tenant() devolvería otra empresa y los agentes no
  -- estarían ahí.
  SELECT u.id, u.email INTO v_uid, v_mail
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE lower(u.email) IN ('elvidocaminero@gmail.com', 'admin@repuestosmorla.com')
    AND p.tenant_id = v_tenant
  ORDER BY (lower(u.email) = 'admin@repuestosmorla.com') DESC
  LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No hay ninguno de los dos correos autorizados con perfil en Morla. Sin eso no se puede probar la puerta.';
  END IF;

  -- get_user_tenant() prefiere la empresa activa de la extensión. Se quita
  -- para que la prueba no dependa de en qué empresa quedó el navegador.
  -- Se deshace con todo lo demás.
  IF to_regclass('public.usuario_tenant_activo') IS NOT NULL THEN
    DELETE FROM public.usuario_tenant_activo WHERE user_id = v_uid;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'email', v_mail, 'role', 'authenticated')::text, true);

  IF public.get_user_tenant() IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'La sesión de prueba resolvió la empresa % y se esperaba Morla.', public.get_user_tenant();
  END IF;

  -- Estado de partida conocido: sin cambio anterior que deshacer.
  UPDATE public.equipo_agentes SET motor_anterior = NULL, motor_email = NULL, motor_en = NULL
  WHERE tenant_id = v_tenant;

  -- ══ 1 · EL PANEL TRAE EL MOTOR DE CADA AGENTE ═════════════════════
  r := public.equipo_panel(5);
  -- jsonb y no json: el operador `?` ("tiene esta clave") solo existe para
  -- jsonb.
  SELECT count(*)::int INTO n
  FROM jsonb_array_elements((r -> 'agentes')::jsonb) a
  WHERE a ? 'proveedor' AND a ? 'modelo' AND a ? 'ejecuta_en';
  v_obt := n::text;
  v_esp := '3';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  1 · Los tres agentes llegan con su motor'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 2 · EL CATÁLOGO VIAJA CON EL PANEL ════════════════════════════
  -- Si no viniera aquí, abrir el desplegable costaría una segunda llamada.
  v_obt := (json_array_length(r -> 'modelos') > 0)::text;
  v_esp := 'true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  2 · El catalogo de modelos viene en el mismo panel'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 3 · SIN EL CORREO AUTORIZADO, NO SE CAMBIA NADA ═══════════════
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    PERFORM public.equipo_motor('jarvis', 'openai', 'gpt-4o-mini');
    v_obt := 'lo dejo pasar';
  EXCEPTION WHEN OTHERS THEN v_obt := 'rechazado';
  END;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'email', v_mail, 'role', 'authenticated')::text, true);
  v_esp := 'rechazado';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  3 · Sin correo autorizado no se le cambia el motor a nadie'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 4 · LA SUSCRIPCIÓN SE VA SOLA A "MÁQUINA PROPIA" ══════════════
  -- Y borra el modelo aunque se mande uno: con Claude Code lo decide la
  -- sesión, y guardar aquí un nombre que nadie lee es guardar una mentira.
  r := public.equipo_motor('comercial_creativo', 'claude_suscripcion', 'claude-opus-5');
  v_obt := (r ->> 'ejecuta_en') || '/' || COALESCE(r ->> 'modelo', '(nulo)') || '/' || (r ->> 'necesita_worker');
  v_esp := 'maquina_propia/(nulo)/true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  4 · Suscripcion => maquina propia, sin modelo, avisa del worker'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 5 · SE GUARDÓ DE VERDAD, NO SOLO EN LA RESPUESTA ══════════════
  SELECT proveedor || '/' || COALESCE(modelo,'(nulo)') || '/' || ejecuta_en INTO v_obt
  FROM public.equipo_agentes WHERE tenant_id = v_tenant AND clave = 'comercial_creativo';
  v_esp := 'claude_suscripcion/(nulo)/maquina_propia';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  5 · Quedo escrito en la tabla, no solo en el json'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 6 · QUIÉN LO CAMBIÓ Y CUÁNDO ══════════════════════════════════
  SELECT (motor_email = v_mail)::text || '/' || (motor_en IS NOT NULL)::text
      || '/' || (motor_por = v_uid)::text INTO v_obt
  FROM public.equipo_agentes WHERE tenant_id = v_tenant AND clave = 'comercial_creativo';
  v_esp := 'true/true/true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  6 · Queda el correo, la hora y el usuario del que lo cambio'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 7 · UNA CLAVE DE API SE VA A LA NUBE ══════════════════════════
  r := public.equipo_motor('comercial_creativo', 'claude', 'claude-sonnet-5', 0.6, 900);
  v_obt := (r ->> 'ejecuta_en') || '/' || (r ->> 'modelo') || '/' || (r ->> 'necesita_worker');
  v_esp := 'nube/claude-sonnet-5/false';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  7 · Clave de API => nube, con su modelo'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 8 · UN MODELO DEL CATÁLOGO NO SE AVISA ════════════════════════
  v_obt := COALESCE(r ->> 'aviso', '(sin aviso)');
  v_esp := '(sin aviso)';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  8 · Un modelo conocido pasa callado'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 9 · UNO QUE NO ESTÁ EN EL CATÁLOGO SE ACEPTA PERO SE AVISA ════
  -- No se bloquea porque puede ser un modelo recién salido. Pero un dedazo
  -- en el nombre no se ve hasta la primera pregunta, y ahí ya es tarde.
  r := public.equipo_motor('comercial_creativo', 'claude', 'claude-sonet-5');
  v_obt := (r ->> 'ok') || '/' || (r ->> 'aviso' IS NOT NULL)::text;
  v_esp := 'true/true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || '  9 · Un modelo fuera del catalogo se acepta, pero avisa'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 10 · DESHACER DEVUELVE AL MOTOR ANTERIOR ══════════════════════
  r := public.equipo_motor_deshacer('comercial_creativo');
  v_obt := (r ->> 'proveedor') || '/' || (r ->> 'modelo');
  v_esp := 'claude/claude-sonnet-5';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 10 · Deshacer vuelve a como estaba antes del ultimo cambio'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 11 · SIN CAMBIO PREVIO NO HAY NADA QUE DESHACER ═══════════════
  BEGIN
    PERFORM public.equipo_motor_deshacer('hermes');   -- nunca se le toco
    v_obt := 'lo dejo pasar';
  EXCEPTION WHEN OTHERS THEN v_obt := 'rechazado';
  END;
  v_esp := 'rechazado';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 11 · Deshacer sin cambio anterior se rechaza con su motivo'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 12 · JARVIS EN SUSCRIPCIÓN: EL WIDGET SE DEGRADA Y SE DICE ════
  r := public.equipo_motor('jarvis', 'claude_suscripcion');
  v_obt := (r ->> 'widget_degradado');
  v_esp := 'true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 12 · Jarvis en suscripcion avisa que el boton flotante se degrada'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 13 · Y EL PANEL LO ENSEÑA, NO SOLO EL QUE GUARDÓ ══════════════
  -- El que abre la pantalla mañana tiene que verlo igual que el que lo
  -- cambió hoy.
  SELECT (a ->> 'proveedor') || '/' || (a ->> 'proveedor_widget') || '/' || (a ->> 'atiende_widget')
    INTO v_obt
  FROM json_array_elements(public.equipo_panel(5) -> 'agentes') a
  WHERE a ->> 'clave' = 'jarvis';
  v_esp := 'claude_suscripcion/openai/true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 13 · El panel dice con que motor se queda el boton flotante'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 14 · UN MOTOR QUE NO EXISTE NO SE GUARDA ══════════════════════
  BEGIN
    PERFORM public.equipo_motor('jarvis', 'gemini', 'gemini-pro');
    v_obt := 'lo dejo pasar';
  EXCEPTION WHEN OTHERS THEN v_obt := 'rechazado';
  END;
  v_esp := 'rechazado';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 14 · Un proveedor inventado se rechaza'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 15 · NO SE PUEDE CONFIGURAR UN CUARTO AGENTE ══════════════════
  BEGIN
    PERFORM public.equipo_motor('disenador', 'openai', 'gpt-4o-mini');
    v_obt := 'lo dejo pasar';
  EXCEPTION WHEN OTHERS THEN v_obt := 'rechazado';
  END;
  v_esp := 'rechazado';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 15 · Por aqui tampoco aparece un cuarto agente'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 16 · LOS LÍMITES DE TEMPERATURA Y LARGO ═══════════════════════
  BEGIN
    PERFORM public.equipo_motor('jarvis', 'openai', 'gpt-4o-mini', 1.8, 800);
    v_obt := 'temp:paso';
  EXCEPTION WHEN OTHERS THEN v_obt := 'temp:rechazada';
  END;
  BEGIN
    PERFORM public.equipo_motor('jarvis', 'openai', 'gpt-4o-mini', 0.2, 50000);
    v_obt := v_obt || '/largo:paso';
  EXCEPTION WHEN OTHERS THEN v_obt := v_obt || '/largo:rechazado';
  END;
  v_esp := 'temp:rechazada/largo:rechazado';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 16 · Temperatura y largo fuera de rango se rechazan'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 17 · NADIE ESCRIBE EL CATÁLOGO POR LA PUERTA DE ATRÁS ═════════
  -- Supabase concede ALL a las tablas nuevas de public. Si esto da algo
  -- distinto de 0, el REVOKE del archivo no corrió.
  SELECT count(*)::int INTO n
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'equipo_modelos'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
  v_obt := n::text;
  v_esp := '0';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 17 · anon y authenticated no pueden escribir el catalogo'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  -- ══ 18 · CAMBIAR EL MOTOR NO TOCA EL TRABAJO EN CURSO ═════════════
  -- Es configuración, no una acción sobre la cola. Si esto cambiara algo
  -- de equipo_mensajes, un cambio de modelo podría perder un trabajo.
  SELECT count(*)::int INTO n FROM public.equipo_mensajes WHERE tenant_id = v_tenant;
  PERFORM public.equipo_motor('jarvis', 'openai', 'gpt-4o-mini', 0.1, 800);
  v_obt := (n = (SELECT count(*)::int FROM public.equipo_mensajes WHERE tenant_id = v_tenant))::text;
  v_esp := 'true';
  v_ok := (v_esp IS NOT DISTINCT FROM v_obt);
  IF v_ok THEN v_pasan := v_pasan+1; ELSE v_fallan := v_fallan+1; END IF;
  v_lineas := v_lineas || (CASE WHEN v_ok THEN '  ok   ' ELSE '  FALLA' END || ' 18 · Cambiar el motor no mueve ni un mensaje de la cola'
    || chr(10) || '         esperaba: ' || v_esp || chr(10) || '         obtuvo  : ' || COALESCE(v_obt,'(nulo)'));

  RAISE EXCEPTION '%',
    chr(10) || chr(10)
    || '══════ PRUEBAS DEL MOTOR DESDE LA PANTALLA ══════' || chr(10) || chr(10)
    || '  sesion de prueba: ' || v_mail || chr(10) || chr(10)
    || array_to_string(v_lineas, chr(10)) || chr(10) || chr(10)
    || '  ' || CASE WHEN v_fallan = 0 THEN 'TODO EN VERDE' ELSE 'HAY FALLOS' END
    || '  ·  pasan ' || v_pasan || ', fallan ' || v_fallan || chr(10) || chr(10)
    || '  (nada de esto se guardo: esta excepcion lo deshace todo,' || chr(10)
    || '   incluidos los motores que las pruebas cambiaron)' || chr(10);
END $PRUEBAS$;
