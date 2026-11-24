-- ============================================================
-- presupuesto_compras_cuenta_la_hermana.sql (24/11/2026)
-- ------------------------------------------------------------
-- Decisión del dueño: el dinero que vende REPUESTOS MORLA #1 cuenta para lo
-- que REPUESTOS MORLA puede comprar (Morla compra por las dos:
-- compras_cuentan_ventas_de_la_hermana.sql).
--
-- Solo cambian las VENTAS del cálculo (ventas_recientes en v1, v_v30 en v2),
-- y solo para la empresa con config_empresa.compra_por_hermana (Morla). La CxP
-- sigue siendo la de Morla (Morla #1 no compra) y la CxC la de cada una.
--
-- OJO (revisión): Morla tiene el presupuesto MANUAL (monto_base_mensual), así
-- que hoy esto solo mueve el presupuesto automático (v1) y la razón CxP/ventas
-- que decide el incremento mensual. El "disponible" de Morla no cambia
-- mientras la base sea manual. El presupuesto por suplidor en modelo
-- 'recuperacion' sale de los pagos, no de las ventas.
--
-- Anuladas: las facturas guardan 'ANULADA' (mayúsculas); el filtro viejo
-- 'Anulada' no excluía nada. Corregido aquí.
-- Resto = definición de producción de hoy. Se editan los _impl_.
-- ============================================================

-- La empresa y, si compra por su hermana, la hermana. Si por error las dos
-- tuvieran compra_por_hermana, ninguna suma la otra (no se cuenta doble).
CREATE OR REPLACE FUNCTION public._empresas_que_venden_para(p_tenant uuid)
RETURNS uuid[]
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $f$
  SELECT ARRAY[p_tenant] || COALESCE((
    SELECT ARRAY[c.inventario_compartido_con] FROM public.config_empresa c
     WHERE c.tenant_id = p_tenant AND c.compra_por_hermana AND c.inventario_compartido_con IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.config_empresa h
                        WHERE h.tenant_id = c.inventario_compartido_con AND h.compra_por_hermana)
  ), '{}'::uuid[]);
