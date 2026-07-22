-- =====================================================================
-- Lista de Transacciones: por FECHA REAL del documento, no por cuando
-- se digito/migro
-- ---------------------------------------------------------------------
-- Problema (MotoPrestamos Los Naranjos, 2026-07-21): la lista mostraba
-- recibos (PG), notas de credito (NC) y cargos (AB) por `created_at`. Como
-- la migracion diaria del SiiF inserta de golpe los documentos de varios
-- dias, TODO lo migrado aparecia en el dia de la corrida: la lista de hoy
-- traia los recibos del 17, 18 y 20 y los cargos del 14 al 17, mientras que
-- lo realmente hecho hoy (RI-0147626..31, NC-0000001 y el cargo AB-0010642)
-- quedaba mezclado en el monton.
--
-- Es el mismo criterio que ya se aplico a la caja en
-- sql/caja_recibos_por_fecha_real.sql: el documento cuenta por SU fecha.
--
-- Arreglo:
--   1) PG/NC/AB usan la `fecha` del documento, conservando la HORA de
--      digitacion para que el orden dentro del dia siga siendo el real.
--      Para quien digita el mismo dia (Morla, Caminero) el valor es
--      identico al `created_at` de antes: no cambia ningun numero.
--   2) El filtro del rango compara en hora de Santo Domingo. Antes
--      `fecha::date` se evaluaba en UTC, asi que lo digitado despues de
--      las 8:00 PM caia en el dia siguiente.
--   3) Facturas (FT) y devoluciones (DV) se quedan como estaban.
--
-- Supersede sql/transacciones_codigo_cliente.sql. Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_transacciones_diarias_sin_limite(p_fecha_desde date, p_fecha_hasta date, p_cliente_id uuid DEFAULT NULL::uuid, p_tipo_transaccion text DEFAULT NULL::text)
 RETURNS TABLE(fecha timestamp with time zone, transaccion text, ncf text, cliente_codigo text, cliente_nombre text, descripcion text, debito numeric, credito numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
BEGIN
  v_tenant := public.get_user_tenant();

  RETURN QUERY
  WITH transacciones_base AS (
      -- VENTAS (Facturas)
      SELECT
          CASE
            WHEN (
              UPPER(COALESCE(f.forma_pago, '')) = 'EFECTIVO'
              OR UPPER(COALESCE(f.notas, '')) LIKE '%POS_MOVIL%'
              OR UPPER(COALESCE(f.notas, '')) LIKE '%POS MOVIL%'
              OR UPPER(COALESCE(f.notas, '')) LIKE '%MOVIL%'
              OR UPPER(COALESCE(f.tipo_pago, '')) LIKE '%MOVIL%'
            ) THEN COALESCE(f.created_at, f.fecha)
            ELSE f.fecha
          END AS fecha,
          'FT' AS tipo,
          'FT-' || f.numero::text AS trans_num,
          COALESCE(f.ncf, '') AS ncf_val,
          f.cliente_id AS cli_id,
          COALESCE(NULLIF(c.codigo, ''), c.rnc, 'N/A') AS cli_cod,
          COALESCE(c.nombre, 'Cliente Generico') AS cli_nom,
          CASE
            WHEN (
              UPPER(COALESCE(f.forma_pago, '')) = 'EFECTIVO'
              OR UPPER(COALESCE(f.notas, '')) LIKE '%POS_MOVIL%'
              OR UPPER(COALESCE(f.notas, '')) LIKE '%POS MOVIL%'
              OR UPPER(COALESCE(f.notas, '')) LIKE '%MOVIL%'
              OR UPPER(COALESCE(f.tipo_pago, '')) LIKE '%MOVIL%'
            ) THEN 'Cuenta Contado Movil'
            ELSE 'Venta de Mercancias'
          END AS desc_val,
          f.total::numeric AS deb,
          (
            CASE
              WHEN UPPER(COALESCE(f.forma_pago, '')) IN ('CONTADO', 'EFECTIVO') THEN f.total
              ELSE 0
            END
          )::numeric AS cre
      FROM public.facturas f
      LEFT JOIN public.clientes c ON f.cliente_id = c.id
      WHERE f.tenant_id = v_tenant
        AND COALESCE(f.estado, '') <> 'ANULADA'

      UNION ALL

      -- DEVOLUCIONES
      SELECT
          d.created_at AS fecha,
          'DV' AS tipo,
          'DV-' || d.numero::text AS trans_num,
          COALESCE(d.ncf_modificado, '') AS ncf_val,
          d.cliente_id AS cli_id,
          COALESCE(NULLIF(c.codigo, ''), c.rnc, 'N/A') AS cli_cod,
          COALESCE(c.nombre, 'Cliente Generico') AS cli_nom,
          'Devolucion de Mercancias' AS desc_val,
          0::numeric AS deb,
          d.total_devolucion::numeric AS cre
      FROM public.devoluciones d
      LEFT JOIN public.clientes c ON d.cliente_id = c.id
      WHERE d.tenant_id = v_tenant

      UNION ALL

      -- RECIBOS DE INGRESO (LEFT JOIN: un recibo sin cliente tambien sale)
      -- Fecha REAL del cobro + hora de digitacion (para el orden del dia).
      SELECT
          ((COALESCE(ri.fecha, (ri.created_at AT TIME ZONE 'America/Santo_Domingo')::date)::timestamp
            + (ri.created_at AT TIME ZONE 'America/Santo_Domingo')::time)
           AT TIME ZONE 'America/Santo_Domingo') AS fecha,
          'PG' AS tipo,
          ri.numero AS trans_num,
          '' AS ncf_val,
          ri.cliente_id AS cli_id,
          COALESCE(NULLIF(c.codigo, ''), c.rnc, 'N/A') AS cli_cod,
          COALESCE(c.nombre, 'Cliente Generico') AS cli_nom,
          COALESCE(ri.concepto, 'Recibo de Ingreso') AS desc_val,
          0::numeric AS deb,
          ri.monto_pagado::numeric AS cre
      FROM public.recibos_ingreso ri
      LEFT JOIN public.clientes c ON ri.cliente_id = c.id
      WHERE ri.anulado = false
        AND ri.tenant_id = v_tenant

      UNION ALL

      -- NOTAS DE CREDITO (financiera): bajan la deuda del cliente -> CREDITO
      SELECT
          ((COALESCE(nc.fecha, (nc.created_at AT TIME ZONE 'America/Santo_Domingo')::date)::timestamp
            + (nc.created_at AT TIME ZONE 'America/Santo_Domingo')::time)
           AT TIME ZONE 'America/Santo_Domingo') AS fecha,
          'NC' AS tipo,
          nc.numero AS trans_num,
          '' AS ncf_val,
          nc.cliente_id AS cli_id,
          COALESCE(NULLIF(c.codigo, ''), c.rnc, 'N/A') AS cli_cod,
          COALESCE(c.nombre, 'N/A') AS cli_nom,
          'Nota de Credito' || CASE WHEN nc.comentarios IS NOT NULL AND btrim(nc.comentarios) <> ''
                                    THEN ' · ' || nc.comentarios ELSE '' END AS desc_val,
          0::numeric AS deb,
          nc.monto::numeric AS cre
      FROM public.prestamo_notas_credito nc
      LEFT JOIN public.clientes c ON nc.cliente_id = c.id
      WHERE nc.tenant_id = v_tenant
        AND nc.anulada = false

      UNION ALL

      -- OTRAS TRANSACCIONES (cargos manuales AB-): suben la deuda -> DEBITO
      SELECT
          ((COALESCE(cg.fecha, (cg.created_at AT TIME ZONE 'America/Santo_Domingo')::date)::timestamp
            + (cg.created_at AT TIME ZONE 'America/Santo_Domingo')::time)
           AT TIME ZONE 'America/Santo_Domingo') AS fecha,
          'AB' AS tipo,
          cg.numero AS trans_num,
          '' AS ncf_val,
          cg.cliente_id AS cli_id,
          COALESCE(NULLIF(c.codigo, ''), c.rnc, 'N/A') AS cli_cod,
          COALESCE(c.nombre, 'N/A') AS cli_nom,
          COALESCE(cg.tipo, 'Cargo') || CASE WHEN cg.concepto IS NOT NULL AND btrim(cg.concepto) <> ''
                                             THEN ' · ' || cg.concepto ELSE '' END AS desc_val,
          cg.monto::numeric AS deb,
          0::numeric AS cre
      FROM public.prestamo_cargos cg
      LEFT JOIN public.clientes c ON cg.cliente_id = c.id
      WHERE cg.tenant_id = v_tenant
        AND COALESCE(cg.anulado, false) = false
  )
  SELECT
      tb.fecha,
      tb.trans_num AS transaccion,
      tb.ncf_val AS ncf,
      tb.cli_cod AS cliente_codigo,
      tb.cli_nom AS cliente_nombre,
      tb.desc_val AS descripcion,
      tb.deb AS debito,
      tb.cre AS credito
  FROM transacciones_base tb
  WHERE
      -- el dia se decide en hora de Santo Domingo, no en UTC
      (tb.fecha AT TIME ZONE 'America/Santo_Domingo')::date BETWEEN p_fecha_desde AND p_fecha_hasta
      AND (p_cliente_id IS NULL OR tb.cli_id = p_cliente_id)
      AND (p_tipo_transaccion IS NULL OR tb.tipo = p_tipo_transaccion)
  ORDER BY
      tb.fecha DESC,
      tb.trans_num DESC;
END;
$function$;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('transacciones_por_fecha_real.sql');
  END IF;
END $$;

SELECT 'Lista de Transacciones por fecha real del documento' AS status;
