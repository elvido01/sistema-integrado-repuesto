-- =====================================================================
-- Que Hermes sepa QUIÉN le está escribiendo
-- ---------------------------------------------------------------------
-- (2026-08-08) Desde MotoFlow le preguntaron "¿cuál es mi nombre?" y
-- contestó "Aún no tengo su nombre registrado". Por Telegram, la misma
-- pregunta, el mismo minuto: "Tu nombre es Elvido Caminero".
--
-- Es el Hermes de verdad — el mismo proceso, la misma memoria. Lo que pasa
-- es que no sabe con quién habla. Su adaptador identifica al remitente como
--
--     tenant:00000000-0000-0000-0000-000000000001
--
-- que es la EMPRESA, no una persona. Por Telegram el remitente es la cuenta
-- de Elvido y por eso lo reconoce; por aquí le llega un desconocido de
-- Repuestos Morla, y contesta como se le contesta a un desconocido.
--
-- La culpa es de esta función: la tabla guarda user_id desde el primer día y
-- chat_pendientes() nunca se lo pasó. Devolvía qué se dijo y desde qué
-- pantalla, pero no quién lo dijo.
--
-- >>> HAY QUE BORRARLA, NO REEMPLAZARLA <<<
-- CREATE OR REPLACE no admite cambiar lo que devuelve una función. Al
-- borrarla se van también sus permisos, así que el GRANT se rehace abajo.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

DROP FUNCTION IF EXISTS hermes.chat_pendientes(int);

CREATE FUNCTION hermes.chat_pendientes(p_limite int DEFAULT 10)
RETURNS TABLE (
  id         bigint,
  texto      text,
  pantalla   jsonb,
  creado_en  timestamptz,
  -- El identificador estable de la persona. Es el que sirve para amarrar
  -- esta conversación con la de Telegram: el nombre puede cambiar, este no.
  user_id    uuid,
  usuario    text,
  email      text,
  rol        text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id, c.texto, c.pantalla, c.creado_en,
         c.user_id,
         p.full_name,
         p.email,
         p.role
  FROM public.hermes_chat c
  -- LEFT: si algún día se escribe sin sesión, el mensaje debe llegar igual.
  -- Perder la pregunta por no saber quién la hizo sería peor.
  LEFT JOIN public.profiles p
         ON p.id = c.user_id
        AND p.tenant_id = c.tenant_id
  WHERE c.tenant_id = '00000000-0000-0000-0000-000000000001'
    AND c.rol = 'usuario'
    AND c.respondido = false
  ORDER BY c.creado_en
  LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 10), 50));
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hermes_readonly') THEN
    GRANT EXECUTE ON FUNCTION hermes.chat_pendientes(int) TO hermes_readonly;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('hermes_chat_quien_escribe.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- Debe traer usuario y email además del texto:
SELECT * FROM hermes.chat_pendientes();

-- Y quién ha escrito hasta ahora desde MotoFlow:
SELECT p.full_name, p.email, COUNT(*) AS mensajes
FROM public.hermes_chat c
LEFT JOIN public.profiles p ON p.id = c.user_id
WHERE c.rol = 'usuario'
GROUP BY 1, 2 ORDER BY 3 DESC;
