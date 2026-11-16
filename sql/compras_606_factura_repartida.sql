-- =====================================================================
-- 606 / hoja del IT-1: factura repartida en dos fichas del suplidor (16/11/2026)
-- ---------------------------------------------------------------------
-- Algunos suplidores son UNA empresa con dos vendedores y en MotoFlow tienen
-- dos fichas (Pedro Racing, G&G/HAO en Morla). Una factura se carga a veces
-- repartida: dos compras con el mismo RNC + NCF, una en cada ficha. Antes la
-- segunda salía "repetida" y su ITBIS no contaba. Ahora solo es repetida si
-- está dos veces en la MISMA ficha; en fichas distintas cuentan las dos (el
-- TXT del 606 las junta en una línea: src/lib/dgiiExport.js revisar606).
-- Generado desde la versión de producción del 16/11; solo cambia eso.
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
           co.tipo_retencion_isr AS tipo_ret, co.suplidor_id AS ficha
      FROM public.compras co
      LEFT JOIN public.proveedores pv ON pv.id = co.suplidor_id
     WHERE co.tenant_id = p_tenant AND co.fecha >= p_ini AND co.fecha < p_fin
       AND COALESCE(co.estado, '') <> 'ANULADA' AND NOT COALESCE(co.es_saldo_inicial, false)
    UNION ALL
    -- Comprobantes de gastos APROBADOS (foto de la factura del gasto).
    SELECT g.id, 'gasto', g.proveedor_nombre::text, COALESCE(g.itbis, 0), COALESCE(g.total, 0),
           COALESCE(g.monto_gravado, 0) + COALESCE(g.monto_exento, 0), 0::numeric, 0::numeric,
           COALESCE(g.ncf, ''), COALESCE(g.rnc, ''), COALESCE(g.tipo_bs, 2)::int, ''::text, NULL::smallint, NULL::uuid
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
  )
  -- La misma factura (RNC + NCF) dos veces en la MISMA ficha cuenta una sola:
  -- la otra sale como repetida, igual que en el 606. (16/11/2026) En fichas
  -- DISTINTAS del mismo suplidor (una empresa con dos vendedores: Pedro Racing,
  -- G&G/HAO) es una factura repartida: cuentan las dos partes (el TXT las
  -- junta en una línea).
  SELECT k0.id, k0.origen, k0.proveedor, k0.rnc, k0.ncf, k0.tipo,
         (CASE WHEN k0.tbs BETWEEN 1 AND 11 THEN k0.tbs ELSE 9 END) IN (1, 2, 3, 7, 11),
         k0.base * k0.signo, k0.itbis * k0.signo, k0.total * k0.signo,
         round(k0.itbis * k0.signo * k0.itbis_ret_pct / 100, 2), round(k0.base * k0.signo * k0.isr_pct / 100, 2), k0.isr_pct,
         CASE WHEN k0.motivo0 = 'ok'
               AND row_number() OVER (PARTITION BY k0.motivo0,
                     CASE WHEN k0.tipo IN ('B13','B17','E43','E47') THEN k0.rnc_emp ELSE k0.rnc END, k0.ncf, k0.ficha
                     ORDER BY k0.id) > 1
              THEN 'repetida' ELSE k0.motivo0 END
    FROM k0
$function$;

SELECT registrar_migracion('compras_606_factura_repartida.sql');
