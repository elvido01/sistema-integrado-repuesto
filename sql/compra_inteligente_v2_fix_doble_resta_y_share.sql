-- ============================================================
-- Fix 2: presupuesto = 0 + distribucion por suplidor automatica
-- ============================================================
--
-- BUG 1: Doble resta de caja_minima
--   En modo auto, el RPC v2 llamaba a get_presupuesto_compras pasando
--   p_colchon = caja_minima, que YA restaba ese monto del legacy.
--   Despues v2 restaba caja_minima OTRA VEZ al calcular disponible.
--   Resultado: si caja_minima es alta, disponible queda en 0 siempre.
--
-- BUG 2: presupuesto = 0 inesperado
--   En "salud sana" el factor es 0.6. Si ventas_30d * 0.6 < caja_minima,
--   el legacy devolvia 0, y v2 mostraba 0 aunque hubiera capacidad.
--
-- FEATURE: Distribucion por suplidor segun movimiento
--   El presupuesto total se reparte segun el peso historico de compras
--   a cada suplidor (ultimos 90 dias). Si no hay historico para un
--   suplidor, recibe 0 hasta que registre su primera compra.
--   Override manual sigue funcionando via presupuesto_asignaciones_suplidor.
-- ============================================================

-- ============================================================
-- 1) FIX get_presupuesto_compras_v2: no restar caja_minima dos veces
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_presupuesto_compras_v2(
  p_tenant_id UUID DEFAULT NULL,
  p_mes       DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_tenant          UUID;
  v_config          public.presupuesto_config%ROWTYPE;
  v_monto_base      NUMERIC := 0;
  v_meses_desde     INT     := 0;
  v_comprado_mes    NUMERIC := 0;
  v_disponible      NUMERIC := 0;
  v_modo            TEXT;
  v_salud           TEXT;
  v_color           TEXT;
  v_legacy          JSON;
  v_caja            JSON;
  v_incr_max        NUMERIC := 0;
  v_incr_aplicado   NUMERIC := 0;
  v_factor_salud    NUMERIC := 1.0;
  v_ratio_cxp       NUMERIC := 0;
  v_v30             NUMERIC := 0;
  v_cxp             NUMERIC := 0;
BEGIN
  v_tenant := COALESCE(p_tenant_id, public.get_user_tenant());
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sin tenant';
  END IF;

  SELECT * INTO v_config
  FROM public.presupuesto_config
  WHERE tenant_id = v_tenant;

  IF v_config.monto_base_mensual IS NOT NULL AND v_config.monto_base_mensual > 0 THEN
    v_modo := 'manual';

    SELECT COALESCE(SUM(fd.cantidad * fd.precio), 0) INTO v_v30
    FROM public.facturas_detalle fd
    JOIN public.facturas f ON f.id = fd.factura_id
    WHERE f.tenant_id = v_tenant
      AND f.estado <> 'Anulada'
      AND f.fecha >= CURRENT_DATE - 30;

    SELECT COALESCE(SUM(monto_pendiente), 0) INTO v_cxp
    FROM public.compras
    WHERE tenant_id = v_tenant AND monto_pendiente > 0;

    v_ratio_cxp := CASE WHEN v_v30 > 0 THEN v_cxp / v_v30 ELSE 99 END;
    v_factor_salud := CASE
      WHEN v_ratio_cxp > 1.5 THEN 0.0
      WHEN v_ratio_cxp > 1.0 THEN 0.4
      WHEN v_ratio_cxp > 0.6 THEN 0.7
      ELSE 1.0
    END;

    v_incr_max      := COALESCE(v_config.incremento_mensual_pct, 0);
    v_incr_aplicado := v_incr_max * v_factor_salud;

    v_meses_desde := GREATEST(0,
      EXTRACT(YEAR  FROM AGE(p_mes, COALESCE(v_config.fecha_base, CURRENT_DATE)))::INT * 12 +
      EXTRACT(MONTH FROM AGE(p_mes, COALESCE(v_config.fecha_base, CURRENT_DATE)))::INT
    );

    v_monto_base := v_config.monto_base_mensual *
                    (1 + v_incr_aplicado / 100.0 * v_meses_desde);
  ELSE
    v_modo := 'auto';
    -- FIX: pasamos colchon=0 al legacy para evitar doble resta;
    -- v2 resta caja_minima una sola vez al final.
    v_legacy := public.get_presupuesto_compras(v_tenant, 30, 0);
    v_monto_base := (v_legacy->>'presupuesto_sugerido')::NUMERIC;
  END IF;

  -- compras.total_compra es la columna (no 'total')
  SELECT COALESCE(SUM(total_compra), 0) INTO v_comprado_mes
  FROM public.compras
  WHERE tenant_id = v_tenant
    AND fecha >= p_mes
    AND fecha < (p_mes + INTERVAL '1 month');

  v_disponible := GREATEST(0, v_monto_base - v_comprado_mes - COALESCE(v_config.caja_minima, 0));

  IF v_monto_base = 0 THEN
    v_color := 'gris'; v_salud := 'sin_datos';
  ELSIF v_disponible <= 0 THEN
    v_color := 'rojo'; v_salud := 'agotado';
  ELSIF v_disponible / v_monto_base < 0.25 THEN
    v_color := 'amarillo'; v_salud := 'limite_cerca';
  ELSE
    v_color := 'verde'; v_salud := 'sano';
  END IF;

  v_caja := public.get_caja_disponible(v_tenant, NOW());

  RETURN json_build_object(
    'mes',                p_mes,
    'modo',               v_modo,
    'monto_base_mensual', ROUND(v_monto_base, 2),
    'comprado_mes',       ROUND(v_comprado_mes, 2),
    'caja_minima',        COALESCE(v_config.caja_minima, 0),
    'disponible',         ROUND(v_disponible, 2),
    'incremento_pct',          v_incr_aplicado,
    'incremento_maximo_pct',   v_incr_max,
    'incremento_aplicado_pct', v_incr_aplicado,
    'factor_salud',            v_factor_salud,
    'ratio_cxp_ventas',        ROUND(v_ratio_cxp, 2),
    'meses_desde_base',        v_meses_desde,
    'control_estricto',        COALESCE(v_config.control_estricto, false),
    'workflow_aprobacion',     COALESCE(v_config.workflow_aprobacion, false),
    'limite_aprobacion',       COALESCE(v_config.limite_aprobacion_manual, 0),
    'distribuir_por',          COALESCE(v_config.distribuir_por, 'total'),
    'salud',                   v_salud,
    'color',                   v_color,
    'caja_disponible',         v_caja,
    'legacy_calculo',          v_legacy
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_presupuesto_compras_v2(UUID, DATE) TO authenticated, service_role;

-- ============================================================
-- 2) NUEVO RPC get_presupuesto_suplidor_auto
-- ============================================================
-- Distribuye el presupuesto total del mes entre suplidores segun
-- su peso historico de compras (ultimos 90 dias).
--
-- Si hay asignacion manual en presupuesto_asignaciones_suplidor,
-- esa gana. Si no, share_automatico = compras_suplidor_90d / total_compras_90d
--
-- Devuelve: presupuesto del suplidor, comprado este mes a el,
-- disponible para nuevas ordenes a ese suplidor.
CREATE OR REPLACE FUNCTION public.get_presupuesto_suplidor_auto(
  p_suplidor_id UUID,
  p_tenant_id   UUID DEFAULT NULL,
  p_mes         DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_tenant              UUID;
  v_total_compras_90d   NUMERIC := 0;
  v_compras_sup_90d     NUMERIC := 0;
  v_share               NUMERIC := 0;
  v_presup_total_json   JSON;
  v_presup_total        NUMERIC := 0;
  v_presup_suplidor     NUMERIC := 0;
  v_comprado_sup_mes    NUMERIC := 0;
  v_disponible_sup      NUMERIC := 0;
  v_asignado_manual     NUMERIC := NULL;
  v_modo_distribucion   TEXT;
  v_color               TEXT;
BEGIN
  v_tenant := COALESCE(p_tenant_id, public.get_user_tenant());
  IF v_tenant IS NULL OR p_suplidor_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id y suplidor_id son requeridos';
  END IF;

  -- 1. Presupuesto total del mes
  v_presup_total_json := public.get_presupuesto_compras_v2(v_tenant, p_mes);
  v_presup_total := (v_presup_total_json->>'monto_base_mensual')::NUMERIC;

  -- 2. Si hay asignacion manual, usarla
  SELECT monto_asignado INTO v_asignado_manual
  FROM public.presupuesto_asignaciones_suplidor
  WHERE tenant_id = v_tenant
    AND suplidor_id = p_suplidor_id
    AND mes = p_mes;

  IF v_asignado_manual IS NOT NULL THEN
    v_presup_suplidor := v_asignado_manual;
    v_modo_distribucion := 'manual';
  ELSE
    -- 3. Distribucion automatica por movimiento 90d
    SELECT COALESCE(SUM(total_compra), 0) INTO v_total_compras_90d
    FROM public.compras
    WHERE tenant_id = v_tenant
      AND fecha >= CURRENT_DATE - 90;

    SELECT COALESCE(SUM(total_compra), 0) INTO v_compras_sup_90d
    FROM public.compras
    WHERE tenant_id = v_tenant
      AND suplidor_id = p_suplidor_id
      AND fecha >= CURRENT_DATE - 90;

    v_share := CASE
      WHEN v_total_compras_90d > 0 THEN v_compras_sup_90d / v_total_compras_90d
      ELSE 0
    END;

    -- Si no hay historico, dar share minimo del 10% al menos para no
    -- bloquearse al primer pedido de un suplidor nuevo
    IF v_compras_sup_90d = 0 AND v_total_compras_90d > 0 THEN
      v_share := 0.10;
    END IF;

    v_presup_suplidor := v_presup_total * v_share;
    v_modo_distribucion := CASE WHEN v_compras_sup_90d > 0 THEN 'auto_movimiento' ELSE 'auto_minimo' END;
  END IF;

  -- 4. Comprado a este suplidor este mes
  SELECT COALESCE(SUM(total_compra), 0) INTO v_comprado_sup_mes
  FROM public.compras
  WHERE tenant_id = v_tenant
    AND suplidor_id = p_suplidor_id
    AND fecha >= p_mes
    AND fecha < p_mes + INTERVAL '1 month';

  v_disponible_sup := GREATEST(0, v_presup_suplidor - v_comprado_sup_mes);

  -- 5. Color del semaforo
  v_color := CASE
    WHEN v_presup_suplidor <= 0 THEN 'gris'
    WHEN v_disponible_sup <= 0 THEN 'rojo'
    WHEN v_disponible_sup / NULLIF(v_presup_suplidor, 0) < 0.25 THEN 'amarillo'
    ELSE 'verde'
  END;

  RETURN json_build_object(
    'suplidor_id',          p_suplidor_id,
    'mes',                  p_mes,
    'modo_distribucion',    v_modo_distribucion,
    'share_pct',            ROUND(v_share * 100, 2),
    'presupuesto_total',    ROUND(v_presup_total, 2),
    'presupuesto_suplidor', ROUND(v_presup_suplidor, 2),
    'comprado_suplidor',    ROUND(v_comprado_sup_mes, 2),
    'disponible_suplidor',  ROUND(v_disponible_sup, 2),
    'compras_90d_total',    ROUND(v_total_compras_90d, 2),
    'compras_90d_suplidor', ROUND(v_compras_sup_90d, 2),
    'color',                v_color,
    'presupuesto_total_json', v_presup_total_json
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_presupuesto_suplidor_auto(UUID, UUID, DATE) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'fix doble-resta + RPC suplidor_auto listos' AS status;
