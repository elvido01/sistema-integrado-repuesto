-- =====================================================================
-- ORDEN AUTOMÁTICA para dealer de vehículos (Caminero) — por MODELO
-- ---------------------------------------------------------------------
-- (2026-07-25) La orden automática actual busca "productos bajo el stock
-- mínimo del suplidor". En Caminero eso NUNCA devuelve nada, comprobado:
--   · 3,514 productos, pero solo 2 tienen min_stock definido
--   · solo 29 tienen suplidor asignado (12 de Motores del Sur)
--   · productos de ese suplidor con min_stock > 0: 0  →  el botón no hace nada
--
-- Y conceptualmente no puede funcionar: cada moto es un producto ÚNICO (su
-- chasis). Se compra una vez, se vende una vez y NUNCA se repone, así que un
-- "mínimo" por chasis no significa nada. La unidad de reposición de un dealer
-- es el MODELO.
--
-- Esta función sugiere POR MODELO según rotación real:
--   promedio mensual = vendidas últimos 90 días / 3
--   objetivo         = promedio mensual * (p_dias / 30)      [p_dias = 30]
--   sugerido         = techo(objetivo - unidades en stock)   [mínimo 0]
--
-- Solo considera los modelos que ESE suplidor vende (historial de compras) y
-- unifica las variantes de escritura del mismo motor (SX2 = SX2-250CC = ...).
--
-- Requiere mf_norm_modelo (sql/orden_compra_dealer_stock_compromisos.sql).
-- Idempotente. Correr en PRODUCCIÓN (SQL editor de Supabase).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_orden_automatica_dealer(
  p_suplidor_id uuid,
  p_dias        int DEFAULT 30      -- días de venta que se quieren cubrir
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_hoy    date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_dias   int  := GREATEST(COALESCE(p_dias, 30), 1);
  v_result json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF p_suplidor_id IS NULL THEN RETURN '[]'::json; END IF;

  WITH prods_sup AS (  -- lo que ese suplidor vende (historial + asignados)
    SELECT DISTINCT p.id, p.descripcion
    FROM public.compras c
    JOIN public.compras_detalle cd ON cd.compra_id = c.id
    JOIN public.productos p        ON p.id = cd.producto_id
    WHERE c.tenant_id = v_tenant AND c.suplidor_id = p_suplidor_id
    UNION
    SELECT p.id, p.descripcion
    FROM public.productos p
    WHERE p.tenant_id = v_tenant AND p.suplidor_id = p_suplidor_id
  ),
  modelos_sup AS (  -- modelos del catálogo que aparecen en lo que vende.
                    -- DISTINCT ON deja UNA sola fila por motor (la variante de
                    -- nombre más corta): SX2 / SX2-250CC / SX2(250CC) = 1.
    SELECT DISTINCT ON (public.mf_norm_modelo(mo.nombre), ma.nombre)
           public.mf_norm_modelo(mo.nombre) AS k,
           ma.nombre                        AS marca,
           mo.nombre                        AS modelo
    FROM public.modelos mo
    JOIN public.marcas  ma ON ma.id = mo.marca_id AND ma.tenant_id = v_tenant
    WHERE mo.tenant_id = v_tenant
      AND COALESCE(mo.activo, true)
      AND length(public.mf_norm_modelo(mo.nombre)) >= 3
      AND EXISTS (
        SELECT 1 FROM prods_sup ps
        WHERE public.mf_norm_modelo(ps.descripcion)
              LIKE '%' || public.mf_norm_modelo(mo.nombre) || '%'
      )
    ORDER BY public.mf_norm_modelo(mo.nombre), ma.nombre, length(mo.nombre)
  ),
  prod_stock AS (  -- stock y rotación de CADA producto del tenant, una sola vez
    SELECT p.id, p.descripcion, p.costo,
           COALESCE(SUM(m.cantidad), 0) AS stock,
           COALESCE(SUM(CASE WHEN m.tipo = 'SALIDA' AND m.fecha >= (v_hoy - 90)
                             THEN ABS(m.cantidad) ELSE 0 END), 0) AS vend90
    FROM public.productos p
    LEFT JOIN public.inventario_movimientos m
           ON m.producto_id = p.id AND m.tenant_id = v_tenant
    WHERE p.tenant_id = v_tenant
    GROUP BY p.id, p.descripcion, p.costo
  ),
  por_modelo AS (
    SELECT mn.marca, mn.modelo, agg.stock, agg.vend90, agg.costo_cat,
           ROUND(agg.vend90 / 3.0, 2) AS prom_mes,
           GREATEST(0, CEIL(agg.vend90 / 3.0 * (v_dias / 30.0) - agg.stock))::int AS sugerido
    FROM modelos_sup mn
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE ps.stock > 0)::numeric AS stock,
             COALESCE(SUM(ps.vend90), 0)::numeric          AS vend90,
             MAX(ps.costo)                                 AS costo_cat
      FROM prod_stock ps
      WHERE public.mf_norm_modelo(ps.descripcion) LIKE '%' || public.mf_norm_modelo(mn.marca) || '%'
        AND public.mf_norm_modelo(ps.descripcion) LIKE '%' || mn.k || '%'
    ) agg ON true
  )
  SELECT COALESCE(json_agg(json_build_object(
           'marca',        pm.marca,
           'modelo',       pm.modelo,
           'stock',        pm.stock,
           'vendidas_90d', pm.vend90,
           'prom_mes',     pm.prom_mes,
           'sugerido',     pm.sugerido,
           -- costo: el de la última compra de ese modelo; si no, el del catálogo
           'costo', COALESCE((
             SELECT cd.costo_unitario
             FROM public.compras_detalle cd
             JOIN public.compras co ON co.id = cd.compra_id AND co.tenant_id = v_tenant
             JOIN public.productos p ON p.id = cd.producto_id
             WHERE COALESCE(cd.costo_unitario, 0) > 0
               AND public.mf_norm_modelo(p.descripcion) LIKE '%' || public.mf_norm_modelo(pm.marca)  || '%'
               AND public.mf_norm_modelo(p.descripcion) LIKE '%' || public.mf_norm_modelo(pm.modelo) || '%'
             ORDER BY co.fecha DESC
             LIMIT 1
           ), pm.costo_cat, 0)
         ) ORDER BY pm.sugerido DESC, pm.vend90 DESC), '[]'::json)
    INTO v_result
  FROM por_modelo pm;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_orden_automatica_dealer(uuid,int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_orden_automatica_dealer(uuid,int) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('orden_automatica_dealer.sql');
  END IF;
END $$;

SELECT 'get_orden_automatica_dealer lista (sugerencia por modelo segun rotacion)' AS status;
