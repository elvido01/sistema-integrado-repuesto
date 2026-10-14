-- =====================================================================
-- ELIMINAR EMPRESAS VACÍAS E INACTIVAS (más de 90 días) — solo superadmin
-- =====================================================================
-- (14/10/2026) Pedido del dueño: un botón en Admin para quitar empresas que
-- no se usan (registros de prueba, duplicados). Versión LIMITADA a propósito:
-- solo se borra una empresa VACÍA. Si tiene un solo usuario, cliente,
-- producto, factura o cualquier otro dato, no se puede borrar desde aquí.
--
-- Por qué tanto cuidado: hay dos empresas con el MISMO nombre ("Motoprestamos
-- los narajos y caminero motors"): una vacía y otra con 9,276 clientes. Todo
-- va por tenant_id y la base vuelve a comprobar al borrar; la pantalla no decide.
--
-- Se puede borrar si:
--   · se creó hace más de 90 días;
--   · no tiene suscripción vigente en los últimos 90 días;
--   · no tiene NINGUNA fila en sus tablas, fuera de lo que crea el registro
--     (configuración, almacén PRINCIPAL, suscripción de prueba, contadores,
--     reclamo de alta, empresa activa);
--   · no es la empresa del superadmin ni la que tiene activa.
--
-- admin_empresas_vacias()                → las que se pueden borrar hoy
-- admin_eliminar_empresa_vacia(id, 'ELIMINAR') → la borra y deja constancia
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.empresas_eliminadas (
  id            bigserial PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  nombre        text,
  rnc           text,
  creada        timestamptz,
  eliminada_at  timestamptz NOT NULL DEFAULT now(),
  eliminada_por uuid
);
ALTER TABLE public.empresas_eliminadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS empresas_eliminadas_superadmin ON public.empresas_eliminadas;
CREATE POLICY empresas_eliminadas_superadmin ON public.empresas_eliminadas
  FOR SELECT TO authenticated USING (public.is_superadmin());
REVOKE ALL ON public.empresas_eliminadas FROM anon;

-- Lo que crea el registro solo: no cuenta como "dato".
CREATE OR REPLACE FUNCTION public._tablas_de_arranque()
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$ SELECT ARRAY['config_empresa', 'almacenes', 'suscripciones', 'tenant_onboarding_claims',
                   'tenant_doc_counters', 'usuario_tenant_activo'] $$;

-- Filas de datos de una empresa (sin contar las de arranque). Para en la primera.
CREATE OR REPLACE FUNCTION public._empresa_tiene_datos(p_tenant uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE r record; v boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE tenant_id = p_tenant)
     OR EXISTS (SELECT 1 FROM public.usuarios_empresas WHERE tenant_id = p_tenant) THEN
    RETURN 'usuarios';
  END IF;
  FOR r IN
    SELECT c.table_schema s, c.table_name n
      FROM information_schema.columns c
      JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
                                       AND tb.table_type = 'BASE TABLE'
     WHERE c.column_name = 'tenant_id' AND c.table_schema IN ('public', 'private', 'hermes')
       AND c.table_name <> 'tenants' AND c.table_name <> ALL (public._tablas_de_arranque())
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I WHERE tenant_id = $1)', r.s, r.n) INTO v USING p_tenant;
    IF v THEN RETURN r.n; END IF;
  END LOOP;
  RETURN NULL;
END
$fn$;

CREATE OR REPLACE FUNCTION public.admin_empresas_vacias()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_res jsonb := '[]'::jsonb; t record;
BEGIN
  IF NOT public.is_superadmin() THEN RAISE EXCEPTION 'Solo el superadmin.'; END IF;
  FOR t IN
    SELECT x.id, x.nombre, x.rnc, x.created_at FROM public.tenants x
     WHERE x.created_at < now() - interval '90 days'
       AND NOT EXISTS (SELECT 1 FROM public.suscripciones s
                        WHERE s.tenant_id = x.id AND s.fecha_fin >= now() - interval '90 days')
       AND x.id <> public.get_user_tenant()
       AND x.id IS DISTINCT FROM (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid())
     ORDER BY x.created_at
  LOOP
    IF public._empresa_tiene_datos(t.id) IS NULL THEN
      v_res := v_res || jsonb_build_object('tenant_id', t.id, 'nombre', t.nombre, 'rnc', t.rnc, 'creada', t.created_at);
    END IF;
  END LOOP;
  RETURN v_res;
END
$fn$;

CREATE OR REPLACE FUNCTION public.admin_eliminar_empresa_vacia(p_tenant uuid, p_confirmacion text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE t record; v_datos text;
BEGIN
  IF NOT public.is_superadmin() THEN RAISE EXCEPTION 'Solo el superadmin.'; END IF;
  IF coalesce(p_confirmacion, '') <> 'ELIMINAR' THEN RAISE EXCEPTION 'Escribe ELIMINAR para confirmar.'; END IF;

  SELECT * INTO t FROM public.tenants WHERE id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La empresa no existe.'; END IF;
  IF p_tenant = public.get_user_tenant()
     OR p_tenant IS NOT DISTINCT FROM (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()) THEN
    RAISE EXCEPTION 'No puedes eliminar tu propia empresa ni la que tienes activa.';
  END IF;
  IF t.created_at >= now() - interval '90 days' THEN
    RAISE EXCEPTION 'La empresa tiene menos de 90 días.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.suscripciones s WHERE s.tenant_id = p_tenant AND s.fecha_fin >= now() - interval '90 days') THEN
    RAISE EXCEPTION 'La empresa tuvo suscripción en los últimos 90 días.';
  END IF;
  v_datos := public._empresa_tiene_datos(p_tenant);
  IF v_datos IS NOT NULL THEN
    RAISE EXCEPTION 'La empresa no está vacía (tiene datos en %). Desde aquí solo se borran empresas vacías.', v_datos;
  END IF;

  -- Solo quedan las filas de arranque
  DELETE FROM public.usuario_tenant_activo WHERE tenant_id = p_tenant;
  DELETE FROM public.tenant_doc_counters WHERE tenant_id = p_tenant;
  DELETE FROM private.tenant_onboarding_claims WHERE tenant_id = p_tenant;
  DELETE FROM public.suscripciones WHERE tenant_id = p_tenant;
  DELETE FROM public.almacenes WHERE tenant_id = p_tenant;
  DELETE FROM public.config_empresa WHERE tenant_id = p_tenant;
  DELETE FROM public.tenants WHERE id = p_tenant;

  INSERT INTO public.empresas_eliminadas (tenant_id, nombre, rnc, creada, eliminada_por)
  VALUES (t.id, t.nombre, t.rnc, t.created_at, auth.uid());

  RETURN jsonb_build_object('ok', true, 'nombre', t.nombre);
END
$fn$;

REVOKE ALL ON FUNCTION public._empresa_tiene_datos(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_empresas_vacias() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_eliminar_empresa_vacia(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_empresas_vacias() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_eliminar_empresa_vacia(uuid, text) TO authenticated;

COMMIT;

SELECT public.registrar_migracion('eliminar_empresas_vacias.sql');
