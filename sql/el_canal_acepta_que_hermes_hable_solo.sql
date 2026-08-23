-- =====================================================================
-- El canal no aceptaba que el mensaje viniera de nadie
-- ---------------------------------------------------------------------
-- (2026-08-23) `hermes_chat.source_surface` tiene la lista cerrada de por
-- donde entro un mensaje: web, mobile, whatsapp, telegram, api. Los cinco
-- son sitios donde hay una PERSONA escribiendo, porque hasta hoy no habia
-- otra forma de que apareciera una fila.
--
-- Los centinelas son la primera cosa que habla sin que nadie le hable, y
-- el CHECK la rechazo:
--
--   new row for relation "hermes_chat" violates check constraint
--   "hermes_chat_surface_chk"
--
-- >>> OTRA VEZ SALIO POR EJECUTARLO, NO POR LEERLO <<<
-- Es el mismo caso que `decision_pendiente_ult_compra.sql` de esta misma
-- manana: instalar la funcion no falla, falla el dia que se usa. Aqui se
-- uso enseguida y aparecio; si el primer aviso hubiera sido el de las
-- 8:30 de un cron, habria reventado dentro de pg_cron a solas y el canal
-- se habria quedado mudo sin que nadie lo supiera.
--
-- Se anaden dos origenes en vez de reciclar 'api', porque distinguir
-- "Hermes contesto" de "Hermes hablo solo" es justo lo que uno quiere
-- poder mirar despues.
--
-- Idempotente.
-- =====================================================================

ALTER TABLE public.hermes_chat
  DROP CONSTRAINT IF EXISTS hermes_chat_surface_chk;

ALTER TABLE public.hermes_chat
  ADD CONSTRAINT hermes_chat_surface_chk
  CHECK (source_surface IS NULL OR source_surface = ANY (ARRAY[
    'web'::text,
    'mobile'::text,
    'whatsapp'::text,
    'telegram'::text,
    'api'::text,
    -- Hermes empezando la conversacion el solo:
    'centinela'::text,   -- lo levanto un centinela del flujo
    'hermes_vps'::text   -- lo mando el gateway por su cuenta
  ]));

SELECT public.registrar_migracion('el_canal_acepta_que_hermes_hable_solo.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT (pg_get_constraintdef(oid) LIKE '%centinela%') AS acepta_centinela,
       (pg_get_constraintdef(oid) LIKE '%hermes_vps%') AS acepta_vps
FROM pg_constraint
WHERE conrelid = 'public.hermes_chat'::regclass
  AND conname = 'hermes_chat_surface_chk';
