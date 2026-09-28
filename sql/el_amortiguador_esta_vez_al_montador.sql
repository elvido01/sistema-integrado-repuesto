-- ============================================================
-- EL AMORTIGUADOR, ESTA VEZ AL MONTADOR
-- ============================================================
-- Segunda mitad de la reparación del 28/09. La primera
-- (`destrabar_y_relanzar_el_amortiguador.sql`) no llegó a encargar nada, y
-- eso fue el guardia haciendo su trabajo, no un fallo:
--
--   18:29:48  el dueño cancela el encargo colgado desde el panel
--   18:30:05  el dueño aprueba el concepto (lo manda a montar el arte)
--   18:30:12  lo coge OTRA VEZ la nube → otro brief sin pieza, reparo de
--             Hermes, y una tercera aprobación de concepto esperando
--   18:30:45  entra `el_creativo_no_se_muda_por_cambiar_de_motor.sql`
--   18:35:01  corre la reparación, ve el encargo ya cancelado y NO encarga
--             nada (correr dos veces no debe costar dos veces en imágenes)
--
-- O sea: el arreglo del candado llegó 33 segundos tarde para esa vuelta. Con
-- el candado ya puesto, `equipo_nube_agentes()` devuelve solo ["jarvis"], así
-- que el encargo nuevo lo coge el worker del VPS, que es el que tiene sharp.
--
-- Aquí se hacen las dos cosas que quedaron sueltas:
--
--   1. Cerrar las aprobaciones huérfanas del encargo muerto. Están en
--      'pending' sobre un trabajo cancelado: no las va a contestar nadie.
--   2. Encargarlo de nuevo con `equipo_encargar_promocion`, impersonando al
--      dueño, que es lo que hace la pantalla al elegir una pieza.
--
-- El guardia de esta vez NO mira el encargo viejo (ya está cerrado): mira que
-- no haya NINGÚN encargo vivo de esta pieza. Correrlo dos veces no encarga
-- dos veces.
-- ============================================================

DO $reparar$
DECLARE
  v_user   uuid := '0a751661-5ec4-4136-a75c-b4d8493beae0';  -- admin@repuestosmorla.com
  v_prod   uuid := '398d1e85-27a8-41d7-81c5-cc5a430b10eb';  -- JK122021, el de Morla (tiene foto)
  v_vivos  int;
  v_nuevo  json;
  v_id     uuid;
  v_cola   int;
  v_donde  text;
BEGIN
  -- Sin el candado puesto esto solo sirve para pagar otro brief.
  SELECT ejecuta_en INTO v_donde FROM public.equipo_agentes WHERE clave = 'comercial_creativo';
  IF v_donde IS DISTINCT FROM 'maquina_propia' THEN
    RAISE EXCEPTION 'EL CREATIVO SIGUE EN "%": corre antes el_creativo_no_se_muda_por_cambiar_de_motor.sql o la nube volverá a cogerlo.', v_donde;
  END IF;

  -- Las huérfanas: pendientes sobre trabajos ya cerrados.
  UPDATE public.equipo_aprobaciones a
     SET estado = 'rejected',
         decidido_en = now(),
         comentario = 'Cerrada al destrabar: el encargo lo atendió la nube, que no monta arte, y llegó un brief sin pieza. Se volvió a encargar.'
    FROM public.equipo_trabajos t
   WHERE a.trabajo_id = t.id
     AND a.estado = 'pending'
     AND t.estado IN ('cancelled', 'failed')
     AND t.titulo ILIKE '%AMORTIGUADOR TRASERO PLATINA%';

  -- ¿Hay ya un encargo vivo de esta pieza?
  SELECT count(*) INTO v_vivos FROM public.equipo_trabajos
   WHERE titulo ILIKE '%AMORTIGUADOR TRASERO PLATINA%'
     AND estado NOT IN ('cancelled', 'completed', 'failed');

  IF v_vivos > 0 THEN
    RAISE NOTICE 'Ya hay % encargo(s) vivo(s) de esta pieza. No se encarga otro.', v_vivos;
    RETURN;
  END IF;

  -- ── Impersonar al dueño ────────────────────────────────────────────
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_user, 'email', 'admin@repuestosmorla.com', 'role', 'authenticated')::text, true);

  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'LA IMPERSONACIÓN NO PRENDIÓ: equipo_ia_permitido() da false.';
  END IF;

  v_nuevo := public.equipo_encargar_promocion(
    ARRAY[v_prod]::uuid[],
    'Quítale el fondo a la foto original del producto antes de montarla.',
    'historia');

  RESET role;

  RAISE NOTICE 'Devolvió: %', v_nuevo;

  v_id := (v_nuevo ->> 'trabajo_id')::uuid;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'EL ENCARGO NO DEVOLVIÓ TRABAJO: %', v_nuevo;
  END IF;

  -- Y que sea NUEVO, no el cancelado devuelto por un guardia de duplicados.
  IF EXISTS (SELECT 1 FROM public.equipo_trabajos
              WHERE id = v_id AND estado IN ('cancelled', 'completed')) THEN
    RAISE EXCEPTION 'DEVOLVIÓ UN ENCARGO YA CERRADO (%): no se encargó nada nuevo.', v_id;
  END IF;

  SELECT count(*) INTO v_cola FROM public.equipo_mensajes
   WHERE trabajo_id = v_id AND to_agent = 'comercial_creativo';

  IF v_cola = 0 THEN
    RAISE EXCEPTION 'EL ENCARGO (%) NO LE LLEGÓ AL CREATIVO: cero mensajes en su cola.', v_id;
  END IF;

  RAISE NOTICE 'Encargado (%), con % mensaje(s) esperando al creativo.', v_id, v_cola;
END $reparar$;

SELECT public.registrar_migracion('el_amortiguador_esta_vez_al_montador.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT json_build_object(
  'donde_corre_el_creativo', (SELECT ejecuta_en FROM public.equipo_agentes
                               WHERE clave = 'comercial_creativo'),
  'la_nube_lo_coge',         jsonb_exists(public.equipo_nube_agentes(), 'comercial_creativo'),
  'aprobaciones_huerfanas',  (SELECT count(*) FROM public.equipo_aprobaciones a
                               JOIN public.equipo_trabajos t ON t.id = a.trabajo_id
                              WHERE a.estado = 'pending'
                                AND t.estado IN ('cancelled','failed','completed')),
  'encargo_vivo',            (SELECT json_agg(json_build_object(
                                'id', t.id, 'estado', t.estado, 'creado', t.creado_en))
                               FROM public.equipo_trabajos t
                              WHERE t.titulo ILIKE '%AMORTIGUADOR TRASERO PLATINA%'
                                AND t.estado NOT IN ('cancelled','completed','failed'))
) AS r;
