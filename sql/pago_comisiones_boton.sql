-- =====================================================================
-- PAGO DE COMISIONES: boton "Pagar" en el Reporte de Comisiones
-- ---------------------------------------------------------------------
-- Pedido 2026-07-04: al pagar la comision de un vendedor debe
-- descontarse de la caja (efectivo) o de la Caja Actual (transferencia),
-- para no depender del compromiso fijo mensual de Compromisos a Pagar.
--
-- Diseno:
--   * pagos_comisiones (tabla ya existia sin uso) guarda cada pago con
--     numero PC-xxxxxxx, forma de pago y periodo.
--   * pagos_comisiones_facturas = CANDADO anti doble pago: las facturas
--     comisionadas quedan registradas y calcular_comisiones_vendedor las
--     EXCLUYE de futuras consultas.
--   * EFECTIVO -> se crea un gasto diario tipo COMISIONES vinculado; con
--     eso la Caja del Dia y la Caja Actual se descuentan solas.
--   * TRANSFERENCIA -> no toca la caja del dia; se resta SOLO de la Caja
--     Actual (excedente) y del Flujo Neto: se actualizan
--     get_caja_excedente_dashboard + rodar_ancla_caja (mismos filtros,
--     invariante del ancla intacto) y get_flujo_neto_dashboard.
--   * Solo admin/gerente puede pagar (validado en el RPC).
--
-- Re-ejecutable. Correr en PRODUCCION.
-- =====================================================================

-- 1) TABLAS: completar pagos_comisiones + candado --------------------------
ALTER TABLE public.pagos_comisiones
  ADD COLUMN IF NOT EXISTS tenant_id       uuid,
  ADD COLUMN IF NOT EXISTS numero          text,
  ADD COLUMN IF NOT EXISTS forma_pago      text NOT NULL DEFAULT 'EFECTIVO',
  ADD COLUMN IF NOT EXISTS banco           text,
  ADD COLUMN IF NOT EXISTS referencia      text,
  ADD COLUMN IF NOT EXISTS base            text NOT NULL DEFAULT 'ventas',
  ADD COLUMN IF NOT EXISTS anulado         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gasto_diario_id uuid;

CREATE INDEX IF NOT EXISTS idx_pagos_comisiones_tenant
  ON public.pagos_comisiones (tenant_id, fecha_pago) WHERE anulado = false;

ALTER TABLE public.pagos_comisiones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pagos_comisiones_tenant ON public.pagos_comisiones;
CREATE POLICY pagos_comisiones_tenant ON public.pagos_comisiones FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());
GRANT SELECT, INSERT, UPDATE ON public.pagos_comisiones TO authenticated;

ALTER TABLE public.pagos_comisiones_facturas
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

ALTER TABLE public.pagos_comisiones_facturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pagos_comisiones_fact_tenant ON public.pagos_comisiones_facturas;
CREATE POLICY pagos_comisiones_fact_tenant ON public.pagos_comisiones_facturas FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());
GRANT SELECT, INSERT ON public.pagos_comisiones_facturas TO authenticated;


