-- =====================================================================
-- La orden se cierra cuando el suplidor trae lo que trajo
-- ---------------------------------------------------------------------
-- (2026-08-23) De 58 ordenes de compra, solo 5 llegaron a "Recibida".
-- Las otras 53 estan en el limbo: Parcial=24, Pendiente=19, Enviada=10.
-- De 592 lineas pedidas historicamente, solo 139 tienen algo recibido.
--
-- El motivo es simple: la orden solo cierra si llega TODO. Como nunca
-- llega todo, ninguna cierra. Y el dueno trabaja asi —guarda la orden
-- cuando el suplidor esta al frente, y no la vuelve a abrir hasta la
-- proxima visita— o sea que nadie va a cerrarlas a mano.
--
-- >>> LA SALIDA DE EMERGENCIA ESTABA ROTA <<<
-- Existe el boton "marcar como no suplido", y llama a
-- `cancelar_linea_orden_compra_no_suplida`. Esa funcion NO EXISTE en
-- produccion: su migracion nunca se corrio. El boton lleva desde siempre
-- tirando error. Por eso solo hay 8 lineas canceladas y se acumularon
-- 222 fantasmas. Aqui se restaura, identica al repo.
--
-- >>> NO CORRER orden_compra_enviada_rotacion_equivalentes.sql <<<
-- Ese archivo tiene la funcion que falta, pero tambien una version VIEJA
-- de get_productos_para_orden_automatica que borraria el arreglo de
-- en_camino_que_nunca_llego.sql. Por eso aqui solo se rescata la pieza
-- que falta, y no se corre aquel archivo.
--
-- >>> LO QUE HACE ESTE ARCHIVO <<<
-- 1. `dias_caducidad_orden()`: la regla de cuando una orden se da por
--    vencida, en UN solo lugar. Antes estaba escrita dentro de
--    get_productos_para_orden_automatica; ahora las dos la leen de aqui,
--    porque una regla de dinero escrita dos veces termina diciendo cosas
--    distintas y nadie se entera.
-- 2. `cancelar_linea_orden_compra_no_suplida()`: restaurada.
-- 3. `cerrar_ordenes_vencidas_del_suplidor()`: al entrar una compra de
--    ese suplidor, sus ordenes que ya pasaron la ventana se cierran — lo
--    que no vino, no vino. Hace lo mismo que el boton manual, en bloque.
--
-- >>> QUE NO TOCA <<<
-- Los borradores (estado Pendiente) NO se cierran nunca: esa es la
-- canasta de trabajo del dueno, donde se van acumulando los productos
-- entre visita y visita. Solo se cierran ordenes ya PEDIDAS (Enviada o
-- Parcial) y solo despues de su ventana.
--
-- Idempotente.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) La regla, en un solo sitio
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dias_caducidad_orden(p_suplidor_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_lt    json;
  v_lead  numeric := 7;
  v_ciclo numeric := 13;
  v_dias  int;
BEGIN
  -- El tiempo de entrega del suplidor MAS un ciclo completo de compras:
  -- si ya hiciste otra ronda de pedidos y eso no llego, no va a llegar.
  BEGIN
    v_lt    := public.get_suplidor_lead_time(p_suplidor_id);
    v_lead  := COALESCE((v_lt->>'lead_dias')::numeric, 7);
    v_ciclo := COALESCE((v_lt->>'ciclo_dias')::numeric, 13);
  EXCEPTION WHEN OTHERS THEN
    v_lead := 7; v_ciclo := 13;
  END;

  -- Minimo 21 dias, para no castigar una demora normal.
  v_dias := GREATEST(21, CEIL(v_lead + v_ciclo))::int;

  SELECT COALESCE(ce.dias_caducidad_en_camino, v_dias)
    INTO v_dias
  FROM public.config_empresa ce
  WHERE ce.tenant_id = public.get_user_tenant()
  LIMIT 1;

  RETURN COALESCE(v_dias, 21);
END $fn$;

GRANT EXECUTE ON FUNCTION public.dias_caducidad_orden(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 2) La salida de emergencia que faltaba (copia exacta del repo)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancelar_linea_orden_compra_no_suplida(p_detalle_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_orden_id UUID;
  v_estado TEXT;
BEGIN
  SELECT orden_compra_id INTO v_orden_id
  FROM public.ordenes_compra_detalle WHERE id = p_detalle_id;

  IF v_orden_id IS NULL THEN
    RAISE EXCEPTION 'No se encontro la linea de orden %', p_detalle_id;
  END IF;

  UPDATE public.ordenes_compra_detalle
  SET cantidad_pedida    = COALESCE(cantidad_pedida, cantidad, 0),
      cantidad_recibida  = COALESCE(cantidad_recibida, 0),
      cantidad_pendiente = 0,
      estado_linea       = 'cancelada'
  WHERE id = p_detalle_id
    AND COALESCE(estado_linea, 'pendiente') IN ('pendiente', 'parcial');

  v_estado := public.recalcular_estado_recepcion_orden(v_orden_id);
  RETURN v_estado;
END $fn$;

GRANT EXECUTE ON FUNCTION public.cancelar_linea_orden_compra_no_suplida(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3) Al llegar la compra, cerrar lo que ya vencio
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cerrar_ordenes_vencidas_del_suplidor(p_suplidor_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_dias     int;
  v_ordenes  int := 0;
  v_lineas   int := 0;
  v_unidades numeric := 0;
  v_nums     text[] := ARRAY[]::text[];
  v_n        int;
  v_u        numeric;
  r          record;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin empresa'; END IF;
  v_dias := public.dias_caducidad_orden(p_suplidor_id);

  FOR r IN
    SELECT oc.id, oc.numero
    FROM public.ordenes_compra oc
    WHERE oc.tenant_id = v_tenant
      AND oc.suplidor_id = p_suplidor_id
      -- Solo ordenes YA PEDIDAS. El borrador es la canasta de trabajo y
      -- no se toca: ahi se juntan los productos entre visita y visita.
      AND COALESCE(oc.estado, 'Pendiente') IN ('Enviada', 'Parcial')
      AND oc.fecha_orden < CURRENT_DATE - v_dias
      AND EXISTS (SELECT 1 FROM public.ordenes_compra_detalle d
                   WHERE d.orden_compra_id = oc.id
                     AND COALESCE(d.estado_linea, 'pendiente') IN ('pendiente', 'parcial'))
  LOOP
    -- Contar ANTES de cerrar: despues la cantidad pendiente ya es cero.
    SELECT count(*),
           COALESCE(SUM(GREATEST(COALESCE(d.cantidad_pendiente,
             COALESCE(d.cantidad_pedida, d.cantidad, 0) - COALESCE(d.cantidad_recibida, 0)), 0)), 0)
      INTO v_n, v_u
    FROM public.ordenes_compra_detalle d
    WHERE d.orden_compra_id = r.id
      AND COALESCE(d.estado_linea, 'pendiente') IN ('pendiente', 'parcial');

    UPDATE public.ordenes_compra_detalle d
    SET cantidad_pedida    = COALESCE(d.cantidad_pedida, d.cantidad, 0),
        cantidad_recibida  = COALESCE(d.cantidad_recibida, 0),
        cantidad_pendiente = 0,
        estado_linea       = 'cancelada'
    WHERE d.orden_compra_id = r.id
      AND COALESCE(d.estado_linea, 'pendiente') IN ('pendiente', 'parcial');

    PERFORM public.recalcular_estado_recepcion_orden(r.id);

    v_ordenes  := v_ordenes + 1;
    v_lineas   := v_lineas + COALESCE(v_n, 0);
    v_unidades := v_unidades + COALESCE(v_u, 0);
    v_nums     := array_append(v_nums, r.numero);
  END LOOP;

  RETURN json_build_object(
    'ok', true, 'ordenes', v_ordenes, 'lineas', v_lineas,
    'unidades', v_unidades, 'numeros', v_nums, 'ventana_dias', v_dias);
END $fn$;

GRANT EXECUTE ON FUNCTION public.cerrar_ordenes_vencidas_del_suplidor(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 4) La orden automatica pasa a leer la regla del punto 1
-- ------------------------------------------------------------
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

SELECT public.registrar_migracion('cerrar_lo_que_no_llego.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'cancelar_linea_orden_compra_no_suplida')            AS boton_no_suplido_restaurado,
  public.dias_caducidad_orden('ece448e5-9a41-4318-9dc0-6a1a3a27ceff'::uuid) AS ventana_magna,
  -- REGRESION: la orden automatica tiene que seguir dando 12 para MAGNA
  (SELECT count(*) FROM public.get_productos_para_orden_automatica(
     'ece448e5-9a41-4318-9dc0-6a1a3a27ceff'::uuid))                        AS sugeridos_magna,
  -- Cuantas ordenes cerraria la proxima compra de cada suplidor. Solo se
  -- cuentan: este archivo no cierra nada por su cuenta.
  (SELECT count(*) FROM public.ordenes_compra oc
    WHERE oc.tenant_id = '00000000-0000-0000-0000-000000000001'
      AND COALESCE(oc.estado, 'Pendiente') IN ('Enviada', 'Parcial')
      AND oc.fecha_orden < CURRENT_DATE - public.dias_caducidad_orden(oc.suplidor_id)
      AND EXISTS (SELECT 1 FROM public.ordenes_compra_detalle d
                   WHERE d.orden_compra_id = oc.id
                     AND COALESCE(d.estado_linea, 'pendiente') IN ('pendiente', 'parcial'))) AS ordenes_que_se_cerrarian;
