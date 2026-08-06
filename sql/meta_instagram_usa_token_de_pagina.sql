-- =====================================================================
-- Instagram guardaba el token equivocado (y encima vencido)
-- ---------------------------------------------------------------------
-- (2026-08-06) "¿qué le falta para conectar el FB y el Instagram al CRM de
-- Repuestos Morla?"
--
-- Facebook está bien: la página 100771345587204 está suscrita a la app
-- MotoFlow CRM con los campos messages, messaging_postbacks,
-- message_deliveries y message_reads, y su token de página sigue vivo.
--
-- Instagram no, por dos razones a la vez:
--
--   1. El token guardado empieza con IGAA — es un token de Instagram Login,
--      que solo sirve contra graph.instagram.com. El webhook responde por
--      graph.facebook.com/{ig-id}/messages, que pide un token de PÁGINA.
--   2. Además ya venció: "Session has expired on 29-Jul-26".
--
-- >>> NO HACE FALTA UN TOKEN NUEVO <<<
-- El token de la página YA sirve para Instagram. Sus permisos, leídos de
-- debug_token, incluyen:
--
--   instagram_basic + instagram_manage_messages  →  17841442598881436
--
-- que es exactamente la cuenta @repuestosmorla. Probado contra la API: con
-- ese token, /conversations?platform=instagram responde 200 y trae los hilos
-- reales de Instagram.
--
-- Así que Instagram pasa a usar el mismo token de la página. Cuando haya que
-- renovarlo (ver abajo) se renueva UNO solo y sirve para los dos canales.
--
-- >>> OJO: EL ACCESO A DATOS VENCE EL 24/08/2026 <<<
-- El token en sí no expira (expires_at = 0), pero Meta corta el acceso a
-- datos a los 90 días de la última autorización: data_access_expires_at cae
-- el 24 de agosto de 2026. Antes de esa fecha alguien tiene que volver a
-- entrar por "Conectar con Facebook" para renovar. Si no, los dos canales se
-- caen el mismo día.
--
-- Idempotente / re-ejecutable. El token NO se escribe aquí: se copia de la
-- fila de Facebook, así que este archivo no lleva secretos.
-- =====================================================================

DO $$
DECLARE v_n int;
BEGIN
  UPDATE public.social_account_secrets d
     SET access_token = f.access_token
    FROM public.social_account_secrets f
    JOIN public.social_accounts sa_fb ON sa_fb.id = f.account_id
    JOIN public.social_accounts sa_ig
      ON sa_ig.tenant_id = sa_fb.tenant_id
     AND sa_ig.platform = 'instagram'
   WHERE sa_fb.platform = 'facebook'
     AND f.access_token IS NOT NULL
     AND d.account_id = sa_ig.id
     AND d.access_token IS DISTINCT FROM f.access_token;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Instagram apuntando al token de la pagina: % cuenta(s).', v_n;
END $$;

-- El canal que el webhook resuelve primero (sales_channels) se rearma solo
-- desde social_accounts la proxima vez que entre un mensaje. Pero si ya
-- existe con el token viejo, se le pone el bueno aqui.
UPDATE public.sales_channels c
   SET access_token = s.access_token,
       status = 'active'
  FROM public.social_accounts sa
  JOIN public.social_account_secrets s ON s.account_id = sa.id
 WHERE sa.platform = c.platform
   AND sa.external_account_id = c.external_account_id
   AND sa.tenant_id = c.tenant_id
   AND c.platform IN ('facebook', 'instagram')
   AND c.access_token IS DISTINCT FROM s.access_token;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('meta_instagram_usa_token_de_pagina.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) LAS DOS CUENTAS CON EL MISMO TOKEN (el de la página)
SELECT sa.platform, sa.account_name, sa.external_account_id,
       left(s.access_token, 4) AS empieza_con,
       length(s.access_token)  AS largo
FROM public.social_accounts sa
JOIN public.social_account_secrets s ON s.account_id = sa.id
WHERE sa.platform IN ('facebook', 'instagram')
ORDER BY sa.platform;
-- esperado: las dos filas empezando en 'EAGB' y con el mismo largo.
-- Si Instagram sigue en 'IGAA', el UPDATE no encontró la fila de Facebook.

-- 2) QUÉ HA ENTRADO POR EL WEBHOOK DE META
SELECT received_at, platform, event_type, status, error_message
FROM public.meta_webhook_events
ORDER BY received_at DESC
LIMIT 20;
-- Hoy solo hay 2 eventos, el último del 31/05/2026. Si después de escribirle
-- a la página desde OTRO teléfono no aparece nada nuevo aquí, el problema no
-- es el token: es que la app de Meta sigue en modo Desarrollo y solo deja
-- pasar los mensajes de quien tenga rol en la app.
