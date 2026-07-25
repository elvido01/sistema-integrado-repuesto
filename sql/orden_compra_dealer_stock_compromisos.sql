-- =====================================================================
-- Orden de Compra (dealer de vehículos): stock real por modelo + compromisos
-- ---------------------------------------------------------------------
-- (2026-07-25, Caminero) Dos mejoras pedidas:
--
-- 1) FILTRO DE CÓDIGO ÚNICO. En Caminero cada moto es un producto con su
--    chasis (3,514 productos, solo ~97 unidades en stock). El filtro de la
--    Orden de Compra contaba FILAS de productos que coincidieran por texto —
--    incluía las YA VENDIDAS y no filtraba por empresa — así que la columna
--    "Existencia" salía en 0 y el precio en 0.00.
--    `get_stock_modelo_dealer` devuelve, para una marca+modelo (+año/color):
--      · unidades      = motos EN STOCK (neto de inventario_movimientos > 0)
--      · ultimo_costo  = costo de la última compra de ese modelo
--      · vendidas_90d  = salidas de los últimos 90 días (para saber cuánto pedir)
--
-- 2) PAGO MENSUAL COMPROMETIDO. `get_compromisos_cxp_mensual` lista, por mes,
--    cuánto hay que pagar de las cuentas por pagar pendientes (cada pagaré
--    vence en fecha + dias_credito). Sirve para ver el flujo antes de comprar.
--
-- NOTA sobre el stock: en inventario_movimientos las SALIDAS se guardan con
-- cantidad NEGATIVA, así que el neto es SUM(cantidad).
--
-- Idempotente. Correr en PRODUCCIÓN (SQL editor de Supabase).
-- =====================================================================

