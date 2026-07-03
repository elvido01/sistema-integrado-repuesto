-- =====================================================================
-- Caminero -> Recibo de Pago de financiera externa
-- ---------------------------------------------------------------------
-- Caminero Motors cobrara los prestamos de MotoPrestamos Los Naranjos
-- desde su app movil. MotoPrestamos no tendra usuarios en la app por ahora.
-- Estas RPC SECURITY DEFINER resuelven el tenant de MotoPrestamos por nombre
-- o por feat_financiera y devuelven/registran solo datos necesarios para el
-- recibo de pago. No crean recibos ni pagos en Caminero Motors.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._get_financiera_externa_tenant()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_fin uuid;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant';
  END IF;

  SELECT ce.tenant_id
    INTO v_fin
  FROM public.config_empresa ce
  CROSS JOIN LATERAL (
    SELECT lower(translate(
      COALESCE(ce.nombre, '') || ' ' || COALESCE(ce.razon_social, ''),
      'áàäâãéèëêíìïîóòöôõúùüûñÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑ',
      'aaaaaeeeeiiiiooooouuuunAAAAAEEEEIIIIOOOOOUUUUN'
    )) AS txt
  ) n
  WHERE ce.tenant_id IS NOT NULL
    AND ce.tenant_id <> v_tenant
    AND (
      n.txt LIKE '%naranjo%'
      OR n.txt LIKE '%motoprestamo%'
      OR n.txt LIKE '%moto prestamo%'
      OR COALESCE(ce.feat_financiera, false) = true
    )
  ORDER BY
    CASE WHEN n.txt LIKE '%naranjo%' THEN 0 ELSE 1 END,
    CASE WHEN n.txt LIKE '%motoprestamo%' OR n.txt LIKE '%moto prestamo%' THEN 0 ELSE 1 END,
    CASE WHEN COALESCE(ce.feat_financiera, false) THEN 0 ELSE 1 END,
    ce.nombre NULLS LAST
  LIMIT 1;

  IF v_fin IS NULL THEN
    RAISE EXCEPTION 'No se encontro el tenant de MotoPrestamos Los Naranjos';
  END IF;

  RETURN v_fin;
END;
$$;

