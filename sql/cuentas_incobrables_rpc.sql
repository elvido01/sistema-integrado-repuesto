-- =====================================================================
-- RPCs del módulo Cuentas Incobrables / Vehículos Robados
-- ---------------------------------------------------------------------
-- Requiere sql/cuentas_incobrables.sql (columnas de castigo).
--   get_cuentas_incobrables()          -> lista de castigadas + balance
--   castigar_prestamo(id, motivo)      -> mover a castigado (manual)
--   restaurar_prestamo(id)             -> devolver a activo (manual)
--   registrar_recuperacion(...)        -> cobro sobre una castigada
-- Todas SECURITY DEFINER, tenant por get_user_tenant().
-- =====================================================================

-- 1) LISTA -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cuentas_incobrables()
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_result json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;

  WITH castigadas AS (
    SELECT
      p.id AS prestamo_id, p.numero, p.cliente_id, p.garantia, p.tipo,
      p.motivo_castigo, p.fecha_castigo, p.monto_capital,
      c.nombre AS cliente_nombre, c.codigo AS cliente_codigo, c.rnc, c.telefono,
      COALESCE(SUM(GREATEST(q.capital - q.capital_pagado, 0)), 0) AS capital_pend,
      COALESCE(SUM(GREATEST(q.interes - q.interes_pagado, 0)), 0) AS interes_pend
    FROM public.prestamos p
    JOIN public.clientes c ON c.id = p.cliente_id AND c.tenant_id = v_tenant
    LEFT JOIN public.prestamo_cuotas q
      ON q.prestamo_id = p.id AND q.tenant_id = v_tenant
     AND COALESCE(q.estado, 'pendiente') <> 'pagada'
    WHERE p.tenant_id = v_tenant AND p.estado = 'castigado'
    GROUP BY p.id, p.numero, p.cliente_id, p.garantia, p.tipo, p.motivo_castigo,
             p.fecha_castigo, p.monto_capital, c.nombre, c.codigo, c.rnc, c.telefono
  )
  SELECT json_build_object(
    'total_cuentas', COALESCE(COUNT(*), 0),
    'total_capital', COALESCE(SUM(capital_pend), 0),
    'total_balance', COALESCE(SUM(capital_pend + interes_pend), 0),
    'por_motivo', COALESCE((
      SELECT json_object_agg(m, n) FROM (
        SELECT COALESCE(motivo_castigo, 'incobrable') AS m, COUNT(*) AS n
        FROM castigadas GROUP BY 1
      ) x
    ), '{}'::json),
    'cuentas', COALESCE(json_agg(json_build_object(
      'prestamo_id', prestamo_id, 'numero', numero, 'cliente_id', cliente_id,
      'cliente_nombre', cliente_nombre, 'cliente_codigo', cliente_codigo,
      'rnc', rnc, 'telefono', telefono, 'garantia', garantia, 'tipo', tipo,
      'motivo_castigo', COALESCE(motivo_castigo, 'incobrable'), 'fecha_castigo', fecha_castigo,
      'capital_pend', capital_pend, 'interes_pend', interes_pend,
      'balance', capital_pend + interes_pend
    ) ORDER BY cliente_nombre), '[]'::json)
  ) INTO v_result
  FROM castigadas;

  RETURN v_result;
END;
$$;

-- 2) CASTIGAR (manual) -------------------------------------------------
CREATE OR REPLACE FUNCTION public.castigar_prestamo(p_prestamo_id uuid, p_motivo text DEFAULT 'incobrable')
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_motivo text := CASE WHEN p_motivo IN ('incobrable','vehiculo_robado','perdida_total') THEN p_motivo ELSE 'incobrable' END;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  UPDATE public.prestamos
     SET estado = 'castigado', motivo_castigo = v_motivo,
         fecha_castigo = (now() AT TIME ZONE 'America/Santo_Domingo')::date,
         castigado_manual = true
   WHERE id = p_prestamo_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Préstamo no encontrado'; END IF;
  RETURN json_build_object('ok', true, 'motivo', v_motivo);
END;
$$;

