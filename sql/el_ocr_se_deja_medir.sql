-- =====================================================================
-- El OCR se deja medir
-- ---------------------------------------------------------------------
-- (2026-08-28) Para contestar "¿el OCR está aprendiendo?" hubo que
-- reconstruir a mano la comparación entre lo que la IA extrajo y lo que
-- quedó guardado. Salieron cosas que nadie sabía —el 41% de las
-- correcciones no eran errores de la IA sino paquetes abiertos a mano— y
-- todo eso estaba escrito desde hacía meses en extracted_json.
--
-- Una medición que hay que reconstruir cada vez no se hace nunca. Esto la
-- deja puesta.
--
-- >>> LO QUE SE PUEDE SABER, Y LO QUE NO <<<
-- Se compara línea por línea contra el código del producto. Eso deja fuera
-- las facturas sin OCR (se digitaron a mano) y las líneas que la IA leyó
-- con un código que no existe: esas últimas se cuentan aparte, como
-- `no_emparejo`, que es su propio problema.
--
-- Y hay un limite honesto: si una compra se EDITO despues, lo guardado ya
-- no es "lo que el dueno corrigio ese dia" sino el estado de hoy. Con eso
-- se vive; alternativa seria guardar una foto del antes en cada guardado,
-- y no vale la pena por ahora.
--
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Línea por línea: qué leyó la IA y qué quedó
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_ocr_correcciones AS
WITH ocr AS (
  SELECT c.id AS compra_id, c.tenant_id, c.suplidor_id, c.fecha, c.numero,
         upper(btrim(it ->> 'code'))          AS codigo,
         it ->> 'description'                 AS descripcion,
         NULLIF(it ->> 'qty', '')::numeric    AS cant_ocr,
         NULLIF(it ->> 'unit_cost','')::numeric AS costo_ocr
  FROM public.compras c
  CROSS JOIN LATERAL jsonb_array_elements(c.extracted_json::jsonb -> 'items') it
  WHERE c.extracted_json IS NOT NULL
    AND COALESCE(btrim(it ->> 'code'), '') <> ''
), fin AS (
  -- Una fila por codigo: si la misma pieza viene en dos lineas de la misma
  -- factura, se suman. Cruzarlas una contra otra inventaria correcciones
  -- que nadie hizo.
  SELECT d.compra_id, upper(btrim(p.codigo)) AS codigo,
         sum(d.cantidad)                                    AS cantidad,
         (array_agg(d.costo_unitario ORDER BY d.cantidad DESC))[1] AS costo_unitario
  FROM public.compras_detalle d
  JOIN public.productos p ON p.id = d.producto_id
  GROUP BY d.compra_id, upper(btrim(p.codigo))
), pares AS (
  SELECT o.*, f.cantidad AS cant_final, f.costo_unitario AS costo_final,
         CASE WHEN o.cant_ocr > 0  THEN f.cantidad / o.cant_ocr END        AS factor_cant,
         CASE WHEN f.costo_unitario > 0 THEN o.costo_ocr / f.costo_unitario END AS factor_costo
  FROM ocr o
  LEFT JOIN fin f ON f.compra_id = o.compra_id AND f.codigo = o.codigo
)
SELECT
  p.tenant_id, p.compra_id, p.numero, p.fecha, p.suplidor_id,
  p.codigo, p.descripcion,
  p.cant_ocr, p.cant_final, p.costo_ocr, p.costo_final,
  CASE
    WHEN p.cant_final IS NULL THEN 'no_emparejo'
    WHEN abs(COALESCE(p.costo_ocr,0) - p.costo_final) <= 0.01
     AND abs(COALESCE(p.cant_ocr,0) - p.cant_final)  <= 0.001 THEN 'ok'
    -- La firma de abrir un paquete: la cantidad se multiplica y el costo se
    -- divide por el MISMO numero, asi que el importe de la linea no cambia.
    WHEN p.factor_cant > 1.0001
     AND abs(p.factor_cant - p.factor_costo) < 0.02
     AND abs(round(p.factor_cant) - p.factor_cant) < 0.01 THEN 'paquete'
    WHEN abs(COALESCE(p.costo_ocr,0) - p.costo_final) > 0.01 THEN 'costo'
    ELSE 'cantidad'
  END AS resultado,
  CASE WHEN p.factor_cant > 1.0001
        AND abs(p.factor_cant - p.factor_costo) < 0.02
       THEN round(p.factor_cant) END AS paquete_de
