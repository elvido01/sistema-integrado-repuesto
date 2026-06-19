-- ============================================================
-- Estado de cuenta del cliente (cobranza por WhatsApp)
-- ============================================================
-- Devuelve las cuotas ATRASADAS (facturas a credito vencidas con
-- saldo pendiente) de un cliente, mas el nombre de la empresa y la
-- plantilla de mensaje configurada. Pensada para que la extension de
-- WhatsApp Web arme un recordatorio de cobro.
--
-- Seguridad: SECURITY DEFINER pero resuelve el tenant del USUARIO
-- autenticado (get_user_tenant), por lo que solo ve clientes/facturas
-- de su propio tenant. No usa service_role.
--
-- Logica de "vencida" identica a ai_detect_facturas_vencidas:
--   monto_pendiente > 0
--   estado != 'Anulada'
--   dias_credito > 0
--   (fecha + dias_credito) < CURRENT_DATE
-- ============================================================

-- 1) Plantilla configurable por tenant (con placeholders)
ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS plantilla_cobro TEXT;

COMMENT ON COLUMN public.config_empresa.plantilla_cobro IS
  'Plantilla del recordatorio de cobro por WhatsApp. Placeholders: {NOMBRE} {EMPRESA} {N} {FACTURAS} {MONTO}.';

-- Plantilla por defecto (solo si esta vacia)
UPDATE public.config_empresa
SET plantilla_cobro =
  'Hola {NOMBRE}. El estado de su cuenta en {EMPRESA} es el siguiente: ' ||
  'cuotas atrasadas: {N} FACTURA: {FACTURAS}, MONTO ATRASADO: {MONTO} - ' ||
  'Favor pagar a mas tardar entre las proximas 48 horas y evitar cargos ' ||
  'adicionales, este es un mensaje automatico del sistema. Gracias.'
WHERE plantilla_cobro IS NULL OR btrim(plantilla_cobro) = '';


-- 2) RPC: estado de cuenta del cliente
CREATE OR REPLACE FUNCTION public.get_estado_cuenta_cliente(
  p_cliente_id UUID
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant        UUID;
  v_cliente       public.clientes%ROWTYPE;
  v_empresa_nom   TEXT;
  v_plantilla     TEXT;
  v_facturas      JSON;
  v_count         INT     := 0;
  v_total         NUMERIC := 0;
BEGIN
  v_tenant := public.get_user_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant del usuario';
  END IF;
  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'cliente_id es requerido';
  END IF;

  -- Cliente (debe pertenecer al mismo tenant)
  SELECT * INTO v_cliente
  FROM public.clientes
  WHERE id = p_cliente_id AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente no encontrado en este tenant';
  END IF;

  -- Datos de empresa + plantilla
  SELECT nombre, plantilla_cobro
    INTO v_empresa_nom, v_plantilla
  FROM public.config_empresa
  WHERE tenant_id = v_tenant
  LIMIT 1;

  -- Facturas vencidas con saldo (mismo criterio que ai_detect_facturas_vencidas)
  SELECT
    COALESCE(json_agg(x ORDER BY x.fecha_vence ASC), '[]'::json),
    COALESCE(COUNT(*), 0),
    COALESCE(SUM(x.monto_atrasado), 0)
  INTO v_facturas, v_count, v_total
  FROM (
    SELECT
      f.id                                                   AS factura_id,
      'FT-' || f.numero::text                                AS numero,
      f.ncf                                                  AS ncf,
      ROUND(COALESCE(f.monto_pendiente, 0), 2)              AS monto_atrasado,
      (f.fecha + (f.dias_credito || ' days')::INTERVAL)::DATE AS fecha_vence,
      (CURRENT_DATE - (f.fecha + (f.dias_credito || ' days')::INTERVAL)::DATE) AS dias_vencida
    FROM public.facturas f
    WHERE f.tenant_id = v_tenant
      AND f.cliente_id = p_cliente_id
      AND f.monto_pendiente > 0
      AND COALESCE(f.estado, '') <> 'Anulada'
      AND COALESCE(f.dias_credito, 0) > 0
      AND (f.fecha + (f.dias_credito || ' days')::INTERVAL)::DATE < CURRENT_DATE
  ) x;

  RETURN json_build_object(
    'cliente_id',        v_cliente.id,
    'cliente_nombre',    v_cliente.nombre,
    'cliente_telefono',  v_cliente.telefono,
    'empresa_nombre',    COALESCE(v_empresa_nom, 'la empresa'),
    'plantilla',         v_plantilla,
    'cuotas_atrasadas',  v_count,
    'total_atrasado',    ROUND(v_total, 2),
    'facturas',          v_facturas
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_estado_cuenta_cliente(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_estado_cuenta_cliente(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_estado_cuenta_cliente(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'get_estado_cuenta_cliente + config_empresa.plantilla_cobro listos' AS status;
