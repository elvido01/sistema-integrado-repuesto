-- =====================================================================
-- Confirmar el correo de la empresa nueva "inmobiliaria incace SRL" (17/11/2026)
-- ---------------------------------------------------------------------
-- Se registró hoy y no ha podido confirmar el correo. El dueño pidió
-- confirmarlo a mano. Solo esa cuenta y solo si sigue sin confirmar.
-- =====================================================================

UPDATE auth.users
   SET email_confirmed_at = now()
 WHERE id = '43fbde7c-49b3-4286-90d1-a93d27f1b766'
   AND email_confirmed_at IS NULL;

SELECT registrar_migracion('confirmar_correo_incace.sql');