-- ------------------------------------------------------------
-- 0) Normalizador de modelo: el MISMO motor está escrito de varias formas en
--    el catálogo migrado ("SX2 250", "SX2(250CC)", "SX2-250CC" son el mismo).
--    Regla: mayúsculas, quitar todo lo que no sea letra/número y unificar la
--    unidad "CC" cuando sigue a un número (250CC → 250).
--    Verificado con datos reales de Caminero: las 4 variantes de SX2 pasan a
--    contarse juntas (56 unidades) y los modelos DISTINTOS siguen separados
--    (LX200ZH-AI = 46 vs LX200ZH-AT = 1).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mf_norm_modelo(p_txt text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT regexp_replace(
           regexp_replace(upper(COALESCE(p_txt, '')), '[^A-Z0-9]', '', 'g'),
           '([0-9])CC', '\1', 'g');
$$;

-- ------------------------------------------------------------
-- 1) Stock real + costo + rotación por marca/modelo
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_stock_modelo_dealer(
  p_marca  text,
  p_modelo text,
  p_anio   text DEFAULT NULL,
  p_color  text DEFAULT NULL
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
  v_result json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF COALESCE(btrim(p_marca), '') = '' OR COALESCE(btrim(p_modelo), '') = '' THEN
    RETURN json_build_object('unidades', 0, 'ultimo_costo', 0, 'vendidas_90d', 0);
  END IF;

  WITH coincide AS (  -- productos de ese modelo. Se compara NORMALIZADO para
                      -- que las variantes de escritura del mismo motor cuenten
                      -- juntas (el catálogo migrado no trae marca_id/modelo_id).
    SELECT p.id, p.costo
    FROM public.productos p
    WHERE p.tenant_id = v_tenant
      AND public.mf_norm_modelo(p.descripcion) LIKE '%' || public.mf_norm_modelo(p_marca)  || '%'
      AND public.mf_norm_modelo(p.descripcion) LIKE '%' || public.mf_norm_modelo(p_modelo) || '%'
      AND (COALESCE(btrim(p_anio), '')  = '' OR p.descripcion ILIKE '%' || btrim(p_anio) || '%')
      AND (COALESCE(btrim(p_color), '') = '' OR public.mf_norm_modelo(p.descripcion) LIKE '%' || public.mf_norm_modelo(p_color) || '%')
  ),
  neto AS (  -- stock por producto (SALIDA ya viene en negativo)
    SELECT m.producto_id, SUM(m.cantidad) AS stock
    FROM public.inventario_movimientos m
    JOIN coincide c ON c.id = m.producto_id
    WHERE m.tenant_id = v_tenant
    GROUP BY m.producto_id
  ),
  ventas AS (  -- unidades despachadas en los últimos 90 días
    SELECT COALESCE(SUM(ABS(m.cantidad)), 0) AS vendidas
    FROM public.inventario_movimientos m
    JOIN coincide c ON c.id = m.producto_id
    WHERE m.tenant_id = v_tenant
      AND m.tipo = 'SALIDA'
      AND m.fecha >= (v_hoy - 90)
  ),
  costo AS (  -- último costo pagado por ese modelo (compra más reciente)
    SELECT cd.costo_unitario
    FROM public.compras_detalle cd
    JOIN coincide c ON c.id = cd.producto_id
    JOIN public.compras co ON co.id = cd.compra_id AND co.tenant_id = v_tenant
    WHERE COALESCE(cd.costo_unitario, 0) > 0
    ORDER BY co.fecha DESC
    LIMIT 1
  )
  SELECT json_build_object(
    'unidades',     (SELECT COUNT(*) FROM neto WHERE stock > 0),
    'ultimo_costo', COALESCE((SELECT costo_unitario FROM costo),
                             (SELECT MAX(costo) FROM coincide), 0),
    'vendidas_90d', (SELECT vendidas FROM ventas)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_stock_modelo_dealer(text,text,text,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_stock_modelo_dealer(text,text,text,text) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.mf_norm_modelo(text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 2) Compromisos de pago por mes (CxP pendientes)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_compromisos_cxp_mensual(
  p_meses       int  DEFAULT 8,
  p_suplidor_id uuid DEFAULT NULL   -- si viene, SOLO ese suplidor
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
  v_result json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;

  WITH cxp AS (
    SELECT
      (c.fecha + COALESCE(c.dias_credito, 0))::date       AS vence,
      COALESCE(c.monto_pendiente, 0)                      AS monto,
      COALESCE(c.pendiente_usd, 0)                        AS monto_usd
    FROM public.compras c
    WHERE c.tenant_id = v_tenant
      AND c.estado = 'PENDIENTE'
      AND c.forma_pago ILIKE '%credito%'
      AND COALESCE(c.monto_pendiente, 0) > 0
      -- Con suplidor seleccionado se muestra SOLO su deuda: si no, se mezclaban
      -- los "saldo inicial papel" de otros suplidores y aparecía como vencido
      -- lo que no era de este (caso Motores del Sur, que no tiene vencidos).
      AND (p_suplidor_id IS NULL OR c.suplidor_id = p_suplidor_id)
  ),
  por_mes AS (
    SELECT date_trunc('month', vence)::date AS mes,
           SUM(monto)                        AS monto,
           SUM(monto_usd)                    AS monto_usd,
           COUNT(*)                          AS cuotas,
           SUM(monto) FILTER (WHERE vence < v_hoy) AS vencido
    FROM cxp
    GROUP BY 1
  )
  SELECT json_build_object(
    'total_pendiente', COALESCE((SELECT SUM(monto) FROM cxp), 0),
    'vencido',         COALESCE((SELECT SUM(monto) FROM cxp WHERE vence < v_hoy), 0),
    'meses', COALESCE((
      SELECT json_agg(json_build_object(
               'mes',       to_char(mes, 'YYYY-MM'),
               'monto',     ROUND(monto, 2),
               'monto_usd', ROUND(monto_usd, 2),
               'cuotas',    cuotas,
               'vencido',   ROUND(COALESCE(vencido, 0), 2)
             ) ORDER BY mes)
      FROM (SELECT * FROM por_mes ORDER BY mes LIMIT GREATEST(p_meses, 1)) z
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- La firma vieja (solo p_meses) se elimina para no dejar sobrecarga ambigua.
DROP FUNCTION IF EXISTS public.get_compromisos_cxp_mensual(int);
REVOKE EXECUTE ON FUNCTION public.get_compromisos_cxp_mensual(int, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_compromisos_cxp_mensual(int, uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3) Marcas y modelos que VENDE un suplidor
-- ------------------------------------------------------------
-- Al elegir el suplidor en la Orden de Compra, los combos de Marca y Modelo
-- deben mostrar solo lo que ese suplidor vende (Motores del Sur = LONCIN:
-- LX250ZH-13 MAX, NATIVA 125 SPORT, X-SPEED 150, LX200ZH-AI/AT, SX2).
-- Se deduce del HISTORIAL DE COMPRAS (productos.modelo_id viene vacío en el
-- catálogo migrado; marca_id sí está). Los modelos se emparejan contra la
-- descripción con la misma normalización del stock.
CREATE OR REPLACE FUNCTION public.get_marcas_modelos_suplidor(
  p_suplidor_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_result json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF p_suplidor_id IS NULL THEN
    RETURN json_build_object('marcas', '[]'::json, 'modelos', '[]'::json);
  END IF;

  WITH prods AS (  -- lo comprado a ese suplidor + lo que lo tiene asignado
    SELECT DISTINCT p.id, p.marca_id, p.descripcion
    FROM public.compras c
    JOIN public.compras_detalle cd ON cd.compra_id = c.id
    JOIN public.productos p        ON p.id = cd.producto_id
    WHERE c.tenant_id = v_tenant AND c.suplidor_id = p_suplidor_id
    UNION
    SELECT p.id, p.marca_id, p.descripcion
    FROM public.productos p
    WHERE p.tenant_id = v_tenant AND p.suplidor_id = p_suplidor_id
  )
  SELECT json_build_object(
    'marcas', COALESCE((
      SELECT json_agg(DISTINCT m.nombre)
      FROM prods pr
      JOIN public.marcas m ON m.id = pr.marca_id AND m.tenant_id = v_tenant
    ), '[]'::json),
    'modelos', COALESCE((
      SELECT json_agg(DISTINCT mo.nombre)
      FROM public.modelos mo
      WHERE mo.tenant_id = v_tenant
        AND length(public.mf_norm_modelo(mo.nombre)) >= 3  -- evita modelos basura ("4")
        AND EXISTS (
          SELECT 1 FROM prods pr
          WHERE public.mf_norm_modelo(pr.descripcion)
                LIKE '%' || public.mf_norm_modelo(mo.nombre) || '%'
        )
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_marcas_modelos_suplidor(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_marcas_modelos_suplidor(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('orden_compra_dealer_stock_compromisos.sql');
  END IF;
END $$;

SELECT 'get_stock_modelo_dealer + get_compromisos_cxp_mensual listas' AS status;
