-- ============================================================
-- Fix: incremento_mensual_pct = MAXIMO permitido, no rate fijo
-- ============================================================
-- Antes:
--   monto = monto_base * (1 + incremento_pct/100 * meses)
--   (siempre aplica el mismo % sin importar si la empresa va bien o mal)
--
-- Ahora:
--   factor_salud = f(ratio CxP / ventas_30d)
--     ratio <= 0.6: 1.0  (sana, aplica el MAX permitido)
--     ratio <= 1.0: 0.7  (ajustada, aplica 70% del max)
--     ratio <= 1.5: 0.4  (tension, aplica 40% del max)
--     ratio > 1.5:  0.0  (critica, no incrementa)
--   incremento_aplicado = incremento_max * factor_salud
--   monto = monto_base * (1 + incremento_aplicado/100 * meses)
--
-- El usuario configura el TECHO una sola vez. El sistema decide cuanto
-- aplicar segun el desempeño real del negocio.
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
  -- nuevos para incremento dinamico
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

  -- Cargar config
  SELECT * INTO v_config
  FROM public.presupuesto_config
  WHERE tenant_id = v_tenant;

  -- Calculo del incremento_aplicado segun salud de caja
  -- (solo importa en modo manual; en modo auto el legacy ya lo maneja)
  IF v_config.monto_base_mensual IS NOT NULL AND v_config.monto_base_mensual > 0 THEN
    v_modo := 'manual';

    -- Ventas ultimos 30 dias
    SELECT COALESCE(SUM(fd.cantidad * fd.precio), 0) INTO v_v30
    FROM public.facturas_detalle fd
    JOIN public.facturas f ON f.id = fd.factura_id
    WHERE f.tenant_id = v_tenant
      AND f.estado <> 'Anulada'
      AND f.fecha >= CURRENT_DATE - 30;

    -- CxP acumulada
    SELECT COALESCE(SUM(monto_pendiente), 0) INTO v_cxp
    FROM public.compras
    WHERE tenant_id = v_tenant AND monto_pendiente > 0;

    -- Ratio CxP/ventas determina el factor de salud
    v_ratio_cxp := CASE WHEN v_v30 > 0 THEN v_cxp / v_v30 ELSE 99 END;
    v_factor_salud := CASE
      WHEN v_ratio_cxp > 1.5 THEN 0.0    -- critica, no incrementa
      WHEN v_ratio_cxp > 1.0 THEN 0.4    -- tension, 40% del max
      WHEN v_ratio_cxp > 0.6 THEN 0.7    -- ajustada, 70%
      ELSE 1.0                            -- sana, aplica el MAX permitido
    END;

    v_incr_max      := COALESCE(v_config.incremento_mensual_pct, 0);
    v_incr_aplicado := v_incr_max * v_factor_salud;

    v_meses_desde := GREATEST(0,
      EXTRACT(YEAR  FROM AGE(p_mes, COALESCE(v_config.fecha_base, CURRENT_DATE)))::INT * 12 +
      EXTRACT(MONTH FROM AGE(p_mes, COALESCE(v_config.fecha_base, CURRENT_DATE)))::INT
    );

    -- Monto base se incrementa con el aplicado, no con el max
    v_monto_base := v_config.monto_base_mensual *
                    (1 + v_incr_aplicado / 100.0 * v_meses_desde);
  ELSE
    v_modo := 'auto';
    v_legacy := public.get_presupuesto_compras(v_tenant, 30, COALESCE(v_config.caja_minima, 0));
    v_monto_base := (v_legacy->>'presupuesto_sugerido')::NUMERIC;
  END IF;

  -- Comprado este mes
  SELECT COALESCE(SUM(total), 0) INTO v_comprado_mes
  FROM public.compras
  WHERE tenant_id = v_tenant
    AND fecha >= p_mes
    AND fecha < (p_mes + INTERVAL '1 month');

  v_disponible := GREATEST(0, v_monto_base - v_comprado_mes - COALESCE(v_config.caja_minima, 0));

  -- Semaforo final del disponible
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
    -- Diferencia clave: ahora distinguimos MAX vs APLICADO
    'incremento_pct',          v_incr_aplicado,     -- backward compat (el que se aplico)
    'incremento_maximo_pct',   v_incr_max,          -- techo que el user configuro
    'incremento_aplicado_pct', v_incr_aplicado,     -- el que realmente se uso
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

NOTIFY pgrst, 'reload schema';

SELECT 'incremento ahora es MAX + factor salud' AS status;
