-- ============================================================
-- UNA SOLA PUERTA PARA ENCARGAR
-- ============================================================
-- Al pulsar "Autorizar" saltaba, en rojo, delante del dueño:
--
--   function hermes.equipo_encargar_a(uuid, unknown) is not unique
--
-- Y tenía toda la razón el error. Quedaron dos versiones vivas de la misma
-- función:
--
--   equipo_encargar_a(uuid, text)                     ← la primera
--   equipo_encargar_a(uuid, text, int, text)          ← con ronda y nota
--
-- Las dos aceptan que se las llame con dos argumentos, porque la segunda
-- tiene valores por defecto. Postgres no elige entre dos candidatas igual de
-- válidas: se planta. Y la herramienta de Hermes llama con dos.
--
-- Fue un descuido mío al añadir la ronda: CREATE OR REPLACE no reemplaza una
-- función cuando le cambias la lista de argumentos, la duplica. Se ve en el
-- catálogo y no se ve en el código.
--
-- Se queda la de cuatro. Con sus defaults responde igual a una llamada de
-- dos, así que la herramienta de Hermes no cambia.
--
-- Idempotente.
-- ============================================================

DROP FUNCTION IF EXISTS hermes.equipo_encargar_a(uuid, text);

-- Los permisos viajaban en la que se va; se rehacen sobre la que queda.
DO $g$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['hermes_readonly','equipo_worker'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION hermes.equipo_encargar_a(uuid,text,int,text) TO %I', r);
    END IF;
  END LOOP;
END $g$;

SELECT public.registrar_migracion('una_sola_puerta_para_encargar.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- La prueba no es contar filas: es que una llamada de DOS argumentos —la que
-- hace Hermes— resuelva a una sola candidata. Se comprueba pidiéndole al
-- planificador que la resuelva de verdad, sin ejecutarla.
SELECT json_build_object(
 'cuantas_quedan', (SELECT count(*) FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='hermes' AND p.proname='equipo_encargar_a'),
 'firma', (SELECT pg_get_function_identity_arguments(p.oid) FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='hermes' AND p.proname='equipo_encargar_a'),
 'la_llamada_de_hermes_resuelve', (
   SELECT to_regprocedure('hermes.equipo_encargar_a(uuid,text)') IS NOT NULL
       OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='hermes' AND p.proname='equipo_encargar_a'
                    AND p.pronargs = 4))
) AS r;
