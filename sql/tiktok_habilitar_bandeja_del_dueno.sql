-- Habilitar TikTok para las promociones de Repuestos Morla. Orden del dueño
-- (30/09/2026), después de probar el camino entero: el video llegó como
-- borrador a su bandeja, lo publicó desde el teléfono y TikTok respondió
-- PUBLISH_COMPLETE.
--
-- Qué hace MotoFlow con la cuenta habilitada: al publicar una promoción con
-- "TikTok · video" marcado, sube el video vertical como BORRADOR a la bandeja
-- de TikTok del dueño (video.upload). NO publica: el dueño lo publica desde
-- el teléfono. El historial dice "EN TU TIKTOK" y pasa solo a PUBLICADO
-- cuando TikTok informa PUBLISH_COMPLETE (publicar-promociones mira cada 5
-- minutos).
--
-- Solo la cuenta CONECTADA por OAuth; la fila manual antigua no se toca.
-- promo_crear decide el bloqueo con esta columna: las promociones nuevas
-- ya no saldrán "SIN AUTORIZAR" en TikTok. Las ya creadas se quedan como están.

UPDATE public.social_accounts
   SET publicacion_habilitada = true,
       verificado_at = now(),
       verificacion_detalle = 'Habilitada por orden del dueño 30/09/2026: el video va como borrador a su bandeja de TikTok (video.upload) y él lo publica desde el teléfono. Probado: PUBLISH_COMPLETE.'
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND platform = 'tiktok' AND status = 'connected';

SELECT public.registrar_migracion('tiktok_habilitar_bandeja_del_dueno.sql');

-- ===== VERIFICACION =====
SELECT platform, status, account_name, publicacion_habilitada
FROM public.social_accounts
WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND platform = 'tiktok';
