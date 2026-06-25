-- =====================================================================
-- Cotejo "Generar Cargos por Atrasos (MORA)?" por cliente
-- ---------------------------------------------------------------------
-- Como el sistema viejo (ADR): un check por cliente que aplica/quita la
-- mora en cualquier momento. La mora se calcula al vuelo en
-- get_prestamos_cliente, asi que con prender/apagar el cotejo (y recargar
-- el Recibo de Pago) la mora aparece o desaparece al instante.
-- Re-ejecutable.
-- =====================================================================

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS generar_mora boolean NOT NULL DEFAULT true;

-- get_prestamos_cliente: la mora pendiente se anula si el cliente tiene
-- generar_mora = false (cotejo apagado).
CREATE OR REPLACE FUNCTION public.get_prestamos_cliente(p_cliente_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_genmora  boolean := true;
  v_cli_mora numeric := 0;
  v_result   json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;

  -- La mora se rige por el CLIENTE (cotejo + tasa), aplicada al vuelo. Asi el
  -- switch y el % del catalogo / del Recibo de Pago mandan en tiempo real.
  SELECT COALESCE(generar_mora, true), COALESCE(mora_pct, 0)
    INTO v_genmora, v_cli_mora
  FROM public.clientes WHERE id = p_cliente_id AND tenant_id = v_tenant;
  v_genmora  := COALESCE(v_genmora, true);
  v_cli_mora := COALESCE(v_cli_mora, 0);

  WITH cu AS (
    SELECT
      q.id, q.prestamo_id, p.numero AS prestamo_numero, q.numero_cuota, p.plazo_cuotas,
      p.fecha_inicio,
      q.fecha_vencimiento,
      q.capital, q.interes, q.monto_cuota,
      q.capital_pagado, q.interes_pagado, q.mora_pagada,
      GREATEST(q.capital  - q.capital_pagado, 0) AS capital_pend,
      GREATEST(q.interes  - q.interes_pagado, 0) AS interes_pend,
      GREATEST(0, (date_part('day', (now() AT TIME ZONE 'America/Santo_Domingo') - q.fecha_vencimiento) / 30)::int) AS meses_atraso,
      p.mora_pct
    FROM public.prestamo_cuotas q
    JOIN public.prestamos p ON p.id = q.prestamo_id AND p.tenant_id = v_tenant
    WHERE q.tenant_id = v_tenant
      AND p.cliente_id = p_cliente_id
      AND p.estado = 'activo'
      AND q.estado <> 'pagada'
  ),
  cu2 AS (
    SELECT *,
      -- Tasa efectiva: la del cliente si la tiene; si no, la del prestamo.
      CASE WHEN v_genmora THEN
        GREATEST(
          round((capital_pend + interes_pend)
                * ((CASE WHEN v_cli_mora > 0 THEN v_cli_mora ELSE mora_pct END)/100.0)
                * meses_atraso, 2) - mora_pagada,
          0
        )
      ELSE 0 END AS mora_pend
    FROM cu
  )
  SELECT json_build_object(
    'capital_pendiente',    COALESCE(SUM(capital_pend), 0),
    'intereses_pendientes', COALESCE(SUM(interes_pend), 0),
    'mora_pendiente',       COALESCE(SUM(mora_pend), 0),
    'balance_total',        COALESCE(SUM(capital_pend + interes_pend + mora_pend), 0),
    'cuotas', COALESCE(json_agg(json_build_object(
      'cuota_id',          id,
      'prestamo_id',       prestamo_id,
      'prestamo_numero',   prestamo_numero,
      'referencia',        lpad(numero_cuota::text,3,'0') || '/' || lpad(plazo_cuotas::text,3,'0'),
      'fecha',             fecha_inicio,
      'fecha_vencimiento', fecha_vencimiento,
      'monto_cuota',       monto_cuota,
      'capital_pend',      capital_pend,
      'interes_pend',      interes_pend,
      'mora_pend',         mora_pend,
      'pendiente',         (capital_pend + interes_pend + mora_pend),
      'vencida',           (fecha_vencimiento < (now() AT TIME ZONE 'America/Santo_Domingo')::date)
    ) ORDER BY fecha_vencimiento), '[]'::json)
  ) INTO v_result
  FROM cu2;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_prestamos_cliente(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_prestamos_cliente(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'clientes.generar_mora + get_prestamos_cliente con gate de mora listos' AS status;
