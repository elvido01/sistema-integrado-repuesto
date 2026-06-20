-- =====================================================================
-- Cobranza: enviar la ficha del cliente (PDF) al "buscador"
-- ---------------------------------------------------------------------
-- Cuando se marca "Ir a buscar", la extension genera un PDF con los
-- datos del cliente (ficha dealer + deuda, SIN credito/facturacion) y
-- lo manda al WhatsApp de la persona encargada de localizar a la gente.
--
-- El telefono del buscador se configura por empresa en
-- Configuracion del Sistema.
-- =====================================================================

-- 1) Telefono del buscador por empresa
ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS cobranza_buscador_telefono text;

-- 2) RPC: ficha completa del cliente para el PDF (sin credito/facturacion)
CREATE OR REPLACE FUNCTION public.get_cliente_ficha(p_cliente_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   uuid;
  v_empresa  text;
  v_buscador text;
  v_cliente  json;
BEGIN
  v_tenant := public.get_user_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant del usuario';
  END IF;
  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'cliente_id es requerido';
  END IF;

  SELECT nombre, cobranza_buscador_telefono
    INTO v_empresa, v_buscador
  FROM public.config_empresa
  WHERE tenant_id = v_tenant
  LIMIT 1;

  SELECT json_build_object(
    'codigo',       c.codigo,
    'nombre',       c.nombre,
    'rnc',          c.rnc,
    'telefono',     c.telefono,
    'email',        c.email,
    'direccion',    c.direccion,
    'ficha_dealer', c.ficha_dealer
  )
    INTO v_cliente
  FROM public.clientes c
  WHERE c.id = p_cliente_id AND c.tenant_id = v_tenant;

  IF v_cliente IS NULL THEN
    RAISE EXCEPTION 'Cliente no encontrado en este tenant';
  END IF;

  RETURN json_build_object(
    'empresa_nombre',    COALESCE(v_empresa, 'la empresa'),
    'buscador_telefono', v_buscador,
    'cliente',           v_cliente
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_cliente_ficha(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_cliente_ficha(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_cliente_ficha(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'cobranza_buscador_telefono + get_cliente_ficha listos' AS status;
