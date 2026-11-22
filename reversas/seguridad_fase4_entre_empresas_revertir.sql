-- =====================================================================
-- REVERSA de sql/seguridad_fase4_entre_empresas.sql (SOLO si algo se rompe)
-- ---------------------------------------------------------------------
-- Quita las 22 envolturas (cada _impl_ vuelve a su nombre) y deja a las 22
-- y a las 13 internas EXACTAMENTE con los roles que podían ejecutarlas
-- antes de la fase 4 (respaldo: '<tipo>|<roles jsonb>|<proacl>'). Los
-- guardias _exigir_acceso_empresa / _exigir_mismo_usuario se quedan (no
-- estorban). REABRE la fuga entre empresas: anotar QUÉ se rompió y cerrar
-- bien lo que corresponda.
-- =====================================================================
BEGIN;

DO $$
DECLARE r record; v_tipo text; v_tenia jsonb; v_nombre text; v_args text; v_impl text; rol text;
BEGIN
  FOR r IN SELECT firma, acl FROM public.seguridad_acl_respaldo WHERE fase = 'fase4' LOOP
    v_tipo  := split_part(r.acl, '|', 1);
    v_tenia := split_part(r.acl, '|', 2)::jsonb;
    v_nombre := split_part(substr(r.firma, 8), '(', 1);          -- 'public.<nombre>(args)'
    v_args   := substr(r.firma, strpos(r.firma, '('));
    IF v_tipo = 'envuelta' THEN
      v_impl := '_impl_' || v_nombre;
      CONTINUE WHEN to_regprocedure('public.' || v_impl || v_args) IS NULL;   -- ya revertida
      EXECUTE format('DROP FUNCTION %s', r.firma);
      EXECUTE format('ALTER FUNCTION public.%I%s RENAME TO %I', v_impl, v_args, v_nombre);
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role, hermes_readonly', r.firma);
    FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role','hermes_readonly'] LOOP
      IF (v_tenia ->> rol)::boolean THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', r.firma, rol);
      END IF;
    END LOOP;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT public.registrar_migracion('seguridad_fase4_entre_empresas_revertir.sql');
