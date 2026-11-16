-- =====================================================================
-- 606 / hoja del IT-1: factura repartida en dos fichas del suplidor (16/11/2026)
-- ---------------------------------------------------------------------
-- Algunos suplidores son UNA empresa con dos vendedores y en MotoFlow tienen
-- dos fichas (Pedro Racing, G&G/HAO en Morla). Una factura se carga a veces
-- repartida: dos compras con el mismo RNC + NCF, una en cada ficha. Antes la
-- segunda salía "repetida" y su ITBIS no contaba. Ahora cuentan las dos SOLO
-- si son compras de fichas distintas con la misma fecha, forma de pago y
-- retenciones (la misma regla que revisar606 en src/lib/dgiiExport.js, que
-- las junta en una línea del TXT). Misma ficha dos veces, o un comprobante de
-- gasto con una compra: repetida, como antes.
-- Reemplaza la primera versión de este archivo (corregida tras la revisión).
-- Generado desde la versión de producción del 16/11.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._contab_compras_606(p_tenant uuid, p_ini date, p_fin date)
 RETURNS TABLE(id uuid, origen text, proveedor text, rnc text, ncf text, tipo text, es_servicio boolean, base numeric, itbis numeric, total numeric, itbis_ret numeric, isr_ret numeric, isr_pct numeric, motivo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH emp AS (
    SELECT regexp_replace(COALESCE((SELECT ce.rnc FROM public.config_empresa ce WHERE ce.tenant_id = p_tenant), ''), '\D', '', 'g') AS rnc
  ), c AS (
    SELECT co.id, 'compra'::text AS origen, pv.nombre::text AS proveedor,
           COALESCE(co.itbis_total, 0) AS itbis, COALESCE(co.total_compra, 0) AS total,
           COALESCE(co.total_gravado, 0) + COALESCE(co.total_exento, 0) AS base,
           COALESCE(co.itbis_retenido_pct, 0) AS itbis_ret_pct, COALESCE(co.isr_retenido_pct, 0) AS isr_pct,
           upper(regexp_replace(COALESCE(co.ncf, ''), '[\s-]', '', 'g')) AS ncf,
           regexp_replace(COALESCE(pv.rnc, ''), '\D', '', 'g') AS rnc,
           CASE WHEN btrim(COALESCE(co.tipo_bienes_servicios, '')) ~ '^\d{1,2}$' THEN btrim(co.tipo_bienes_servicios)::int ELSE 9 END AS tbs,
           upper(regexp_replace(COALESCE(co.ncf_modificado, ''), '[\s-]', '', 'g')) AS ncf_mod,
           co.tipo_retencion_isr AS tipo_ret, co.suplidor_id AS ficha, co.fecha::date AS fecha_c,
           -- Forma de pago del 606 (col. 23), igual que formaPago606 (lib/dgiiExport).
           CASE WHEN upper(COALESCE(co.forma_pago, '') || ' ' || COALESCE(co.tipo_pago_detalle, '')) LIKE '%TARJETA%' THEN '03'
                WHEN upper(COALESCE(co.forma_pago, '') || ' ' || COALESCE(co.tipo_pago_detalle, '')) ~ 'CHEQUE|TRANSFER|DEPOSIT' THEN '02'
                WHEN upper(COALESCE(co.forma_pago, '') || ' ' || COALESCE(co.tipo_pago_detalle, '')) LIKE '%PERMUTA%' THEN '05'
                WHEN upper(COALESCE(co.forma_pago, '') || ' ' || COALESCE(co.tipo_pago_detalle, '')) LIKE '%NOTA%' THEN '06'
                WHEN upper(COALESCE(co.forma_pago, '') || ' ' || COALESCE(co.tipo_pago_detalle, '')) LIKE '%MIXTO%' THEN '07'
                WHEN upper(COALESCE(co.forma_pago, '') || ' ' || COALESCE(co.tipo_pago_detalle, '')) ~ 'CR[EÉ]DITO' THEN '04'
                ELSE '01' END AS forma
      FROM public.compras co
      LEFT JOIN public.proveedores pv ON pv.id = co.suplidor_id
     WHERE co.tenant_id = p_tenant AND co.fecha >= p_ini AND co.fecha < p_fin
       AND COALESCE(co.estado, '') <> 'ANULADA' AND NOT COALESCE(co.es_saldo_inicial, false)
    UNION ALL
    -- Comprobantes de gastos APROBADOS (foto de la factura del gasto).
    SELECT g.id, 'gasto', g.proveedor_nombre::text, COALESCE(g.itbis, 0), COALESCE(g.total, 0),
           COALESCE(g.monto_gravado, 0) + COALESCE(g.monto_exento, 0), 0::numeric, 0::numeric,
           COALESCE(g.ncf, ''), COALESCE(g.rnc, ''), COALESCE(g.tipo_bs, 2)::int, ''::text, NULL::smallint, NULL::uuid, g.fecha::date, NULL::text
      FROM public.gastos_comprobantes g
     WHERE g.tenant_id = p_tenant AND g.fecha >= p_ini AND g.fecha < p_fin AND g.estado = 'aprobado' AND g.entra_606
  ), k0 AS (
    SELECT c.*, left(c.ncf, 3) AS tipo, (SELECT rnc FROM emp) AS rnc_emp,
      -- Nota de crédito del suplidor: RESTA crédito (en el TXT va en positivo).
      CASE WHEN left(c.ncf, 3) IN ('B04', 'E34') THEN -1 ELSE 1 END AS signo,
      CASE
        WHEN c.ncf = '' THEN 'sin_ncf'
        WHEN c.ncf !~ '^(B\d{10}|E\d{12})$' THEN 'ncf_mal'
        WHEN left(c.ncf, 3) IN ('B02', 'E32') THEN 'consumo'
        WHEN left(c.ncf, 3) NOT IN ('B01','B03','B04','B11','B13','B14','B15','B17','E31','E33','E34','E41','E43','E44','E45','E47') THEN 'tipo'
        WHEN left(c.ncf, 3) IN ('B13','B17','E43','E47') AND length((SELECT rnc FROM emp)) NOT IN (9, 11) THEN 'rnc_empresa'
        WHEN left(c.ncf, 3) NOT IN ('B13','B17','E43','E47') AND length(c.rnc) NOT IN (9, 11) THEN 'rnc'
        -- (14/11) Compras guarda el NCF modificado y el tipo de retención de
        -- ISR. Solo las que NO los tienen quedan fuera del TXT (se agregan a
        -- mano en la herramienta de la DGII), igual que en revisar606.
        WHEN left(c.ncf, 3) IN ('B03','B04','E33','E34') AND c.ncf_mod = '' THEN 'nota'
        WHEN c.isr_pct > 0 AND c.tipo_ret IS NULL THEN 'ret_isr'
        ELSE 'ok' END AS motivo0
      FROM c
  ), k1 AS (
    SELECT k0.*,
           CASE WHEN k0.tipo IN ('B13','B17','E43','E47') THEN k0.rnc_emp ELSE k0.rnc END AS clave_rnc
      FROM k0
  ), k2 AS (
    -- Orden igual que el 606 (ReportesDGIIPage): compras por fecha e id, y
    -- los comprobantes de gastos al final.
    SELECT k1.*,
           row_number() OVER w AS rn_todo,
           row_number() OVER (PARTITION BY k1.motivo0, k1.clave_rnc, k1.ncf, COALESCE(k1.ficha::text, '-')
                              ORDER BY (k1.origen <> 'compra'), k1.fecha_c, k1.id) AS rn_ficha,
           first_value(k1.origen) OVER w AS p_origen, first_value(k1.fecha_c) OVER w AS p_fecha,
           first_value(k1.forma) OVER w AS p_forma, first_value(k1.itbis_ret_pct) OVER w AS p_itbis_ret,
           first_value(k1.isr_pct) OVER w AS p_isr, first_value(k1.tipo_ret) OVER w AS p_tipo_ret
      FROM k1
    WINDOW w AS (PARTITION BY k1.motivo0, k1.clave_rnc, k1.ncf ORDER BY (k1.origen <> 'compra'), k1.fecha_c, k1.id)
  )
  -- La misma factura (RNC + NCF) dos veces cuenta una sola: la otra sale como
  -- repetida, igual que en el 606. (16/11/2026) Excepción: COMPRAS de fichas
  -- DISTINTAS del mismo suplidor (una empresa con dos vendedores: Pedro
  -- Racing, G&G/HAO) con la misma fecha, forma de pago y retenciones son una
  -- factura repartida y cuentan todas (el TXT las junta en una línea:
  -- revisar606 en src/lib/dgiiExport.js). Un comprobante de gasto nunca se
  -- junta con una compra.
  SELECT k2.id, k2.origen, k2.proveedor, k2.rnc, k2.ncf, k2.tipo,
         (CASE WHEN k2.tbs BETWEEN 1 AND 11 THEN k2.tbs ELSE 9 END) IN (1, 2, 3, 7, 11),
         k2.base * k2.signo, k2.itbis * k2.signo, k2.total * k2.signo,
         round(k2.itbis * k2.signo * k2.itbis_ret_pct / 100, 2), round(k2.base * k2.signo * k2.isr_pct / 100, 2), k2.isr_pct,
         CASE WHEN k2.motivo0 = 'ok' AND k2.rn_todo > 1
               AND NOT (k2.rn_ficha = 1 AND k2.origen = 'compra' AND k2.ficha IS NOT NULL AND k2.p_origen = 'compra'
                        AND k2.fecha_c = k2.p_fecha AND k2.forma = k2.p_forma
                        AND k2.itbis_ret_pct = k2.p_itbis_ret AND k2.isr_pct = k2.p_isr
                        AND k2.tipo_ret IS NOT DISTINCT FROM k2.p_tipo_ret)
              THEN 'repetida' ELSE k2.motivo0 END
    FROM k2
$function$;

SELECT registrar_migracion('compras_606_factura_repartida.sql');
