-- ============================================================
-- FIX: get_transacciones_diarias_sin_limite - Filtrar por tenant_id
-- Esta función fue omitida en la migración multi-tenant original.
-- Ejecutar en producción (Supabase SQL Editor)
-- ============================================================

DROP FUNCTION IF EXISTS get_transacciones_diarias_sin_limite(date, date, uuid, text);

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
  v_tenant UUID;
BEGIN
  v_tenant := public.get_user_tenant();

  RETURN QUERY
  WITH transacciones_base AS (
      -- VENTAS (Facturas)
      SELECT
          f.fecha,
          'FT' as tipo,
          'FT-' || f.numero::text AS trans_num,
          COALESCE(f.ncf, '') as ncf_val,
          f.cliente_id as cli_id,
          COALESCE(c.id::text, 'N/A') AS cli_cod,
          COALESCE(c.nombre, 'Cliente Genérico') AS cli_nom,
          'Venta de Mercancías' AS desc_val,
          f.total::numeric AS deb,
          (CASE WHEN f.forma_pago = 'CONTADO' THEN f.total ELSE 0 END)::numeric AS cre
      FROM public.facturas f 
      LEFT JOIN public.clientes c ON f.cliente_id = c.id
      WHERE f.tenant_id = v_tenant

      UNION ALL

      -- DEVOLUCIONES
      SELECT
          d.created_at AS fecha,
          'DV' as tipo,
          'DV-' || d.numero::text AS trans_num,
          COALESCE(d.ncf_modificado, '') AS ncf_val,
          d.cliente_id as cli_id,
          COALESCE(c.id::text, 'N/A') AS cli_cod,
          COALESCE(c.nombre, 'Cliente Genérico') AS cli_nom,
          'Devolución de Mercancías' AS desc_val,
          0::numeric AS deb,
          d.total_devolucion::numeric AS cre
      FROM public.devoluciones d 
      LEFT JOIN public.clientes c ON d.cliente_id = c.id
      WHERE d.tenant_id = v_tenant
      
      UNION ALL

      -- PAGOS (Recibos de Ingreso)
      SELECT 
          ri.created_at as fecha,
          'PG' as tipo,
          ri.numero as trans_num,
          '' as ncf_val,
          ri.cliente_id as cli_id,
          c.id::text as cli_cod,
          c.nombre as cli_nom,
          ri.concepto as desc_val,
          0::numeric as deb,
          ri.monto_pagado::numeric as cre
      FROM public.recibos_ingreso ri 
      JOIN public.clientes c ON ri.cliente_id = c.id
      WHERE ri.anulado = false
        AND ri.tenant_id = v_tenant
  )
  SELECT
      tb.fecha,
      tb.trans_num as transaccion,
      tb.ncf_val as ncf,
      tb.cli_cod as cliente_codigo,
      tb.cli_nom as cliente_nombre,
      tb.desc_val as descripcion,
      tb.deb as debito,
      tb.cre as credito
  FROM
      transacciones_base tb
  WHERE
      tb.fecha::date BETWEEN p_fecha_desde AND p_fecha_hasta
      AND (p_cliente_id IS NULL OR tb.cli_id = p_cliente_id)
      AND (p_tipo_transaccion IS NULL OR tb.tipo = p_tipo_transaccion)
  ORDER BY
      tb.fecha DESC, tb.trans_num DESC;
END;
$$;

-- Asegurar que los usuarios autenticados pueden ejecutar la función
GRANT EXECUTE ON FUNCTION public.get_transacciones_diarias_sin_limite(date, date, uuid, text) TO authenticated;
