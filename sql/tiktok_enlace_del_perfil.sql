-- El "ver" de TikTok en el historial de Equipo IA (30/09/2026). Un video
-- que el dueño publica desde su bandeja no deja enlace propio en MotoFlow, y
-- leer el nombre de usuario pediría otro permiso a TikTok (user.info.profile).
-- El dueño dio su perfil: el "ver" de TikTok lleva ahí. Solo la cuenta
-- conectada; la pantalla lee únicamente meta->>perfil_url.

UPDATE public.social_accounts
   SET meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('perfil_url', 'https://www.tiktok.com/@repuestos_morla')
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND platform = 'tiktok' AND status = 'connected';

SELECT public.registrar_migracion('tiktok_enlace_del_perfil.sql');

-- ===== VERIFICACION =====
SELECT platform, status, meta ->> 'perfil_url' AS perfil_url
FROM public.social_accounts
WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND platform = 'tiktok';
