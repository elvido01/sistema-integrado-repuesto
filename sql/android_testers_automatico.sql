-- =====================================================================
-- Testers Android automáticos (camino A, 19/11/2026)
-- ---------------------------------------------------------------------
-- La función android-tester mete el correo al grupo de Google (Cloud Identity,
-- testers de la prueba cerrada en Play) y le manda el enlace por correo
-- (Resend). Aquí se anota qué pasó con cada uno, para reintentar los que
-- quedaron pendientes y no mandar el mismo correo diez veces.
-- =====================================================================

ALTER TABLE public.android_testers
  ADD COLUMN IF NOT EXISTS en_grupo_at       timestamptz,
  ADD COLUMN IF NOT EXISTS correo_enviado_at timestamptz,
  ADD COLUMN IF NOT EXISTS ultimo_error      text;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('android_testers_automatico.sql');