FROM pares p;

-- ---------------------------------------------------------------------
-- Lo que la IA NO vio
-- ---------------------------------------------------------------------
-- Una linea que falta pesa mas que un precio mal leido: el precio se ve al
-- revisar, la linea que no esta no se echa de menos.
CREATE OR REPLACE VIEW public.v_ocr_lineas_perdidas AS
SELECT c.tenant_id, c.id AS compra_id, c.numero, c.fecha, c.suplidor_id,
       upper(btrim(p.codigo)) AS codigo, p.descripcion,
       d.cantidad, d.costo_unitario
FROM public.compras c
JOIN public.compras_detalle d ON d.compra_id = c.id
JOIN public.productos p ON p.id = d.producto_id
WHERE c.extracted_json IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(c.extracted_json::jsonb -> 'items') it
    WHERE upper(btrim(it ->> 'code')) = upper(btrim(p.codigo)));

-- ---------------------------------------------------------------------
-- El resumen que se mira
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_precision_ocr(p_dias integer DEFAULT 180)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_desde  date;
  v_out    json;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin empresa'; END IF;
  v_desde := CURRENT_DATE - GREATEST(1, LEAST(COALESCE(p_dias, 180), 1095));

  SELECT json_build_object(
    'desde', v_desde,
    'total', (
      SELECT json_build_object(
        'lineas',      count(*),
        'ok',          count(*) FILTER (WHERE resultado = 'ok'),
        'paquete',     count(*) FILTER (WHERE resultado = 'paquete'),
        'costo',       count(*) FILTER (WHERE resultado = 'costo'),
        'cantidad',    count(*) FILTER (WHERE resultado = 'cantidad'),
        'no_emparejo', count(*) FILTER (WHERE resultado = 'no_emparejo'))
      FROM public.v_ocr_correcciones
      WHERE tenant_id = v_tenant AND fecha >= v_desde),

    -- Quien da mas trabajo. El paquete se cuenta aparte porque ya se
    -- corrige solo: mezclarlo haria ver mal a un suplidor que esta bien.
    'suplidores', (
      SELECT COALESCE(json_agg(x ORDER BY x.a_mano DESC), '[]'::json) FROM (
        SELECT COALESCE(pr.nombre, '(sin suplidor)') AS suplidor,
               count(*)                                          AS lineas,
               count(*) FILTER (WHERE v.resultado = 'paquete')    AS paquete,
               count(*) FILTER (WHERE v.resultado IN ('costo','cantidad','no_emparejo')) AS a_mano,
               round(100.0 * count(*) FILTER (WHERE v.resultado = 'ok') / GREATEST(count(*),1), 1) AS pct_ok
        FROM public.v_ocr_correcciones v
        LEFT JOIN public.proveedores pr ON pr.id = v.suplidor_id
        WHERE v.tenant_id = v_tenant AND v.fecha >= v_desde
        GROUP BY 1 HAVING count(*) >= 10) x),

    -- Si esto mejora mes a mes, esta aprendiendo. Si no, no.
    'por_mes', (
      SELECT COALESCE(json_agg(y ORDER BY y.mes), '[]'::json) FROM (
        SELECT to_char(date_trunc('month', v.fecha), 'YYYY-MM') AS mes,
               count(*) AS lineas,
               round(100.0 * count(*) FILTER (WHERE v.resultado = 'ok') / GREATEST(count(*),1), 1) AS pct_ok,
               count(*) FILTER (WHERE v.resultado IN ('costo','cantidad','no_emparejo')) AS a_mano
        FROM public.v_ocr_correcciones v
        WHERE v.tenant_id = v_tenant AND v.fecha >= v_desde
        GROUP BY 1) y),

    'lineas_perdidas', (
      SELECT count(*) FROM public.v_ocr_lineas_perdidas
      WHERE tenant_id = v_tenant AND fecha >= v_desde),

    'paquetes_aprendidos', (
      SELECT count(*) FROM public.compras_paquetes WHERE tenant_id = v_tenant)
  ) INTO v_out;

  RETURN v_out;
END $fn$;

REVOKE EXECUTE ON FUNCTION public.get_precision_ocr(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_precision_ocr(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('el_ocr_se_deja_medir.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- El mismo numero que se saco a mano tiene que salir solo.
SELECT resultado, count(*)
FROM public.v_ocr_correcciones
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
GROUP BY 1 ORDER BY 2 DESC;
