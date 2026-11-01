-- Volver a habilitar TikTok tras reconectar (01/11/2026).
--
-- Al reconectar la cuenta para dar los permisos nuevos (video.publish y
-- video.list), social_oauth_save_connection la deja en
-- publicacion_habilitada = false, a propósito: conectar no es autorizar a
-- publicar. Estaba habilitada por orden del dueño desde el 30/09
-- (sql/tiktok_habilitar_bandeja_del_dueno.sql); esto la deja como estaba.
--
-- Nada sale "directo" por esto: cada promoción va a la bandeja salvo que el
-- dueño elija "Publicar directo" en la pantalla, con a quién se muestra.
-- Comprobado antes de habilitar: creator_info y video.list responden con la
-- cuenta Repuestos Morla Higüey (@repuestos_morla).

UPDATE public.social_accounts
   SET publicacion_habilitada = true,
       verificado_at = now(),
       verificacion_detalle = 'Rehabilitada 01/11/2026 tras reconectar con video.publish y video.list (orden del dueño). Por defecto a la bandeja; directo solo si se elige en la pantalla.'
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND platform = 'tiktok' AND status = 'connected';

SELECT public.registrar_migracion('tiktok_rehabilitar_tras_reconectar.sql');

-- ===== VERIFICACION =====
SELECT platform, status, account_name, publicacion_habilitada, connected_at
FROM public.social_accounts
WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND platform = 'tiktok';
