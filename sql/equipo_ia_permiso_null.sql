-- =====================================================================
-- El permiso del Equipo IA devolvía NULL, y NULL no frena nada
-- ---------------------------------------------------------------------
-- (2026-08-13) Salió verificando que los cuatro SQL del motor estuvieran
-- aplicados: equipo_panel() contestó `permitido: true` a una llamada que
-- no tenía correo ninguno.
--
-- >>> QUÉ PASABA <<<
-- equipo_ia_permitido() termina en:
--
--     SELECT lower(...correo...) IN ('elvido...', 'admin...')
--
-- Si el correo es NULL, eso no da `false`: da NULL. Y todas las funciones
-- del módulo preguntan igual:
--
--     IF NOT public.equipo_ia_permitido() THEN ... RAISE ...
--
-- `NOT NULL` es NULL, y PL/pgSQL entra en el IF solo cuando la condición
-- es verdadera. Con NULL no entra: la comprobación se salta entera y la
-- función sigue como si el permiso estuviera dado.
--
-- >>> QUÉ TAN GRAVE ERA <<<
-- Menos de lo que suena, y conviene decirlo sin inflarlo:
--
--   · Las políticas RLS NO estaban afectadas. En una política, un USING
--     que da NULL oculta la fila — ahí NULL sí frena.
--   · Para llegar al hueco hace falta una sesión sin correo: la clave de
--     servicio (que ya se salta todo por definición) o un usuario sin
--     `email` en el token y sin fila en profiles.
--   · Y aun entrando, get_user_tenant() también da NULL, así que
--     equipo_panel() devolvía listas vacías y equipo_motor() moría en el
--     "Sin sesión" de la línea siguiente.
--
-- O sea: no hubo fuga de datos. Pero la puerta que se creía cerrada
-- estaba abierta y lo que frenaba era otra cosa, un poco más allá. Eso no
-- es un permiso, es suerte.
--
-- >>> EL ARREGLO <<<
-- Una palabra: COALESCE. Se arregla en la función y queda arreglado en
-- los ocho sitios que preguntan, sin tocarlos.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.equipo_ia_permitido()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Sin correo NO es "no se sabe": es que no. Un permiso que puede
  -- devolver NULL no es un permiso.
  SELECT COALESCE(
    lower(COALESCE(
      NULLIF(auth.jwt() ->> 'email', ''),
      (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
    )) IN ('elvidocaminero@gmail.com', 'admin@repuestosmorla.com'),
    false);
$$;

REVOKE ALL ON FUNCTION public.equipo_ia_permitido() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_ia_permitido() TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('equipo_ia_permiso_null.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ------------------------------------------------------------
-- QUE SE VEA EL ARREGLO
-- ------------------------------------------------------------
-- En el editor de SQL no hay sesión, así que esto tiene que dar `false`
-- las dos veces. Antes del arreglo, la primera daba NULL.
SELECT public.equipo_ia_permitido()              AS permitido,
       (NOT public.equipo_ia_permitido())        AS niega_de_verdad,
       (public.equipo_panel(1) ->> 'permitido')  AS panel_dice;
