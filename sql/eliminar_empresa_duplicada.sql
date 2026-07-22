-- =====================================================================
-- Eliminar empresa/tenant DUPLICADA y VACÍA
-- ---------------------------------------------------------------------
-- f1e5ed03-447c-4e6a-bf56-2113d774d747 = "Motoprestamos los narajos y
-- caminero motors" (duplicado vacío: 0 productos, 0 préstamos, 0 clientes,
-- 0 facturas, 0 usuarios).
--
-- Borra sus filas en TODA tabla de public que tenga columna tenant_id
-- (config incluida), en una sola transacción. Guarda de seguridad: aborta
-- si la empresa tuviera datos de negocio.
-- Correr en el editor SQL de Supabase.
-- =====================================================================

DO $$
DECLARE
  v_tenant uuid := 'f1e5ed03-447c-4e6a-bf56-2113d774d747';
  r record;
BEGIN
  -- 1) Seguridad: no borrar si tiene datos de negocio.
  IF (SELECT count(*) FROM public.prestamos WHERE tenant_id = v_tenant) > 0
     OR (SELECT count(*) FROM public.productos WHERE tenant_id = v_tenant) > 0
     OR (SELECT count(*) FROM public.clientes  WHERE tenant_id = v_tenant) > 0
     OR (SELECT count(*) FROM public.facturas  WHERE tenant_id = v_tenant) > 0
     OR (SELECT count(*) FROM public.profiles  WHERE tenant_id = v_tenant) > 0
  THEN
    RAISE EXCEPTION 'La empresa % tiene datos; abortando por seguridad.', v_tenant;
  END IF;

  -- 2) Borrar filas hijas (toda tabla con tenant_id), config_empresa al final.
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
      AND t.table_type = 'BASE TABLE'          -- excluye vistas (ej. ai_agent_metrics_daily)
      AND c.table_name <> 'config_empresa'
    ORDER BY c.table_name
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1', r.table_name) USING v_tenant;
  END LOOP;

  DELETE FROM public.config_empresa WHERE tenant_id = v_tenant;

  RAISE NOTICE 'Empresa % eliminada.', v_tenant;
END $$;

-- Verificación: no debe devolver ninguna fila.
SELECT tenant_id, nombre
FROM public.config_empresa
WHERE tenant_id = 'f1e5ed03-447c-4e6a-bf56-2113d774d747';
