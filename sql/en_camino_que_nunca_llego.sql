-- =====================================================================
-- La mercancia que nunca llego deja de tapar el pedido
-- ---------------------------------------------------------------------
-- (2026-08-23) El dueno reporto que el CILINDRO COMPLETO PLATINA 125
-- (36JK0064) llevaba dias agotado y la Orden Automatica no lo proponia.
-- Abrio y cerro el producto en Mercancias y entonces si aparecio.
--
-- No era el boton. Era la cuenta:
--
--     WHERE stock_objetivo - stock - en_camino - en_borrador > 0
--
-- Ese producto tenia 1 unidad "en camino" de ORD-0021, del 8 de julio,
-- con cantidad recibida CERO y 46 dias esperando. Y como no tenia minimo
-- ni maximo configurado, su stock_objetivo colapsaba a 1:
--
--     1 - 0 - 1 - 0 = 0     ->  no es > 0  ->  descartado
--
-- Al abrir el producto, el formulario le puso minimo 1 / maximo 2. Eso
-- subio el objetivo a 2, el deficit paso a 1, y reaparecio. El producto
-- nunca estuvo mal: estaba secuestrado por una unidad que no existe.
--
-- >>> POR QUE NO SE ARREGLA SOLO <<<
-- `recalcular_estado_recepcion_orden` descuenta lo que LLEGA. Una linea
-- que nunca llego se queda con cantidad_recibida = 0 y estado 'pendiente'
-- para siempre; la orden pasa a 'Parcial' y ahi se queda. El dialogo de
-- la orden promete "al recibir la compra se rebaja sola", y eso es cierto
-- solo para lo que llega. Para lo que no llega no se rebaja nada, nunca.
--
-- Existe el boton "marcar como no suplido", que hace justo esto. Pero hay
-- que acordarse, linea por linea: hoy hay 153 lineas de mas de 30 dias
-- abiertas, la mas vieja de 67.
--
-- >>> LA REGLA <<<
-- Una linea deja de contar como mercancia en camino cuando pasa el tiempo
-- de entrega del suplidor MAS un ciclo completo de compras. Traducido: ya
-- hiciste otra ronda de pedidos y eso todavia no llego. Minimo 21 dias,
-- para no castigar una demora normal. Para MAGNA MOTORS son 7 + 13 = 21.
--
-- >>> NO SE TOCA NI UN DATO <<<
-- Las lineas siguen abiertas, con su cantidad pendiente y su historial.
-- El boton "no suplido" sigue funcionando igual. Lo unico que cambia es
-- que dejan de contarse como inventario que va llegando, que es lo unico
-- que esta funcion calcula. Revertir es volver a poner la version vieja.
--
-- El borrador (orden en estado Pendiente) NO se toca: es la canasta de
-- trabajo del dueno y esta ahi a proposito, para reabrirla con todos sus
-- productos dentro.
--
-- Idempotente.
-- =====================================================================

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS dias_caducidad_en_camino integer;

COMMENT ON COLUMN public.config_empresa.dias_caducidad_en_camino IS
  'Dias tras los cuales una linea de orden no recibida deja de contar como mercancia en camino. NULL = automatico (entrega + ciclo del suplidor, minimo 21).';

