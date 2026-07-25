-- =====================================================================
-- Flujo Neto para empresas de financiamiento de TERCEROS (Caminero)
-- ---------------------------------------------------------------------
-- Decisión del usuario (2026-07-24): en Caminero el flujo del mes es
--   INGRESOS del mes completo (iniciales + cobros)  −  EGRESOS operativos,
-- SIN contar la deuda vieja de suplidores (8.03M pagados el 14-22/07,
-- "saldo inicial / SI-CXP"). Esos 11 de 12 pagos dicen genérico
-- "Pago a suplidor", así que NO se pueden distinguir por el texto; pero
-- TODOS son ANTERIORES al cuadre de caja (ancla = 23/07). Por eso:
--
--   * INGRESOS (ventas contado + cobros de clientes/recibos): mes completo
--     (desde el 1ro del mes). Para Caminero casi todo es inicial de ventas
--     registrado como RI → refleja el volumen cobrado real del mes.
--   * EGRESOS (gastos, compromisos, suplidores, compras, comisiones): desde
--     el ANCLA de caja (caja_historial_desde) → deja fuera la deuda vieja.
--
-- Resultado Caminero julio: cobros 293,500 − gastos 4,600 = 288,900.
-- Empresas NO terceros: v_ini_ing = v_ini_act → comportamiento IDÉNTICO al
-- anterior (sql/flujo_neto_respeta_ancla.sql), nada cambia para ellas.
--
-- ADEMÁS: ancla PROPIA del Flujo (independiente de la caja). Se agrega
-- config_empresa.flujo_historial_desde: si está lleno, el flujo del mes
-- arranca ahí (la CAJA/excedente sigue usando caja_historial_desde, no se
-- toca). Caso MotoPréstamos: caja desde 21/07 pero el FLUJO desde 20/07.
-- Con GREATEST(inicio de mes, ancla) rueda solo cada mes (agosto → 01/08).
--
-- Re-ejecutable. Correr en PRODUCCIÓN.
-- =====================================================================

-- Ancla propia del flujo del mes (independiente de la caja). NULL = usa la
-- de la caja (caja_historial_desde).
ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS flujo_historial_desde date;

