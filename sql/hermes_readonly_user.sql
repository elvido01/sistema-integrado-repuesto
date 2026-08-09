-- Usuario SQL de solo lectura para el agente Hermes, limitado a Repuestos Morla.
-- Ejecutar manualmente en Supabase SQL Editor con un usuario admin/postgres.
--
-- =====================================================================
-- >>> ESTE ARCHIVO YA SE EJECUTÓ. NO VOLVER A CORRERLO. <<<
-- (2026-08-09)
--
-- El rol existe y está en uso: Hermes se conecta con él desde su PC y por
-- ahí pasan el canal de MotoFlow, el vault y las vistas del schema hermes.
-- Re-ejecutarlo hace dos daños:
--   1. Le CAMBIA la contraseña, y Hermes se queda sin conexión hasta que
--      alguien actualice MOTOFLOW_DB_URL en la otra máquina.
--   2. BORRA las vistas del schema hermes. Habría que volver a correr
--      hermes_readonly_vistas.sql, vault_agentes.sql, hermes_canal_motoflow.sql
--      y hermes_chat_marcar.sql para devolverle los permisos.
--
-- ¿Solo quieres cambiarle la clave? Una línea en el SQL Editor:
--     ALTER ROLE hermes_readonly WITH PASSWORD 'la nueva';
-- y después actualizar MOTOFLOW_DB_URL en la PC de Hermes.
--
-- >>> Y LA CLAVE NUNCA SE ESCRIBE AQUÍ. <<<
-- Este archivo va a GitHub. El marcador de abajo existe para eso: si se
-- reemplaza por una contraseña de verdad, queda publicada y en el historial
-- de git para siempre, donde borrarla ya no la borra.
-- =====================================================================
--
-- IMPORTANTE:
-- 1. Cambia v_password antes de ejecutar.
-- 2. El rol NO recibe SELECT directo sobre public.
-- 3. El rol lee desde el schema hermes, que contiene vistas filtradas por
--    tenant_id de Repuestos Morla.
-- 4. Si una tabla no tiene tenant_id, no se expone, excepto public.tenants
--    filtrada por id.

BEGIN;

DO $$
DECLARE
  v_role_name text := 'hermes_readonly';
  v_password_placeholder constant text := 'CAMBIAR_PASSWORD_LARGO_Y_UNICO_AQUI';
  v_password  text := 'CAMBIAR_PASSWORD_LARGO_Y_UNICO_AQUI';
BEGIN
  IF v_password = v_password_placeholder THEN
    RAISE EXCEPTION 'Cambia v_password antes de ejecutar este script.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = v_role_name
  ) THEN
    EXECUTE format(
      'CREATE ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT',
      v_role_name,
      v_password
    );
  ELSE
    EXECUTE format(
      'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT',
      v_role_name,
      v_password
    );
  END IF;

  EXECUTE format('ALTER ROLE %I SET default_transaction_read_only = on', v_role_name);
  EXECUTE format('ALTER ROLE %I SET statement_timeout = %L', v_role_name, '30s');
  EXECUTE format('ALTER ROLE %I SET search_path = %I, public', v_role_name, 'hermes');
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), v_role_name);
END $$;

-- Cierra cualquier permiso amplio de una ejecucion anterior del script.
REVOKE USAGE ON SCHEMA public FROM hermes_readonly;
REVOKE CREATE ON SCHEMA public FROM hermes_readonly;
REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM hermes_readonly;
REVOKE SELECT ON ALL SEQUENCES IN SCHEMA public FROM hermes_readonly;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON ALL TABLES IN SCHEMA public
FROM hermes_readonly;
REVOKE UPDATE
ON ALL SEQUENCES IN SCHEMA public
FROM hermes_readonly;

-- Elimina las policies amplias del script anterior, si existian.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'hermes_readonly_select',
      r.table_name
    );
  END LOOP;
END $$;

CREATE SCHEMA IF NOT EXISTS hermes;
REVOKE ALL ON SCHEMA hermes FROM PUBLIC;
GRANT USAGE ON SCHEMA hermes TO hermes_readonly;
REVOKE CREATE ON SCHEMA hermes FROM hermes_readonly;

-- Recrear las vistas para que el script sea re-ejecutable.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT table_name
    FROM information_schema.views
    WHERE table_schema = 'hermes'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS hermes.%I CASCADE', r.table_name);
  END LOOP;
END $$;

-- Crear una vista filtrada por tenant_id para cada tabla tenant-aware.
DO $$
DECLARE
  v_morla_tenant_id uuid;
  v_matches integer;
  r record;
BEGIN
  SELECT COUNT(*), (array_agg(ce.tenant_id ORDER BY ce.tenant_id::text))[1]
    INTO v_matches, v_morla_tenant_id
  FROM public.config_empresa ce
  WHERE ce.tenant_id IS NOT NULL
    AND ce.nombre ILIKE '%morla%';

  IF v_matches <> 1 OR v_morla_tenant_id IS NULL THEN
    RAISE EXCEPTION
      'No se pudo resolver Repuestos Morla de forma unica en config_empresa. Coincidencias: %',
      v_matches;
  END IF;

  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN information_schema.columns col
      ON col.table_schema = n.nspname
     AND col.table_name = c.relname
     AND col.column_name = 'tenant_id'
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
    ORDER BY c.relname
  LOOP
    EXECUTE format(
      'CREATE VIEW hermes.%I WITH (security_barrier = true) AS SELECT * FROM public.%I WHERE tenant_id = %L::uuid',
      r.table_name,
      r.table_name,
      v_morla_tenant_id
    );
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'tenants'
  ) THEN
    EXECUTE format(
      'CREATE VIEW hermes.tenants WITH (security_barrier = true) AS SELECT * FROM public.tenants WHERE id = %L::uuid',
      v_morla_tenant_id
    );
  END IF;
END $$;

GRANT SELECT ON ALL TABLES IN SCHEMA hermes TO hermes_readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA hermes
GRANT SELECT ON TABLES TO hermes_readonly;

COMMIT;

-- Verificacion rapida:
-- SET ROLE hermes_readonly;
-- SHOW search_path;
-- SELECT COUNT(*) FROM productos;
-- SELECT DISTINCT tenant_id FROM productos; -- debe devolver solo Repuestos Morla
-- RESET ROLE;
