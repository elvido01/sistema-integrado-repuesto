-- =====================================================================
-- EQUIPO IA: PROMOCIONAR LO QUE SE VENDE + AGOTADOS QUE SE VENDEN
-- ---------------------------------------------------------------------
-- (2026-10-04) Medido sobre las promociones de los ultimos 60 dias: de 17
-- piezas promocionadas, 13 vendieron CERO unidades las dos semanas antes y
-- las dos despues (faroles, asientos, amortiguadores con 1-3 en estante).
-- El elegidor ponia "lo que mas se vende" en la ULTIMA de 5 prioridades:
-- liquidaba capital dormido en vez de traer gente a la tienda.
--
-- 1) _equipo_candidatos_de: misma firma (CREATE OR REPLACE reemplaza).
--    - Orden nuevo: mas_vendidos (el "gancho") > buen_margen >
--      recien_llegados > alta_existencia > baja_rotacion. Una pieza que cae
--      en varios cajones se queda en el de mas prioridad, asi que lo que se
--      vende ya no se pierde dentro de "baja rotacion" ni "alta existencia".
--    - Minimo 5 en estante (antes 2): no se anuncia lo que no se puede
--      entregar a todo el que venga.
--
-- 2) equipo_agotados_que_se_venden: piezas con 4+ facturas en 90 dias que
--    estan en 0 (o negativo) o que se acaban en menos de 2 semanas al ritmo
--    de los ultimos 30 dias. Un grupo de equivalentes que suma existencia
--    (combina_stock) cuenta como UNA pieza: si el hermano tiene, no falta.
--    Dice si ya esta en una orden abierta o en Suplidor Virtual.
--    Medido el 04/10: 26 piezas; 25 ya estan en alguna orden abierta (varias
--    en ORD-0030, que no termina de llegar). La cuenta "a mano" del dia
--    anterior (23 piezas, RD$28,000/mes) estaba inflada: baterias y aceite
--    RS8 tienen equivalentes con existencia y aqui no salen.
--
-- 3) equipo_agotado_a_suplidor_virtual: el boton "Pedir" del cuadro. Mete
--    la pieza en Suplidor Virtual (no crea la orden: el dueño elige el
--    suplidor alli). No duplica si ya esta pendiente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._equipo_candidatos_de(p_tenant uuid, p_limite integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT p.id, p.codigo, p.descripcion, p.precio, p.costo, p.imagen_url, p.created_at,
           COALESCE(public.get_stock_actual(p.id), 0) AS existencia,
           CASE WHEN p.precio > 0 AND p.costo > 0
                THEN ROUND(((p.precio - p.costo) / p.precio * 100)::numeric, 1) END AS margen_pct,
           CASE WHEN p.costo > 0 THEN p.precio - p.costo END AS ganancia_unidad,
           COALESCE((SELECT SUM(fd.cantidad) FROM public.facturas_detalle fd
                     JOIN public.facturas f ON f.id = fd.factura_id
                     WHERE fd.producto_id = p.id AND f.tenant_id = p_tenant
                       AND f.fecha >= CURRENT_DATE - INTERVAL '30 days'
                       AND f.estado <> 'Anulada'), 0) AS vendidos_30d,
           COALESCE((SELECT SUM(fd.cantidad) FROM public.facturas_detalle fd
                     JOIN public.facturas f ON f.id = fd.factura_id
                     WHERE fd.producto_id = p.id AND f.tenant_id = p_tenant
                       AND f.fecha >= CURRENT_DATE - INTERVAL '60 days'
                       AND f.estado <> 'Anulada'), 0) AS vendidos_60d
    FROM public.productos p
    WHERE p.tenant_id = p_tenant
      AND COALESCE(p.activo, true)
      AND p.precio > 0
      AND COALESCE(p.imagen_url, '') <> ''
  ),
  enr AS (
    SELECT b.*,
           ROUND((b.existencia * COALESCE(b.costo, 0))::numeric, 2) AS capital_inmovilizado,
           upper(split_part(btrim(b.descripcion), ' ', 1)) AS familia
    FROM base b
    -- (04/10/2026) Antes >= 2: se anunciaban piezas con 2 en estante.
    WHERE b.existencia >= 5
  ),
  elegibles AS (
    SELECT e.* FROM enr e
    WHERE NOT EXISTS (
            SELECT 1 FROM public.marketing_promocion_manual m
            WHERE m.tenant_id = p_tenant AND m.producto_id = e.id
              AND (m.permanente OR m.fecha > now() - interval '14 days'))
      AND NOT EXISTS (
            SELECT 1 FROM public.equipo_trabajos w
            WHERE w.tenant_id = p_tenant AND w.tipo = 'promocion'
              AND w.creado_en > now() - interval '14 days'
              AND w.estado <> 'cancelled'
              AND w.peticion LIKE '%' || e.codigo || '%')
  ),
  cajones AS (
    -- (04/10/2026) Lo que se vende va PRIMERO: es el gancho que trae gente.
    SELECT 'mas_vendidos' AS cajon, 1 AS prio, e.*,
           row_number() OVER (ORDER BY e.vendidos_30d DESC, e.vendidos_60d DESC) AS pos
    FROM elegibles e WHERE e.vendidos_30d > 0
    UNION ALL
    SELECT 'buen_margen', 2, e.*,
           row_number() OVER (ORDER BY e.ganancia_unidad DESC)
    FROM elegibles e WHERE e.margen_pct >= 30
    UNION ALL
    SELECT 'recien_llegados', 3, e.*,
           row_number() OVER (ORDER BY e.created_at DESC)
    FROM elegibles e WHERE e.created_at >= CURRENT_DATE - INTERVAL '21 days'
    UNION ALL
    SELECT 'alta_existencia', 4, e.*,
           row_number() OVER (ORDER BY e.capital_inmovilizado DESC)
    FROM elegibles e WHERE e.existencia > 10 AND e.existencia > 2 * e.vendidos_30d
    UNION ALL
    SELECT 'baja_rotacion', 5, e.*,
           row_number() OVER (ORDER BY e.capital_inmovilizado DESC)
    FROM elegibles e WHERE e.existencia > 5 AND e.vendidos_60d < 3
  ),
  -- Una pieza en varios cajones se queda en el de más prioridad.
  unico AS (
    SELECT DISTINCT ON (c.id) c.* FROM cajones c ORDER BY c.id, c.prio
  ),
  con_ronda AS (
    SELECT u.*, row_number() OVER (PARTITION BY u.cajon ORDER BY u.pos) AS ronda
    FROM unico u
  ),
  con_familia AS (
    SELECT r.*, row_number() OVER (PARTITION BY r.familia ORDER BY r.ronda, r.prio) AS vez_familia
    FROM con_ronda r
  ),
  ordenado AS (
    SELECT c.vez_familia, c.ronda, c.prio,
           jsonb_build_object(
             'id', c.id, 'codigo', c.codigo, 'descripcion', c.descripcion,
             'precio', c.precio, 'costo', c.costo, 'imagen_url', c.imagen_url,
             'created_at', c.created_at, 'existencia', c.existencia,
             'margen_pct', c.margen_pct, 'vendidos_30d', c.vendidos_30d,
             'vendidos_60d', c.vendidos_60d, 'tiene_imagen', true, 'modo', 'normal',
             'capital_inmovilizado', c.capital_inmovilizado, 'cajon', c.cajon,
             'razon', CASE c.cajon
               WHEN 'mas_vendidos' THEN format('Gancho: se vende bien (%s en 30 días). La gente ya lo busca y, al venir, se lleva más cosas.',
                 c.vendidos_30d)
               WHEN 'baja_rotacion' THEN format('Casi no se mueve: %s vendidos en 60 días y tienes RD$%s dormidos ahí.',
                 c.vendidos_60d, to_char(c.capital_inmovilizado, 'FM999G999G990D00'))
               WHEN 'alta_existencia' THEN format('Tienes %s en el estante (RD$%s parados), más de lo que se vende.',
                 c.existencia, to_char(c.capital_inmovilizado, 'FM999G999G990D00'))
               WHEN 'buen_margen' THEN format('Te deja RD$%s por unidad (%s%% de margen).',
                 to_char(c.ganancia_unidad, 'FM999G999G990'), round(c.margen_pct))
               ELSE 'Acaba de entrar. Nadie sabe todavía que lo tienes.'
             END) AS fila
    FROM con_familia c
    ORDER BY c.vez_familia, c.ronda, c.prio
    LIMIT p_limite
  )
  SELECT COALESCE(jsonb_agg(o.fila ORDER BY o.vez_familia, o.ronda, o.prio), '[]'::jsonb)
  FROM ordenado o;
