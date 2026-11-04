-- =====================================================================
-- Piezas "solo por encargo" (04/11/2026)
-- ---------------------------------------------------------------------
-- Hay piezas que rotan tan poco que solo se piden cuando un cliente las
-- encarga. Hasta hoy volvian solas a la Orden de Compra (por la reposicion
-- automatica o porque se acabaron vendiendo) y habia que sacarlas a mano
-- cada vez.
--
-- Ahora, en la columna DECISION de la orden hay "Solo por encargo". Al
-- elegirla:
--   * la linea sale de esa orden (no se pide), como "Poca rotacion";
--   * la pieza queda marcada (productos.solo_por_encargo) y ya no entra
--     sola: ni por la reposicion automatica, ni al acabarse vendiendo, ni
--     en los avisos de "agotado sin pedir" / Equipo IA.
-- Se sigue pudiendo agregar a mano cuando un cliente la encarga. La marca
-- se quita desde la ficha del producto.
--
-- Las funciones se copiaron de PRODUCCION (04/11) y solo se les anadio el
-- filtro. Idempotente.
-- =====================================================================
BEGIN;

-- 1. La marca en el producto
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS solo_por_encargo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.productos.solo_por_encargo IS
  'Pieza de muy poca rotacion que solo se pide cuando un cliente la encarga: no entra sola en las ordenes de compra.';

-- 2. La base tiene que aceptar la decision nueva (primero y a proposito:
--    si falta, no falla al instalar, falla el dia que se usa)
ALTER TABLE public.ordenes_compra_detalle
  DROP CONSTRAINT IF EXISTS chk_ordenes_compra_detalle_decision_estado;

ALTER TABLE public.ordenes_compra_detalle
  ADD CONSTRAINT chk_ordenes_compra_detalle_decision_estado
  CHECK (decision_estado = ANY (ARRAY[
    'pedir_hoy'::text,
    'pedido'::text,
    'no_disponible'::text,
    'pospuesto_presupuesto'::text,
    'poca_rotacion'::text,
    'sustituido'::text,
    'pendiente_ult_compra'::text,
    'agotado_en_venta'::text,
    -- Solo se pide cuando un cliente la encarga.
    'por_encargo'::text
  ]));

-- 3. Elegir "Solo por encargo" en la orden marca la pieza. Lo hace la base
--    para que no dependa de por donde se grabe la orden.
CREATE OR REPLACE FUNCTION public.fn_linea_por_encargo_marca_producto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.decision_estado = 'por_encargo' AND NEW.producto_id IS NOT NULL THEN
    UPDATE public.productos
       SET solo_por_encargo = true
     WHERE id = NEW.producto_id
       AND tenant_id = NEW.tenant_id
       AND NOT solo_por_encargo;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_linea_por_encargo_marca_producto ON public.ordenes_compra_detalle;
CREATE TRIGGER trg_linea_por_encargo_marca_producto
  AFTER INSERT OR UPDATE OF decision_estado ON public.ordenes_compra_detalle
  FOR EACH ROW
  WHEN (NEW.decision_estado = 'por_encargo')
  EXECUTE FUNCTION public.fn_linea_por_encargo_marca_producto();

REVOKE ALL ON FUNCTION public.fn_linea_por_encargo_marca_producto() FROM PUBLIC, anon, authenticated;

-- 4. Lo que alimenta la orden deja fuera las piezas por encargo

-- 4a. Se acabo vendiendola
CREATE OR REPLACE FUNCTION public.fn_venta_alimenta_orden()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stock    numeric;
  v_suplidor uuid;
  v_codigo   text;
  v_ajeno    boolean;