CREATE OR REPLACE FUNCTION public.get_productos_para_orden_automatica(p_suplidor_id uuid)
 RETURNS TABLE(id uuid, codigo text, descripcion text, existencia numeric, min_stock numeric, max_stock numeric, precio numeric, costo numeric, itbis_pct numeric, ventas_90d numeric, cantidad_sugerida integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_lt           JSON;
  v_lead_dias    NUMERIC := 7;
  v_ciclo_dias   NUMERIC := 13;
  v_caduca_dias  INT     := 21;
  v_cob_reorden  NUMERIC := 15.0;
  v_cob_objetivo NUMERIC := 22.0;
BEGIN
  -- Calibracion por suplidor (lead time + ciclo de compra reales)
  BEGIN
    v_lt := public.get_suplidor_lead_time(p_suplidor_id);
    v_cob_reorden  := COALESCE((v_lt->>'cobertura_reorden')::NUMERIC, 15.0);
    v_cob_objetivo := COALESCE((v_lt->>'cobertura_objetivo')::NUMERIC, 22.0);
  EXCEPTION WHEN OTHERS THEN
    v_cob_reorden := 15.0; v_cob_objetivo := 22.0;
  END;

  -- Cuando una linea deja de contar como mercancia en camino.
  -- Regla: el tiempo de entrega del suplidor MAS un ciclo completo de
  -- compras. Si ya hiciste otra ronda de pedidos y eso todavia no llego,
  -- no va a llegar. Minimo 21 dias para no castigar una demora normal.
  BEGIN
    v_lead_dias  := COALESCE((v_lt->>'lead_dias')::NUMERIC, 7);
    v_ciclo_dias := COALESCE((v_lt->>'ciclo_dias')::NUMERIC, 13);
  EXCEPTION WHEN OTHERS THEN
    v_lead_dias := 7; v_ciclo_dias := 13;
  END;
  v_caduca_dias := GREATEST(21, CEIL(v_lead_dias + v_ciclo_dias))::INT;

  -- La empresa puede fijar otro criterio sin tocar esta funcion.
  SELECT COALESCE(ce.dias_caducidad_en_camino, v_caduca_dias)
    INTO v_caduca_dias
  FROM public.config_empresa ce
  WHERE ce.tenant_id = public.get_user_tenant()
  LIMIT 1;
  v_caduca_dias := COALESCE(v_caduca_dias, 21);

  RETURN QUERY
  WITH productos_suplidor AS (
    SELECT
      p.id,
      p.codigo,
      p.descripcion,
      p.suplidor_id,
      public.get_stock_actual(p.id)::NUMERIC AS existencia,
      COALESCE(p.min_stock, 0)::NUMERIC AS min_stock,
      COALESCE(p.max_stock, 0)::NUMERIC AS max_stock,
      COALESCE(p.precio, 0)::NUMERIC AS precio,
      COALESCE(
        NULLIF(p.costo, 0),
        (
          SELECT NULLIF(pr.costo, 0)
          FROM public.presentaciones pr
          WHERE pr.producto_id = p.id
          LIMIT 1
        ),
        NULLIF(p.precio, 0),
        0
      )::NUMERIC AS costo,
      COALESCE(p.itbis_pct, 0)::NUMERIC AS itbis_pct,
      gm.grupo_id
    FROM public.productos p
    LEFT JOIN public.producto_grupo_miembros gm ON gm.producto_id = p.id
    WHERE p.suplidor_id = p_suplidor_id
      AND COALESCE(p.activo, true) = true
      AND NOT public.producto_en_suplidor_virtual(p.id)
  ),
  grupo_base AS (
    SELECT
      ps.*,
      COALESCE(ps.grupo_id::TEXT, ps.id::TEXT) AS bucket_id
    FROM productos_suplidor ps
  ),
  -- Miembros de esos buckets en TODO el catálogo (incluye equivalentes
  -- de otros suplidores, igual que la versión anterior)
  miembros AS (
    SELECT px.id AS producto_id,
           COALESCE(gmx.grupo_id::TEXT, px.id::TEXT) AS bucket_id
    FROM public.productos px
    LEFT JOIN public.producto_grupo_miembros gmx ON gmx.producto_id = px.id
    WHERE COALESCE(px.activo, true) = true
      AND COALESCE(gmx.grupo_id::TEXT, px.id::TEXT) IN (SELECT gb.bucket_id FROM grupo_base gb)
  ),
  stock_bucket_agg AS (
    SELECT mi.bucket_id, SUM(public.get_stock_actual(mi.producto_id))::NUMERIC AS stock_bucket
    FROM miembros mi
    GROUP BY mi.bucket_id
  ),
  ventas_bucket_agg AS (
    SELECT mi.bucket_id,
      COALESCE(SUM(fd.cantidad) FILTER (WHERE f.fecha >= NOW() - INTERVAL '15 days'), 0)::NUMERIC AS v15,
      COALESCE(SUM(fd.cantidad) FILTER (WHERE f.fecha >= NOW() - INTERVAL '30 days'), 0)::NUMERIC AS v30,
      COALESCE(SUM(fd.cantidad) FILTER (WHERE f.fecha >= NOW() - INTERVAL '90 days'), 0)::NUMERIC AS v90,
      COALESCE(SUM(fd.cantidad), 0)::NUMERIC AS v180
    FROM miembros mi
    JOIN public.facturas_detalle fd ON fd.producto_id = mi.producto_id
    JOIN public.facturas f ON f.id = fd.factura_id
    WHERE COALESCE(f.estado, '') <> 'Anulada'
      AND f.fecha >= NOW() - INTERVAL '180 days'
    GROUP BY mi.bucket_id
  ),
  camino_bucket_agg AS (
    SELECT mi.bucket_id,
      SUM(COALESCE(ocd.cantidad_pendiente, GREATEST(COALESCE(ocd.cantidad, 0) - COALESCE(ocd.cantidad_recibida, 0), 0)))::NUMERIC AS en_camino
    FROM miembros mi
    JOIN public.ordenes_compra_detalle ocd ON ocd.producto_id = mi.producto_id
    JOIN public.ordenes_compra oc ON oc.id = ocd.orden_compra_id
    WHERE COALESCE(oc.estado, 'Pendiente') IN ('Enviada', 'Parcial')
      AND COALESCE(ocd.estado_linea, 'pendiente') IN ('pendiente', 'parcial')
      -- >>> LO QUE NO LLEGO DEJA DE CONTAR <<<
      -- Una orden vieja con lineas nunca recibidas dejaba al producto
      -- fuera de la orden automatica para siempre: agotarse no bastaba,
      -- habia que agotarse Y que no quedara ninguna linea abierta.
      -- La linea NO se toca: sigue viva para el boton 'no suplido' y para
      -- el historial. Solo deja de contarse como inventario que va
      -- llegando, que es lo unico que aqui se esta calculando.
      AND oc.fecha_orden >= CURRENT_DATE - v_caduca_dias
    GROUP BY mi.bucket_id
  ),
  borrador_prod_agg AS (
    SELECT ocd.producto_id, SUM(ocd.cantidad)::NUMERIC AS en_borrador
    FROM public.ordenes_compra_detalle ocd
    JOIN public.ordenes_compra oc ON oc.id = ocd.orden_compra_id
    WHERE oc.suplidor_id = p_suplidor_id
      AND COALESCE(oc.estado, 'Pendiente') = 'Pendiente'
    GROUP BY ocd.producto_id
  ),
  metricas AS (
    SELECT
      gb.*,
      COALESCE(sb.stock_bucket, 0) AS stock_bucket,
      COALESCE(vb.v15, 0) AS ventas_15d_bucket,
      COALESCE(vb.v30, 0) AS ventas_30d_bucket,
      COALESCE(vb.v90, 0) AS ventas_90d_bucket,
      COALESCE(vb.v180, 0) AS ventas_180d_bucket,
      COALESCE(cb.en_camino, 0) AS cantidad_en_camino_bucket,
      COALESCE(bp.en_borrador, 0) AS cantidad_borrador_producto
    FROM grupo_base gb
    LEFT JOIN stock_bucket_agg sb ON sb.bucket_id = gb.bucket_id
    LEFT JOIN ventas_bucket_agg vb ON vb.bucket_id = gb.bucket_id
    LEFT JOIN camino_bucket_agg cb ON cb.bucket_id = gb.bucket_id
    LEFT JOIN borrador_prod_agg bp ON bp.producto_id = gb.id
  ),
  calculado AS (
    SELECT
      m.*,
      GREATEST(m.ventas_15d_bucket / 15.0, m.ventas_30d_bucket / 30.0, m.ventas_90d_bucket / 90.0, m.ventas_180d_bucket / 180.0) AS demanda_diaria,
      GREATEST(
        m.min_stock,
        CEIL(GREATEST(m.ventas_15d_bucket / 15.0, m.ventas_30d_bucket / 30.0, m.ventas_90d_bucket / 90.0, m.ventas_180d_bucket / 180.0) * v_cob_reorden),
        CASE WHEN m.ventas_180d_bucket > 0 AND m.stock_bucket <= 0 THEN 1 ELSE 0 END
      ) AS punto_reorden,
      CASE
        WHEN m.ventas_30d_bucket <= 0
          AND m.ventas_180d_bucket > 0
          AND m.stock_bucket <= 0
        THEN GREATEST(1, m.min_stock)
        ELSE GREATEST(
          CASE WHEN m.max_stock > 0 THEN m.max_stock ELSE 0 END,
          CEIL(GREATEST(m.ventas_15d_bucket / 15.0, m.ventas_30d_bucket / 30.0, m.ventas_90d_bucket / 90.0, m.ventas_180d_bucket / 180.0) * v_cob_objetivo),
          CASE WHEN m.ventas_180d_bucket > 0 AND m.stock_bucket <= 0 THEN 1 ELSE 0 END,
          m.min_stock + 1
        )
      END AS stock_objetivo
    FROM metricas m
    WHERE GREATEST(m.ventas_15d_bucket, m.ventas_30d_bucket, m.ventas_90d_bucket, m.ventas_180d_bucket) > 0
  )
  SELECT
    c.id,
    c.codigo,
    c.descripcion,
    c.existencia,
    c.min_stock,
    c.max_stock,
    c.precio,
    c.costo,
    c.itbis_pct,
    c.ventas_90d_bucket AS ventas_90d,
    GREATEST(0, CEIL(c.stock_objetivo - c.stock_bucket - c.cantidad_en_camino_bucket - c.cantidad_borrador_producto))::INT AS cantidad_sugerida
  FROM calculado c
  WHERE c.stock_bucket + c.cantidad_en_camino_bucket + c.cantidad_borrador_producto <= c.punto_reorden
    AND c.stock_objetivo - c.stock_bucket - c.cantidad_en_camino_bucket - c.cantidad_borrador_producto > 0
  ORDER BY
    (c.punto_reorden - (c.stock_bucket + c.cantidad_en_camino_bucket + c.cantidad_borrador_producto)) DESC,
    c.ventas_15d_bucket DESC,
    c.ventas_30d_bucket DESC,
    c.codigo ASC;
END;
$function$
;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('en_camino_que_nunca_llego.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Los agotados de MAGNA MOTORS que ORD-0021 tenia secuestrados.
SELECT
  (SELECT count(*) FROM public.get_productos_para_orden_automatica('ece448e5-9a41-4318-9dc0-6a1a3a27ceff'::uuid)) AS sugeridos_magna,
  (SELECT string_agg(codigo, ', ' ORDER BY codigo)
     FROM public.get_productos_para_orden_automatica('ece448e5-9a41-4318-9dc0-6a1a3a27ceff'::uuid)) AS codigos,
  -- Estos estaban agotados, con ventas, y no aparecian.
  (SELECT count(*) FROM public.get_productos_para_orden_automatica('ece448e5-9a41-4318-9dc0-6a1a3a27ceff'::uuid)
    WHERE codigo IN ('JZ231601','PF131239','JK131814','JZ231600','36JK0064')) AS de_los_5_bloqueados_ahora_aparecen,
  -- Las lineas siguen intactas: no se borro nada.
  (SELECT count(*) FROM public.ordenes_compra_detalle ocd
     JOIN public.ordenes_compra oc ON oc.id=ocd.orden_compra_id
    WHERE oc.numero='ORD-0021' AND COALESCE(ocd.estado_linea,'pendiente')='pendiente') AS lineas_ORD0021_intactas;