CREATE OR REPLACE FUNCTION public.get_flujo_neto_dashboard(
  p_fecha_referencia date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant       uuid := public.get_user_tenant();
  v_hoy          date := COALESCE(p_fecha_referencia, (now() AT TIME ZONE 'America/Santo_Domingo')::date);
  v_mes_ini      date := date_trunc('month', v_hoy)::date;
  v_anchor       date := DATE '1970-01-01';
  v_es_terceros  boolean := false;
  v_ini_act      date;                 -- inicio de EGRESOS (respeta el ancla)
  v_ini_ing      date;                 -- inicio de INGRESOS (mes completo si terceros)
  v_dia_act      int;
  v_dias_en_mes  int  := extract(day from (date_trunc('month', v_hoy) + interval '1 month - 1 day'))::int;
  v_dia          int  := (v_hoy - date_trunc('month', v_hoy)::date) + 1;
  v_mes_ant_ini  date := (date_trunc('month', v_hoy) - interval '1 month')::date;
  v_mes_ant_fin  date := LEAST(
                           ((date_trunc('month', v_hoy) - interval '1 month')::date + (v_dia - 1)),
                           (date_trunc('month', v_hoy) - interval '1 day')::date
                         );
  v_meta         numeric := 0;
  v_meta_ventas  numeric := 0;
  v_ventas_mes   numeric := 0;
  v_result       json;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant del usuario';
  END IF;

  -- El flujo puede tener su propia ancla; si no, usa la de la caja.
  SELECT COALESCE(meta_flujo_neto_mensual, 0),
         COALESCE(meta_ventas, 0),
         COALESCE(flujo_historial_desde, caja_historial_desde, DATE '1970-01-01'),
         (COALESCE(financiamiento_tipo, 'propio') = 'terceros')
    INTO v_meta, v_meta_ventas, v_anchor, v_es_terceros
  FROM public.config_empresa
  WHERE tenant_id = v_tenant
  LIMIT 1;

  -- Egresos: respetan el ancla (deja fuera la deuda vieja pre-cuadre).
  v_ini_act := GREATEST(v_mes_ini, v_anchor);
  -- Ingresos: mes completo en terceros (el volumen cobrado del mes); en el
  -- resto siguen el ancla igual que los egresos (sin cambios).
  v_ini_ing := CASE WHEN v_es_terceros THEN v_mes_ini ELSE v_ini_act END;
  v_dia_act := (v_hoy - v_ini_ing) + 1;
  IF v_dia_act < 1 THEN v_dia_act := 1; END IF;

  -- Ventas del período para la franja de METAS (volumen, no flujo).
  SELECT COALESCE(SUM(f.total), 0)
    INTO v_ventas_mes
  FROM public.facturas f
  WHERE f.tenant_id = v_tenant
    AND (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date >= v_ini_ing
    AND (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date <= v_hoy
    AND COALESCE(f.estado, '') <> 'ANULADA';

  WITH movimientos AS (
    SELECT (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date AS dia,
           f.total::numeric AS ingreso, 0::numeric AS egreso,
           'ingreso_venta_contado'::text AS categoria
    FROM public.facturas f
    WHERE f.tenant_id = v_tenant
      AND (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date >= v_mes_ant_ini
      AND (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date <= v_hoy
      AND f.forma_pago ILIKE 'contado'
      AND COALESCE(f.estado, '') <> 'ANULADA'

    UNION ALL
    SELECT r.fecha::date, r.monto_pagado::numeric, 0, 'ingreso_cobro_cliente'
    FROM public.recibos_ingreso r
    WHERE r.tenant_id = v_tenant
      AND r.fecha >= v_mes_ant_ini AND r.fecha <= v_hoy
      AND COALESCE(r.anulado, false) = false

    UNION ALL
    SELECT g.fecha::date, 0, g.monto::numeric, 'gasto_operativo'
    FROM public.gastos_diarios g
    WHERE g.tenant_id = v_tenant
      AND g.fecha >= v_mes_ant_ini AND g.fecha <= v_hoy
      AND COALESCE(g.anulado, false) = false

    UNION ALL
    SELECT c.fecha, 0, c.monto::numeric, 'compromiso_fijo'
    FROM public.compromisos c
    WHERE c.tenant_id = v_tenant
      AND c.activo = false
      AND c.fecha_pago IS NOT NULL
      AND c.fecha >= v_mes_ant_ini
      AND c.fecha <= v_hoy

    UNION ALL
    SELECT ps.fecha::date, 0, ps.monto_pagado::numeric, 'pago_suplidor'
    FROM public.pagos_suplidores ps
    WHERE ps.tenant_id = v_tenant
      AND ps.fecha >= v_mes_ant_ini AND ps.fecha <= v_hoy
      AND COALESCE(ps.anulado, false) = false

    UNION ALL
    SELECT co.fecha::date, 0, co.total_compra::numeric, 'compra_contado'
    FROM public.compras co
    WHERE co.tenant_id = v_tenant
      AND co.fecha >= v_mes_ant_ini AND co.fecha <= v_hoy
      AND co.forma_pago ILIKE 'contado'
      AND COALESCE(co.estado, '') <> 'ANULADA'

    UNION ALL
    SELECT pc.fecha_pago::date, 0, pc.total_comision::numeric, 'pago_comision'
    FROM public.pagos_comisiones pc
    WHERE pc.tenant_id = v_tenant
      AND pc.fecha_pago >= v_mes_ant_ini AND pc.fecha_pago <= v_hoy
      AND UPPER(COALESCE(pc.forma_pago,'EFECTIVO')) = 'TRANSFERENCIA'
      AND COALESCE(pc.anulado, false) = false
  ),
  dia_neto AS (
    SELECT dia,
           SUM(ingreso)          AS ingreso,
           SUM(egreso)           AS egreso,
           SUM(ingreso - egreso) AS neto
    FROM movimientos
    GROUP BY dia
  ),
  agg AS (
    SELECT
      -- INGRESOS: desde v_ini_ing (mes completo si terceros)
      COALESCE(SUM(ingreso) FILTER (WHERE categoria = 'ingreso_venta_contado' AND dia >= v_ini_ing), 0) AS act_venta_contado,
      COALESCE(SUM(ingreso) FILTER (WHERE categoria = 'ingreso_cobro_cliente' AND dia >= v_ini_ing), 0) AS act_cobro_cliente,
      -- EGRESOS: desde el ancla (deja fuera la deuda vieja)
      COALESCE(SUM(egreso)  FILTER (WHERE categoria = 'gasto_operativo' AND dia >= v_ini_act), 0) AS act_gastos,
      COALESCE(SUM(egreso)  FILTER (WHERE categoria = 'compromiso_fijo' AND dia >= v_ini_act), 0) AS act_compromisos,
      COALESCE(SUM(egreso)  FILTER (WHERE categoria = 'pago_suplidor'   AND dia >= v_ini_act), 0) AS act_suplidores,
      COALESCE(SUM(egreso)  FILTER (WHERE categoria = 'compra_contado'  AND dia >= v_ini_act), 0) AS act_compras,
      COALESCE(SUM(egreso)  FILTER (WHERE categoria = 'pago_comision'   AND dia >= v_ini_act), 0) AS act_comisiones,
      COALESCE(SUM(ingreso - egreso) FILTER (WHERE dia = v_hoy), 0)                               AS flujo_hoy,
      COALESCE(SUM(ingreso - egreso) FILTER (WHERE dia >= v_mes_ant_ini AND dia <= v_mes_ant_fin), 0) AS ant_flujo,
      COUNT(*) FILTER (WHERE dia >= v_mes_ant_ini AND dia <= v_mes_ant_fin)                       AS ant_movs
    FROM movimientos
  ),
  serie_actual AS (
    -- Ingresos desde v_ini_ing, egresos desde v_ini_act (mismo criterio del total)
    SELECT json_agg(json_build_object('dia', dia_mes, 'valor', ROUND(acum, 2)) ORDER BY dia_mes) AS data
    FROM (
      SELECT ((g.d)::date - v_mes_ini) + 1 AS dia_mes,
             SUM(
               (CASE WHEN (g.d)::date >= v_ini_ing THEN COALESCE(dn.ingreso, 0) ELSE 0 END)
             - (CASE WHEN (g.d)::date >= v_ini_act THEN COALESCE(dn.egreso, 0)  ELSE 0 END)
             ) OVER (ORDER BY g.d) AS acum
      FROM generate_series(v_ini_ing, v_hoy, interval '1 day') g(d)
      LEFT JOIN dia_neto dn ON dn.dia = (g.d)::date
    ) s
  ),
  serie_anterior AS (
    SELECT json_agg(json_build_object('dia', dia_mes, 'valor', ROUND(acum, 2)) ORDER BY dia_mes) AS data
    FROM (
      SELECT ((g.d)::date - v_mes_ant_ini) + 1 AS dia_mes,
             SUM(dn.neto) OVER (ORDER BY g.d) AS acum
      FROM generate_series(v_mes_ant_ini, v_mes_ant_fin, interval '1 day') g(d)
      LEFT JOIN dia_neto dn ON dn.dia = (g.d)::date
    ) s
  )
  SELECT json_build_object(
    'periodo_actual', json_build_object(
      'fecha_inicio',            v_ini_ing,
      'fecha_fin',               v_hoy,
      'dias_transcurridos',      v_dia_act,
      'dias_en_mes',             v_dias_en_mes,
      'ingreso_venta_contado',   ROUND(a.act_venta_contado, 2),
      'ingreso_cobro_cliente',   ROUND(a.act_cobro_cliente, 2),
      'ingresos_cobrados',       ROUND(a.act_venta_contado + a.act_cobro_cliente, 2),
      'gastos_diarios',          ROUND(a.act_gastos, 2),
      'compromisos_fijos_pagados', ROUND(a.act_compromisos, 2),
      'pagos_suplidores',        ROUND(a.act_suplidores, 2),
      'compras_contado',         ROUND(a.act_compras, 2),
      'pagos_comisiones',        ROUND(a.act_comisiones, 2),
      'total_egresos',           ROUND(a.act_gastos + a.act_compromisos + a.act_suplidores + a.act_compras + a.act_comisiones, 2),
      'flujo_neto',              ROUND((a.act_venta_contado + a.act_cobro_cliente)
                                       - (a.act_gastos + a.act_compromisos + a.act_suplidores + a.act_compras + a.act_comisiones), 2),
      'flujo_hoy',               ROUND(a.flujo_hoy, 2),
      'promedio_diario',         ROUND(((a.act_venta_contado + a.act_cobro_cliente)
                                        - (a.act_gastos + a.act_compromisos + a.act_suplidores + a.act_compras + a.act_comisiones))
                                       / NULLIF(v_dia_act, 0), 2)
    ),
    'periodo_anterior', json_build_object(
      'fecha_inicio', v_mes_ant_ini,
      'fecha_fin',    v_mes_ant_fin,
      'flujo_neto',   ROUND(a.ant_flujo, 2),
      'tiene_datos',  (a.ant_movs > 0)
    ),
    'comparacion', json_build_object(
      'diferencia', ROUND(((a.act_venta_contado + a.act_cobro_cliente)
                           - (a.act_gastos + a.act_compromisos + a.act_suplidores + a.act_compras + a.act_comisiones))
                          - a.ant_flujo, 2),
      'variacion_porcentual',
        CASE WHEN a.ant_flujo <> 0
             THEN ROUND(((((a.act_venta_contado + a.act_cobro_cliente)
                           - (a.act_gastos + a.act_compromisos + a.act_suplidores + a.act_compras + a.act_comisiones))
                          - a.ant_flujo) / abs(a.ant_flujo)) * 100, 2)
             ELSE NULL END
    ),
    'metas', json_build_object(
      'meta_mensual',    ROUND(v_meta, 2),
      'proyeccion',      ROUND(((a.act_venta_contado + a.act_cobro_cliente)
                                - (a.act_gastos + a.act_compromisos + a.act_suplidores + a.act_compras + a.act_comisiones))
                               / NULLIF(v_dia_act, 0) * v_dias_en_mes, 2),
      'porcentaje_meta', NULL,
      'meta_ventas',       ROUND(v_meta_ventas, 2),
      'ventas_mes',        ROUND(v_ventas_mes, 2),
      'proyeccion_ventas', ROUND((v_ventas_mes / NULLIF(v_dia_act, 0)) * v_dias_en_mes, 2),
      'porcentaje_meta_ventas',
        CASE WHEN v_meta_ventas > 0
             THEN ROUND((v_ventas_mes / v_meta_ventas) * 100, 2)
             ELSE NULL END
    ),
    'series', json_build_object(
      'mes_actual',   COALESCE((SELECT data FROM serie_actual),   '[]'::json),
      'mes_anterior', COALESCE((SELECT data FROM serie_anterior), '[]'::json)
    )
  )
  INTO v_result
  FROM agg a;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_flujo_neto_dashboard(date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_flujo_neto_dashboard(date) TO authenticated, service_role;

-- MotoPréstamos Los Naranjos: el FLUJO del mes arranca el 20/07 (la caja
-- sigue en 21/07, no se toca). En agosto rueda solo al 01/08.
UPDATE public.config_empresa
   SET flujo_historial_desde = DATE '2026-07-20'
 WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('flujo_terceros_ventas_mes.sql');
  END IF;
END $$;

-- Verificación
SELECT nombre, caja_historial_desde, flujo_historial_desde
FROM public.config_empresa
WHERE tenant_id IN ('766fe3d6-6885-4f2b-b2cc-1a91db696fb4',
                    'b39506c3-27dc-467d-830b-096731b83113');
