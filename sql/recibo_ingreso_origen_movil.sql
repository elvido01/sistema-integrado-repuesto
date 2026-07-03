-- =====================================================================
-- Recibos de Ingreso: marcar el ORIGEN (movil vs caja/web)
-- ---------------------------------------------------------------------
-- El Cierre de Caja separa "Ventas Contado Caja" vs "Cuenta Contado Movil"
-- usando notas='POS_MOVIL' en facturas. Los recibos de ingreso NO tenian
-- forma de distinguir el canal. Se agrega recibos_ingreso.origen:
--   'movil' -> creado desde la app movil (POS movil o cobro de prestamo)
--   NULL    -> caja/escritorio (web)
--
-- Se actualizan los DOS RPC que insertan recibos:
--   1) crear_recibo_ingreso_y_actualizar_facturas: toma origen de
--      p_recibo_data (la app movil manda 'movil'; la web no manda nada).
--   2) registrar_pago_prestamo_financiera_externa: cobro de prestamo desde
--      la app movil de Caminero -> origen SIEMPRE 'movil'.
-- =====================================================================

-- 1) Columna nueva
ALTER TABLE public.recibos_ingreso
  ADD COLUMN IF NOT EXISTS origen text;

COMMENT ON COLUMN public.recibos_ingreso.origen IS
  'Canal de creacion: "movil" (app movil) o NULL (caja/escritorio web).';

CREATE INDEX IF NOT EXISTS idx_recibos_ingreso_tenant_origen
  ON public.recibos_ingreso (tenant_id, origen);

-- Backfill: los recibos de cobro de prestamo (financiera externa) siempre son
-- moviles (los crea la app movil de Caminero). Marcamos los historicos para
-- que el Cierre de Caja los muestre como movil sin re-crearlos.
UPDATE public.recibos_ingreso
SET origen = 'movil'
WHERE origen IS NULL
  AND concepto = 'Pago de prestamo (financiera)';


-- 2) RPC POS: recibo + abonos (base = version con tenant_id + proteccion de
--    negativos). Se agrega el campo origen tomado de p_recibo_data.
CREATE OR REPLACE FUNCTION public.crear_recibo_ingreso_y_actualizar_facturas(p_recibo_data jsonb, p_abonos_data jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_recibo_id uuid;
    v_recibo_numero text;
    v_abono_detalle jsonb;
    v_factura_id uuid;
    v_monto_abonado numeric;
    v_monto_pendiente_actual numeric;
    v_cliente_id uuid;
    v_tenant_id uuid;
BEGIN
    v_cliente_id := (p_recibo_data->>'cliente_id')::uuid;
    v_tenant_id := COALESCE((p_recibo_data->>'tenant_id')::uuid, public.get_user_tenant());

    -- Generate receipt number
    v_recibo_numero := get_next_recibo_ingreso_numero();

    -- Insert receipt header (con origen: 'movil' desde la app, NULL desde la web)
    INSERT INTO public.recibos_ingreso (tenant_id, numero, cliente_id, fecha, monto_pagado, concepto, formas_pago, usuario_id, origen)
    VALUES (
        v_tenant_id,
        v_recibo_numero,
        v_cliente_id,
        (p_recibo_data->>'fecha')::date,
        (p_recibo_data->>'monto_pagado')::numeric,
        p_recibo_data->>'concepto',
        (p_recibo_data->>'formas_pago')::jsonb,
        auth.uid(),
        NULLIF(p_recibo_data->>'origen', '')
    ) RETURNING id INTO v_recibo_id;

    -- Iterate over payments and update invoices
    FOR v_abono_detalle IN SELECT * FROM jsonb_array_elements(p_abonos_data)
    LOOP
        v_factura_id := (v_abono_detalle->>'factura_id')::uuid;
        v_monto_abonado := (v_abono_detalle->>'monto_abono')::numeric;

        INSERT INTO public.recibos_ingreso_detalle (tenant_id, recibo_id, factura_id, monto_abonado)
        VALUES (v_tenant_id, v_recibo_id, v_factura_id, v_monto_abonado);

        UPDATE public.facturas
        SET monto_pendiente = GREATEST(0, monto_pendiente - v_monto_abonado)
        WHERE id = v_factura_id
          AND tenant_id = v_tenant_id
        RETURNING monto_pendiente INTO v_monto_pendiente_actual;

        IF v_monto_pendiente_actual <= 0.01 THEN
            UPDATE public.facturas
            SET estado = 'PAGADA', monto_pendiente = 0
            WHERE id = v_factura_id
              AND tenant_id = v_tenant_id;
        END IF;
    END LOOP;

    -- Update client balance
    UPDATE public.clientes
    SET balance = (
        SELECT COALESCE(SUM(monto_pendiente), 0)
        FROM public.facturas
        WHERE cliente_id = v_cliente_id
          AND estado = 'PENDIENTE'
          AND tenant_id = v_tenant_id
    )
    WHERE id = v_cliente_id
      AND tenant_id = v_tenant_id;

    RETURN v_recibo_numero;
END;
$function$;


-- 3) RPC cobro de prestamo (financiera externa, desde app movil de Caminero):
--    su recibo de ingreso siempre es 'movil'. Cuerpo identico al vigente,
--    solo se agrega origen='movil' al INSERT de recibos_ingreso.
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
    tenant_id, numero, cliente_id, fecha, monto_pagado, concepto, formas_pago, usuario_id, origen
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
    auth.uid(),
    'movil'
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

REVOKE EXECUTE ON FUNCTION public.registrar_pago_prestamo_financiera_externa(uuid,numeric,date,text,text,text,text,text,uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pago_prestamo_financiera_externa(uuid,numeric,date,text,text,text,text,text,uuid,uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'recibos_ingreso.origen + RPCs actualizados (POS movil + financiera externa)' AS status;
