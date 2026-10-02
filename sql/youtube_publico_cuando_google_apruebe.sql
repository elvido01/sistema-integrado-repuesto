-- =====================================================================
-- YOUTUBE EN PÚBLICO — correr SOLO cuando Google apruebe la auditoría
-- ---------------------------------------------------------------------
-- (2026-10-02) Hasta la auditoría (enviada el 29/09) Google sube en privado
-- todo lo de un proyecto sin auditar, pidamos lo que pidamos. El publicador
-- (publicar-promociones) sube en privado por defecto y solo pide público si
-- la cuenta de YouTube trae meta.privacidad_publicacion = 'public'
-- (_shared/cuentaSocial.mjs → adaptadores.mjs → youtubeShort).
--
-- DECISIÓN DEL DUEÑO: este archivo NO se corre solo ni lo corre Claude.
-- Cuando llegue el correo de Google aprobando, se corre y desde la siguiente
-- promoción los Shorts salen públicos. Para volver a privado, la sección de
-- abajo.
-- =====================================================================

UPDATE public.social_accounts
   SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('privacidad_publicacion', 'public')
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND platform = 'youtube'
   AND status = 'connected';

SELECT public.registrar_migracion('youtube_publico_cuando_google_apruebe.sql');

-- VERIFICACION
SELECT account_name, status, publicacion_habilitada, meta ->> 'privacidad_publicacion' AS privacidad
  FROM public.social_accounts
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND platform = 'youtube';

-- ---------------------------------------------------------------------
-- PARA VOLVER A PRIVADO:
-- UPDATE public.social_accounts SET meta = meta - 'privacidad_publicacion'
--  WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND platform = 'youtube';
-- ---------------------------------------------------------------------
