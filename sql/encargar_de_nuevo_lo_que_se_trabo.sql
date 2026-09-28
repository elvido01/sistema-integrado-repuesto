-- ============================================================
-- ENCARGAR DE NUEVO LO QUE SE TRABÓ
-- ============================================================
-- El 28/09 el encargo del amortiguador se quedó girando en el panel: la nube
-- entregó un brief sin pieza, Hermes lo rechazó y dejó una aprobación de
-- CONCEPTO esperando, y la tarjeta del encargo solo sabe enseñar aprobaciones
-- con arte. Para sacarlo de ahí hubo que tocar la base a mano.
--
-- La tarjeta va a tener un botón "Encargar de nuevo" para eso. Y no puede ser
-- simplemente volver a llamar a `equipo_encargar_promocion`:
--
--   · Es idempotente por pieza, enfoque, formato y día → devuelve el MISMO
--     trabajo.
--   · Y `equipo_encargar_a` solo revive el encargo si murió (failed o
--     cancelled). En el caso trabado, el encargo terminó "completed" —
--     entregó un brief—, así que pedirlo otra vez contesta "ya existe" y NO
--     HACE NADA. El dueño vería "encargado" y la ruedita seguiría ahí.
--
-- Esto hace las tres cosas que se hicieron a mano el 28/09:
--   1. Cierra las aprobaciones colgadas de ese encargo (nadie las contesta).
--   2. Cancela el encargo trabado y sus mensajes vivos.
--   3. Abre uno NUEVO con la misma petición y el encargo de arte completo
--      (`equipo_brief_arte`: materiales, foto, reglas de la casa), igual que
--      lo abre el panel.
--
-- La clave del nuevo es 'promo-reencargo:<id del viejo>': un doble clic
-- devuelve el mismo nuevo, no dos. Y si el nuevo también se traba, se
-- reencarga ÉL, con su propia clave.
--
-- No toca un encargo 'completed': eso es una pieza ya aceptada, no algo
-- trabado. Para otra versión de algo aceptado se encarga desde la barra.
-- ============================================================

