-- ============================================================
-- DESTRABAR Y RELANZAR EL AMORTIGUADOR
-- ============================================================
-- Reparación de una vez, consecuencia de
-- `el_creativo_no_se_muda_por_cambiar_de_motor.sql` (28/09).
--
-- El encargo 733ba131 quedó colgado: la nube contestó con un brief sin
-- pieza, Hermes lo rechazó con razón y dejó una aprobación de CONCEPTO
-- esperando. El panel solo sabe enseñar aprobaciones con arte, así que se
-- quedó girando: ni pieza que enseñar, ni trabajo terminado que cerrar. Sin
-- tocarlo a mano no sale de ahí, porque nadie le va a contestar nunca.
--
-- Aquí se hacen dos cosas, por la puerta buena y no escribiendo en las colas
-- a mano:
--
--   1. Cerrar el encargo muerto con `equipo_trabajo_accion(..., 'cancelar')`,
--      el mismo botón que tiene el panel, y dejar resuelta la aprobación
--      huérfana para que no quede pendiente de nadie.
--   2. Volver a encargarlo con `equipo_encargar_promocion`, que es lo que
--      llama la pantalla cuando eliges una pieza en "Qué promocionar hoy".
--      Ahora el creativo ya está en la máquina del montador, así que lo coge
--      el worker del VPS y sale la pieza, no un brief.
--
-- Las dos funciones son del dueño (`equipo_ia_permitido`) y resuelven la
-- empresa por la activa (`get_user_tenant`), así que hay que IMPERSONAR: sin
-- eso, corriendo como postgres, `auth.uid()` es nulo, el permiso da false y
-- la empresa sale nula. Se impersona a admin@repuestosmorla.com, que es
-- quien pidió el encargo original.
--
-- Lo que pidió el dueño al devolver la primera pieza —"siempre debes
-- eliminarle el fondo a la imagen original"— va como enfoque de este
-- encargo. Lo de "siempre" es harina de otro costal: eso es un criterio fijo
-- del arte, no una nota suelta, y se decide aparte.
--
-- NO es idempotente a ciegas a propósito: si el encargo viejo ya no está
-- colgado, no se encarga nada. Correr esto dos veces no debe costar dos
-- veces en imágenes.
-- ============================================================

DO $reparar$
DECLARE
  v_user    uuid := '0a751661-5ec4-4136-a75c-b4d8493beae0';  -- admin@repuestosmorla.com
  v_viejo   uuid := '733ba131-9b73-46cf-8942-88e248093c71';
  v_prod    uuid := '398d1e85-27a8-41d7-81c5-cc5a430b10eb';  -- JK122021, el de Morla (tiene foto)
  v_estado  text;
  v_nuevo   json;
  v_id      uuid;
  v_cola    int;
BEGIN
  SELECT estado INTO v_estado FROM public.equipo_trabajos WHERE id = v_viejo;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'NO ESTÁ EL ENCARGO VIEJO (%). Alguien lo borró: para y mira antes de seguir.', v_viejo;
  END IF;

  IF v_estado IN ('cancelled', 'completed') THEN
    RAISE NOTICE 'El encargo viejo ya estaba cerrado (%). No se encarga nada nuevo.', v_estado;
    RETURN;
  END IF;

  -- ── Impersonar al dueño ────────────────────────────────────────────
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_user, 'email', 'admin@repuestosmorla.com', 'role', 'authenticated')::text, true);

  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'LA IMPERSONACIÓN NO PRENDIÓ: equipo_ia_permitido() da false. Sin esto las dos llamadas de abajo fallarían por permiso.';
  END IF;

  -- ── 1. Cerrar el muerto ────────────────────────────────────────────
  PERFORM public.equipo_trabajo_accion(v_viejo, 'cancelar');

  -- ── 2. Encargarlo otra vez ─────────────────────────────────────────
  v_nuevo := public.equipo_encargar_promocion(
    ARRAY[v_prod]::uuid[],
    'Quítale el fondo a la foto original del producto antes de montarla.',
    'historia');

  RAISE NOTICE 'Encargo nuevo: %', v_nuevo;

  -- ── Y la aprobación huérfana, que el cancelar no toca ───────────────
  RESET role;
  UPDATE public.equipo_aprobaciones
     SET estado = 'rejected',
         decidido_en = now(),
         comentario = 'Cerrada al destrabar: llegó un brief sin pieza porque el encargo lo atendió la nube, que no monta arte. Se volvió a encargar.'
   WHERE trabajo_id = v_viejo AND estado = 'pending';

  -- ── Comprobar que el nuevo existe y está en la cola del creativo ───
  v_id := (v_nuevo ->> 'trabajo_id')::uuid;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'EL ENCARGO NUEVO NO DEVOLVIÓ TRABAJO: %', v_nuevo;
  END IF;

  SELECT count(*) INTO v_cola FROM public.equipo_mensajes
   WHERE trabajo_id = v_id AND to_agent = 'comercial_creativo';

  IF v_cola = 0 THEN
    RAISE EXCEPTION 'EL ENCARGO NUEVO (%) NO LE LLEGÓ AL CREATIVO: cero mensajes en su cola.', v_id;
  END IF;

  RAISE NOTICE 'Viejo cerrado y nuevo encargado (%), con % mensaje(s) para el creativo.', v_id, v_cola;
END $reparar$;

SELECT public.registrar_migracion('destrabar_y_relanzar_el_amortiguador.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT json_build_object(
  'viejo_cerrado',   (SELECT estado FROM public.equipo_trabajos
                       WHERE id = '733ba131-9b73-46cf-8942-88e248093c71'),
  'aprobaciones_colgando', (SELECT count(*) FROM public.equipo_aprobaciones
                       WHERE trabajo_id = '733ba131-9b73-46cf-8942-88e248093c71'
                         AND estado = 'pending'),
  'encargos_vivos',  (SELECT json_agg(json_build_object('id', t.id, 'estado', t.estado, 'creado', t.creado_en))
                       FROM public.equipo_trabajos t
                      WHERE t.titulo ILIKE '%AMORTIGUADOR TRASERO PLATINA%'
                        AND t.estado NOT IN ('cancelled'))
) AS r;
