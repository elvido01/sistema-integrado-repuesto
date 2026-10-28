-- =====================================================================
-- SERVICIO GENERAL POR EMPRESA (28/10/2026)
-- ---------------------------------------------------------------------
-- El punto de venta de SERVICIOS e INMOBILIARIA factura por líneas libres
-- (servicio · descripción · referencia · monto), como la factura de Grupo
-- Ycast o las cotizaciones Magna de Morla. Cada línea necesita un producto
-- que la sostenga: si el usuario no elige uno de su catálogo, va contra el
-- "SERVICIO GENERAL" de su empresa (servicio profesional, ITBIS 18%, sin
-- inventario). Esta función lo crea la primera vez y lo devuelve siempre.
-- Idempotente.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.asegurar_servicio_general()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  p record;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión'; END IF;
  SELECT id, codigo, descripcion, itbis_pct, naturaleza, servicio_tipo INTO p
    FROM public.productos WHERE tenant_id = v_tenant AND codigo = 'SERV-GENERAL' LIMIT 1;
  IF p.id IS NULL THEN
    INSERT INTO public.productos (tenant_id, codigo, descripcion, precio, costo, itbis_pct, naturaleza, servicio_tipo, activo)
    VALUES (v_tenant, 'SERV-GENERAL', 'SERVICIO GENERAL', 0, 0, 0.18, 'servicio', 'profesional', true)
    RETURNING id, codigo, descripcion, itbis_pct, naturaleza, servicio_tipo INTO p;
  END IF;
  RETURN to_jsonb(p);
END $$;
REVOKE ALL ON FUNCTION public.asegurar_servicio_general() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asegurar_servicio_general() TO authenticated;

SELECT public.registrar_migracion('servicio_general_por_empresa.sql');
