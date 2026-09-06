-- ============================================================
-- EL ESPEJO DICE POR QUÉ ESTÁ CALLADO
-- ============================================================
-- El chip del panel decía «⚠ Sin capturas · Hace ? h que no entra un mensaje
-- nuevo», y eso hacía pensar que el espejo estaba roto. No lo estaba: los
-- latidos llegaban al minuto. Lo que pasaba es otra cosa, y ninguna pantalla
-- la decía.
--
-- >>> EL ESPEJO COPIA EL CHAT QUE TENGAS DELANTE, NO TODO WHATSAPP <<<
-- Comprobado en `omni_mirror_health` de REPUESTOS MORLA:
--   last_ping_at      = hace 5 minutos      -> la extensión está viva
--   last_chatopen_at  = 03/09 15:03         -> hace 3 días que no abre un chat
--   last_parsed_at    = 03/09 15:03         -> el MISMO segundo: cuando hubo
--                                              un chat abierto, leyó bien
-- O sea: no hay DOM roto ni error. Al vendedor le pasa que vive dentro de la
-- bandeja Omni (TikTok), que ocupa el lugar del chat, y el espejo se queda sin
-- nada que copiar. Igual con TikTok e Instagram: esos solo entran mientras la
-- pestaña de la red esté abierta.
--
-- >>> QUÉ CAMBIA <<<
-- Un estado nuevo, `sin_chat`: latidos frescos pero sin chat abierto hace más
-- de 2 horas. El panel lo pinta diciendo qué hacer («abre un chat en WhatsApp
-- Web») en vez de dar a entender que algo se rompió. `dom_roto` sigue
-- exactamente igual de sensible: si abres un chat y NO se lee, salta rojo.
-- ============================================================

SELECT public.registrar_migracion('el_espejo_dice_por_que_esta_callado.sql');

CREATE OR REPLACE FUNCTION public.get_omni_mirror_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant       uuid := public.get_user_tenant();
  v_ping         timestamptz;
  v_chatopen     timestamptz;
  v_parsed       timestamptz;
  v_last_msg     timestamptz;
  v_estado       text;
  v_now          timestamptz := now();
BEGIN
  IF v_tenant IS NULL THEN RETURN jsonb_build_object('estado','desconocido'); END IF;

  SELECT max(last_ping_at), max(last_chatopen_at), max(last_parsed_at)
    INTO v_ping, v_chatopen, v_parsed
  FROM public.omni_mirror_health WHERE tenant_id = v_tenant;

  SELECT max(created_at) INTO v_last_msg
  FROM public.sales_messages
  WHERE tenant_id = v_tenant AND platform = 'whatsapp'
    AND raw_data->>'source' = 'mirror';

  v_estado := CASE
    -- sin latidos recientes → la extensión no está corriendo
    WHEN v_ping IS NULL OR v_now - v_ping > interval '10 minutes' THEN 'inactivo'
    -- latidos frescos + abriste chats, pero no lee mensajes → estructura cambió
    WHEN v_chatopen IS NOT NULL AND v_now - v_chatopen < interval '15 minutes'
         AND (v_parsed IS NULL OR v_now - v_parsed > interval '15 minutes') THEN 'dom_roto'
    -- viva, pero hace horas que no tiene un chat delante que copiar
    WHEN v_chatopen IS NULL OR v_now - v_chatopen > interval '2 hours' THEN 'sin_chat'
    -- corriendo, con chats abiertos, pero hace horas que no entra nada nuevo
    WHEN v_last_msg IS NULL OR v_now - v_last_msg > interval '12 hours' THEN 'sin_captura'
    ELSE 'ok'
  END;

  RETURN jsonb_build_object(
    'estado',            v_estado,
    'last_ping_at',      v_ping,
    'last_chatopen_at',  v_chatopen,
    'last_parsed_at',    v_parsed,
    'last_message_at',   v_last_msg,
    'minutos_sin_leer',  CASE WHEN v_parsed IS NOT NULL THEN round(extract(epoch FROM (v_now - v_parsed))/60)::int END,
    'horas_sin_chat',    CASE WHEN v_chatopen IS NOT NULL THEN round(extract(epoch FROM (v_now - v_chatopen))/3600, 1) END,
    'horas_sin_captura', CASE WHEN v_last_msg IS NOT NULL THEN round(extract(epoch FROM (v_now - v_last_msg))/3600, 1) END
  );
END;
$fn$;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- PRUEBA — contra el espejo de verdad
-- ============================================================
-- Solo revienta si falla.
DO $prueba$
DECLARE
  v_user   uuid;
  v_tenant uuid;
  v_r      jsonb;
BEGIN
  SELECT h.user_id, h.tenant_id INTO v_user, v_tenant
    FROM public.omni_mirror_health h
   ORDER BY h.last_ping_at DESC NULLS LAST
   LIMIT 1;

  IF v_user IS NULL THEN
    RAISE NOTICE 'Nadie ha usado el espejo todavia. Funcion creada igual.';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  v_r := public.get_omni_mirror_status();

  RESET ROLE;

  IF v_r->>'estado' = 'desconocido' THEN
    RAISE EXCEPTION 'La funcion no resolvio la empresa del usuario % — revisa get_user_tenant.', v_user;
  END IF;

  IF NOT (v_r ? 'horas_sin_chat') THEN
    RAISE EXCEPTION 'Falta el dato nuevo horas_sin_chat: se corrio una version vieja del archivo.';
  END IF;

  RAISE NOTICE 'Estado del espejo: %  ·  horas sin chat abierto: %  ·  horas sin captura: %',
    v_r->>'estado', COALESCE(v_r->>'horas_sin_chat','-'), COALESCE(v_r->>'horas_sin_captura','-');
END $prueba$;