BEGIN
  BEGIN
    -- Solo donde este encendido.
    IF NOT EXISTS (SELECT 1 FROM public.config_empresa ce
                    WHERE ce.tenant_id = NEW.tenant_id
                      AND COALESCE(ce.feat_venta_alimenta_orden, false)) THEN
      RETURN NEW;
    END IF;

    -- Todavia queda: no hay nada que reponer.
    v_stock := public.get_stock_actual(NEW.producto_id);
    IF v_stock > 0 THEN RETURN NEW; END IF;

    SELECT p.suplidor_id, p.codigo INTO v_suplidor, v_codigo
    FROM public.productos p
    WHERE p.id = NEW.producto_id AND p.tenant_id = NEW.tenant_id
      AND COALESCE(p.activo, true)
      -- Pieza que solo se pide por encargo: que se acabe es lo normal.
      AND NOT COALESCE(p.solo_por_encargo, false);

    -- Sin suplidor no hay borrador donde ponerlo. No es un fallo: es el
    -- centinela `sin_suplidor` el que se encarga de eso.
    IF v_suplidor IS NULL THEN RETURN NEW; END IF;

    -- Si ya esta pedido por otro motivo, no se toca. El calculo de
    -- reposicion ya decidio una cantidad mirando la rotacion.
    SELECT EXISTS (
      SELECT 1 FROM public.ordenes_compra_detalle d
      JOIN public.ordenes_compra oc ON oc.id = d.orden_compra_id
      WHERE oc.tenant_id = NEW.tenant_id
        AND d.producto_id = NEW.producto_id
        AND COALESCE(oc.estado, 'Pendiente') IN ('Pendiente', 'Enviada', 'Parcial')
        AND COALESCE(d.estado_linea, 'pendiente') IN ('pendiente', 'parcial')
        AND COALESCE(d.decision_estado, '') <> 'agotado_en_venta'
    ) INTO v_ajeno;
    IF v_ajeno THEN RETURN NEW; END IF;

    PERFORM public.poner_en_borrador_del_suplidor(
      NEW.tenant_id, v_suplidor, NEW.producto_id, abs(NEW.cantidad),
      'agotado_en_venta',
      format('Se acabo al vender %s', COALESCE(NEW.referencia_doc, 'una factura')));

  EXCEPTION WHEN OTHERS THEN
    -- LA VENTA MANDA. Pase lo que pase aqui, la factura se graba.
    BEGIN
      INSERT INTO public.venta_orden_fallos
        (tenant_id, producto_id, movimiento, referencia, error)
      VALUES (NEW.tenant_id, NEW.producto_id, NEW.id, NEW.referencia_doc, SQLERRM);
    EXCEPTION WHEN OTHERS THEN NULL;   -- ni anotando el fallo se tumba una venta
    END;
  END;

  RETURN NEW;
END $function$;

-- 4b. Reposicion automatica (sugerencia de la orden)
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
$function$;

