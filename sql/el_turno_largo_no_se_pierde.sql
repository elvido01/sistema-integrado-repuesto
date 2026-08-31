-- ============================================================
-- EL TURNO LARGO NO SE PIERDE
-- ============================================================
-- 30/08/2026. Con el canal ya de vuelta, se pidió la promoción de la careta
-- y pasó esto:
--
--   mensaje 580 · intentos 3 · estado 'procesando' · lease vencido 18:14
--   mensaje 581 · intentos 2 · "Working — 6 min — iteration 19/60"
--   la imagen (2,2 MB) registrada y esperando a un 580 que nunca contestó
--
-- Y el propio Hermes lo dijo por el canal de progreso:
--   "Detecté que MotoFlow pierde el token de la solicitud antes de enviar
--    texto e imagen; por eso la promoción se vuelve a intentar."
--
-- Tenía razón. El mecanismo:
--
--   · chat_lease() dura 5 minutos
--   · chat_estado() renueva en cada reporte de progreso — bien
--   · pero generar una imagen lo deja MINUTOS sin reportar nada
--   · pasados los 5, chat_tomar() se lo quita, sube intentos y genera un
--     claim_token NUEVO; el worker que estaba trabajando queda invalidado
--   · su respuesta final se rechaza con claim_abandoned, y vuelta a empezar
--
-- Dos arreglos, ninguno toca chat_tomar() ni el fencing:
--
--   1. El arrendamiento pasa de 5 a 12 minutos. No es un parche: 5 se
--      eligió cuando Hermes solo redactaba texto. Un turno que de verdad
--      tarda 6 minutos no cabe en una ventana de 5, y no cabía por diseño.
--
--   2. Un turno que agota los 3 intentos ya no muere callado. Hoy se queda
--      en 'procesando' para siempre: no contesta, no da error, no vuelve a
--      la cola, y la pantalla espera a alguien que no va a venir. Pasa a
--      'error' con el motivo escrito.
--
-- La limpieza va dentro del latido, que el gateway llama cada minuto. Es su
-- sitio natural: el latido ya es la señal de "sigo vivo", y de paso barre lo
-- que quedó muerto. No hace falta un cronjob que se pueda olvidar.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. DOCE MINUTOS
-- ------------------------------------------------------------
-- Sube el techo sin tocar nada más: chat_tomar, chat_renovar y chat_estado
-- ya la llaman. El precio es que un worker REALMENTE muerto retiene su
-- mensaje 12 minutos en vez de 5. Es el precio correcto: quitarle el turno
-- a alguien que está trabajando cuesta un trabajo entero repetido; esperar
-- de más a alguien que murió cuesta unos minutos.
CREATE OR REPLACE FUNCTION hermes.chat_lease()
RETURNS interval
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $fn$ SELECT interval '12 minutes' $fn$;

-- ------------------------------------------------------------
-- 2. LOS QUE YA NO VAN A CONTESTAR
-- ------------------------------------------------------------
-- Un mensaje con los 3 intentos gastados y el arrendamiento vencido no lo
-- va a tomar nadie: chat_tomar() exige intentos < 3. Se marca como error
-- para que la pantalla lo diga y la persona pueda repetir la pregunta.
CREATE OR REPLACE FUNCTION hermes.chat_barrer_muertos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_n      integer;
BEGIN
  UPDATE public.hermes_chat c
     SET estado = 'error',
         error_en = now(),
         claim_token = NULL,
         lease_until = NULL,
         estado_detalle = NULL,
         ultimo_error = COALESCE(c.ultimo_error,
           'El turno se agotó tras 3 intentos sin llegar a contestar.')
   WHERE c.tenant_id = v_tenant
     AND c.rol = 'usuario'
     AND c.estado = 'procesando'
     AND c.intentos >= 3
     AND COALESCE(c.lease_until, c.procesando_en + hermes.chat_lease()) <= now();

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $fn$;

REVOKE ALL ON FUNCTION hermes.chat_barrer_muertos() FROM PUBLIC;

-- ------------------------------------------------------------
-- 3. EL LATIDO TAMBIÉN BARRE
-- ------------------------------------------------------------
-- Mismo contrato de antes; solo se le añade la limpieza y el recuento en la
-- respuesta, por si algún día hay que mirar cuántos se están perdiendo.
CREATE OR REPLACE FUNCTION hermes.latido(p_detalle jsonb DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_muertos integer := 0;
BEGIN
  INSERT INTO public.hermes_presencia (tenant_id, ultimo, detalle)
  VALUES (v_tenant, now(), p_detalle)
  ON CONFLICT (tenant_id) DO UPDATE SET ultimo = now(), detalle = EXCLUDED.detalle;

  -- Que la limpieza no pueda tumbar el latido: si algo falla aquí, se
  -- prefiere un turno muerto sin barrer a un canal que parece caído.
  BEGIN
    v_muertos := hermes.chat_barrer_muertos();
  EXCEPTION WHEN OTHERS THEN
    v_muertos := -1;
  END;

  RETURN json_build_object('ok', true, 'barridos', v_muertos);
END $fn$;

DO $g$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hermes_readonly') THEN
    GRANT EXECUTE ON FUNCTION hermes.latido(jsonb) TO hermes_readonly;
  END IF;
END $g$;

SELECT public.registrar_migracion('el_turno_largo_no_se_pierde.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
DO $p$
DECLARE
  v_ten  uuid := '00000000-0000-0000-0000-000000000001';
  v_vivo bigint;
  v_mue  bigint;
  v_lat  json;
  v_ev   text;
  v_em   text;
BEGIN
  -- Uno vivo trabajando: 3 intentos pero renovando. NO se puede tocar.
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, estado, intentos,
    claim_token, procesando_en, lease_until, conversation_key)
  VALUES (v_ten, 'usuario', 'PRUEBA vivo', 'procesando', 3,
    gen_random_uuid(), now(), now() + interval '4 minutes',
    'agent:main:morla:tenant:' || v_ten)
  RETURNING id INTO v_vivo;

  -- Uno muerto: 3 intentos y el arrendamiento vencido hace rato.
  INSERT INTO public.hermes_chat (tenant_id, rol, texto, estado, intentos,
    claim_token, procesando_en, lease_until, conversation_key)
  VALUES (v_ten, 'usuario', 'PRUEBA muerto', 'procesando', 3,
    gen_random_uuid(), now() - interval '30 minutes',
    now() - interval '20 minutes', 'agent:main:morla:tenant:otra-' || v_ten)
  RETURNING id INTO v_mue;

  v_lat := hermes.latido('{"origen":"prueba"}'::jsonb);

  SELECT c.estado INTO v_ev FROM public.hermes_chat c WHERE c.id = v_vivo;
  SELECT c.estado INTO v_em FROM public.hermes_chat c WHERE c.id = v_mue;

  RAISE EXCEPTION 'PRUEBA: lease=[%] | el vivo sigue=[%] | el muerto pasa a=[%] | latido=[%]',
    hermes.chat_lease(), v_ev, v_em, v_lat::text;
END $p$;