-- 3) RESTAURAR (manual) -> activo --------------------------------------
CREATE OR REPLACE FUNCTION public.restaurar_prestamo(p_prestamo_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid := public.get_user_tenant();
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  UPDATE public.prestamos
     SET estado = 'activo', motivo_castigo = NULL, fecha_castigo = NULL,
         castigado_manual = true   -- queda pegado: la migración no lo vuelve a castigar
   WHERE id = p_prestamo_id AND tenant_id = v_tenant AND estado = 'castigado';
  IF NOT FOUND THEN RAISE EXCEPTION 'Préstamo castigado no encontrado'; END IF;
  RETURN json_build_object('ok', true);
END;
$$;

-- 4) RECUPERACIÓN: cobro sobre una castigada ---------------------------
CREATE OR REPLACE FUNCTION public.registrar_recuperacion(
  p_prestamo_id uuid,
  p_monto       numeric,
  p_fecha       date DEFAULT NULL,
  p_cobrador    text DEFAULT NULL,
  p_forma_pago  text DEFAULT 'Efectivo',
  p_comentarios text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_asof     date := COALESCE(p_fecha, (now() AT TIME ZONE 'America/Santo_Domingo')::date);
  v_restante numeric := round(COALESCE(p_monto,0), 2);
  v_total    numeric := round(COALESCE(p_monto,0), 2);
  v_cliente  uuid;
  v_pago_id  uuid;
  v_numero   text;
  v_seq      int;
  rec        record;
  ab_int     numeric;
  ab_cap     numeric;
  v_quedan   int;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF v_total <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor que cero'; END IF;

  SELECT cliente_id INTO v_cliente FROM public.prestamos
   WHERE id = p_prestamo_id AND tenant_id = v_tenant AND estado = 'castigado';
  IF v_cliente IS NULL THEN RAISE EXCEPTION 'Préstamo castigado no encontrado'; END IF;

  SELECT COALESCE(MAX((regexp_replace(numero, '\D','','g'))::int), 0) + 1
    INTO v_seq FROM public.prestamo_pagos WHERE tenant_id = v_tenant;
  v_numero := lpad(v_seq::text, 7, '0');

  INSERT INTO public.prestamo_pagos (
    tenant_id, numero, cliente_id, fecha, cobrador, forma_pago,
    total_pagado, balance_anterior, balance_actual, comentarios
  ) VALUES (
    v_tenant, v_numero, v_cliente, v_asof, p_cobrador, COALESCE(p_forma_pago,'Efectivo'),
    v_total, 0, 0, COALESCE(p_comentarios, 'Recuperación cuenta incobrable')
  ) RETURNING id INTO v_pago_id;

  -- Reparte interés -> capital, cuota más vieja primero (sin mora en castigadas).
  FOR rec IN
    SELECT q.id, GREATEST(q.interes - q.interes_pagado, 0) AS int_pend,
           GREATEST(q.capital - q.capital_pagado, 0) AS cap_pend
    FROM public.prestamo_cuotas q
    WHERE q.prestamo_id = p_prestamo_id AND q.tenant_id = v_tenant
      AND COALESCE(q.estado, 'pendiente') <> 'pagada'
    ORDER BY q.fecha_vencimiento
  LOOP
    EXIT WHEN v_restante <= 0;
    ab_int := LEAST(v_restante, rec.int_pend); v_restante := round(v_restante - ab_int, 2);
    ab_cap := LEAST(v_restante, rec.cap_pend); v_restante := round(v_restante - ab_cap, 2);
    IF (ab_int + ab_cap) > 0 THEN
      INSERT INTO public.prestamo_pago_detalle (tenant_id, pago_id, cuota_id, abono_capital, abono_interes, abono_mora, abono_total)
      VALUES (v_tenant, v_pago_id, rec.id, ab_cap, ab_int, 0, ab_cap + ab_int);
      UPDATE public.prestamo_cuotas q
         SET capital_pagado = q.capital_pagado + ab_cap,
             interes_pagado = q.interes_pagado + ab_int,
             estado = CASE WHEN (q.capital_pagado + ab_cap) >= q.capital
                            AND (q.interes_pagado + ab_int) >= q.interes THEN 'pagada' ELSE 'parcial' END
       WHERE q.id = rec.id AND q.tenant_id = v_tenant;
    END IF;
  END LOOP;

  -- Recibo de ingreso (caja)
  INSERT INTO public.recibos_ingreso (tenant_id, numero, cliente_id, fecha, monto_pagado, concepto, formas_pago, usuario_id)
  VALUES (
    v_tenant, public.get_next_recibo_ingreso_numero(), v_cliente, v_asof, v_total,
    'Recuperación cuenta incobrable',
    jsonb_build_array(jsonb_build_object('forma', COALESCE(p_forma_pago,'Efectivo'), 'monto', v_total)),
    auth.uid()
  );

  -- Si ya no queda nada pendiente -> saldada (sale del módulo). Se conserva
  -- motivo/fecha de castigo y castigado_manual para historial.
  SELECT COUNT(*) INTO v_quedan FROM public.prestamo_cuotas q
   WHERE q.prestamo_id = p_prestamo_id AND q.tenant_id = v_tenant AND COALESCE(q.estado,'pendiente') <> 'pagada';
  IF v_quedan = 0 THEN
    UPDATE public.prestamos SET estado = 'saldado' WHERE id = p_prestamo_id AND tenant_id = v_tenant;
  END IF;

  UPDATE public.prestamo_pagos SET balance_actual = v_total - GREATEST(v_restante,0) WHERE id = v_pago_id;

  RETURN json_build_object('ok', true, 'numero', v_numero, 'aplicado', v_total - GREATEST(v_restante,0),
    'sobrante', GREATEST(v_restante,0), 'saldado', (v_quedan = 0));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_cuentas_incobrables() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.castigar_prestamo(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.restaurar_prestamo(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.registrar_recuperacion(uuid,numeric,date,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cuentas_incobrables() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.castigar_prestamo(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restaurar_prestamo(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_recuperacion(uuid,numeric,date,text,text,text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'RPCs cuentas incobrables listas' AS status;