CREATE OR REPLACE FUNCTION public.equipo_reencargar_promocion(p_trabajo_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant  uuid := public.get_user_tenant();
  v_w       record;
  v_email   text;
  v_abierto json;
  v_nuevo   uuid;
  v_encargo json;
  v_cerradas int;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Este módulo es del dueño.';
  END IF;

  SELECT * INTO v_w FROM public.equipo_trabajos
   WHERE id = p_trabajo_id AND tenant_id = v_tenant;

  IF v_w.id IS NULL THEN
    RAISE EXCEPTION 'Ese encargo no existe en esta empresa.';
  END IF;
  IF v_w.tipo IS DISTINCT FROM 'promocion' THEN
    RAISE EXCEPTION 'Solo se vuelven a encargar promociones.';
  END IF;
  IF v_w.estado = 'completed' THEN
    RAISE EXCEPTION 'Ese encargo ya se cerró con una pieza aceptada. Para otra versión, encárgalo desde "Qué promocionar hoy".';
  END IF;

  v_email := COALESCE(NULLIF(auth.jwt() ->> 'email', ''),
                      (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid()));

  -- 1. Lo colgado se cierra: nadie lo va a contestar.
  UPDATE public.equipo_aprobaciones
     SET estado = 'rejected', decidido_por = auth.uid(), decidido_email = v_email,
         decidido_en = now(),
         comentario = 'Cerrada al volver a encargar: el encargo se había trabado.'
   WHERE trabajo_id = p_trabajo_id AND estado = 'pending';
  GET DIAGNOSTICS v_cerradas = ROW_COUNT;

  -- 2. El trabado se cancela, con lo que le quedara vivo.
  UPDATE public.equipo_trabajos
     SET estado = 'cancelled', terminado_en = now()
   WHERE id = p_trabajo_id AND estado NOT IN ('completed', 'cancelled');
  UPDATE public.equipo_mensajes SET status = 'cancelled'
   WHERE trabajo_id = p_trabajo_id
     AND status IN ('pending', 'claimed', 'processing', 'waiting_dependency', 'failed');

  -- 3. Uno nuevo, igual que lo abre el panel.
  v_abierto := hermes.equipo_abrir_trabajo(
    p_tenant          => v_tenant,
    p_titulo          => v_w.titulo,
    p_peticion        => v_w.peticion,
    p_tipo            => 'promocion',
    p_origin_platform => COALESCE(v_w.origin_platform, 'panel'),
    p_solicitado_por  => auth.uid(),
    p_idempotency_key => 'promo-reencargo:' || p_trabajo_id::text);

  v_nuevo := (v_abierto ->> 'trabajo_id')::uuid;

  v_encargo := hermes.equipo_encargar_a(v_nuevo, 'comercial_creativo', 1,
                 hermes.equipo_brief_arte(v_tenant, v_w.peticion));

  RETURN json_build_object(
    'ok', true,
    'trabajo_id', v_nuevo,
    'anterior', p_trabajo_id,
    'aprobaciones_cerradas', v_cerradas,
    'duplicado', COALESCE((v_abierto ->> 'duplicado')::boolean, false));
END $fn$;

REVOKE ALL ON FUNCTION public.equipo_reencargar_promocion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_reencargar_promocion(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('encargar_de_nuevo_lo_que_se_trabo.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Simulacro sobre el encargo REAL del amortiguador que se trabó el 28/09
-- (733ba131, ya cancelado). Todo dentro de un bloque que acaba en una
-- excepción provocada: el encargo nuevo nunca se confirma, así que el worker
-- del VPS no lo ve y no se gasta ni una imagen.
--
-- Se comprueba:
--   · que abre un trabajo NUEVO (no devuelve el viejo),
--   · que el encargo le llega al creativo CON el encargo de arte completo
--     (se busca "recortado", que solo está en la regla del fondo del 28/09),
--   · que un doble clic devuelve el mismo nuevo y no abre otro,
--   · que sin ser el dueño se niega.
CREATE TEMP TABLE _informe (t text);

DO $prueba$
DECLARE
  v_informe text;
BEGIN
  BEGIN
    -- Sin sesión de dueño: tiene que negarse.
    DECLARE v_nego boolean := false;
    BEGIN
      BEGIN
        PERFORM public.equipo_reencargar_promocion('733ba131-9b73-46cf-8942-88e248093c71');
      EXCEPTION WHEN raise_exception THEN
        v_nego := SQLERRM LIKE '%del dueño%';
      END;
      IF NOT v_nego THEN RAISE EXCEPTION 'FALLO: sin ser el dueño, dejó reencargar.'; END IF;
    END;

    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object(
      'sub', '0a751661-5ec4-4136-a75c-b4d8493beae0',
      'email', 'admin@repuestosmorla.com', 'role', 'authenticated')::text, true);

    DECLARE
      v_r1   json;
      v_r2   json;
      v_id   uuid;
      v_brief boolean;
      v_viejo text;
    BEGIN
      v_r1 := public.equipo_reencargar_promocion('733ba131-9b73-46cf-8942-88e248093c71');
      v_id := (v_r1 ->> 'trabajo_id')::uuid;

      RESET role;

      IF v_id IS NULL OR v_id = '733ba131-9b73-46cf-8942-88e248093c71' THEN
        RAISE EXCEPTION 'FALLO: no abrió un trabajo nuevo: %', v_r1;
      END IF;

      SELECT EXISTS (SELECT 1 FROM public.equipo_mensajes m
                      WHERE m.trabajo_id = v_id AND m.to_agent = 'comercial_creativo'
                        AND m.status = 'pending'
                        AND lower(m.payload::text) LIKE '%recortado%')
        INTO v_brief;
      IF NOT v_brief THEN
        RAISE EXCEPTION 'FALLO: el encargo nuevo no le llega al creativo con el encargo de arte completo (sin la regla del fondo).';
      END IF;

      SELECT estado INTO v_viejo FROM public.equipo_trabajos WHERE id = '733ba131-9b73-46cf-8942-88e248093c71';
      IF v_viejo <> 'cancelled' THEN
        RAISE EXCEPTION 'FALLO: el viejo quedó en "%".', v_viejo;
      END IF;

      -- Doble clic.
      PERFORM set_config('role', 'authenticated', true);
      v_r2 := public.equipo_reencargar_promocion('733ba131-9b73-46cf-8942-88e248093c71');
      RESET role;
      IF (v_r2 ->> 'trabajo_id')::uuid IS DISTINCT FROM v_id THEN
        RAISE EXCEPTION 'FALLO: el doble clic abrió otro trabajo (% y %).', v_id, v_r2 ->> 'trabajo_id';
      END IF;

      RAISE EXCEPTION 'SIMULACRO_OK: abre uno nuevo (%), le llega al creativo con el arte completo, el doble clic devuelve el mismo y sin ser el dueño se niega.', v_id;
    END;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'SIMULACRO_OK:%' THEN v_informe := SQLERRM; ELSE RAISE; END IF;
  END;

  INSERT INTO _informe VALUES (v_informe);
END $prueba$;

SELECT json_build_object(
  'informe', (SELECT t FROM _informe),
  'restos_del_simulacro', (SELECT count(*) FROM public.equipo_mensajes
                            WHERE idempotency_key = 'promo-reencargo:733ba131-9b73-46cf-8942-88e248093c71')
) AS r;
