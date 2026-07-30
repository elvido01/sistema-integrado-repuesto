-- =====================================================================
-- Detalle de las cuotas a suplidores de un mes (doble clic en la columna)
-- ---------------------------------------------------------------------
-- (2026-07-30) "Quiero que al hacer doble clic en la columna de suplidores
-- aparezca el detalle de cada factura que se vence ese mes: número de
-- factura, suplidor, monto, fecha."
--
-- Julio 2026 son estas 11, que suman los 2,975,290.78 de la fila:
--
--   05/07  FIN-6618-02      AUTO MOTOPRESTAMOS ORIENTAL     188,356.00
--   06/07  FIN-05109-01     TERUEL & COMPANIA SRL            52,499.79
--   06/07  FIN-05108-01     TERUEL & COMPANIA SRL            18,498.25
--   10/07  FIN-18819-02     NIPPONIA CARIBE SRL             420,420.00
--   11/07  FIN-6644-02      AUTO MOTOPRESTAMOS ORIENTAL      68,696.00
--   14/07  FIN-04295-02     TERUEL & COMPANIA SRL           115,817.63
--   15/07  FIN-CAST-02      MOTOPRESTAMOS CASTILLO S.R.L.   550,250.00
--   20/07  OC-0001          NIPPONIA CARIBE SRL           1,299,180.00  PAGADA
--   23/07  FIN-18893-01     NIPPONIA CARIBE SRL             122,193.75
--   26/07  FIN-02680-04     TERUEL & COMPANIA SRL           139,150.00
--   31/07  DEUDA-PAPEL-TER  TERUEL & COMPANIA SRL               229.36
--
-- >>> LOS FILTROS SON LOS MISMOS DE LA FILA <<<
-- Si aquí faltara o sobrara una, el detalle no cuadraría con el total y no
-- serviría de nada. Van idénticos a los de `cxp` en
-- get_gestion_empresarial_ia: a crédito, no anulada, con monto, sin los
-- SALDO INICIAL (que ya están desglosados en sus pagarés) y sin las del
-- propio grupo.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_gestion_suplidores_mes(p_mes text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant     uuid := public.get_user_tenant();
  v_dealer     uuid;
  v_financiera uuid;
  v_grupo      uuid[];
  v_ini        date;
  v_fin        date;
  v_result     json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;

  -- 'YYYY-MM' es lo que manda la tabla en cada fila.
  v_ini := date_trunc('month', to_date(p_mes || '-01', 'YYYY-MM-DD'))::date;
  v_fin := (v_ini + interval '1 month - 1 day')::date;

  -- EL GRUPO, igual que en el panel: las empresas que en la vida real son
  -- una sola. Nunca por nombre.
  SELECT ce.tenant_id INTO v_dealer
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
  IF v_dealer     IS NOT NULL AND NOT (v_dealer     = ANY(v_grupo)) THEN v_grupo := v_grupo || v_dealer;     END IF;
  IF v_financiera IS NOT NULL AND NOT (v_financiera = ANY(v_grupo)) THEN v_grupo := v_grupo || v_financiera; END IF;

  SELECT COALESCE(json_agg(x ORDER BY x.vence, x.suplidor), '[]'::json) INTO v_result
  FROM (
    SELECT COALESCE(NULLIF(co.numero, ''), NULLIF(co.ncf, ''),
                    NULLIF(co.referencia, ''), '—')            AS numero,
           COALESCE(pv.nombre, 'Sin suplidor')                 AS suplidor,
           co.fecha                                            AS fecha,
           (co.fecha + COALESCE(co.dias_credito, 0))::date     AS vence,
           COALESCE(co.dias_credito, 0)                        AS dias_credito,
           ROUND(COALESCE(co.total_compra, 0), 2)              AS total,
           ROUND(COALESCE(co.monto_pagado, 0), 2)              AS pagado,
           ROUND(COALESCE(co.monto_pendiente, 0), 2)           AS pendiente,
           -- La mayoría de estas facturas se pactaron en DÓLARES: el RD$ es
           -- la conversión a la tasa del día de la compra, que no es la de
           -- hoy. Sin el monto en US$ no se sabe cuánto se debe de verdad.
           COALESCE(co.moneda, 'DOP')                          AS moneda,
           co.tasa_cambio                                      AS tasa,
           CASE WHEN COALESCE(co.moneda, 'DOP') = 'USD'
                THEN ROUND(COALESCE(co.total_usd, 0), 2) END   AS total_usd,
           CASE WHEN COALESCE(co.moneda, 'DOP') = 'USD'
                THEN ROUND(COALESCE(co.pendiente_usd, 0), 2) END AS pendiente_usd
    FROM public.compras co
    LEFT JOIN public.proveedores pv ON pv.id = co.suplidor_id
    WHERE co.tenant_id = ANY(v_grupo)
      AND co.forma_pago ILIKE '%credito%'
      AND COALESCE(co.estado, '') <> 'ANULADA'
      AND COALESCE(co.total_compra, 0) > 0
      AND NOT COALESCE(co.es_saldo_inicial, false)
      AND (pv.empresa_grupo_tenant_id IS NULL OR NOT (pv.empresa_grupo_tenant_id = ANY(v_grupo)))
      AND (co.fecha + COALESCE(co.dias_credito, 0))::date BETWEEN v_ini AND v_fin
  ) x;

  RETURN v_result;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_gestion_suplidores_mes(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_gestion_suplidores_mes(text) TO authenticated, service_role;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('gestion_detalle_suplidores_mes.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- OJO: no se llama a get_gestion_suplidores_mes desde aquí porque usa
-- get_user_tenant() y el editor SQL no tiene sesión. Se replica en SQL plano.
WITH g AS (SELECT ARRAY['b39506c3-27dc-467d-830b-096731b83113'::uuid,
                        '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'::uuid] AS ids),
mes AS (SELECT date_trunc('month', CURRENT_DATE)::date AS ini,
               (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date AS fin)
SELECT (co.fecha + COALESCE(co.dias_credito, 0))::date AS vence,
       COALESCE(NULLIF(co.numero, ''), NULLIF(co.ncf, ''), NULLIF(co.referencia, ''), '—') AS numero,
       COALESCE(pv.nombre, 'Sin suplidor') AS suplidor,
       co.fecha, co.total_compra, co.monto_pendiente
FROM public.compras co
LEFT JOIN public.proveedores pv ON pv.id = co.suplidor_id
CROSS JOIN g CROSS JOIN mes
WHERE co.tenant_id = ANY(g.ids)
  AND co.forma_pago ILIKE '%credito%'
  AND COALESCE(co.estado, '') <> 'ANULADA'
  AND COALESCE(co.total_compra, 0) > 0
  AND NOT COALESCE(co.es_saldo_inicial, false)
  AND (pv.empresa_grupo_tenant_id IS NULL OR NOT (pv.empresa_grupo_tenant_id = ANY(g.ids)))
  AND (co.fecha + COALESCE(co.dias_credito, 0))::date BETWEEN mes.ini AND mes.fin
ORDER BY vence;
-- esperado: 11 filas y SUM(total_compra) = 2,975,290.78, el mismo número de
-- la fila de julio en «Mes por mes». Si no cuadra, el detalle no sirve.

-- 2) CUÁNTO DE ESO ESTÁ PACTADO EN DÓLARES
SELECT COALESCE(co.moneda, 'DOP') AS moneda, COUNT(*) AS facturas,
       ROUND(SUM(co.total_compra), 2)   AS total_rd,
       ROUND(SUM(co.total_usd), 2)      AS total_usd,
       ROUND(SUM(co.monto_pendiente), 2) AS pendiente_rd,
       ROUND(SUM(co.pendiente_usd), 2)   AS pendiente_usd
FROM public.compras co
LEFT JOIN public.proveedores pv ON pv.id = co.suplidor_id
WHERE co.tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113',
                       '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
  AND co.forma_pago ILIKE '%credito%'
  AND COALESCE(co.estado, '') <> 'ANULADA'
  AND COALESCE(co.total_compra, 0) > 0
  AND NOT COALESCE(co.es_saldo_inicial, false)
  AND pv.empresa_grupo_tenant_id IS NULL
  AND (co.fecha + COALESCE(co.dias_credito, 0))::date
      BETWEEN date_trunc('month', CURRENT_DATE)::date
          AND (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date
GROUP BY 1;
-- esperado: USD 9 facturas · US$ 18,336.24 · pendiente US$ 17,482.24
--           DOP 2 facturas (FIN-CAST-02 y OC-0001)
-- Cada factura en US$ trae su PROPIA tasa (60.5 a 63): el RD$ es lo que
-- costó el día de la compra, no lo que costaría hoy.
