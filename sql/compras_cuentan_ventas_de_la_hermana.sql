-- ============================================================
-- compras_cuentan_ventas_de_la_hermana.sql (24/11/2026)
-- ------------------------------------------------------------
-- Decisión del dueño: REPUESTOS MORLA compra por las dos empresas (Morla y
-- REPUESTOS MORLA #1 comparten inventario por espejo, morla_vieja_hermana_
-- un_inventario.sql). La orden de compra tiene que ver la venta de AMBAS.
--
-- Antes cada cálculo contaba solo las facturas de la pieza propia: las ventas
-- de Morla #1 (22 und. en 30 días hoy) no existían para la orden automática.
--
-- config_empresa.compra_por_hermana = true en la empresa que COMPRA por la
-- pareja (hoy solo Morla). Ahí las ventas de una pieza suman las de su
-- GEMELA (productos_espejo), y lo que la hermana ya tenga pedido se descuenta.
-- La EXISTENCIA no se suma (es la misma mercancía). Las parejas donde cada
-- empresa compra lo suyo (Centenario, empresas hermanas nuevas) no cambian.
--
-- El borrador "agotado al vender" ya funcionaba: la copia del movimiento de
-- Morla #1 en Morla dispara fn_venta_alimenta_orden del lado de Morla.
--
-- Revisión (code-review high): las funciones siguen limitadas a la empresa de
-- la sesión (optimizar_orden_compra exige acceso; demanda por grupo propio).
-- El PRESUPUESTO (get_presupuesto_compras*) sigue por empresa: pendiente de
-- decisión del dueño.
-- Cambia SOLO esas líneas; el resto es la definición de producción de hoy.
-- Las envueltas se editan en su _impl_.
-- ============================================================

ALTER TABLE public.config_empresa ADD COLUMN IF NOT EXISTS compra_por_hermana boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.config_empresa.compra_por_hermana IS
  'Esta empresa compra por su hermana de inventario compartido: la orden de compra cuenta las ventas de las dos.';
UPDATE public.config_empresa SET compra_por_hermana = true
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND inventario_compartido_con IS NOT NULL;

-- La pieza y, si su empresa compra por la hermana, su gemela.
CREATE OR REPLACE FUNCTION public._producto_y_gemelos(p_producto uuid)
RETURNS uuid[]
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $f$
  SELECT ARRAY[p_producto] || CASE
    WHEN EXISTS (SELECT 1 FROM public.productos pr
                   JOIN public.config_empresa c ON c.tenant_id = pr.tenant_id
                  WHERE pr.id = p_producto AND c.compra_por_hermana)
    THEN COALESCE(ARRAY(SELECT e.par_id FROM public.productos_espejo e WHERE e.producto_id = p_producto), '{}'::uuid[])
    ELSE '{}'::uuid[] END;