-- 2) calcular_comisiones_vendedor: EXCLUIR facturas ya comisionadas --------
CREATE OR REPLACE FUNCTION public.calcular_comisiones_vendedor(
  p_vendedor_id uuid,
  p_fecha_desde date,
  p_fecha_hasta date
)
RETURNS TABLE(
  factura_id     uuid,
  factura_numero text,
  fecha          date,
  cliente_nombre text,
  monto_factura  numeric,
  monto_itbis    numeric,
  subtotal       numeric,
  forma_pago     text
)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_vendedor_tenant uuid;
BEGIN
  v_tenant_id := public.get_user_tenant();

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No se puede determinar el tenant del usuario actual';
  END IF;

  SELECT v.tenant_id INTO v_vendedor_tenant
  FROM public.vendedores v
  WHERE v.id = p_vendedor_id;

  IF v_vendedor_tenant IS NULL THEN
    RAISE EXCEPTION 'Vendedor % no encontrado', p_vendedor_id;
  END IF;

  IF v_vendedor_tenant <> v_tenant_id THEN
    RAISE EXCEPTION 'Vendedor % no pertenece al tenant actual', p_vendedor_id;
  END IF;

  RETURN QUERY
  SELECT
    f.id                                              AS factura_id,
    f.numero::text                                    AS factura_numero,
    f.fecha::date                                     AS fecha,
    COALESCE(c.nombre, f.manual_cliente_nombre, 'CLIENTE GENERICO')::text AS cliente_nombre,
    f.total                                           AS monto_factura,
    f.itbis                                           AS monto_itbis,
    f.subtotal                                        AS subtotal,
    f.forma_pago::text                                AS forma_pago
  FROM public.facturas f
  LEFT JOIN public.clientes c ON f.cliente_id = c.id
  WHERE
    f.tenant_id = v_tenant_id
    AND f.vendedor_id = p_vendedor_id
    AND f.fecha::date >= p_fecha_desde
    AND f.fecha::date <= p_fecha_hasta
    AND COALESCE(f.estado, 'EMITIDA') <> 'ANULADA'
    -- CANDADO: fuera las facturas cuya comision ya se pago
    AND NOT EXISTS (
      SELECT 1
      FROM public.pagos_comisiones_facturas pcf
      JOIN public.pagos_comisiones pc ON pc.id = pcf.pago_comision_id
      WHERE pcf.factura_id = f.id
        AND COALESCE(pc.anulado, false) = false
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.calcular_comisiones_vendedor(uuid, date, date) TO authenticated;


-- 3) RPC pagar_comision ------------------------------------------------------
DROP FUNCTION IF EXISTS public.pagar_comision(uuid,date,date,numeric,numeric,numeric,text,text,text,text,uuid[]);