$function$;


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


CREATE OR REPLACE FUNCTION public.equipo_agotado_a_suplidor_virtual(p_producto_id uuid, p_cantidad numeric DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_p record;
  v_id uuid;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Este módulo es del dueño.';
  END IF;

  SELECT id, codigo, descripcion, costo, suplidor_id INTO v_p
    FROM public.productos WHERE id = p_producto_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa pieza no es de esta empresa.';
  END IF;

  SELECT id INTO v_id FROM public.suplidor_virtual_items
   WHERE tenant_id = v_tenant AND producto_id = p_producto_id
     AND estado = 'pendiente' AND orden_compra_pedida_id IS NULL
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'ya_estaba', true, 'id', v_id);
  END IF;

  INSERT INTO public.suplidor_virtual_items
    (tenant_id, producto_id, suplidor_original_id, codigo, descripcion,
     cantidad_sugerida, precio_referencia, notas, created_by)
  VALUES
    (v_tenant, v_p.id, v_p.suplidor_id, v_p.codigo, v_p.descripcion,
     GREATEST(COALESCE(p_cantidad, 1), 1), NULLIF(v_p.costo, 0),
     'Agotado que se vende (Equipo IA)', auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'ya_estaba', false, 'id', v_id);
END $function$;

REVOKE ALL ON FUNCTION public.equipo_agotados_que_se_venden(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.equipo_agotado_a_suplidor_virtual(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_agotados_que_se_venden(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equipo_agotado_a_suplidor_virtual(uuid, numeric) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('promocionar_lo_que_se_vende.sql');
