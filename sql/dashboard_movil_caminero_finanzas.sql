-- =====================================================================
-- Dashboard movil: gastos y compromisos por empresa relacionada
-- ---------------------------------------------------------------------
-- Para Caminero Motors, muestra un resumen separado de:
--   - Caminero Motors
--   - MotoPrestamos Los Naranjos (financiera_tenant_id / fallback nombre)
--
-- SECURITY DEFINER porque el usuario de Caminero no debe leer directamente
-- tablas de otro tenant por RLS. La funcion expone resumen y detalles solo
-- de gastos/compromisos de las empresas relacionadas.
-- Re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_caminero_finanzas_resumen_movil(
  p_fecha date DEFAULT NULL,
  p_hasta date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_fin uuid;
  v_allow_fallback boolean := false;
  v_fecha date := COALESCE(p_fecha, (now() AT TIME ZONE 'America/Santo_Domingo')::date);
  v_hasta date := COALESCE(p_hasta, (now() AT TIME ZONE 'America/Santo_Domingo')::date);
  v_result jsonb;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant';
  END IF;

  SELECT (ce.nombre ILIKE '%caminero%' OR ce.razon_social ILIKE '%caminero%')
    INTO v_allow_fallback
  FROM public.config_empresa ce
  WHERE ce.tenant_id = v_tenant
  LIMIT 1;

  IF COALESCE(v_allow_fallback, false) THEN
    SELECT ce.tenant_id
      INTO v_fin
    FROM public.config_empresa ce
    CROSS JOIN LATERAL (
      SELECT lower(translate(
        COALESCE(ce.nombre, '') || ' ' || COALESCE(ce.razon_social, ''),
        'áàäâãéèëêíìïîóòöôõúùüûñÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑ',
        'aaaaaeeeeiiiiooooouuuunAAAAAEEEEIIIIOOOOOUUUUN'
      )) AS txt
    ) n
    WHERE ce.tenant_id IS NOT NULL
      AND ce.tenant_id <> v_tenant
      AND (
        n.txt LIKE '%naranjo%'
        OR n.txt LIKE '%motoprestamo%'
        OR n.txt LIKE '%moto prestamo%'
        OR COALESCE(ce.feat_financiera, false) = true
      )
    ORDER BY
      CASE WHEN n.txt LIKE '%naranjo%' THEN 0 ELSE 1 END,
      CASE WHEN n.txt LIKE '%motoprestamo%' OR n.txt LIKE '%moto prestamo%' THEN 0 ELSE 1 END,
      CASE WHEN COALESCE(ce.feat_financiera, false) THEN 0 ELSE 1 END,
      ce.nombre NULLS LAST
    LIMIT 1;
  END IF;

  WITH target_tenants AS (
    SELECT v_tenant AS tenant_id, 0 AS orden
    UNION
    SELECT v_fin AS tenant_id, 1 AS orden
    WHERE v_fin IS NOT NULL AND v_fin <> v_tenant
  ),
  empresas AS (
    SELECT
      tt.tenant_id,
      MIN(tt.orden) AS orden,
      COALESCE(MAX(ce.razon_social), MAX(ce.nombre), 'Empresa') AS nombre
    FROM target_tenants tt
    LEFT JOIN public.config_empresa ce ON ce.tenant_id = tt.tenant_id
    GROUP BY tt.tenant_id
  ),
  gastos AS (
    SELECT
      gd.tenant_id,
      COALESCE(SUM(gd.monto), 0) AS total,
      COUNT(*)::int AS cantidad
    FROM public.gastos_diarios gd
    JOIN target_tenants tt ON tt.tenant_id = gd.tenant_id
    WHERE gd.fecha = v_fecha
      AND COALESCE(gd.anulado, false) = false
    GROUP BY gd.tenant_id
  ),
  gastos_detalle AS (
    SELECT
      gd.tenant_id,
      COALESCE(jsonb_agg(jsonb_build_object(
        'id', gd.id,
        'fecha', gd.fecha,
        'tipo_gasto', gd.tipo_gasto,
        'descripcion', gd.descripcion,
        'monto', gd.monto
      ) ORDER BY gd.created_at DESC), '[]'::jsonb) AS registros
    FROM public.gastos_diarios gd
    JOIN target_tenants tt ON tt.tenant_id = gd.tenant_id
    WHERE gd.fecha = v_fecha
      AND COALESCE(gd.anulado, false) = false
    GROUP BY gd.tenant_id
  ),
  compromisos AS (
    -- TODOS los compromisos activos, sin corte de fecha: mismo criterio
    -- que la tarjeta del dashboard web (2026-07-12, pedido del usuario).
    SELECT
      c.tenant_id,
      COALESCE(SUM(c.monto), 0) AS total,
      COUNT(*)::int AS cantidad
    FROM public.compromisos c
    JOIN target_tenants tt ON tt.tenant_id = c.tenant_id
    WHERE COALESCE(c.activo, true) = true
    GROUP BY c.tenant_id
  ),
  compromisos_detalle AS (
    SELECT
      c.tenant_id,
      COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'fecha', c.fecha,
        'nombre', c.nombre,
        'tipo', c.tipo,
        'monto', c.monto,
        'recurrente', COALESCE(c.recurrente, false),
        'frecuencia', c.frecuencia
      ) ORDER BY c.fecha ASC, c.created_at ASC), '[]'::jsonb) AS registros
    FROM public.compromisos c
    JOIN target_tenants tt ON tt.tenant_id = c.tenant_id
    WHERE COALESCE(c.activo, true) = true
    GROUP BY c.tenant_id
  ),
  filas AS (
    SELECT
      e.tenant_id,
      e.nombre,
      e.orden,
      COALESCE(g.total, 0) AS gastos_dia,
      COALESCE(g.cantidad, 0) AS gastos_count,
      COALESCE(c.total, 0) AS compromisos_pagar,
      COALESCE(c.cantidad, 0) AS compromisos_count,
      COALESCE(gd.registros, '[]'::jsonb) AS gastos,
      COALESCE(cd.registros, '[]'::jsonb) AS compromisos
    FROM empresas e
    LEFT JOIN gastos g ON g.tenant_id = e.tenant_id
    LEFT JOIN compromisos c ON c.tenant_id = e.tenant_id
    LEFT JOIN gastos_detalle gd ON gd.tenant_id = e.tenant_id
    LEFT JOIN compromisos_detalle cd ON cd.tenant_id = e.tenant_id
  )
  SELECT jsonb_build_object(
    'fecha', v_fecha,
    'hasta', v_hasta,
    'empresas', COALESCE(jsonb_agg(jsonb_build_object(
      'tenant_id', tenant_id,
      'nombre', nombre,
      'gastos_dia', gastos_dia,
      'gastos_count', gastos_count,
      'compromisos_pagar', compromisos_pagar,
      'compromisos_count', compromisos_count,
      'gastos', gastos,
      'compromisos', compromisos
    ) ORDER BY orden, nombre), '[]'::jsonb),
    'total_gastos_dia', COALESCE(SUM(gastos_dia), 0),
    'total_compromisos_pagar', COALESCE(SUM(compromisos_pagar), 0),
    'total_gastos_count', COALESCE(SUM(gastos_count), 0),
    'total_compromisos_count', COALESCE(SUM(compromisos_count), 0)
  )
  INTO v_result
  FROM filas;

  RETURN COALESCE(v_result, jsonb_build_object(
    'fecha', v_fecha,
    'hasta', v_hasta,
    'empresas', '[]'::jsonb,
    'total_gastos_dia', 0,
    'total_compromisos_pagar', 0,
    'total_gastos_count', 0,
    'total_compromisos_count', 0
  ));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_caminero_finanzas_resumen_movil(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_caminero_finanzas_resumen_movil(date,date) TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('dashboard_movil_caminero_finanzas.sql');
  END IF;
END $$;

SELECT 'get_caminero_finanzas_resumen_movil listo (compromisos sin corte, igual que la web)' AS status;