CREATE OR REPLACE FUNCTION public.pagar_comision(
  p_vendedor_id    uuid,
  p_periodo_desde  date,
  p_periodo_hasta  date,
  p_total_ventas   numeric,
  p_porcentaje     numeric,
  p_total_comision numeric,
  p_forma_pago     text DEFAULT 'EFECTIVO',      -- EFECTIVO | TRANSFERENCIA
  p_banco          text DEFAULT NULL,
  p_referencia     text DEFAULT NULL,
  p_notas          text DEFAULT NULL,
  p_factura_ids    uuid[] DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_rol      text;
  v_forma    text := UPPER(COALESCE(NULLIF(btrim(p_forma_pago),''), 'EFECTIVO'));
  v_monto    numeric := round(COALESCE(p_total_comision, 0), 2);
  v_vend_nom text;
  v_pago_id  uuid;
  v_numero   text;
  v_seq      int;
  v_gasto_id uuid;
  v_facturas int := 0;
  v_hoy      date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF v_monto <= 0 THEN RAISE EXCEPTION 'El monto de la comision debe ser mayor que cero'; END IF;
  IF v_forma NOT IN ('EFECTIVO','TRANSFERENCIA') THEN
    RAISE EXCEPTION 'Forma de pago invalida: use EFECTIVO o TRANSFERENCIA';
  END IF;

  -- Solo roles administrativos pagan comisiones
  SELECT role INTO v_rol FROM public.profiles WHERE id = auth.uid();
  IF COALESCE(v_rol,'') NOT IN ('admin','owner','manager','gerente') THEN
    RAISE EXCEPTION 'Solo un administrador o gerente puede pagar comisiones';
  END IF;

  SELECT nombre INTO v_vend_nom FROM public.vendedores
   WHERE id = p_vendedor_id AND tenant_id = v_tenant;
  IF v_vend_nom IS NULL THEN RAISE EXCEPTION 'Vendedor no encontrado en este tenant'; END IF;

  -- Numero PC-xxxxxxx por tenant
  SELECT COALESCE(MAX((regexp_replace(numero, '\D','','g'))::int), 0) + 1
    INTO v_seq FROM public.pagos_comisiones
   WHERE tenant_id = v_tenant AND numero IS NOT NULL;
  v_numero := 'PC-' || lpad(v_seq::text, 7, '0');

  INSERT INTO public.pagos_comisiones (
    tenant_id, numero, vendedor_id, fecha_pago, periodo_desde, periodo_hasta,
    total_ventas, porcentaje_comision, total_comision,
    forma_pago, banco, referencia, notas, usuario_id
  ) VALUES (
    v_tenant, v_numero, p_vendedor_id, v_hoy, p_periodo_desde, p_periodo_hasta,
    round(COALESCE(p_total_ventas,0),2), COALESCE(p_porcentaje,0), v_monto,
    v_forma, NULLIF(btrim(COALESCE(p_banco,'')),''), NULLIF(btrim(COALESCE(p_referencia,'')),''),
    NULLIF(btrim(COALESCE(p_notas,'')),''), auth.uid()
  ) RETURNING id INTO v_pago_id;

  -- CANDADO: registrar las facturas comisionadas (solo las aun libres)
  IF p_factura_ids IS NOT NULL AND array_length(p_factura_ids, 1) > 0 THEN
    INSERT INTO public.pagos_comisiones_facturas (pago_comision_id, factura_id, tenant_id)
    SELECT v_pago_id, f.id, v_tenant
    FROM public.facturas f
    WHERE f.id = ANY(p_factura_ids)
      AND f.tenant_id = v_tenant
      AND NOT EXISTS (
        SELECT 1 FROM public.pagos_comisiones_facturas pcf
        JOIN public.pagos_comisiones pc ON pc.id = pcf.pago_comision_id
        WHERE pcf.factura_id = f.id AND COALESCE(pc.anulado, false) = false
      );
    GET DIAGNOSTICS v_facturas = ROW_COUNT;
  END IF;

  -- EFECTIVO: sale de la caja fisica -> gasto diario tipo COMISIONES
  -- (con eso la Caja del Dia, la Caja Actual y el Flujo Neto lo descuentan solos)
  IF v_forma = 'EFECTIVO' THEN
    INSERT INTO public.gastos_diarios (tenant_id, fecha, tipo_gasto, monto, descripcion, usuario_id)
    VALUES (
      v_tenant, v_hoy, 'COMISIONES', v_monto,
      'Pago comision ' || v_vend_nom || ' (' || v_numero || ') periodo '
        || to_char(p_periodo_desde, 'DD/MM/YYYY') || ' - ' || to_char(p_periodo_hasta, 'DD/MM/YYYY'),
      auth.uid()
    ) RETURNING id INTO v_gasto_id;

    UPDATE public.pagos_comisiones SET gasto_diario_id = v_gasto_id WHERE id = v_pago_id;
  END IF;
  -- TRANSFERENCIA: no toca la caja del dia; get_caja_excedente_dashboard y
  -- get_flujo_neto_dashboard (abajo) la restan directo de pagos_comisiones.

  RETURN json_build_object(
    'pago_id', v_pago_id,
    'numero', v_numero,
    'vendedor', v_vend_nom,
    'monto', v_monto,
    'forma_pago', v_forma,
    'facturas_bloqueadas', v_facturas,
    'gasto_diario_id', v_gasto_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pagar_comision(uuid,date,date,numeric,numeric,numeric,text,text,text,text,uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.pagar_comision(uuid,date,date,numeric,numeric,numeric,text,text,text,text,uuid[]) TO authenticated, service_role;


-- 4) CAJA: restar comisiones por TRANSFERENCIA del excedente ---------------
--    (las de EFECTIVO ya restan via gastos_diarios; NO se duplican)
--    OJO: lectura y ancla usan LOS MISMOS filtros -> invariante intacto.
CREATE OR REPLACE FUNCTION public.get_caja_excedente_dashboard()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant      uuid := public.get_user_tenant();
  v_seed        numeric := 0;
  v_anchor_date date := DATE '1970-01-01';
  v_anchor_ts   timestamptz;
  v_today       date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_today_ts    timestamptz;
  v_mes_ini     date := date_trunc('month', (now() AT TIME ZONE 'America/Santo_Domingo')::date)::date;
  v_excedente   numeric := 0;
  v_caja_hoy    numeric := 0;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant del usuario';
  END IF;

  SELECT COALESCE(saldo_inicial_caja, 0),
         COALESCE(caja_historial_desde, DATE '1970-01-01')
    INTO v_seed, v_anchor_date
  FROM public.config_empresa
  WHERE tenant_id = v_tenant
  LIMIT 1;

  v_anchor_ts := (v_anchor_date::timestamp AT TIME ZONE 'America/Santo_Domingo');
  v_today_ts  := (v_today::timestamp     AT TIME ZONE 'America/Santo_Domingo');

  v_excedente := v_seed
    + COALESCE((SELECT SUM(total) FROM public.facturas
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND forma_pago ILIKE 'contado' AND COALESCE(estado, '') <> 'ANULADA'), 0)
    + COALESCE((SELECT SUM(monto_pagado) FROM public.recibos_ingreso
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND COALESCE(anulado, false) = false), 0)
    - COALESCE((SELECT SUM(monto) FROM public.compromisos
        WHERE tenant_id = v_tenant AND fecha_pago >= v_anchor_ts
          AND activo = false), 0)
    - COALESCE((SELECT SUM(monto_pagado) FROM public.pagos_suplidores
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND COALESCE(anulado, false) = false), 0)
    - COALESCE((SELECT SUM(total_compra) FROM public.compras
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND forma_pago ILIKE 'contado' AND COALESCE(estado, '') <> 'ANULADA'), 0)
    - COALESCE((SELECT SUM(monto) FROM public.gastos_diarios
        WHERE tenant_id = v_tenant AND fecha >= v_anchor_date
          AND COALESCE(anulado, false) = false), 0)
    -- comisiones pagadas por transferencia (efectivo ya entra por gastos)
    - COALESCE((SELECT SUM(total_comision) FROM public.pagos_comisiones
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND UPPER(COALESCE(forma_pago,'EFECTIVO')) = 'TRANSFERENCIA'
          AND COALESCE(anulado, false) = false), 0);

  v_caja_hoy :=
      COALESCE((SELECT SUM(total) FROM public.facturas
        WHERE tenant_id = v_tenant AND created_at >= v_today_ts
          AND forma_pago ILIKE 'contado' AND COALESCE(estado, '') <> 'ANULADA'), 0)
    + COALESCE((SELECT SUM(monto_pagado) FROM public.recibos_ingreso
        WHERE tenant_id = v_tenant AND created_at >= v_today_ts
          AND COALESCE(anulado, false) = false), 0)
    - COALESCE((SELECT SUM(monto) FROM public.gastos_diarios
        WHERE tenant_id = v_tenant AND fecha = v_today
          AND COALESCE(anulado, false) = false), 0);

  RETURN json_build_object(
    'excedente',     ROUND(v_excedente, 2),
    'caja_hoy',      ROUND(v_caja_hoy, 2),
    'saldo_inicial', ROUND(v_seed, 2),
    'anchor',        v_anchor_date,
    'debe_rodar',    (v_anchor_date < v_mes_ini)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_caja_excedente_dashboard() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_caja_excedente_dashboard() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rodar_ancla_caja()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant      uuid := public.get_user_tenant();
  v_seed        numeric := 0;
  v_anchor_date date := DATE '1970-01-01';
  v_corte       date := date_trunc('month', (now() AT TIME ZONE 'America/Santo_Domingo')::date)::date;
  v_anchor_ts   timestamptz;
  v_corte_ts    timestamptz;
  v_fold        numeric := 0;
  v_nuevo_saldo numeric := 0;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant del usuario';
  END IF;

  SELECT COALESCE(saldo_inicial_caja, 0),
         COALESCE(caja_historial_desde, DATE '1970-01-01')
    INTO v_seed, v_anchor_date
  FROM public.config_empresa
  WHERE tenant_id = v_tenant
  LIMIT 1;

  IF v_anchor_date >= v_corte THEN
    RETURN json_build_object('rodada', false, 'anchor', v_anchor_date, 'saldo_inicial', ROUND(v_seed, 2));
  END IF;

  v_anchor_ts := (v_anchor_date::timestamp AT TIME ZONE 'America/Santo_Domingo');
  v_corte_ts  := (v_corte::timestamp     AT TIME ZONE 'America/Santo_Domingo');

  v_fold :=
      COALESCE((SELECT SUM(total) FROM public.facturas
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts AND created_at < v_corte_ts
          AND forma_pago ILIKE 'contado' AND COALESCE(estado, '') <> 'ANULADA'), 0)
    + COALESCE((SELECT SUM(monto_pagado) FROM public.recibos_ingreso
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts AND created_at < v_corte_ts
          AND COALESCE(anulado, false) = false), 0)
    - COALESCE((SELECT SUM(monto) FROM public.compromisos
        WHERE tenant_id = v_tenant AND fecha_pago >= v_anchor_ts AND fecha_pago < v_corte_ts
          AND activo = false), 0)
    - COALESCE((SELECT SUM(monto_pagado) FROM public.pagos_suplidores
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts AND created_at < v_corte_ts
          AND COALESCE(anulado, false) = false), 0)
    - COALESCE((SELECT SUM(total_compra) FROM public.compras
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts AND created_at < v_corte_ts
          AND forma_pago ILIKE 'contado' AND COALESCE(estado, '') <> 'ANULADA'), 0)
    - COALESCE((SELECT SUM(monto) FROM public.gastos_diarios
        WHERE tenant_id = v_tenant AND fecha >= v_anchor_date AND fecha < v_corte
          AND COALESCE(anulado, false) = false), 0)
    -- comisiones por transferencia (mismos limites que la lectura)
    - COALESCE((SELECT SUM(total_comision) FROM public.pagos_comisiones
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts AND created_at < v_corte_ts
          AND UPPER(COALESCE(forma_pago,'EFECTIVO')) = 'TRANSFERENCIA'
          AND COALESCE(anulado, false) = false), 0);

  v_nuevo_saldo := v_seed + v_fold;

  UPDATE public.config_empresa
     SET saldo_inicial_caja   = v_nuevo_saldo,
         caja_historial_desde = v_corte
   WHERE tenant_id = v_tenant;

  RETURN json_build_object(
    'rodada',        true,
    'anchor',        v_corte,
    'saldo_inicial', ROUND(v_nuevo_saldo, 2),
    'congelado',     ROUND(v_fold, 2)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rodar_ancla_caja() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rodar_ancla_caja() TO authenticated, service_role;


-- 5) FLUJO NETO: comisiones por TRANSFERENCIA como egreso ------------------
--    (las de EFECTIVO ya entran como gasto_operativo via gastos_diarios)
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
  v_dia          int  := (v_hoy - date_trunc('month', v_hoy)::date) + 1;
  v_ult_dia_mes  date := (date_trunc('month', v_hoy) + interval '1 month - 1 day')::date;
  v_dias_en_mes  int  := extract(day from (date_trunc('month', v_hoy) + interval '1 month - 1 day'))::int;
  v_mes_ant_ini  date := (date_trunc('month', v_hoy) - interval '1 month')::date;
  v_ult_dia_ant  date := (date_trunc('month', v_hoy) - interval '1 day')::date;
  v_mes_ant_fin  date := LEAST(
                           ((date_trunc('month', v_hoy) - interval '1 month')::date + (v_dia - 1)),
                           (date_trunc('month', v_hoy) - interval '1 day')::date
                         );
  v_meta         numeric := 0;
  v_result       json;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant del usuario';
  END IF;

  SELECT COALESCE(meta_flujo_neto_mensual, 0)
    INTO v_meta
  FROM public.config_empresa
  WHERE tenant_id = v_tenant
  LIMIT 1;

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
    -- EGRESO: comisiones pagadas por TRANSFERENCIA (efectivo ya entra
    -- como gasto_operativo via gastos_diarios; no se duplica)
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
      COALESCE(SUM(ingreso) FILTER (WHERE categoria = 'ingreso_venta_contado' AND dia >= v_mes_ini), 0) AS act_venta_contado,
      COALESCE(SUM(ingreso) FILTER (WHERE categoria = 'ingreso_cobro_cliente' AND dia >= v_mes_ini), 0) AS act_cobro_cliente,
      COALESCE(SUM(egreso)  FILTER (WHERE categoria = 'gasto_operativo'       AND dia >= v_mes_ini), 0) AS act_gastos,
      COALESCE(SUM(egreso)  FILTER (WHERE categoria = 'compromiso_fijo'       AND dia >= v_mes_ini), 0) AS act_compromisos,
      COALESCE(SUM(egreso)  FILTER (WHERE categoria = 'pago_suplidor'         AND dia >= v_mes_ini), 0) AS act_suplidores,
      COALESCE(SUM(egreso)  FILTER (WHERE categoria = 'compra_contado'        AND dia >= v_mes_ini), 0) AS act_compras,
      COALESCE(SUM(egreso)  FILTER (WHERE categoria = 'pago_comision'         AND dia >= v_mes_ini), 0) AS act_comisiones,
      COALESCE(SUM(ingreso - egreso) FILTER (WHERE dia >= v_mes_ini), 0)                                AS act_flujo,
      COALESCE(SUM(ingreso - egreso) FILTER (WHERE dia = v_hoy), 0)                                     AS flujo_hoy,
      COALESCE(SUM(ingreso - egreso) FILTER (WHERE dia >= v_mes_ant_ini AND dia <= v_mes_ant_fin), 0)   AS ant_flujo,
      COUNT(*) FILTER (WHERE dia >= v_mes_ant_ini AND dia <= v_mes_ant_fin)                             AS ant_movs
    FROM movimientos
  ),
  serie_actual AS (
    SELECT json_agg(json_build_object('dia', dia_mes, 'valor', ROUND(acum, 2)) ORDER BY dia_mes) AS data
    FROM (
      SELECT ((g.d)::date - v_mes_ini) + 1 AS dia_mes,
             SUM(dn.neto) OVER (ORDER BY g.d) AS acum
      FROM generate_series(v_mes_ini, v_hoy, interval '1 day') g(d)
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
      'fecha_inicio',            v_mes_ini,
      'fecha_fin',               v_hoy,
      'dias_transcurridos',      v_dia,
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
      'flujo_neto',              ROUND(a.act_flujo, 2),
      'flujo_hoy',               ROUND(a.flujo_hoy, 2),
      'promedio_diario',         ROUND(a.act_flujo / NULLIF(v_dia, 0), 2)
    ),
    'periodo_anterior', json_build_object(
      'fecha_inicio', v_mes_ant_ini,
      'fecha_fin',    v_mes_ant_fin,
      'flujo_neto',   ROUND(a.ant_flujo, 2),
      'tiene_datos',  (a.ant_movs > 0)
    ),
    'comparacion', json_build_object(
      'diferencia',          ROUND(a.act_flujo - a.ant_flujo, 2),
      'variacion_porcentual',
        CASE WHEN a.ant_flujo <> 0
             THEN ROUND(((a.act_flujo - a.ant_flujo) / abs(a.ant_flujo)) * 100, 2)
             ELSE NULL END
    ),
    'metas', json_build_object(
      'meta_mensual',    ROUND(v_meta, 2),
      'proyeccion',      ROUND((a.act_flujo / NULLIF(v_dia, 0)) * v_dias_en_mes, 2),
      'porcentaje_meta',
        CASE WHEN v_meta > 0
             THEN ROUND((a.act_flujo / v_meta) * 100, 2)
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

NOTIFY pgrst, 'reload schema';

SELECT 'Pago de comisiones (boton Pagar + caja + flujo neto) listo' AS status;
