-- =====================================================================
-- GESTIÓN EMPRESARIAL: la posición del grupo, sin repetir la tabla
-- ---------------------------------------------------------------------
-- (2026-07-29) "Este módulo tiene que darme una idea clara de la situación
-- de la empresa en tiempo real, así que no puede duplicar la misma
-- información."
--
-- >>> LO QUE ESTABA REPETIDO <<<
-- Las 4 tarjetas de arriba eran EXACTAMENTE la suma de las 4 columnas de la
-- tabla de abajo, y la banda de "facturación necesaria" el total de la
-- última columna. Nada de eso aportaba un dato nuevo. Peor: la fila del mes
-- en curso (suplidores 10,163,885) es el mismo número que "Se debía pagar"
-- del cumplimiento — dos veces en la misma pantalla.
--
-- >>> LO QUE FALTABA, QUE ES LO QUE DICE CÓMO ESTÁ LA EMPRESA <<<
-- Caja y bancos, la cartera de préstamos, lo que deben los clientes y las
-- ventas reales del mes: nada de eso aparecía. El panel pedía facturar 138
-- millones sin decir que se vende ~1 millón al mes ni que el grupo tiene 16.9
-- millones colocados en préstamos.
--
-- Ahora arriba va la POSICIÓN: lo que tenemos contra lo que debemos.
--
-- >>> LA DEUDA ENTRE LAS DOS EMPRESAS NO ES DEUDA <<<
-- "La deuda a suplidor de MotoPréstamos hacia Caminero Motors es simbólica."
-- Exacto, y es la razón de ser de consolidar: Caminero vende la motocicleta
-- y MotoPréstamos la financia, así que MotoPréstamos le queda debiendo a
-- Caminero. Vistas como UNA empresa, eso es dinero cambiando de bolsillo.
--
--   CxP de Caminero a suplidores de verdad   12,153,392.35  (98 cuotas)
--   CxP de MotoPréstamos hacia Caminero         779,500.00  (85 cuotas)
--                                            ───────────────
--   Deuda real del grupo                     12,153,392.35
--
-- Se elimina con un VÍNCULO EXPLÍCITO, no adivinando por nombre: la columna
-- proveedores.empresa_grupo_tenant_id dice "este proveedor ES esta empresa
-- del grupo". Misma idea que config_empresa.financiera_tenant_id. Los
-- proveedores no tienen RNC cargado, así que cruzarlos por RNC no era
-- opción, y comparar nombres ya causó una fuga de datos antes.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) El vínculo: qué proveedor es en realidad otra empresa del grupo
-- ------------------------------------------------------------
ALTER TABLE public.proveedores
  ADD COLUMN IF NOT EXISTS empresa_grupo_tenant_id uuid REFERENCES public.tenants(id);

COMMENT ON COLUMN public.proveedores.empresa_grupo_tenant_id IS
  'Cuando este "proveedor" es en realidad otra empresa del mismo grupo. Lo que se le deba NO es deuda del grupo: se elimina al consolidar.';

CREATE INDEX IF NOT EXISTS idx_proveedores_empresa_grupo
  ON public.proveedores (empresa_grupo_tenant_id)
  WHERE empresa_grupo_tenant_id IS NOT NULL;

-- El caso de hoy: el proveedor "CAMINERO MOTORS" dentro de MotoPréstamos.
-- Es un arreglo de datos de una sola vez; de aquí en adelante manda la
-- columna, no el nombre.
UPDATE public.proveedores p
   SET empresa_grupo_tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
 WHERE p.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
   AND p.empresa_grupo_tenant_id IS NULL
   AND p.nombre ILIKE '%caminero%';

