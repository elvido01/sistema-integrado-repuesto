-- =====================================================================
-- LISTA DE TRANSACCIONES: agrega Nota de Credito (NC) y Otras
-- Transacciones (AB), y hace visible todo recibo de ingreso (RI/PG)
-- ---------------------------------------------------------------------
-- Pedido 2026-07-04: en la Lista de Transacciones deben salir tambien
-- recibo de ingreso, devolucion, nota de credito y otras transacciones.
-- FT / DV / PG(RI) ya estaban en la funcion; este fix:
--   1. Agrega NC  (prestamo_notas_credito)  -> CREDITO (baja deuda)
--   2. Agrega AB  (prestamo_cargos)         -> DEBITO  (sube deuda)
--   3. RI: JOIN a clientes pasa a LEFT JOIN para que un recibo sin
--      cliente vinculado no desaparezca de la lista.
--
-- IMPORTANTE: correr DESPUES de sql/nota_credito_financiera.sql (usa la
-- tabla prestamo_notas_credito) y de sql/otras_transacciones_cargos.sql
-- (prestamo_cargos). Re-ejecutable.
-- =====================================================================

DROP FUNCTION IF EXISTS public.get_transacciones_diarias_sin_limite(date, date, uuid, text);

CREATE OR REPLACE FUNCTION public.get_transacciones_diarias_sin_limite(
  p_fecha_desde date,
  p_fecha_hasta date,
  p_cliente_id uuid DEFAULT NULL::uuid,
  p_tipo_transaccion text DEFAULT NULL::text
)
RETURNS TABLE(
  fecha timestamp with time zone,
  transaccion text,
  ncf text,
  cliente_codigo text,
  cliente_nombre text,
  descripcion text,
  debito numeric,
  credito numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
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
          COALESCE(c.id::text, 'N/A') AS cli_cod,
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
          COALESCE(c.id::text, 'N/A') AS cli_cod,
          COALESCE(c.nombre, 'Cliente Generico') AS cli_nom,
          'Devolucion de Mercancias' AS desc_val,
          0::numeric AS deb,
          d.total_devolucion::numeric AS cre
      FROM public.devoluciones d
      LEFT JOIN public.clientes c ON d.cliente_id = c.id
      WHERE d.tenant_id = v_tenant

      UNION ALL

      -- RECIBOS DE INGRESO (LEFT JOIN: un recibo sin cliente tambien sale)
      SELECT
          ri.created_at AS fecha,
          'PG' AS tipo,
          ri.numero AS trans_num,
          '' AS ncf_val,
          ri.cliente_id AS cli_id,
          COALESCE(c.id::text, 'N/A') AS cli_cod,
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
          nc.created_at AS fecha,
          'NC' AS tipo,
          nc.numero AS trans_num,
          '' AS ncf_val,
          nc.cliente_id AS cli_id,
          COALESCE(c.id::text, 'N/A') AS cli_cod,
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
          cg.created_at AS fecha,
          'AB' AS tipo,
          cg.numero AS trans_num,
          '' AS ncf_val,
          cg.cliente_id AS cli_id,
          COALESCE(c.id::text, 'N/A') AS cli_cod,
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
      tb.fecha::date BETWEEN p_fecha_desde AND p_fecha_hasta
      AND (p_cliente_id IS NULL OR tb.cli_id = p_cliente_id)
      AND (p_tipo_transaccion IS NULL OR tb.tipo = p_tipo_transaccion)
  ORDER BY
      tb.fecha DESC,
      tb.trans_num DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_transacciones_diarias_sin_limite(date, date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_transacciones_diarias_sin_limite(date, date, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'Lista de Transacciones con NC y AB lista' AS status;
