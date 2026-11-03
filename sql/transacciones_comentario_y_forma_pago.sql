-- ════════════════════════════════════════════════════════════════════
-- Lista de Transacciones: comentario real y forma de pago (03/11/2026)
-- ════════════════════════════════════════════════════════════════════
-- Pedido del dueño (MotoPréstamos), igual que el sistema anterior:
--   1) Descripción: en los cobros de préstamo salía siempre el texto fijo
--      "Pago de prestamo (financiera)". Ahora sale el comentario que la
--      cajera escribe en el Recibo de Pago ("PAGO 1/6", "ABONO A 29/65",
--      "SALDO"...). Se guarda en prestamo_pagos.comentarios; el recibo se
--      amarra por recibos_ingreso.prestamo_pago_id. Sin comentario, sigue
--      el concepto de siempre.
--   2) Columna nueva forma_pago: Efectivo, Transferencia, Cheque, Tarjeta
--      (si se pagó con dos formas, salen las dos: "Efectivo + Transferencia").
--      Recibos: de recibos_ingreso.formas_pago. Facturas: Crédito, o las
--      formas de tipo_pago si es de contado.
--
-- Cambia lo que devuelve la función (columna nueva) → hay que borrarla y
-- crearla de nuevo; los permisos se vuelven a dar igual que antes.
-- Todo lo demás (fechas, montos, filtros, orden) queda idéntico.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.get_transacciones_diarias_sin_limite(date, date, uuid, text);

-- Nombre legible de una forma de pago: "TARJETA DE CREDITO" -> "Tarjeta de Crédito".
CREATE OR REPLACE FUNCTION public._forma_pago_nombre(p text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT NULLIF(
           replace(replace(replace(
             initcap(lower(btrim(COALESCE(p, '')))),
             ' De ', ' de '), 'Credito', 'Crédito'), 'Debito', 'Débito'),
           '')
$function$;

-- Formas de pago de un jsonb [{forma, monto, ...}], sin repetir, en su orden.
-- Una forma con monto 0 no se usó: no sale.
CREATE OR REPLACE FUNCTION public._formas_pago_texto(p_formas jsonb)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT string_agg(s.nom, ' + ' ORDER BY s.ord)
    FROM (
      SELECT public._forma_pago_nombre(x.e->>'forma') AS nom, min(x.ord) AS ord
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_formas) = 'array' THEN p_formas ELSE '[]'::jsonb END)
             WITH ORDINALITY AS x(e, ord)
       WHERE public._forma_pago_nombre(x.e->>'forma') IS NOT NULL
         AND NOT (x.e ? 'monto' AND COALESCE(NULLIF(x.e->>'monto', '')::numeric, 0) = 0)
       GROUP BY 1
    ) s
$function$;

CREATE FUNCTION public.get_transacciones_diarias_sin_limite(p_fecha_desde date, p_fecha_hasta date, p_cliente_id uuid DEFAULT NULL::uuid, p_tipo_transaccion text DEFAULT NULL::text)
 RETURNS TABLE(fecha timestamp with time zone, transaccion text, ncf text, cliente_codigo text, cliente_nombre text, descripcion text, debito numeric, credito numeric, forma_pago text)
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
          )::numeric AS cre,
          CASE
            WHEN UPPER(COALESCE(f.forma_pago, '')) = 'CREDITO' THEN 'Crédito'
            -- tipo_pago viene como 'EFECTIVO/TRANSFERENCIA': misma regla que los recibos.
            ELSE COALESCE(
              public._formas_pago_texto(
                (SELECT jsonb_agg(jsonb_build_object('forma', x.p) ORDER BY x.ord)
                   FROM unnest(string_to_array(COALESCE(f.tipo_pago, ''), '/')) WITH ORDINALITY AS x(p, ord))),
              'Efectivo')
          END AS fp_val
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
          d.total_devolucion::numeric AS cre,
          '' AS fp_val
      FROM public.devoluciones d
      LEFT JOIN public.clientes c ON d.cliente_id = c.id
      WHERE d.tenant_id = v_tenant

      UNION ALL

      -- RECIBOS DE INGRESO (LEFT JOIN: un recibo sin cliente tambien sale)
      -- Fecha REAL del cobro + hora de digitacion (para el orden del dia).
      -- Descripcion: el comentario del Recibo de Pago si lo tiene.
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
          COALESCE(
            NULLIF(btrim(regexp_replace(COALESCE(pp.comentarios, ''), '\s+', ' ', 'g')), ''),
            ri.concepto,
            'Recibo de Ingreso') AS desc_val,
          0::numeric AS deb,
          ri.monto_pagado::numeric AS cre,
          COALESCE(public._formas_pago_texto(ri.formas_pago),
                   public._forma_pago_nombre(pp.forma_pago),
                   '') AS fp_val
      FROM public.recibos_ingreso ri
      LEFT JOIN public.clientes c ON ri.cliente_id = c.id
      LEFT JOIN public.prestamo_pagos pp ON pp.id = ri.prestamo_pago_id
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
          nc.monto::numeric AS cre,
          '' AS fp_val
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
          0::numeric AS cre,
          '' AS fp_val
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
      tb.cre AS credito,
      tb.fp_val AS forma_pago
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

REVOKE ALL ON FUNCTION public.get_transacciones_diarias_sin_limite(date, date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_transacciones_diarias_sin_limite(date, date, uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('transacciones_comentario_y_forma_pago.sql');

COMMIT;