CREATE OR REPLACE FUNCTION public.debug_financiera_externa_resumen()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_fin uuid;
  v_nombre text;
  v_clientes_total int := 0;
  v_clientes_activos int := 0;
  v_prestamos_activos int := 0;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant';
  END IF;

  v_fin := public._get_financiera_externa_tenant();

  SELECT COALESCE(ce.razon_social, ce.nombre, 'Financiera')
    INTO v_nombre
  FROM public.config_empresa ce
  WHERE ce.tenant_id = v_fin
  LIMIT 1;

  SELECT COUNT(*) INTO v_clientes_total
  FROM public.clientes c
  WHERE c.tenant_id = v_fin;

  SELECT COUNT(*) INTO v_clientes_activos
  FROM public.clientes c
  WHERE c.tenant_id = v_fin
    AND COALESCE(c.activo, true) = true;

  IF to_regclass('public.prestamos') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_prestamos_activos
    FROM public.prestamos p
    WHERE p.tenant_id = v_fin
      AND p.estado = 'activo';
  END IF;

  RETURN jsonb_build_object(
    'tenant_actual', v_tenant,
    'financiera_tenant_id', v_fin,
    'financiera_nombre', COALESCE(v_nombre, 'Financiera'),
    'clientes_total', v_clientes_total,
    'clientes_activos', v_clientes_activos,
    'prestamos_activos', v_prestamos_activos
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.buscar_clientes_financiera_externa(p_search text DEFAULT NULL)
RETURNS TABLE(id uuid, nombre text, codigo text, rnc text, telefono text, direccion text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fin uuid := public._get_financiera_externa_tenant();
  v_term text := '%' || COALESCE(NULLIF(btrim(p_search), ''), '') || '%';
BEGIN
  RETURN QUERY
  SELECT c.id, c.nombre::text, c.codigo::text, c.rnc::text, c.telefono::text, c.direccion::text
  FROM public.clientes c
  WHERE c.tenant_id = v_fin
    AND COALESCE(c.activo, true) = true
    AND (
      COALESCE(NULLIF(btrim(p_search), ''), '') = ''
      OR c.nombre ILIKE v_term
      OR c.codigo ILIKE v_term
      OR c.rnc ILIKE v_term
      OR c.telefono ILIKE v_term
    )
  ORDER BY c.nombre
  LIMIT 40;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_prestamos_cliente_financiera_externa(p_cliente_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_fin uuid := public._get_financiera_externa_tenant();
  v_result json;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND tenant_id = v_fin) THEN
    RAISE EXCEPTION 'Cliente no pertenece a la financiera externa';
  END IF;

  WITH cu AS (
    SELECT
      q.id, q.prestamo_id, p.numero AS prestamo_numero, q.numero_cuota, p.plazo_cuotas,
      p.fecha_inicio,
      q.fecha_vencimiento,
      q.capital, q.interes, q.monto_cuota,
      q.capital_pagado, q.interes_pagado, q.mora_pagada,
      GREATEST(q.capital - q.capital_pagado, 0) AS capital_pend,
      GREATEST(q.interes - q.interes_pagado, 0) AS interes_pend,
      GREATEST(0, (date_part('day', (now() AT TIME ZONE 'America/Santo_Domingo') - q.fecha_vencimiento) / 30)::int) AS meses_atraso,
      p.mora_pct
    FROM public.prestamo_cuotas q
    JOIN public.prestamos p ON p.id = q.prestamo_id AND p.tenant_id = v_fin
    WHERE q.tenant_id = v_fin
      AND p.cliente_id = p_cliente_id
      AND p.estado = 'activo'
      AND COALESCE(q.estado, 'pendiente') <> 'pagada'
  ),
  cu2 AS (
    SELECT *,
      GREATEST(round((capital_pend + interes_pend) * (mora_pct/100.0) * meses_atraso, 2) - mora_pagada, 0) AS mora_pend
    FROM cu
  )
  SELECT json_build_object(
    'capital_pendiente', COALESCE(SUM(capital_pend), 0),
    'intereses_pendientes', COALESCE(SUM(interes_pend), 0),
    'mora_pendiente', COALESCE(SUM(mora_pend), 0),
    'balance_total', COALESCE(SUM(capital_pend + interes_pend + mora_pend), 0),
    'cuotas', COALESCE(json_agg(json_build_object(
      'cuota_id', id,
      'prestamo_id', prestamo_id,
      'prestamo_numero', prestamo_numero,
      'referencia', lpad(numero_cuota::text,3,'0') || '/' || lpad(plazo_cuotas::text,3,'0'),
      'fecha', fecha_inicio,
      'fecha_vencimiento', fecha_vencimiento,
      'monto_cuota', monto_cuota,
      'capital_pend', capital_pend,
      'interes_pend', interes_pend,
      'mora_pend', mora_pend,
      'pendiente', capital_pend + interes_pend + mora_pend,
      'vencida', fecha_vencimiento < (now() AT TIME ZONE 'America/Santo_Domingo')::date
    ) ORDER BY fecha_vencimiento), '[]'::json)
  ) INTO v_result
  FROM cu2;

  RETURN v_result;
END;
$$;

DROP FUNCTION IF EXISTS public.registrar_pago_prestamo_financiera_externa(uuid,numeric,date,text,text,text,text,text,uuid);

CREATE OR REPLACE FUNCTION public.registrar_pago_prestamo_financiera_externa(
  p_cliente_id uuid,
  p_monto numeric,
  p_fecha date DEFAULT NULL,
  p_cobrador text DEFAULT NULL,
  p_forma_pago text DEFAULT 'Efectivo',
  p_cuenta text DEFAULT NULL,
  p_banco text DEFAULT NULL,
  p_comentarios text DEFAULT NULL,
  p_prestamo_id uuid DEFAULT NULL,
  p_cuota_ids uuid[] DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fin uuid := public._get_financiera_externa_tenant();
  v_tenant uuid := public.get_user_tenant();
  v_restante numeric := round(COALESCE(p_monto,0), 2);
  v_total numeric := round(COALESCE(p_monto,0), 2);
  v_bal_ant numeric;
  v_bal_act numeric;
  v_pago_id uuid;
  v_numero text;
  v_ticket_numero text;
  v_recibo_numero text;
  v_seq int;
  v_ticket_seq int;
  v_estado json;
  rec record;
  ab_mora numeric;
  ab_int numeric;
  ab_cap numeric;
BEGIN
  IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'cliente_id es requerido'; END IF;
  IF v_total <= 0 THEN RAISE EXCEPTION 'El monto a pagar debe ser mayor que cero'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND tenant_id = v_fin) THEN
    RAISE EXCEPTION 'Cliente no pertenece a la financiera externa';
  END IF;

  v_estado := public.get_prestamos_cliente_financiera_externa(p_cliente_id);
  v_bal_ant := COALESCE((v_estado->>'balance_total')::numeric, 0);

  SELECT COALESCE(MAX((regexp_replace(numero, '\D','','g'))::int), 0) + 1
    INTO v_seq
  FROM public.prestamo_pagos
  WHERE tenant_id = v_fin;
  v_numero := lpad(v_seq::text, 7, '0');

  SELECT COUNT(*)::int + 1
    INTO v_ticket_seq
  FROM public.prestamo_pagos pp
  WHERE pp.tenant_id = v_fin
    AND (
      (v_tenant IS NOT NULL AND pp.created_by IN (
        SELECT p.id FROM public.profiles p WHERE p.tenant_id = v_tenant
      ))
      OR (v_tenant IS NULL AND pp.created_by = auth.uid())
    );
  v_ticket_numero := lpad(v_ticket_seq::text, 4, '0');

  INSERT INTO public.prestamo_pagos (
    tenant_id, numero, cliente_id, fecha, cobrador, forma_pago, cuenta_numero, banco,
    total_pagado, balance_anterior, balance_actual, comentarios, created_by
  ) VALUES (
    v_fin, v_numero, p_cliente_id, COALESCE(p_fecha, current_date), p_cobrador,
    COALESCE(p_forma_pago,'Efectivo'), p_cuenta, p_banco, v_total, v_bal_ant, 0, p_comentarios, auth.uid()
  ) RETURNING id INTO v_pago_id;

  FOR rec IN
    SELECT (c->>'cuota_id')::uuid AS cuota_id,
           (c->>'mora_pend')::numeric AS mora_pend,
           (c->>'interes_pend')::numeric AS interes_pend,
           (c->>'capital_pend')::numeric AS capital_pend
    FROM json_array_elements(v_estado->'cuotas') c
    WHERE (p_prestamo_id IS NULL OR (c->>'prestamo_id')::uuid = p_prestamo_id)
      AND (p_cuota_ids IS NULL OR (c->>'cuota_id')::uuid = ANY(p_cuota_ids))
    ORDER BY (c->>'fecha_vencimiento')::date
  LOOP
    EXIT WHEN v_restante <= 0;

    ab_mora := LEAST(v_restante, rec.mora_pend);
    v_restante := round(v_restante - ab_mora, 2);
    ab_int := LEAST(v_restante, rec.interes_pend);
    v_restante := round(v_restante - ab_int, 2);
    ab_cap := LEAST(v_restante, rec.capital_pend);
    v_restante := round(v_restante - ab_cap, 2);

    IF (ab_mora + ab_int + ab_cap) > 0 THEN
      INSERT INTO public.prestamo_pago_detalle (
        tenant_id, pago_id, cuota_id, abono_capital, abono_interes, abono_mora, abono_total
      ) VALUES (
        v_fin, v_pago_id, rec.cuota_id, ab_cap, ab_int, ab_mora, ab_cap + ab_int + ab_mora
      );

      UPDATE public.prestamo_cuotas q
         SET capital_pagado = q.capital_pagado + ab_cap,
             interes_pagado = q.interes_pagado + ab_int,
             mora_pagada = q.mora_pagada + ab_mora,
             estado = CASE
                        WHEN (q.capital_pagado + ab_cap) >= q.capital
                         AND (q.interes_pagado + ab_int) >= q.interes THEN 'pagada'
                        ELSE 'parcial'
                      END
       WHERE q.id = rec.cuota_id AND q.tenant_id = v_fin;
    END IF;
  END LOOP;

  UPDATE public.prestamos p
     SET estado = 'saldado'
   WHERE p.tenant_id = v_fin
     AND p.cliente_id = p_cliente_id
     AND p.estado = 'activo'
     AND NOT EXISTS (
       SELECT 1 FROM public.prestamo_cuotas q
       WHERE q.prestamo_id = p.id AND COALESCE(q.estado, 'pendiente') <> 'pagada'
     );

  -- Un pago aceptado por la empresa libera automaticamente el estado SE BUSCA.
  UPDATE public.cobro_gestiones
     SET estado = 'cerrada',
         resultado = 'pago_recibido',
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'cerrado_por_pago', true,
           'pago_id', v_pago_id,
           'pago_numero', v_numero,
           'monto_pagado', v_total
         )
   WHERE tenant_id = v_fin
     AND cliente_id = p_cliente_id
     AND tipo = 'mandado_buscar'
     AND estado = 'mandado_buscar';

  SELECT 'RI-' || lpad((COALESCE(MAX((regexp_replace(numero, '\D','','g'))::int), 0) + 1)::text, 6, '0')
    INTO v_recibo_numero
  FROM public.recibos_ingreso
  WHERE tenant_id = v_fin;

  INSERT INTO public.recibos_ingreso (
    tenant_id, numero, cliente_id, fecha, monto_pagado, concepto, formas_pago, usuario_id
  ) VALUES (
    v_fin,
    v_recibo_numero,
    p_cliente_id,
    COALESCE(p_fecha, current_date),
    v_total,
    'Pago de prestamo (financiera)',
    jsonb_build_array(jsonb_build_object(
      'forma', COALESCE(p_forma_pago, 'Efectivo'),
      'monto', v_total,
      'referencia', COALESCE(NULLIF(btrim(p_cuenta), ''), v_numero)
    )),
    auth.uid()
  );

  v_bal_act := COALESCE((public.get_prestamos_cliente_financiera_externa(p_cliente_id)->>'balance_total')::numeric, 0);
  UPDATE public.prestamo_pagos SET balance_actual = v_bal_act WHERE id = v_pago_id;

  RETURN json_build_object(
    'pago_id', v_pago_id,
    'numero', COALESCE(v_ticket_numero, v_numero),
    'numero_interno', v_numero,
    'total_pagado', v_total,
    'sobrante', GREATEST(v_restante, 0),
    'balance_anterior', v_bal_ant,
    'balance_actual', v_bal_act
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public._get_financiera_externa_tenant() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.debug_financiera_externa_resumen() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.buscar_clientes_financiera_externa(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_prestamos_cliente_financiera_externa(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.registrar_pago_prestamo_financiera_externa(uuid,numeric,date,text,text,text,text,text,uuid,uuid[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public._get_financiera_externa_tenant() TO authenticated;
GRANT EXECUTE ON FUNCTION public.debug_financiera_externa_resumen() TO authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_clientes_financiera_externa(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_prestamos_cliente_financiera_externa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pago_prestamo_financiera_externa(uuid,numeric,date,text,text,text,text,text,uuid,uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'recibo de pago financiera externa para Caminero listo' AS status;