$f$;
REVOKE ALL ON FUNCTION public._empresas_que_venden_para(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._empresas_que_venden_para(uuid) TO service_role;

-- Lo mismo para las piezas gemelas de la orden de compra.
CREATE OR REPLACE FUNCTION public._producto_y_gemelos(p_producto uuid)
RETURNS uuid[]
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $f$
  SELECT ARRAY[p_producto] || CASE
    WHEN EXISTS (SELECT 1 FROM public.productos pr
                   JOIN public.config_empresa c ON c.tenant_id = pr.tenant_id
                  WHERE pr.id = p_producto AND c.compra_por_hermana
                    AND NOT EXISTS (SELECT 1 FROM public.config_empresa h
                                     WHERE h.tenant_id = c.inventario_compartido_con AND h.compra_por_hermana))
    THEN COALESCE(ARRAY(SELECT e.par_id FROM public.productos_espejo e WHERE e.producto_id = p_producto), '{}'::uuid[])
    ELSE '{}'::uuid[] END;
$f$;
REVOKE ALL ON FUNCTION public._producto_y_gemelos(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._producto_y_gemelos(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public._impl_get_presupuesto_compras(p_tenant_id uuid, p_dias integer DEFAULT 15, p_colchon numeric DEFAULT 0)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresas uuid[];
  v_caller_tenant    UUID;
  v_ventas_recientes NUMERIC := 0;
  v_cxc_pendiente    NUMERIC := 0;
  v_cxp_pendiente    NUMERIC := 0;
  v_ratio            NUMERIC := 0;
  v_salud            TEXT;
  v_factor           NUMERIC;
  v_presupuesto      NUMERIC := 0;
BEGIN
  v_caller_tenant := public.get_user_tenant();
  IF v_caller_tenant IS NOT NULL AND v_caller_tenant <> p_tenant_id THEN
    RAISE EXCEPTION 'Acceso denegado: p_tenant_id (%) no coincide con tenant del usuario (%)',
      p_tenant_id, v_caller_tenant USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (24/11/2026) + lo que vende la empresa hermana si esta compra por ella.
  v_empresas := public._empresas_que_venden_para(p_tenant_id);

  SELECT COALESCE(SUM(fd.cantidad * fd.precio), 0) INTO v_ventas_recientes
  FROM public.facturas_detalle fd
  JOIN public.facturas f ON f.id = fd.factura_id
  WHERE f.tenant_id = ANY(v_empresas)
    AND upper(COALESCE(f.estado, '')) <> 'ANULADA'
    AND f.fecha >= CURRENT_DATE - p_dias;

  SELECT COALESCE(SUM(monto_pendiente), 0) INTO v_cxc_pendiente
  FROM public.facturas
  WHERE tenant_id = p_tenant_id AND estado <> 'Anulada' AND monto_pendiente > 0;

  SELECT COALESCE(SUM(monto_pendiente), 0) INTO v_cxp_pendiente
  FROM public.compras
  WHERE tenant_id = p_tenant_id AND monto_pendiente > 0;

  v_ratio := CASE WHEN v_ventas_recientes > 0 THEN v_cxp_pendiente / v_ventas_recientes ELSE 99 END;
  IF v_ratio > 1 THEN
    v_salud := 'tension';  v_factor := 0.30;
  ELSIF v_ratio > 0.6 THEN
    v_salud := 'ajustada'; v_factor := 0.45;
  ELSE
    v_salud := 'sana';     v_factor := 0.60;
  END IF;

  v_presupuesto := GREATEST(0, ROUND(v_ventas_recientes * v_factor - p_colchon, 2));

  RETURN json_build_object(
    'presupuesto_sugerido', v_presupuesto,
    'ventas_recientes',     ROUND(v_ventas_recientes, 2),
    -- La CxC y la CxP son solo de esta empresa.
    'ventas_incluyen_hermana', COALESCE(array_length(v_empresas, 1), 1) > 1,
    'cxc_pendiente',        ROUND(v_cxc_pendiente, 2),
    'cxp_pendiente',        ROUND(v_cxp_pendiente, 2),
    'factor_reinversion',   v_factor,
    'colchon',              ROUND(p_colchon, 2),
    'dias',                 p_dias,
    'salud_caja',           v_salud
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public._impl_get_presupuesto_compras_v2(p_tenant_id uuid DEFAULT NULL::uuid, p_mes date DEFAULT (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))::date)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant UUID; v_config public.presupuesto_config%ROWTYPE;
  v_monto_base NUMERIC := 0; v_meses_desde INT := 0;
  v_comprado_mes NUMERIC := 0; v_disponible NUMERIC := 0;
  v_modo TEXT; v_salud TEXT; v_color TEXT;
  v_legacy JSON; v_caja JSON;
  v_incr_max NUMERIC := 0; v_incr_aplicado NUMERIC := 0;
  v_factor_salud NUMERIC := 1.0; v_ratio_cxp NUMERIC := 0;
  v_v30 NUMERIC := 0; v_cxp NUMERIC := 0;
  v_empresas uuid[];
BEGIN
  v_tenant := COALESCE(p_tenant_id, public.get_user_tenant());
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin tenant'; END IF;
  SELECT * INTO v_config FROM public.presupuesto_config WHERE tenant_id = v_tenant;
  IF v_config.monto_base_mensual IS NOT NULL AND v_config.monto_base_mensual > 0 THEN
    v_modo := 'manual';
    -- (24/11/2026) + lo que vende la empresa hermana si esta compra por ella.
    v_empresas := public._empresas_que_venden_para(v_tenant);
    SELECT COALESCE(SUM(fd.cantidad * fd.precio), 0) INTO v_v30
    FROM public.facturas_detalle fd JOIN public.facturas f ON f.id = fd.factura_id
    WHERE f.tenant_id = ANY(v_empresas) AND upper(COALESCE(f.estado, '')) <> 'ANULADA' AND f.fecha >= CURRENT_DATE - 30;
    SELECT COALESCE(SUM(monto_pendiente), 0) INTO v_cxp FROM public.compras
    WHERE tenant_id = v_tenant AND monto_pendiente > 0;
    v_ratio_cxp := CASE WHEN v_v30 > 0 THEN v_cxp / v_v30 ELSE 99 END;
    v_factor_salud := CASE WHEN v_ratio_cxp > 1.5 THEN 0.0 WHEN v_ratio_cxp > 1.0 THEN 0.4
      WHEN v_ratio_cxp > 0.6 THEN 0.7 ELSE 1.0 END;
    v_incr_max := COALESCE(v_config.incremento_mensual_pct, 0);
    v_incr_aplicado := v_incr_max * v_factor_salud;
    v_meses_desde := GREATEST(0,
      EXTRACT(YEAR FROM AGE(p_mes, COALESCE(v_config.fecha_base, CURRENT_DATE)))::INT * 12 +
      EXTRACT(MONTH FROM AGE(p_mes, COALESCE(v_config.fecha_base, CURRENT_DATE)))::INT);
    v_monto_base := v_config.monto_base_mensual * (1 + v_incr_aplicado / 100.0 * v_meses_desde);
  ELSE
    v_modo := 'auto';
    v_legacy := public.get_presupuesto_compras(v_tenant, 30, 0);
    v_monto_base := (v_legacy->>'presupuesto_sugerido')::NUMERIC;
  END IF;
  SELECT COALESCE(SUM(total_compra), 0) INTO v_comprado_mes FROM public.compras
  WHERE tenant_id = v_tenant AND fecha >= p_mes AND fecha < (p_mes + INTERVAL '1 month');
  v_disponible := GREATEST(0, v_monto_base - v_comprado_mes - COALESCE(v_config.caja_minima, 0));
  IF v_monto_base = 0 THEN v_color := 'gris'; v_salud := 'sin_datos';
  ELSIF v_disponible <= 0 THEN v_color := 'rojo'; v_salud := 'agotado';
  ELSIF v_disponible / v_monto_base < 0.25 THEN v_color := 'amarillo'; v_salud := 'limite_cerca';
  ELSE v_color := 'verde'; v_salud := 'sano'; END IF;
  v_caja := public.get_caja_disponible(v_tenant, NOW());
  RETURN json_build_object(
    'mes', p_mes, 'modo', v_modo, 'monto_base_mensual', ROUND(v_monto_base, 2),
    'comprado_mes', ROUND(v_comprado_mes, 2), 'caja_minima', COALESCE(v_config.caja_minima, 0),
    'disponible', ROUND(v_disponible, 2), 'incremento_pct', v_incr_aplicado,
    'incremento_maximo_pct', v_incr_max, 'incremento_aplicado_pct', v_incr_aplicado,
    'factor_salud', v_factor_salud, 'ratio_cxp_ventas', ROUND(v_ratio_cxp, 2),
    'meses_desde_base', v_meses_desde, 'control_estricto', COALESCE(v_config.control_estricto, false),
    'workflow_aprobacion', COALESCE(v_config.workflow_aprobacion, false),
    'limite_aprobacion', COALESCE(v_config.limite_aprobacion_manual, 0),
    'distribuir_por', COALESCE(v_config.distribuir_por, 'total'),
    'salud', v_salud, 'color', v_color, 'caja_disponible', v_caja, 'legacy_calculo', v_legacy);
END; $function$;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('presupuesto_compras_cuenta_la_hermana.sql');
