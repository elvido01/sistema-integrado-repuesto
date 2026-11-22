-- =====================================================================
-- REVERSA de seguridad_fase3_anon.sql (SOLO si algo se rompe)
-- ---------------------------------------------------------------------
-- Repone los permisos exactos que respaldó la fase 3 (vistas y funciones),
-- quita security_invoker de las 8 vistas y devuelve el permiso por defecto
-- de anon en tablas nuevas. REABRE LA FUGA: usarla solo para salir de un
-- apuro, anotar QUÉ se rompió y cerrar bien lo que corresponda.
-- =====================================================================
BEGIN;

DO $$
DECLARE r record; v text;
BEGIN
  -- Funciones: anon/PUBLIC vuelven, y authenticated en las del vault.
  FOR r IN SELECT firma FROM public.seguridad_acl_respaldo WHERE fase = 'fase3' AND firma NOT LIKE 'vista:%' LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC, anon, authenticated', r.firma);
    EXCEPTION WHEN undefined_function THEN NULL;
    END;
  END LOOP;
  -- Vistas.
  FOR r IN SELECT substr(firma, 7) AS vista FROM public.seguridad_acl_respaldo WHERE fase = 'fase3' AND firma LIKE 'vista:%' LOOP
    EXECUTE format('ALTER VIEW %s RESET (security_invoker)', r.vista);
    EXECUTE format('GRANT ALL ON %s TO anon', r.vista);
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;

COMMIT;

SELECT public.registrar_migracion('seguridad_fase3_anon_revertir.sql');
