-- ============================================================
-- FIX: ventas moviles en caja y transacciones diarias
--
-- 1) Permite guardar el desglose de contado caja vs contado movil
--    cuando se registra un cierre.
-- 2) Actualiza get_transacciones_diarias_sin_limite para:
--    - Mostrar ventas moviles como "Cuenta Contado Movil".
--    - Usar created_at como hora visible para ventas moviles antiguas
--      que se guardaron sin fecha/hora real.
--    - Tratar forma_pago = EFECTIVO como contado para las ventas
--      creadas por el POS movil anterior.
-- ============================================================

ALTER TABLE public.cierres_caja
  ADD COLUMN IF NOT EXISTS total_ventas_contado_caja numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_ventas_contado_movil numeric DEFAULT 0;

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

      -- PAGOS (Recibos de Ingreso)
      SELECT
          ri.created_at AS fecha,
          'PG' AS tipo,
          ri.numero AS trans_num,
          '' AS ncf_val,
          ri.cliente_id AS cli_id,
          c.id::text AS cli_cod,
          c.nombre AS cli_nom,
          ri.concepto AS desc_val,
          0::numeric AS deb,
          ri.monto_pagado::numeric AS cre
      FROM public.recibos_ingreso ri
      JOIN public.clientes c ON ri.cliente_id = c.id
      WHERE ri.anulado = false
        AND ri.tenant_id = v_tenant
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

GRANT EXECUTE ON FUNCTION public.get_transacciones_diarias_sin_limite(date, date, uuid, text) TO authenticated;
