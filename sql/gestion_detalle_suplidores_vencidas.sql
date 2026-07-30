-- =====================================================================
-- Detalle de las cuotas a suplidores YA VENCIDAS (doble clic en la línea)
-- ---------------------------------------------------------------------
-- (2026-07-30) "Quiero poder dar doble clic y ver las cuotas vencidas igual
-- que las facturas que vencen en Jul 2026."
--
-- Es la línea roja de la posición: «de eso, 32 cuotas ya vencidas ·
-- RD$3,483,646». Hasta ahora era un número sin nada detrás; ahora abre el
-- mismo detalle que la columna Suplidores, con su monto en dólares.
--
-- >>> LOS MISMOS FILTROS, MENOS LA FECHA <<<
-- Se calca get_gestion_suplidores_mes —a crédito, no anulada, con monto, sin
-- los SALDO INICIAL ya desglosados en pagarés y sin las del propio grupo—
-- y solo cambia el corte:
--
--   por mes:     vence DENTRO del mes elegido
--   vencidas:    vence ANTES de hoy  Y  todavía tiene pendiente
--
-- Ese «y todavía tiene pendiente» es la diferencia que importa: una cuota de
-- mayo ya pagada no está vencida, está resuelta. Por eso el detalle suma el
-- PENDIENTE y no el total de la factura — es el mismo criterio con que la
-- posición calcula los RD$3,483,646.
--
-- Va aparte de la función por mes en vez de agregarle un parámetro: dos
-- funciones con el mismo nombre y distinta firma se le vuelven ambiguas a
-- PostgREST.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_gestion_suplidores_vencidas()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant     uuid := public.get_user_tenant();
  v_dealer     uuid;
  v_financiera uuid;
  v_grupo      uuid[];
  v_hoy        date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_result     json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;

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
           -- Cuánto lleva vencida: es lo que decide a quién se le paga
           -- primero, y sin esto la lista es solo un montón de fechas.
           (v_hoy - (co.fecha + COALESCE(co.dias_credito, 0))::date) AS dias_vencida,
           ROUND(COALESCE(co.total_compra, 0), 2)              AS total,
           ROUND(COALESCE(co.monto_pagado, 0), 2)              AS pagado,
           ROUND(COALESCE(co.monto_pendiente, 0), 2)           AS pendiente,
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
      -- vencida = pasó la fecha Y todavía debe algo
      AND (co.fecha + COALESCE(co.dias_credito, 0))::date < v_hoy
      AND COALESCE(co.monto_pendiente, 0) > 0
  ) x;

  RETURN v_result;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_gestion_suplidores_vencidas() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_gestion_suplidores_vencidas() TO authenticated, service_role;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('gestion_detalle_suplidores_vencidas.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) QUE EL DETALLE CUADRE CON LA LÍNEA ROJA DE LA POSICIÓN
WITH g AS (SELECT ARRAY['b39506c3-27dc-467d-830b-096731b83113'::uuid,
                        '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'::uuid] AS ids)
SELECT COUNT(*) AS cuotas_vencidas,
       ROUND(SUM(co.monto_pendiente), 2) AS monto_vencido
FROM public.compras co
LEFT JOIN public.proveedores pv ON pv.id = co.suplidor_id
CROSS JOIN g
WHERE co.tenant_id = ANY(g.ids)
  AND co.forma_pago ILIKE '%credito%'
  AND COALESCE(co.estado, '') <> 'ANULADA'
  AND COALESCE(co.total_compra, 0) > 0
  AND NOT COALESCE(co.es_saldo_inicial, false)
  AND (pv.empresa_grupo_tenant_id IS NULL OR NOT (pv.empresa_grupo_tenant_id = ANY(g.ids)))
  AND (co.fecha + COALESCE(co.dias_credito, 0))::date < CURRENT_DATE
  AND COALESCE(co.monto_pendiente, 0) > 0;
-- esperado: 32 cuotas · 3,483,646 — los mismos de «de eso, 32 cuotas ya
-- vencidas» en la posición. Si no cuadra, el detalle no sirve.

-- 2) LAS MÁS VIEJAS PRIMERO, que son las que urgen
WITH g AS (SELECT ARRAY['b39506c3-27dc-467d-830b-096731b83113'::uuid,
                        '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'::uuid] AS ids)
SELECT (co.fecha + COALESCE(co.dias_credito, 0))::date AS vence,
       CURRENT_DATE - (co.fecha + COALESCE(co.dias_credito, 0))::date AS dias_vencida,
       COALESCE(NULLIF(co.numero, ''), NULLIF(co.ncf, ''), NULLIF(co.referencia, ''), '—') AS numero,
       COALESCE(pv.nombre, 'Sin suplidor') AS suplidor,
       co.monto_pendiente, co.moneda, co.pendiente_usd
FROM public.compras co
LEFT JOIN public.proveedores pv ON pv.id = co.suplidor_id
CROSS JOIN g
WHERE co.tenant_id = ANY(g.ids)
  AND co.forma_pago ILIKE '%credito%'
  AND COALESCE(co.estado, '') <> 'ANULADA'
  AND COALESCE(co.total_compra, 0) > 0
  AND NOT COALESCE(co.es_saldo_inicial, false)
  AND (pv.empresa_grupo_tenant_id IS NULL OR NOT (pv.empresa_grupo_tenant_id = ANY(g.ids)))
  AND (co.fecha + COALESCE(co.dias_credito, 0))::date < CURRENT_DATE
  AND COALESCE(co.monto_pendiente, 0) > 0
ORDER BY vence
LIMIT 15;