-- ------------------------------------------------------------
-- 2) La función
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_gestion_empresarial_ia(
  p_meses int DEFAULT 6
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_hoy      date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_mes_ini  date := date_trunc('month', (now() AT TIME ZONE 'America/Santo_Domingo')::date)::date;
  v_mes_fin  date;
  v_n        int  := GREATEST(COALESCE(p_meses, 6), 1);
  v_grupo      uuid[];
  v_dealer     uuid;
  v_dealer_nom text;
  v_financiera uuid;
  v_gasto_d  numeric := 0;
  v_margen   numeric;
  v_ventas   numeric := 0;
  v_costo    numeric := 0;
  v_tasa     numeric := 1;
  -- posición
  v_bancos      numeric := 0;
  v_motos_cant  int := 0;
  v_motos_valor numeric := 0;
  v_cartera     numeric := 0;
  v_cartera_n   int := 0;
  v_cxc         numeric := 0;
  v_cxp         numeric := 0;
  v_cxp_n       int := 0;
  v_inter       numeric := 0;
  v_comp        numeric := 0;
  v_comp_n      int := 0;
  v_ventas_mes  numeric := 0;
  v_result   json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  v_mes_fin := (v_mes_ini + interval '1 month - 1 day')::date;

  -- EL GRUPO: las empresas que en la vida real son una sola.
  SELECT ce.tenant_id, ce.nombre INTO v_dealer, v_dealer_nom
  FROM public.config_empresa ce
  WHERE ce.financiera_tenant_id = v_tenant
    AND COALESCE(ce.financiamiento_tipo, 'propio') = 'terceros'
  LIMIT 1;

  SELECT ce.financiera_tenant_id INTO v_financiera
  FROM public.config_empresa ce
  WHERE ce.tenant_id = v_tenant
    AND COALESCE(ce.financiamiento_tipo, 'propio') = 'terceros'
    AND ce.financiera_tenant_id IS NOT NULL
  LIMIT 1;

  v_grupo := ARRAY[v_tenant];
  IF v_dealer IS NOT NULL AND NOT (v_dealer = ANY(v_grupo)) THEN v_grupo := v_grupo || v_dealer; END IF;
  IF v_financiera IS NOT NULL AND NOT (v_financiera = ANY(v_grupo)) THEN v_grupo := v_grupo || v_financiera; END IF;

  -- Tasa del día, para las cuentas en dólares
  SELECT t.tasa INTO v_tasa FROM public.tasas_cambio t
   WHERE t.tenant_id = ANY(v_grupo) ORDER BY t.fecha DESC LIMIT 1;
  v_tasa := COALESCE(NULLIF(v_tasa, 0), 1);

  -- Gasto operativo por día — de TODO el grupo (real, 90 días)
  SELECT COALESCE(SUM(monto), 0) / 90.0 INTO v_gasto_d
  FROM public.gastos_diarios
  WHERE tenant_id = ANY(v_grupo)
    AND fecha >= (v_hoy - 90) AND fecha <= v_hoy
    AND COALESCE(anulado, false) = false;

  -- Margen bruto de los últimos 90 días (quien factura es el dealer)
  SELECT COALESCE(SUM(d.importe), 0),
         COALESCE(SUM(COALESCE(d.costo_unitario, 0) * d.cantidad), 0)
    INTO v_ventas, v_costo
  FROM public.facturas f
  JOIN public.facturas_detalle d ON d.factura_id = f.id
  WHERE f.tenant_id = ANY(v_grupo)
    AND f.fecha >= (v_hoy - 90)
    AND COALESCE(f.estado, '') <> 'ANULADA';
  v_margen := CASE WHEN v_ventas > 0 AND v_costo > 0 AND v_costo < v_ventas
                   THEN (v_ventas - v_costo) / v_ventas ELSE NULL END;

  -- Ventas del MES en curso: contra qué se compara la facturación necesaria.
  SELECT COALESCE(SUM(f.total), 0) INTO v_ventas_mes
  FROM public.facturas f
  WHERE f.tenant_id = ANY(v_grupo)
    AND f.fecha >= v_mes_ini AND f.fecha < (v_mes_fin + 1)
    AND COALESCE(f.estado, '') <> 'ANULADA';

  -- ============ LO QUE TENEMOS ============
  -- Caja y bancos: saldo inicial + movimientos. Los dólares a la tasa del día.
  SELECT COALESCE(SUM(
           (c.saldo_inicial + COALESCE(m.neto, 0))
           * CASE WHEN upper(COALESCE(c.moneda, 'DOP')) = 'USD' THEN v_tasa ELSE 1 END), 0)
    INTO v_bancos
  FROM public.cuentas_bancarias c
  LEFT JOIN LATERAL (
    SELECT SUM(CASE WHEN mb.tipo = 'ENTRADA' THEN mb.monto ELSE -mb.monto END) AS neto
    FROM public.movimientos_bancarios mb WHERE mb.cuenta_id = c.id
  ) m ON true
  WHERE c.tenant_id = ANY(v_grupo) AND COALESCE(c.activo, true);

  -- Motocicletas en inventario (el dealer serializa cada unidad por chasis)
  SELECT COUNT(*), COALESCE(SUM(COALESCE(p.costo, 0)), 0)
    INTO v_motos_cant, v_motos_valor
  FROM public.productos p
  WHERE p.tenant_id = ANY(v_grupo)
    AND COALESCE(p.activo, true)
    AND p.chasis IS NOT NULL AND btrim(p.chasis) <> ''
    AND public.get_stock_actual(p.id) > 0;

  -- Cartera: CAPITAL COLOCADO en préstamos vivos. No es el saldo pendiente
  -- exacto (eso exige recorrer la amortización de cada préstamo), por eso la
  -- pantalla lo dice con esas palabras y no lo llama "por cobrar".
  SELECT COUNT(*), COALESCE(SUM(pr.monto_capital), 0)
    INTO v_cartera_n, v_cartera
  FROM public.prestamos pr
  WHERE pr.tenant_id = ANY(v_grupo) AND pr.estado = 'activo';

  SELECT COALESCE(SUM(cl.balance), 0) INTO v_cxc
  FROM public.clientes cl
  WHERE cl.tenant_id = ANY(v_grupo) AND COALESCE(cl.balance, 0) > 0
    -- Si un "cliente" fuera otra empresa del grupo tampoco contaría.
    AND NOT EXISTS (SELECT 1 FROM public.config_empresa ce2
                     WHERE ce2.tenant_id = ANY(v_grupo)
                       AND NULLIF(btrim(COALESCE(cl.rnc, '')), '') = NULLIF(btrim(COALESCE(ce2.rnc, '')), '')
                       AND cl.tenant_id <> ce2.tenant_id);

  -- ============ LO QUE DEBEMOS ============
  -- Suplidores REALES: se dejan fuera las compras a una empresa del grupo.
  SELECT COUNT(*), COALESCE(SUM(co.monto_pendiente), 0) INTO v_cxp_n, v_cxp
  FROM public.compras co
  LEFT JOIN public.proveedores pv ON pv.id = co.suplidor_id
  WHERE co.tenant_id = ANY(v_grupo)
    AND co.estado = 'PENDIENTE'
    AND co.forma_pago ILIKE '%credito%'
    AND COALESCE(co.monto_pendiente, 0) > 0
    AND (pv.empresa_grupo_tenant_id IS NULL OR NOT (pv.empresa_grupo_tenant_id = ANY(v_grupo)));

  -- Lo eliminado, para poder mostrarlo y que nadie crea que se perdió.
  SELECT COALESCE(SUM(co.monto_pendiente), 0) INTO v_inter
  FROM public.compras co
  JOIN public.proveedores pv ON pv.id = co.suplidor_id
  WHERE co.tenant_id = ANY(v_grupo)
    AND co.estado = 'PENDIENTE'
    AND co.forma_pago ILIKE '%credito%'
    AND COALESCE(co.monto_pendiente, 0) > 0
    AND pv.empresa_grupo_tenant_id = ANY(v_grupo);

  -- Compromisos VIVOS (no la proyección a 6 meses: eso es carga futura,
  -- no deuda contraída).
  SELECT COUNT(*), COALESCE(SUM(c.monto), 0) INTO v_comp_n, v_comp
  FROM public.compromisos c
  WHERE c.tenant_id = ANY(v_grupo) AND COALESCE(c.activo, true);

  WITH meses AS (
    SELECT (v_mes_ini + (n || ' month')::interval)::date AS mes
    FROM generate_series(0, v_n - 1) n
  ),
  comp_activos AS (
    SELECT c.monto,
           date_trunc('month', c.fecha)::date AS mes_origen,
           COALESCE(c.recurrente, false) AS repite
    FROM public.compromisos c
    WHERE c.tenant_id = ANY(v_grupo)
      AND COALESCE(c.activo, true) = true
      AND NOT EXISTS (SELECT 1 FROM public.nominas n WHERE n.compromiso_id = c.id)
      AND COALESCE(c.tipo, '') <> 'nomina'
  ),
  compromisos_mes AS (
    SELECT m.mes, COALESCE(SUM(ca.monto), 0) AS monto, COUNT(ca.monto) AS cant
    FROM meses m
    LEFT JOIN comp_activos ca
      ON (ca.repite AND m.mes >= LEAST(ca.mes_origen, v_mes_ini))
      OR (NOT ca.repite AND m.mes = ca.mes_origen)
    GROUP BY m.mes
  ),
  emp AS (
    SELECT e.frecuencia_pago,
           COALESCE(e.dia_pago_semanal, 6)::smallint AS dow,
           (e.sueldo_mensual
              - CASE WHEN e.cotiza_tss
                     THEN round(LEAST(e.sueldo_mensual, 464460) * 0.0287, 2)
                        + round(LEAST(e.sueldo_mensual, 232230) * 0.0304, 2)
                        + public.nomina_isr_mensual(
                            e.sueldo_mensual
                            - round(LEAST(e.sueldo_mensual, 464460) * 0.0287, 2)
                            - round(LEAST(e.sueldo_mensual, 232230) * 0.0304, 2))
                     ELSE 0 END) AS neto_mes
    FROM public.empleados e
    WHERE e.tenant_id = ANY(v_grupo) AND e.activo = true
  ),
  nomina_monto AS (
    SELECT m.mes,
           COALESCE(SUM(
             CASE WHEN e.frecuencia_pago = 'semanal'
                  THEN round(e.neto_mes / 4.0, 2)
                       * public.nomina_pagos_en_periodo(
                           m.mes, (m.mes + interval '1 month - 1 day')::date, e.dow)
                  ELSE e.neto_mes END), 0) AS monto
    FROM meses m LEFT JOIN emp e ON true
    GROUP BY m.mes
  ),
  nomina_dias AS (
    SELECT m.mes, count(*) AS cant
    FROM meses m
    CROSS JOIN LATERAL (
      SELECT DISTINCT e.frecuencia_pago, d::date AS fecha
      FROM public.empleados e
      CROSS JOIN generate_series(m.mes::timestamp,
                                 (m.mes + interval '1 month - 1 day')::timestamp,
                                 interval '1 day') d
      WHERE e.tenant_id = ANY(v_grupo) AND e.activo = true
        AND ((e.frecuencia_pago = 'semanal'
              AND extract(dow FROM d)::int = COALESCE(e.dia_pago_semanal, 6))
          OR (e.frecuencia_pago = 'quincenal'
              AND extract(day FROM d)::int IN (
                    15, LEAST(30, extract(day FROM (m.mes + interval '1 month - 1 day'))::int)))
          OR (e.frecuencia_pago = 'mensual'
              AND d::date = (m.mes + interval '1 month - 1 day')::date))
    ) pagos
    GROUP BY m.mes
  ),
  cxp AS (
    -- También aquí fuera lo de entre empresas del grupo.
    SELECT (co.fecha + COALESCE(co.dias_credito, 0))::date AS vence,
           COALESCE(co.total_compra, 0) AS total,
           COALESCE(co.monto_pagado, 0) AS pagado
    FROM public.compras co
    LEFT JOIN public.proveedores pv ON pv.id = co.suplidor_id
    WHERE co.tenant_id = ANY(v_grupo)
      AND co.forma_pago ILIKE '%credito%'
      AND COALESCE(co.estado, '') <> 'ANULADA'
      AND COALESCE(co.total_compra, 0) > 0
      AND (pv.empresa_grupo_tenant_id IS NULL OR NOT (pv.empresa_grupo_tenant_id = ANY(v_grupo)))
  ),
  cumplimiento AS (
    SELECT
      COALESCE(SUM(x.total), 0)  AS suplidores_debia,
      COALESCE(SUM(x.pagado), 0) AS suplidores_pagado,
      COUNT(*)                   AS suplidores_cuotas,
      (SELECT COALESCE(SUM(c.monto), 0) FROM public.compromisos c
        WHERE c.tenant_id = ANY(v_grupo) AND c.fecha BETWEEN v_mes_ini AND v_mes_fin) AS compromisos_debia,
      (SELECT COALESCE(SUM(c.monto), 0) FROM public.compromisos c
        WHERE c.tenant_id = ANY(v_grupo) AND c.fecha BETWEEN v_mes_ini AND v_mes_fin
          AND c.fecha_pago IS NOT NULL) AS compromisos_pagado,
      (SELECT COUNT(*) FROM public.compromisos c
        WHERE c.tenant_id = ANY(v_grupo) AND c.fecha BETWEEN v_mes_ini AND v_mes_fin) AS compromisos_cant
    FROM cxp x WHERE x.vence BETWEEN v_mes_ini AND v_mes_fin
  ),
  suplidores_mes AS (
    SELECT m.mes, COALESCE(SUM(x.total), 0) AS monto, COUNT(x.total) AS cant
    FROM meses m
    LEFT JOIN cxp x ON date_trunc('month', x.vence)::date = m.mes
    GROUP BY m.mes
  ),
  filas AS (
    SELECT m.mes,
      COALESCE(cm.monto, 0) + COALESCE(nm.monto, 0) AS compromisos,
      COALESCE(cm.cant, 0)  + COALESCE(nd.cant, 0)  AS compromisos_cant,
      COALESCE(sm.monto, 0) AS suplidores,
      COALESCE(sm.cant, 0)  AS suplidores_cant,
      ROUND(v_gasto_d * EXTRACT(day FROM (m.mes + interval '1 month - 1 day'))::numeric, 2) AS gastos
    FROM meses m
    LEFT JOIN compromisos_mes cm ON cm.mes = m.mes
    LEFT JOIN nomina_monto    nm ON nm.mes = m.mes
    LEFT JOIN nomina_dias     nd ON nd.mes = m.mes
    LEFT JOIN suplidores_mes  sm ON sm.mes = m.mes
  ),
  hist AS (
    SELECT date_trunc('month', g.fecha)::date AS mes,
           SUM(g.monto) AS monto, COUNT(*) AS cant
    FROM public.gastos_diarios g
    WHERE g.tenant_id = ANY(v_grupo)
      AND g.fecha >= (v_mes_ini - interval '6 months')::date
      AND g.fecha < v_mes_ini
      AND COALESCE(g.anulado, false) = false
    GROUP BY 1
  )
  SELECT json_build_object(
    'generado',        v_hoy,
    'gasto_diario',    ROUND(v_gasto_d, 2),
    'margen_pct',      CASE WHEN v_margen IS NULL THEN NULL ELSE ROUND(v_margen * 100, 2) END,
    'suplidores_de',   v_dealer_nom,
    'empresas_grupo',  array_length(v_grupo, 1),
    'tasa_usd',        v_tasa,
    'ventas_mes',      ROUND(v_ventas_mes, 2),

    -- POSICIÓN: lo que tenemos contra lo que debemos. Es lo único de esta
    -- pantalla que no se puede deducir de la tabla de abajo.
    'posicion', json_build_object(
      'caja_bancos',      ROUND(v_bancos, 2),
      'motos_unidades',   v_motos_cant,
      'motos_valor',      ROUND(v_motos_valor, 2),
      'cartera_cantidad', v_cartera_n,
      'cartera_capital',  ROUND(v_cartera, 2),
      'por_cobrar',       ROUND(v_cxc, 2),
      'activos',          ROUND(v_bancos + v_motos_valor + v_cartera + v_cxc, 2),
      'suplidores',       ROUND(v_cxp, 2),
      'suplidores_cuotas', v_cxp_n,
      'compromisos',      ROUND(v_comp, 2),
      'compromisos_cant', v_comp_n,
      'intercompania',    ROUND(v_inter, 2),
      'pasivos',          ROUND(v_cxp + v_comp, 2),
      'neta',             ROUND(v_bancos + v_motos_valor + v_cartera + v_cxc - v_cxp - v_comp, 2)
    ),

    'estado_actual', (
      SELECT json_build_object(
        'mes',                to_char(v_mes_ini, 'YYYY-MM'),
        'compromisos_debia',  ROUND(c.compromisos_debia, 2),
        'compromisos_pagado', ROUND(c.compromisos_pagado, 2),
        'compromisos_cant',   c.compromisos_cant,
        'compromisos_pct',    CASE WHEN c.compromisos_debia > 0
                                   THEN ROUND(c.compromisos_pagado * 100 / c.compromisos_debia, 1) END,
        'suplidores_debia',   ROUND(c.suplidores_debia, 2),
        'suplidores_pagado',  ROUND(c.suplidores_pagado, 2),
        'suplidores_cant',    c.suplidores_cuotas,
        'suplidores_pct',     CASE WHEN c.suplidores_debia > 0
                                   THEN ROUND(c.suplidores_pagado * 100 / c.suplidores_debia, 1) END,
        'total_debia',        ROUND(c.compromisos_debia + c.suplidores_debia, 2),
        'total_pagado',       ROUND(c.compromisos_pagado + c.suplidores_pagado, 2),
        'total_pct',          CASE WHEN (c.compromisos_debia + c.suplidores_debia) > 0
                                   THEN ROUND((c.compromisos_pagado + c.suplidores_pagado) * 100
                                              / (c.compromisos_debia + c.suplidores_debia), 1) END,
        'cuotas_vencidas_cant',  (SELECT COUNT(*) FROM cxp WHERE vence < v_hoy AND total > pagado),
        'cuotas_vencidas_monto', (SELECT ROUND(COALESCE(SUM(total - pagado), 0), 2)
                                    FROM cxp WHERE vence < v_hoy AND total > pagado)
      ) FROM cumplimiento c
    ),
    'meses', COALESCE((
      SELECT json_agg(json_build_object(
        'mes',              to_char(f.mes, 'YYYY-MM'),
        'compromisos',      ROUND(f.compromisos, 2),
        'compromisos_cant', f.compromisos_cant,
        'suplidores',       ROUND(f.suplidores, 2),
        'suplidores_cant',  f.suplidores_cant,
        'gastos',           f.gastos,
        'total_cubrir',     ROUND(f.compromisos + f.suplidores + f.gastos, 2),
        'facturacion_necesaria',
          CASE WHEN v_margen IS NULL THEN ROUND(f.compromisos + f.suplidores + f.gastos, 2)
               ELSE ROUND((f.compromisos + f.suplidores + f.gastos) / v_margen, 2) END
      ) ORDER BY f.mes) FROM filas f
    ), '[]'::json),
    'totales', (
      SELECT json_build_object(
        'compromisos',  ROUND(COALESCE(SUM(compromisos), 0), 2),
        'suplidores',   ROUND(COALESCE(SUM(suplidores), 0), 2),
        'gastos',       ROUND(COALESCE(SUM(gastos), 0), 2),
        'total_cubrir', ROUND(COALESCE(SUM(compromisos + suplidores + gastos), 0), 2),
        'facturacion_necesaria',
          CASE WHEN v_margen IS NULL THEN ROUND(COALESCE(SUM(compromisos + suplidores + gastos), 0), 2)
               ELSE ROUND(COALESCE(SUM(compromisos + suplidores + gastos), 0) / v_margen, 2) END
      ) FROM filas
    ),
    'historial_gastos', COALESCE((
      SELECT json_agg(json_build_object(
        'mes', to_char(h.mes, 'YYYY-MM'), 'monto', ROUND(h.monto, 2), 'cant', h.cant
      ) ORDER BY h.mes) FROM hist h
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_gestion_empresarial_ia(int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_gestion_empresarial_ia(int) TO authenticated, service_role;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('gestion_posicion_grupo.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) LA DEUDA ENTRE EMPRESAS: qué se elimina y qué queda
SELECT COALESCE(t.nombre, 'suplidor externo') AS proveedor_es,
       count(*) AS cuotas, SUM(co.monto_pendiente) AS monto,
       CASE WHEN pv.empresa_grupo_tenant_id IS NULL THEN 'DEUDA REAL'
            ELSE 'entre empresas — se elimina' END AS trato
FROM public.compras co
LEFT JOIN public.proveedores pv ON pv.id = co.suplidor_id
LEFT JOIN public.tenants t ON t.id = pv.empresa_grupo_tenant_id
WHERE co.tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113',
                       '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
  AND co.estado = 'PENDIENTE' AND co.forma_pago ILIKE '%credito%'
  AND COALESCE(co.monto_pendiente, 0) > 0
GROUP BY 1, 4 ORDER BY 4;
-- esperado: DEUDA REAL 98 cuotas 12,153,392.35
--           entre empresas 85 cuotas 779,500.00 (hacia CAMINERO MOTORS)

-- 2) LA POSICIÓN, pieza por pieza
WITH g AS (SELECT ARRAY['b39506c3-27dc-467d-830b-096731b83113'::uuid,
                        '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'::uuid] AS ids),
tasa AS (SELECT COALESCE(MAX(t.tasa), 1) AS v FROM public.tasas_cambio t, g WHERE t.tenant_id = ANY(g.ids))
SELECT 'Caja y bancos' AS concepto,
       ROUND(SUM((c.saldo_inicial + COALESCE(m.neto,0))
             * CASE WHEN upper(COALESCE(c.moneda,'DOP'))='USD' THEN (SELECT v FROM tasa) ELSE 1 END), 2) AS monto
FROM public.cuentas_bancarias c, g
LEFT JOIN LATERAL (SELECT SUM(CASE WHEN tipo='ENTRADA' THEN monto ELSE -monto END) neto
                     FROM public.movimientos_bancarios mb WHERE mb.cuenta_id=c.id) m ON true
WHERE c.tenant_id = ANY(g.ids) AND COALESCE(c.activo,true)
UNION ALL
SELECT 'Cartera colocada', ROUND(COALESCE(SUM(pr.monto_capital),0),2)
FROM public.prestamos pr, g WHERE pr.tenant_id = ANY(g.ids) AND pr.estado='activo'
UNION ALL
SELECT 'Por cobrar clientes', ROUND(COALESCE(SUM(cl.balance),0),2)
FROM public.clientes cl, g WHERE cl.tenant_id = ANY(g.ids) AND COALESCE(cl.balance,0)>0
UNION ALL
SELECT 'Compromisos vivos', ROUND(COALESCE(SUM(c.monto),0),2)
FROM public.compromisos c, g WHERE c.tenant_id = ANY(g.ids) AND COALESCE(c.activo,true);
-- referencia: bancos ≈ 483,134 · cartera 16,918,711 · por cobrar 1,499,675
--             compromisos 673,964
