-- =====================================================================
-- Que la pantalla pueda LEER la conversación con Hermes
-- ---------------------------------------------------------------------
-- (2026-08-08) Hermes contestaba y la respuesta se grababa, pero en MotoFlow
-- no aparecía nada: dos respuestas suyas llevaban media hora en la tabla
-- mientras la ventana seguía diciendo "pensando...".
--
-- Se insertó una fila de prueba con la pantalla abierta delante y tampoco
-- llegó. Probando con la llave anónima salió esto:
--
--   hermes_chat      -> ERROR: permission denied for function get_user_tenant
--   recibos_ingreso  -> ok
--
-- La policy de hermes_chat llama a get_user_tenant(), y si el rol que
-- consulta no puede EJECUTARLA, la lectura entera falla. No es que devuelva
-- cero filas: revienta. Y como Realtime aplica las mismas policies, tampoco
-- entregaba nada — un solo permiso explicaba los dos síntomas.
--
-- El GRANT ya estaba puesto en extension_empresa_activa.sql; algo lo dejó
-- fuera después. Se vuelve a poner aquí, que es donde se notó.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

GRANT EXECUTE ON FUNCTION public.get_user_tenant() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_tenant() TO anon;

-- La tabla se creó sin GRANTs propios: hasta ahora solo se escribía en ella
-- por hermes_escribir(), que es SECURITY DEFINER y no los necesita. Leerla
-- desde el navegador sí. La policy sigue acotando a la empresa de quien mira.
GRANT SELECT ON public.hermes_chat TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('hermes_chat_lectura.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- Quién puede ejecutar la función de la policy:
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_name = 'get_user_tenant'
ORDER BY grantee;
-- Deben aparecer authenticated y anon.

-- Y quién puede leer la tabla:
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'hermes_chat' AND privilege_type = 'SELECT'
ORDER BY grantee;