-- 4c. Centinela "agotado sin pedir"
CREATE OR REPLACE FUNCTION public.centinela_agotado_sin_pedir(p_tenant_id uuid)
 RETURNS TABLE(huella text, titulo text, detalle text, monto numeric, datos jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH vend AS (
    SELECT fd.producto_id, SUM(fd.cantidad) AS und, SUM(fd.importe) AS fact
    FROM public.facturas_detalle fd
    JOIN public.facturas f ON f.id = fd.factura_id
    WHERE fd.tenant_id = p_tenant_id
      AND f.fecha >= now() - interval '60 days'
      AND COALESCE(f.estado, '') <> 'ANULADA'
      AND fd.producto_id IS NOT NULL
    GROUP BY 1
  ),
  en_orden AS (
    -- Cualquier orden viva cuenta, incluido el BORRADOR: si ya esta
    -- apuntado para la proxima visita del suplidor, no hay nada que avisar.
    SELECT DISTINCT d.producto_id
    FROM public.ordenes_compra_detalle d
    JOIN public.ordenes_compra oc ON oc.id = d.orden_compra_id
    WHERE oc.tenant_id = p_tenant_id
      AND COALESCE(oc.estado, 'Pendiente') IN ('Pendiente', 'Enviada', 'Parcial')
      AND COALESCE(d.estado_linea, 'pendiente') IN ('pendiente', 'parcial')
      AND d.producto_id IS NOT NULL
  )
  SELECT
    p.id::text,
    format('%s sin existencia y sin pedir', COALESCE(p.codigo, '?')),
    format('%s — vendio %s und. en 60 dias (RD$%s) y esta en cero. No aparece en ninguna orden%s.',
           left(COALESCE(p.descripcion, ''), 48),
           round(v.und, 0),
           to_char(round(v.fact, 0), 'FM999,999,999'),
           CASE WHEN pr.nombre IS NULL THEN ', y ademas no tiene suplidor asignado'
                ELSE format('. Suplidor: %s', pr.nombre) END),
    round(v.fact, 2),
    jsonb_build_object(
      'producto_id', p.id, 'codigo', p.codigo, 'descripcion', p.descripcion,
      'und_60d', v.und, 'facturado_60d', round(v.fact, 2),
      'suplidor_id', p.suplidor_id, 'suplidor', pr.nombre)
  FROM public.productos p
  JOIN vend v ON v.producto_id = p.id
  LEFT JOIN public.proveedores pr ON pr.id = p.suplidor_id
  WHERE p.tenant_id = p_tenant_id
    AND COALESCE(p.activo, true)
    AND NOT COALESCE(p.solo_por_encargo, false)
    AND public.get_stock_actual(p.id) <= 0
    AND NOT EXISTS (SELECT 1 FROM en_orden e WHERE e.producto_id = p.id)
    AND EXISTS (SELECT 1 FROM public.inventario_movimientos im
                 WHERE im.producto_id = p.id AND im.tipo::text = 'ENTRADA')
  ORDER BY v.fact DESC;
$function$;

-- 4d. Equipo IA: agotados que se venden
CREATE OR REPLACE FUNCTION public.equipo_agotados_que_se_venden(p_limite integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_res jsonb;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Este módulo es del dueño.';
  END IF;

  WITH v AS (
    SELECT fd.producto_id,
           COALESCE(SUM(fd.cantidad) FILTER (WHERE f.fecha >= CURRENT_DATE - 30), 0) AS v30,
           SUM(fd.cantidad) AS v90,
           COUNT(DISTINCT fd.factura_id) AS fact90,
           MAX(f.fecha) AS ultima
    FROM public.facturas_detalle fd
    JOIN public.facturas f ON f.id = fd.factura_id
    WHERE f.tenant_id = v_tenant
      AND f.fecha >= CURRENT_DATE - 90
      AND f.estado <> 'Anulada'
      AND fd.producto_id IS NOT NULL
    GROUP BY fd.producto_id
  ), prod AS (
    SELECT p.id, p.codigo, p.descripcion, p.precio, p.costo,
           v.v30, v.v90, v.fact90, v.ultima,
           (SELECT g.id FROM public.producto_grupo_miembros m
              JOIN public.producto_grupos g ON g.id = m.grupo_id
             WHERE m.producto_id = p.id AND g.combina_stock
             ORDER BY g.id LIMIT 1) AS grupo_id
    FROM v
    JOIN public.productos p ON p.id = v.producto_id
    WHERE p.tenant_id = v_tenant
      AND COALESCE(p.activo, true)
      AND p.reemplazado_por IS NULL
      AND NOT COALESCE(p.solo_por_encargo, false)
      AND COALESCE(p.stock_mode, 'auto') = 'auto'
      -- Mano de obra y servicios se facturan, pero no se compran.
      AND p.descripcion !~* '^\s*(MANO DE OBRA|SERVICIO)'
  ), unidad AS (
    -- Un grupo que suma existencia es UNA pieza para el cliente.
    SELECT COALESCE(pr.grupo_id, pr.id) AS uid,
           bool_or(pr.grupo_id IS NOT NULL) AS es_grupo,
           SUM(pr.v30) AS v30, SUM(pr.v90) AS v90, SUM(pr.fact90) AS fact90,
           MAX(pr.ultima) AS ultima,
           (array_agg(pr.id ORDER BY pr.v90 DESC))[1] AS rep_id
    FROM prod pr
    GROUP BY 1
  ), miembros AS (
    SELECT u.uid, u.rep_id,
           CASE WHEN u.es_grupo
                THEN ARRAY(SELECT m.producto_id FROM public.producto_grupo_miembros m WHERE m.grupo_id = u.uid)
                ELSE ARRAY[u.uid] END AS ids
    FROM unidad u
  ), con_stock AS (
    SELECT u.*, mi.ids,
           (SELECT COALESCE(SUM(COALESCE(public.get_stock_actual(x), 0)), 0) FROM unnest(mi.ids) x) AS existencia
    FROM unidad u JOIN miembros mi ON mi.uid = u.uid
    WHERE u.fact90 >= 4
  ), faltan AS (
    SELECT c.*,
           p.codigo, p.descripcion, p.precio, p.costo,
           -- Lo que se vende en un mes, menos lo que hay. Mínimo 1.
           GREATEST(CEIL(GREATEST(c.v30, c.v90 / 3.0) - GREATEST(c.existencia, 0)), 1) AS sugerido,
           ROUND(c.v90 / 3.0 * COALESCE(p.precio, 0)) AS venta_mes
    FROM con_stock c
    JOIN public.productos p ON p.id = c.rep_id
    WHERE c.existencia <= 0
       OR c.existencia < c.v30 / 2.0   -- se acaba en menos de 2 semanas
  ), marcado AS (
    SELECT f.*,
           -- La fecha viaja: una orden de hace 2 meses que no llega no es
           -- "ya pedido", es un reclamo pendiente al suplidor.
           (SELECT jsonb_build_object('numero', o.numero, 'fecha', o.fecha_orden, 'estado', o.estado)
              FROM public.ordenes_compra_detalle d
              JOIN public.ordenes_compra o ON o.id = d.orden_compra_id
             WHERE o.tenant_id = v_tenant
               AND o.estado IN ('Pendiente', 'Enviada', 'Parcial')
               AND o.fecha_orden >= CURRENT_DATE - 60
               AND d.cerrada_at IS NULL
               AND COALESCE(d.cantidad_pendiente, d.cantidad, 0) > 0
               AND d.producto_id = ANY(f.ids)
             ORDER BY o.fecha_orden DESC LIMIT 1) AS en_orden,
           EXISTS (SELECT 1 FROM public.suplidor_virtual_items s
                    WHERE s.tenant_id = v_tenant AND s.estado = 'pendiente'
                      AND s.orden_compra_pedida_id IS NULL
                      AND s.producto_id = ANY(f.ids)) AS en_suplidor_virtual
    FROM faltan f
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'producto_id', m.rep_id, 'codigo', m.codigo, 'descripcion', m.descripcion,
           'precio', m.precio, 'costo', m.costo,
           'existencia', m.existencia, 'vendidos_30d', m.v30, 'vendidos_90d', m.v90,
           'facturas_90d', m.fact90, 'ultima_venta', m.ultima,
           'estado', CASE WHEN m.existencia <= 0 THEN 'agotado' ELSE 'por_agotarse' END,
           'conteo_raro', m.existencia < 0,
           'es_grupo', m.es_grupo,
           'sugerido', m.sugerido, 'venta_mes', m.venta_mes,
           'en_orden', m.en_orden, 'en_suplidor_virtual', m.en_suplidor_virtual
         ) ORDER BY (m.en_orden IS NULL AND NOT m.en_suplidor_virtual) DESC, m.venta_mes DESC), '[]'::jsonb)
    INTO v_res
  FROM (SELECT * FROM marcado ORDER BY venta_mes DESC LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 30), 100))) m;

  RETURN v_res;
END $function$;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('orden_compra_solo_por_encargo.sql');

COMMIT;

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_name = 'productos' AND column_name = 'solo_por_encargo')           AS tiene_la_marca,
  (SELECT pg_get_constraintdef(oid) LIKE '%por_encargo%' FROM pg_constraint
    WHERE conname = 'chk_ordenes_compra_detalle_decision_estado')                        AS acepta_la_decision,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_linea_por_encargo_marca_producto') AS marca_al_elegir,
  (SELECT count(*) FROM pg_proc WHERE proname IN ('fn_venta_alimenta_orden','get_productos_para_orden_automatica',
     'centinela_agotado_sin_pedir','equipo_agotados_que_se_venden')
     AND pg_get_functiondef(oid) LIKE '%solo_por_encargo%')                               AS funciones_con_filtro_de_4;