$f$;
REVOKE ALL ON FUNCTION public._producto_y_gemelos(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._producto_y_gemelos(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public._impl_get_productos_para_orden_automatica(p_suplidor_id uuid)
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

  -- Cuando una linea deja de contar como mercancia en camino. La regla
  -- vive en UNA sola funcion porque tambien la usa el cierre automatico
  -- de ordenes: si estuviera escrita dos veces, un dia dirian cosas
  -- distintas y nadie se enteraria.
  v_caduca_dias := public.dias_caducidad_orden(p_suplidor_id);

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
      AND EXISTS (SELECT 1 FROM public.producto_grupos g0
                   WHERE g0.id = gm.grupo_id AND g0.combina_stock)
    WHERE p.suplidor_id = p_suplidor_id
      AND COALESCE(p.activo, true) = true
      AND NOT public.producto_en_suplidor_virtual(p.id)
      -- Solo por encargo: se pide cuando un cliente la encarga, no por rotacion.
      AND NOT COALESCE(p.solo_por_encargo, false)
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
      AND EXISTS (SELECT 1 FROM public.producto_grupos g1
                   WHERE g1.id = gmx.grupo_id AND g1.combina_stock)
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
    -- (24/11/2026) Las ventas de la pieza GEMELA de la empresa hermana
    -- cuentan si ESTA empresa compra por las dos (compra_por_hermana).
    CROSS JOIN LATERAL unnest(public._producto_y_gemelos(mi.producto_id)) AS g(pid)
    JOIN public.facturas_detalle fd ON fd.producto_id = g.pid
    JOIN public.facturas f ON f.id = fd.factura_id
    WHERE COALESCE(f.estado, '') <> 'Anulada'
      AND f.fecha >= NOW() - INTERVAL '180 days'
    GROUP BY mi.bucket_id
  ),
  camino_bucket_agg AS (
    SELECT mi.bucket_id,
      SUM(COALESCE(ocd.cantidad_pendiente, GREATEST(COALESCE(ocd.cantidad, 0) - COALESCE(ocd.cantidad_recibida, 0), 0)))::NUMERIC AS en_camino
    FROM miembros mi
    CROSS JOIN LATERAL unnest(public._producto_y_gemelos(mi.producto_id)) AS g(pid)
    JOIN public.ordenes_compra_detalle ocd ON ocd.producto_id = g.pid
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
    -- Por GRUPO y de cualquier suplidor (un_solo_preferido_por_grupo.sql)
    SELECT mi.bucket_id, SUM(ocd.cantidad)::NUMERIC AS en_borrador
    FROM miembros mi
    CROSS JOIN LATERAL unnest(public._producto_y_gemelos(mi.producto_id)) AS g(pid)
    JOIN public.ordenes_compra_detalle ocd ON ocd.producto_id = g.pid
    JOIN public.ordenes_compra oc ON oc.id = ocd.orden_compra_id
    WHERE COALESCE(oc.estado, 'Pendiente') = 'Pendiente'
      AND COALESCE(ocd.decision_estado, 'pedir_hoy') IN ('pedir_hoy', 'pedido', 'pendiente_ult_compra', 'agotado_en_venta')
      AND (oc.suplidor_id = p_suplidor_id OR oc.fecha_orden >= CURRENT_DATE - v_caduca_dias)
    GROUP BY mi.bucket_id
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
    LEFT JOIN borrador_prod_agg bp ON bp.bucket_id = gb.bucket_id
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
$function$;

CREATE OR REPLACE FUNCTION public._impl_get_productos_para_orden_automatica_v2(p_suplidor_id uuid)
 RETURNS TABLE(id uuid, codigo text, descripcion text, existencia numeric, min_stock numeric, max_stock numeric, precio numeric, costo numeric, itbis_pct numeric, ventas_90d numeric, cantidad_sugerida integer, grupo_id uuid, grupo_nombre text, es_preferido boolean, grupo_miembros integer, grupo_stock_combinado numeric, grupo_ventas_30d_combinada numeric, cantidad_ajustada integer, razon_ajuste text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_row             RECORD;
  v_grupo_id        UUID;
  v_es_pref         BOOLEAN;
  v_grupo_nombre    TEXT;
  v_miembros        INT;
  v_stock_combo     NUMERIC;
  v_demand_combo    NUMERIC;
  v_ajustada        INT;
  v_razon           TEXT;
  v_deficit         NUMERIC;
  v_ya_viene        NUMERIC;
  v_caduca_dias     INT := public.dias_caducidad_orden(p_suplidor_id);
BEGIN
  FOR v_row IN
    SELECT * FROM public.get_productos_para_orden_automatica(p_suplidor_id)
  LOOP
    v_grupo_id     := NULL;
    v_es_pref      := NULL;
    v_grupo_nombre := NULL;
    v_miembros     := NULL;
    v_stock_combo  := NULL;
    v_demand_combo := NULL;
    v_ajustada     := v_row.cantidad_sugerida;
    v_razon        := NULL;

    SELECT m.grupo_id, (m.prioridad = 1), g.nombre
      INTO v_grupo_id, v_es_pref, v_grupo_nombre
    FROM public.producto_grupo_miembros m
    JOIN public.producto_grupos g ON g.id = m.grupo_id
    WHERE m.producto_id = v_row.id
      AND g.combina_stock   -- un grupo de colores no ajusta nada
    LIMIT 1;  -- producto_id es llave: una pieza vive en un solo grupo

    IF v_grupo_id IS NOT NULL THEN
      SELECT
        COUNT(*),
        COALESCE(SUM(public.get_stock_actual(p.id)), 0)
      INTO v_miembros, v_stock_combo
      FROM public.producto_grupo_miembros m
      JOIN public.productos p ON p.id = m.producto_id
      WHERE m.grupo_id = v_grupo_id;

      SELECT COALESCE(SUM(fd.cantidad), 0)
        INTO v_demand_combo
      -- (24/11/2026) + ventas de las gemelas de la empresa hermana.
      FROM public.producto_grupo_miembros m
      CROSS JOIN LATERAL unnest(public._producto_y_gemelos(m.producto_id)) AS g(pid)
      JOIN public.facturas_detalle fd ON fd.producto_id = g.pid
      JOIN public.facturas f ON f.id = fd.factura_id
      WHERE m.grupo_id = v_grupo_id
        AND COALESCE(f.estado, '') <> 'Anulada'
        AND f.fecha >= CURRENT_DATE - 30;

      IF v_demand_combo > 0 AND v_stock_combo >= v_demand_combo * 1.5 THEN
        v_ajustada := 0;
        v_razon := 'Grupo ya tiene ' ||
          ROUND((v_stock_combo / NULLIF(v_demand_combo, 0) * 30)::NUMERIC, 0)::TEXT ||
          ' dias de stock';
      ELSIF v_es_pref THEN
        -- >>> LO NUEVO <<< Lo que ya viene para el grupo: en camino (mismas
        -- reglas de la v1) + borradores que van en la orden.
        SELECT
          COALESCE((
            SELECT SUM(COALESCE(ocd.cantidad_pendiente,
                     GREATEST(COALESCE(ocd.cantidad, 0) - COALESCE(ocd.cantidad_recibida, 0), 0)))
            FROM public.producto_grupo_miembros m
            CROSS JOIN LATERAL unnest(public._producto_y_gemelos(m.producto_id)) AS g(pid)
            JOIN public.ordenes_compra_detalle ocd ON ocd.producto_id = g.pid
            JOIN public.ordenes_compra oc ON oc.id = ocd.orden_compra_id
            WHERE m.grupo_id = v_grupo_id
              AND COALESCE(oc.estado, 'Pendiente') IN ('Enviada', 'Parcial')
              AND COALESCE(ocd.estado_linea, 'pendiente') IN ('pendiente', 'parcial')
              AND oc.fecha_orden >= CURRENT_DATE - v_caduca_dias
          ), 0)
          + COALESCE((
            SELECT SUM(ocd.cantidad)
            FROM public.producto_grupo_miembros m
            CROSS JOIN LATERAL unnest(public._producto_y_gemelos(m.producto_id)) AS g(pid)
            JOIN public.ordenes_compra_detalle ocd ON ocd.producto_id = g.pid
            JOIN public.ordenes_compra oc ON oc.id = ocd.orden_compra_id
            WHERE m.grupo_id = v_grupo_id
              AND COALESCE(oc.estado, 'Pendiente') = 'Pendiente'
              AND COALESCE(ocd.decision_estado, 'pedir_hoy') IN ('pedir_hoy', 'pedido', 'pendiente_ult_compra', 'agotado_en_venta')
              AND (oc.suplidor_id = p_suplidor_id OR oc.fecha_orden >= CURRENT_DATE - v_caduca_dias)
          ), 0)
        INTO v_ya_viene;

        -- El preferido cubre el deficit del grupo, menos lo que ya viene
        v_deficit := GREATEST(0, v_demand_combo - v_stock_combo - v_ya_viene);
        IF v_deficit > v_row.cantidad_sugerida THEN
          v_ajustada := CEIL(v_deficit)::INT;
          v_razon := 'Aumentado: cubre deficit del grupo ('
            || ROUND(v_deficit, 0)::TEXT || ' und.)';
        END IF;
      ELSIF NOT v_es_pref AND v_row.existencia > 0 THEN
        -- Sustituto que YA TIENE stock propio: no se pide. El preferido
        -- del grupo cubre la demanda; pedir el sustituto duplica inventario.
        v_ajustada := 0;
        v_razon := 'No pedido: ya tiene ' || ROUND(v_row.existencia, 0)::TEXT
          || ' und. y el preferido del grupo cubre la demanda';
      ELSIF NOT v_es_pref AND v_row.cantidad_sugerida > 1 THEN
        -- Sustituto SIN stock propio: reducir a 30% (respaldo del preferido)
        v_ajustada := GREATEST(0, FLOOR(v_row.cantidad_sugerida * 0.3))::INT;
        IF v_ajustada < v_row.cantidad_sugerida THEN
          v_razon := 'Reducido: el preferido del grupo cubre el grueso ('
            || (v_row.cantidad_sugerida - v_ajustada)::TEXT || ' und. ahorradas)';
        END IF;
      END IF;
    END IF;

    id                         := v_row.id;
    codigo                     := v_row.codigo;
    descripcion                := v_row.descripcion;
    existencia                 := v_row.existencia;
    min_stock                  := v_row.min_stock;
    max_stock                  := v_row.max_stock;
    precio                     := v_row.precio;
    costo                      := v_row.costo;
    itbis_pct                  := v_row.itbis_pct;
    ventas_90d                 := v_row.ventas_90d;
    cantidad_sugerida          := v_row.cantidad_sugerida;
    grupo_id                   := v_grupo_id;
    grupo_nombre               := v_grupo_nombre;
    es_preferido               := v_es_pref;
    grupo_miembros             := v_miembros;
    grupo_stock_combinado      := v_stock_combo;
    grupo_ventas_30d_combinada := v_demand_combo;
    cantidad_ajustada          := v_ajustada;
    razon_ajuste               := v_razon;

    RETURN NEXT;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_productos_movimiento(p_ids uuid[])
 RETURNS TABLE(producto_id uuid, existencia numeric, ventas_30d numeric, ventas_90d numeric, costo numeric, precio numeric, margen_pct numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant UUID;
BEGIN
  v_tenant := public.get_user_tenant();
  IF v_tenant IS NULL THEN
    RETURN;  -- sin sesion -> 0 filas
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    public.get_stock_actual(p.id)::NUMERIC,
    COALESCE((SELECT SUM(fd.cantidad) FROM public.facturas_detalle fd
      JOIN public.facturas f ON f.id = fd.factura_id
      WHERE fd.producto_id = ANY(public._producto_y_gemelos(p.id)) AND f.fecha >= NOW() - INTERVAL '30 days'
        AND COALESCE(f.estado, '') <> 'Anulada'), 0)::NUMERIC,
    COALESCE((SELECT SUM(fd.cantidad) FROM public.facturas_detalle fd
      JOIN public.facturas f ON f.id = fd.factura_id
      WHERE fd.producto_id = ANY(public._producto_y_gemelos(p.id)) AND f.fecha >= NOW() - INTERVAL '90 days'
        AND COALESCE(f.estado, '') <> 'Anulada'), 0)::NUMERIC,
    COALESCE(p.costo, 0)::NUMERIC,
    COALESCE(p.precio, 0)::NUMERIC,
    CASE WHEN p.precio > 0 AND p.costo > 0 AND p.precio > p.costo
         THEN ROUND(((p.precio - p.costo) / p.precio * 100)::NUMERIC, 1) ELSE 0 END
  FROM public.productos p
  WHERE p.id = ANY(p_ids)
    AND p.tenant_id = v_tenant;
END;
$function$;

CREATE OR REPLACE FUNCTION public.optimizar_orden_compra(p_tenant_id uuid, p_items jsonb, p_presupuesto numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_tenant      UUID;
  v_total       NUMERIC := 0;
  v_acc         NUMERIC := 0;
  v_item        RECORD;
  v_resultado   JSONB := '[]'::JSONB;
  v_urgencia    TEXT;
  v_ratio_keep  NUMERIC;
BEGIN
  v_tenant := COALESCE(p_tenant_id, public.get_user_tenant());
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin tenant'; END IF;
  -- (24/11/2026) Solo la empresa propia (o una a la que el usuario tiene acceso).
  PERFORM public._exigir_acceso_empresa(v_tenant);
  IF p_presupuesto IS NULL OR p_presupuesto <= 0 THEN
    RAISE EXCEPTION 'presupuesto invalido';
  END IF;

  SELECT COALESCE(SUM((value->>'subtotal')::NUMERIC), 0) INTO v_total
  FROM jsonb_array_elements(p_items);

  IF v_total <= p_presupuesto THEN
    RETURN jsonb_build_object(
      'optimizada', false,
      'razon', 'la_orden_no_excede_presupuesto',
      'total_actual', v_total,
      'presupuesto', p_presupuesto,
      'items', p_items
    );
  END IF;

  FOR v_item IN
    WITH base AS (
      SELECT
        (it.value->>'producto_id')::UUID  AS producto_id,
        (it.value->>'cantidad')::NUMERIC  AS cantidad,
        (it.value->>'subtotal')::NUMERIC  AS subtotal
      FROM jsonb_array_elements(p_items) it
    ),
    enriquecido AS (
      SELECT
        b.*,
        COALESCE(public.get_stock_actual(b.producto_id), 0) AS existencia,
        COALESCE(p.precio, 0) AS precio_venta,
        COALESCE(NULLIF(p.costo, 0), NULLIF(p.precio, 0), 0) AS costo_u,
        COALESCE((
          SELECT SUM(fd.cantidad)
          FROM public.facturas_detalle fd
          JOIN public.facturas f ON f.id = fd.factura_id
          -- (24/11/2026) + ventas de la gemela de la empresa hermana; la pieza
          -- tiene que ser de esta empresa (p.tenant_id abajo).
          WHERE fd.producto_id = ANY(public._producto_y_gemelos(b.producto_id))
            AND p.tenant_id = v_tenant
            AND f.fecha >= NOW() - INTERVAL '90 days'
            AND COALESCE(f.estado, '') <> 'Anulada'
        ), 0) AS ventas_90d
      FROM base b
      LEFT JOIN public.productos p ON p.id = b.producto_id AND p.tenant_id = v_tenant
    ),
    scored AS (
      SELECT
        e.*,
        CASE WHEN e.costo_u > 0
          THEN ROUND(((e.precio_venta - e.costo_u) / e.costo_u) * 100, 1)
          ELSE 0 END AS margen_pct,
        -- Retorno por peso invertido: margen relativo x velocidad de venta
        CASE WHEN e.costo_u > 0
          THEN ROUND(((e.precio_venta - e.costo_u) / e.costo_u) * (e.ventas_90d / 90.0), 4)
          ELSE 0 END AS score_retorno
      FROM enriquecido e
    )
    SELECT * FROM scored
    ORDER BY
      -- 1ro: urgentes (sin stock y con ventas) SIEMPRE primero
      CASE WHEN existencia = 0 AND ventas_90d > 0 THEN 0 ELSE 1 END,
      -- 2do: lo que mas genera por peso invertido
      score_retorno DESC,
      -- 3ro: desempate por movimiento
      ventas_90d DESC
  LOOP
    v_urgencia := CASE
      WHEN v_item.existencia = 0 AND v_item.ventas_90d > 0 THEN 'urgente'
      WHEN v_item.ventas_90d > 0 THEN 'proxima'
      ELSE 'puede_esperar'
    END;

    IF v_acc + v_item.subtotal <= p_presupuesto THEN
      v_resultado := v_resultado || jsonb_build_object(
        'producto_id',     v_item.producto_id,
        'urgencia',        v_urgencia,
        'accion',          'mantener',
        'cantidad_nueva',  v_item.cantidad,
        'subtotal_nuevo',  v_item.subtotal,
        'margen_pct',      v_item.margen_pct,
        'score_retorno',   v_item.score_retorno
      );
      v_acc := v_acc + v_item.subtotal;
    ELSIF v_urgencia = 'urgente' THEN
      v_resultado := v_resultado || jsonb_build_object(
        'producto_id',     v_item.producto_id,
        'urgencia',        v_urgencia,
        'accion',          'mantener',
        'cantidad_nueva',  v_item.cantidad,
        'subtotal_nuevo',  v_item.subtotal,
        'margen_pct',      v_item.margen_pct,
        'score_retorno',   v_item.score_retorno,
        'forzado_urgente', true
      );
      v_acc := v_acc + v_item.subtotal;
    ELSE
      v_ratio_keep := GREATEST(0, p_presupuesto - v_acc) / NULLIF(v_item.subtotal, 0);
      IF v_ratio_keep >= 0.5 THEN
        v_resultado := v_resultado || jsonb_build_object(
          'producto_id',    v_item.producto_id,
          'urgencia',       v_urgencia,
          'accion',         'reducir',
          'cantidad_nueva', ROUND(v_item.cantidad * v_ratio_keep, 0),
          'subtotal_nuevo', ROUND(v_item.subtotal * v_ratio_keep, 2),
          'margen_pct',     v_item.margen_pct,
          'score_retorno',  v_item.score_retorno
        );
        v_acc := v_acc + (v_item.subtotal * v_ratio_keep);
      ELSE
        v_resultado := v_resultado || jsonb_build_object(
          'producto_id',    v_item.producto_id,
          'urgencia',       v_urgencia,
          'accion',         'quitar',
          'cantidad_nueva', 0,
          'subtotal_nuevo', 0,
          'margen_pct',     v_item.margen_pct,
          'score_retorno',  v_item.score_retorno
        );
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'optimizada',  true,
    'criterio',    'retorno_por_peso_invertido',
    'total_antes', ROUND(v_total, 2),
    'total_despues', ROUND(v_acc, 2),
    'presupuesto', p_presupuesto,
    'ahorro',      ROUND(v_total - v_acc, 2),
    'items',       v_resultado
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_demanda_grupo(p_grupo_id uuid, p_dias integer DEFAULT 30)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_tenant       UUID;
  v_total_vendido NUMERIC := 0;
  v_total_stock  NUMERIC := 0;
  v_total_costo  NUMERIC := 0;
  v_miembros     INT     := 0;
BEGIN
  v_tenant := public.get_user_tenant();

  SELECT
    COUNT(*),
    COALESCE(SUM(public.get_stock_actual(p.id)), 0),
    COALESCE(SUM(p.costo), 0)
    INTO v_miembros, v_total_stock, v_total_costo
  FROM public.producto_grupo_miembros m
  JOIN public.productos p ON p.id = m.producto_id
  JOIN public.producto_grupos g ON g.id = m.grupo_id
  WHERE m.grupo_id = p_grupo_id
    AND g.tenant_id = v_tenant;

  SELECT COALESCE(SUM(fd.cantidad), 0)
    INTO v_total_vendido
  -- (24/11/2026) + ventas de las gemelas de la empresa hermana. El grupo
  -- tiene que ser de esta empresa.
  FROM public.producto_grupo_miembros m
  JOIN public.producto_grupos g ON g.id = m.grupo_id AND g.tenant_id = v_tenant
  CROSS JOIN LATERAL unnest(public._producto_y_gemelos(m.producto_id)) AS gm(pid)
  JOIN public.facturas_detalle fd ON fd.producto_id = gm.pid
  JOIN public.facturas f ON f.id = fd.factura_id
  WHERE m.grupo_id = p_grupo_id
    AND COALESCE(f.estado, '') <> 'Anulada'
    AND f.fecha >= CURRENT_DATE - p_dias;

  RETURN json_build_object(
    'grupo_id',         p_grupo_id,
    'miembros',         v_miembros,
    'vendido_periodo',  v_total_vendido,
    'stock_combinado',  v_total_stock,
    'costo_promedio',   CASE WHEN v_miembros > 0 THEN v_total_costo / v_miembros ELSE 0 END,
    'dias',             p_dias
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('compras_cuentan_ventas_de_la_hermana.sql');
