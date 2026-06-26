-- =====================================================================
-- REPORTES FINANCIERA (MotoPrestamos): Historico de Cliente + Lista de Chasis
-- ---------------------------------------------------------------------
-- 1) get_historico_cliente(cliente, desde, hasta): libro mayor (ledger) del
--    cliente con saldo corrido. Debitos = prestamos (PT-, total a pagar),
--    cargos (AB-), mora; Creditos = pagos. Reconcilia con el balance actual
--    de get_prestamos_cliente.
--      Nota: el interes va dentro del debito del prestamo (nuestro modelo lo
--      guarda por cuota, no como acumulacion diaria como el ADR viejo).
-- 2) get_lista_chasis_prestamos(estado, tipo, marca, modelo, anio, chasis):
--    prestamos con su chasis/vehiculo (marca/modelo/anio/tipo via solicitudes
--    de compra por chasis) + balance pendiente. Filtros y estatus.
-- Aislamiento por tenant (get_user_tenant + SECURITY DEFINER). Re-ejecutable.
-- =====================================================================

-- 1) HISTORICO DE CLIENTE (libro mayor) ------------------------------------
CREATE OR REPLACE FUNCTION public.get_historico_cliente(
  p_cliente_id uuid,
  p_desde      date DEFAULT NULL,
  p_hasta      date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant    uuid := public.get_user_tenant();
  v_desde     date := COALESCE(p_desde, '1900-01-01'::date);
  v_hasta     date := COALESCE(p_hasta, (now() AT TIME ZONE 'America/Santo_Domingo')::date);
  v_cli       record;
  v_mora_pend numeric := 0;
  v_saldo_ini numeric := 0;
  v_movs      json;
  v_ultimo    date;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'Cliente no encontrado en este tenant';
  END IF;

  SELECT codigo, nombre, rnc, direccion, telefono INTO v_cli
  FROM public.clientes WHERE id = p_cliente_id AND tenant_id = v_tenant;

  -- mora pendiente actual (al vuelo, respeta el cotejo del cliente)
  v_mora_pend := COALESCE((public.get_prestamos_cliente(p_cliente_id)->>'mora_pendiente')::numeric, 0);

  SELECT MAX(fecha) INTO v_ultimo
  FROM public.prestamo_pagos
  WHERE cliente_id = p_cliente_id AND tenant_id = v_tenant AND COALESCE(anulado,false) = false;

  WITH movs AS (
    -- Prestamos creados (debito = total a pagar = SUM monto_cuota)
    SELECT p.fecha_inicio AS fecha, 1 AS orden, p.numero AS transaccion, ''::text AS referencia,
      ('Préstamo' || CASE WHEN COALESCE(btrim(p.garantia),'') <> '' THEN ' · ' || p.garantia ELSE '' END) AS descripcion,
      COALESCE((SELECT SUM(q.monto_cuota) FROM public.prestamo_cuotas q
                 WHERE q.prestamo_id = p.id AND q.tenant_id = v_tenant), 0) AS debito,
      0::numeric AS credito,
      NULL::uuid AS ref_id
    FROM public.prestamos p
    WHERE p.tenant_id = v_tenant AND p.cliente_id = p_cliente_id

    UNION ALL
    -- Cargos manuales AB- (debito)
    SELECT cg.fecha, 2, cg.numero, COALESCE(cg.concepto,''),
      cg.tipo || CASE WHEN COALESCE(btrim(cg.descripcion),'') <> '' THEN ' · ' || cg.descripcion ELSE '' END,
      cg.monto, 0, NULL
    FROM public.prestamo_cargos cg
    WHERE cg.tenant_id = v_tenant AND cg.cliente_id = p_cliente_id AND COALESCE(cg.anulado,false) = false

    UNION ALL
    -- Mora cobrada en cada pago (debito = abono_mora; netea con el credito del pago)
    SELECT pp.fecha, 3, 'MR'::text, pp.numero,
      'Mora por atraso'::text, SUM(d.abono_mora), 0::numeric, NULL::uuid
    FROM public.prestamo_pagos pp
    JOIN public.prestamo_pago_detalle d ON d.pago_id = pp.id AND d.tenant_id = v_tenant
    WHERE pp.tenant_id = v_tenant AND pp.cliente_id = p_cliente_id AND COALESCE(pp.anulado,false) = false
    GROUP BY pp.id, pp.fecha, pp.numero
    HAVING SUM(d.abono_mora) > 0

    UNION ALL
    -- Pagos (credito = total_pagado). ref_id = pago para reimprimir el recibo.
    SELECT pp.fecha, 4, pp.numero, COALESCE(pp.cobrador,''),
      'Pago' || CASE WHEN COALESCE(btrim(pp.comentarios),'') <> '' THEN ' · ' || pp.comentarios ELSE '' END,
      0, pp.total_pagado, pp.id
    FROM public.prestamo_pagos pp
    WHERE pp.tenant_id = v_tenant AND pp.cliente_id = p_cliente_id AND COALESCE(pp.anulado,false) = false

    UNION ALL
    -- Mora pendiente al corte (debito) para que el balance cierre con el actual
    SELECT v_hasta, 5, 'MORA'::text, ''::text, 'Mora pendiente al corte'::text, v_mora_pend, 0::numeric, NULL::uuid
    WHERE v_mora_pend > 0
  )
  SELECT
    COALESCE(SUM(debito - credito) FILTER (WHERE fecha < v_desde), 0),
    COALESCE(json_agg(json_build_object(
        'fecha', fecha, 'transaccion', transaccion, 'referencia', referencia,
        'descripcion', descripcion, 'debito', debito, 'credito', credito, 'ref_id', ref_id
      ) ORDER BY fecha, orden) FILTER (WHERE fecha >= v_desde AND fecha <= v_hasta), '[]'::json)
  INTO v_saldo_ini, v_movs
  FROM movs;

  RETURN json_build_object(
    'cliente', json_build_object(
      'codigo', v_cli.codigo, 'nombre', v_cli.nombre, 'rnc', v_cli.rnc,
      'direccion', v_cli.direccion, 'telefono', v_cli.telefono),
    'desde', v_desde, 'hasta', v_hasta,
    'ultimo_pago', v_ultimo,
    'saldo_inicial', v_saldo_ini,
    'movimientos', v_movs
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_historico_cliente(uuid,date,date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_historico_cliente(uuid,date,date) TO authenticated, service_role;


-- 2) LISTA DE CHASIS RELACIONADOS CON PRESTAMOS ----------------------------
CREATE OR REPLACE FUNCTION public.get_lista_chasis_prestamos(
  p_estado text DEFAULT 'todos',   -- todos | pagados | pendientes
  p_tipo   text DEFAULT NULL,
  p_marca  text DEFAULT NULL,
  p_modelo text DEFAULT NULL,
  p_anio   int  DEFAULT NULL,
  p_chasis text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_estado text := COALESCE(NULLIF(btrim(p_estado),''), 'todos');
  v_tipo   text := NULLIF(btrim(p_tipo),'');
  v_marca  text := NULLIF(btrim(p_marca),'');
  v_modelo text := NULLIF(btrim(p_modelo),'');
  v_chasis text := NULLIF(btrim(p_chasis),'');
  v_result json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;

  SELECT COALESCE(json_agg(t ORDER BY t.fecha DESC, t.prestamo), '[]'::json) INTO v_result
  FROM (
    SELECT
      p.numero AS prestamo,
      p.fecha_inicio AS fecha,
      COALESCE((SELECT SUM(GREATEST(q.capital - q.capital_pagado, 0) + GREATEST(q.interes - q.interes_pagado, 0))
                 FROM public.prestamo_cuotas q WHERE q.prestamo_id = p.id AND q.tenant_id = v_tenant), 0) AS balance,
      c.codigo AS cliente,
      c.nombre AS nombre,
      COALESCE(p.garantia, '') AS chasis,
      COALESCE(v.condicion, '') AS tipo,
      COALESCE(v.marca, '') AS marca,
      COALESCE(v.modelo, '') AS modelo,
      v.anio AS anio,
      p.estado AS estado
    FROM public.prestamos p
    JOIN public.clientes c ON c.id = p.cliente_id AND c.tenant_id = v_tenant
    LEFT JOIN LATERAL (
      SELECT sol.condicion, sol.marca, sol.modelo, sol.anio
      FROM public.solicitudes_compras sol
      WHERE sol.tenant_id = v_tenant
        AND NULLIF(btrim(sol.chasis),'') IS NOT NULL
        AND NULLIF(btrim(sol.chasis),'') = NULLIF(btrim(p.garantia),'')
      ORDER BY sol.created_at DESC
      LIMIT 1
    ) v ON true
    WHERE p.tenant_id = v_tenant
      AND (v_estado = 'todos'
           OR (v_estado = 'pagados'    AND p.estado = 'saldado')
           OR (v_estado = 'pendientes' AND p.estado = 'activo'))
      AND (v_chasis IS NULL OR p.garantia ILIKE '%' || v_chasis || '%')
      AND (v_tipo   IS NULL OR v.condicion ILIKE '%' || v_tipo || '%')
      AND (v_marca  IS NULL OR v.marca ILIKE '%' || v_marca || '%')
      AND (v_modelo IS NULL OR v.modelo ILIKE '%' || v_modelo || '%')
      AND (p_anio   IS NULL OR v.anio = p_anio)
  ) t;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_lista_chasis_prestamos(text,text,text,text,int,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_lista_chasis_prestamos(text,text,text,text,int,text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'financiera_reportes: get_historico_cliente + get_lista_chasis_prestamos listos' AS status;
