-- =====================================================================
-- Avisos al teléfono (push) con el número en el ícono (21/11/2026)
-- ---------------------------------------------------------------------
-- El dueño: "cuando Hermes me escriba o mande una notificación a través de
-- MotoFlow, que me aparezca el número del mensajito" en el ícono de la app.
-- En Android el número del ícono es la cantidad de avisos de la app en la
-- bandeja: hace falta que el aviso LLEGUE al teléfono.
--
-- La app registra el teléfono con su token de Expo en hermes_dispositivos
-- (hermes_dispositivo_registrar, ya existía, pero nadie lo llamaba). Aquí:
--   · cada aviso de la campanita (notificaciones) va a los teléfonos de esa
--     persona, menos 'credito_vencido' (unos 24 al día: sería ruido; va en
--     el resumen diario);
--   · cada mensaje que Hermes escribe por su cuenta (hermes_chat, rol
--     'hermes', sin responde_a: centinelas, publicación diaria) va a los
--     teléfonos de los dueños y administradores de esa empresa.
-- Se manda con pg_net directo a la API de push de Expo (no pide clave).
-- Si algo falla, el aviso de la campanita se guarda igual: el push nunca
-- tumba el INSERT.
-- =====================================================================
BEGIN;

CREATE OR REPLACE FUNCTION private._push_enviar(p_tokens text[], p_titulo text, p_cuerpo text, p_data jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_msgs jsonb;
BEGIN
  IF p_tokens IS NULL OR cardinality(p_tokens) = 0 THEN RETURN; END IF;
  SELECT jsonb_agg(jsonb_build_object(
           'to', t, 'title', left(COALESCE(p_titulo, 'MotoFlow'), 120),
           'body', left(COALESCE(p_cuerpo, ''), 240),
           'sound', 'default', 'priority', 'high', 'channelId', 'avisos',
           'data', COALESCE(p_data, '{}'::jsonb)))
    INTO v_msgs
    FROM (SELECT DISTINCT unnest(p_tokens) AS t) x
   WHERE t LIKE 'ExponentPushToken[%' OR t LIKE 'ExpoPushToken[%';
  IF v_msgs IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
    body := v_msgs);
END $function$;
REVOKE ALL ON FUNCTION private._push_enviar(text[], text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- Texto de Hermes sin el markdown (** y __) para la bandeja del teléfono.
CREATE OR REPLACE FUNCTION private._push_texto_plano(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT btrim(regexp_replace(regexp_replace(COALESCE(p, ''), '(\*\*|__)', '', 'g'), '\s+', ' ', 'g'));
$function$;

-- 1) La campanita → teléfonos de esa persona.
CREATE OR REPLACE FUNCTION private._push_de_notificacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_tokens text[];
BEGIN
  IF NEW.user_id IS NULL OR NEW.tipo = 'credito_vencido' THEN RETURN NEW; END IF;
  BEGIN
    SELECT array_agg(DISTINCT d.push_token) INTO v_tokens
      FROM public.hermes_dispositivos d
     WHERE d.user_id = NEW.user_id AND d.push_token IS NOT NULL
       AND d.revocado_en IS NULL AND COALESCE(d.autorizado, true);
    PERFORM private._push_enviar(v_tokens, private._push_texto_plano(NEW.titulo), private._push_texto_plano(NEW.mensaje),
      jsonb_build_object('origen', 'notificacion', 'tipo', NEW.tipo, 'id', NEW.id));
  EXCEPTION WHEN others THEN
    RAISE WARNING 'push de notificación no salió: %', SQLERRM;
  END;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_push_notificacion ON public.notificaciones;
CREATE TRIGGER trg_push_notificacion
  AFTER INSERT ON public.notificaciones
  FOR EACH ROW EXECUTE FUNCTION private._push_de_notificacion();

-- 2) Hermes escribe por su cuenta → dueños y administradores de la empresa.
CREATE OR REPLACE FUNCTION private._push_de_hermes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_tokens text[];
BEGIN
  BEGIN
    SELECT array_agg(DISTINCT d.push_token) INTO v_tokens
      FROM public.hermes_dispositivos d
     WHERE d.tenant_id = NEW.tenant_id AND d.push_token IS NOT NULL
       AND d.revocado_en IS NULL AND COALESCE(d.autorizado, true)
       AND (EXISTS (SELECT 1 FROM public.profiles p
                     WHERE p.id = d.user_id AND p.tenant_id = NEW.tenant_id AND p.role IN ('owner', 'admin'))
         OR EXISTS (SELECT 1 FROM public.usuarios_empresas ue
                     WHERE ue.user_id = d.user_id AND ue.tenant_id = NEW.tenant_id AND ue.rol IN ('owner', 'admin')));
    PERFORM private._push_enviar(v_tokens, 'Hermes', private._push_texto_plano(NEW.texto),
      jsonb_build_object('origen', 'hermes', 'ruta', '/hermes', 'id', NEW.id));
  EXCEPTION WHEN others THEN
    RAISE WARNING 'push de Hermes no salió: %', SQLERRM;
  END;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_push_hermes ON public.hermes_chat;
CREATE TRIGGER trg_push_hermes
  AFTER INSERT ON public.hermes_chat
  FOR EACH ROW
  WHEN (NEW.rol = 'hermes' AND NEW.responde_a IS NULL)
  EXECUTE FUNCTION private._push_de_hermes();

COMMIT;

SELECT public.registrar_migracion('push_avisos_movil.sql');
