-- ============================================================
-- UNA EXISTENCIA EN MENOS UNO NO DIVIDE
-- ============================================================
-- "Recalcular preferidos automaticamente" contestaba `division by zero` y no
-- recalculaba nada. No era el boton: era una pieza con existencia -1.
--
-- >>> DONDE <<<
-- `calcular_score_producto_en_grupo` mide la rotacion asi:
--     ventas_30d / (stock + 1) * 10
-- El "+1" esta para que un producto sin stock no divida por cero. Pero el
-- inventario tiene existencias NEGATIVAS (se factura mas de lo que hay
-- registrado), y con stock = -1 el denominador vale exactamente 0.
--
-- Comprobado en produccion, dos piezas dentro de grupos:
--     CADENA 428HX118L REFORZADA VINI  -> -1
--     BATERIA 6.5 GTS                  -> -1
-- Con esas dos, el recalculo entero se caia: el boton no servia para ninguno
-- de los 14 grupos.
--
-- >>> EL ARREGLO <<<
-- Una existencia negativa se trata como CERO para medir rotacion: de lo que no
-- hay no se puede rotar, y el numero negativo es un descuadre de inventario, no
-- una cantidad. `GREATEST(v_stock, 0) + 1` nunca puede ser 0.
-- Lo demas de la formula queda igual, incluida la confiabilidad (que ya
-- recortaba lo negativo con GREATEST(0, ...)).
-- ============================================================

SELECT public.registrar_migracion('una_existencia_en_menos_uno_no_divide.sql');

CREATE OR REPLACE FUNCTION public.calcular_score_producto_en_grupo(
  p_producto_id uuid,
  p_grupo_id uuid
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $function$
DECLARE
  v_tenant            UUID;
  v_costo             NUMERIC := 0;
  v_precio            NUMERIC := 0;
  v_margen_pct        NUMERIC := 0;
  v_ventas_30d        NUMERIC := 0;
  v_ventas_90d        NUMERIC := 0;
  v_stock             NUMERIC := 0;
  v_stock_util        NUMERIC := 0;
  v_rotacion_score    NUMERIC := 0;
  v_confiabilidad_pct NUMERIC := 0;
  v_dias_con_stock    INT := 0;
  v_total_grupo_30d   NUMERIC := 0;
  v_vol_relativo_pct  NUMERIC := 0;
  v_score_bruto       NUMERIC := 0;
  v_score_final       NUMERIC := 0;
  v_penalty           NUMERIC := 0;
BEGIN
  v_tenant := public.get_user_tenant();

  -- Datos del producto
  SELECT COALESCE(costo, 0), COALESCE(precio, 0)
    INTO v_costo, v_precio
  FROM public.productos WHERE id = p_producto_id;

  -- Margen %
  IF v_precio > 0 AND v_costo > 0 AND v_precio > v_costo THEN
    v_margen_pct := ROUND(((v_precio - v_costo) / v_precio * 100)::NUMERIC, 2);
  ELSE
    v_margen_pct := 0;
  END IF;

  -- Ventas 30 y 90 dias
  SELECT COALESCE(SUM(fd.cantidad), 0)
    INTO v_ventas_30d
  FROM public.facturas_detalle fd
  JOIN public.facturas f ON f.id = fd.factura_id
  WHERE fd.producto_id = p_producto_id
    AND f.estado <> 'Anulada'
    AND f.fecha >= CURRENT_DATE - 30;

  SELECT COALESCE(SUM(fd.cantidad), 0)
    INTO v_ventas_90d
  FROM public.facturas_detalle fd
  JOIN public.facturas f ON f.id = fd.factura_id
  WHERE fd.producto_id = p_producto_id
    AND f.estado <> 'Anulada'
    AND f.fecha >= CURRENT_DATE - 90;

  -- Stock actual. El inventario tiene existencias NEGATIVAS (descuadres), y
  -- para medir rotacion una existencia negativa es lo mismo que cero: de lo
  -- que no hay no se rota. Ademas asi el denominador nunca da 0 — con stock
  -- = -1 el "+1" de abajo dividia por cero y tumbaba todo el recalculo.
  v_stock := COALESCE(public.get_stock_actual(p_producto_id), 0);
  v_stock_util := GREATEST(v_stock, 0);

  -- Rotacion score: ventas / (stock + 1). Multiplicado por 10 para escalar a ~0-100
  v_rotacion_score := LEAST(100, ROUND((v_ventas_30d / (v_stock_util + 1) * 10)::NUMERIC, 2));

  -- Confiabilidad de stock (% de dias con stock en ultimos 90 dias)
  IF v_ventas_90d > 0 THEN
    v_dias_con_stock := LEAST(90, GREATEST(0, (v_stock_util * 90 / NULLIF(v_ventas_90d, 0))::INT));
    v_confiabilidad_pct := ROUND((v_dias_con_stock::NUMERIC / 90.0 * 100), 2);
  ELSE
    -- Sin ventas pero con stock: confiabilidad neutral
    v_confiabilidad_pct := CASE WHEN v_stock_util > 0 THEN 70 ELSE 0 END;
  END IF;

  -- Volumen relativo: que % de las ventas del grupo se llevo este SKU
  SELECT COALESCE(SUM(fd.cantidad), 0)
    INTO v_total_grupo_30d
  FROM public.facturas_detalle fd
  JOIN public.facturas f ON f.id = fd.factura_id
  JOIN public.producto_grupo_miembros m ON m.producto_id = fd.producto_id
  WHERE m.grupo_id = p_grupo_id
    AND f.estado <> 'Anulada'
    AND f.fecha >= CURRENT_DATE - 30;

  IF v_total_grupo_30d > 0 THEN
    v_vol_relativo_pct := ROUND((v_ventas_30d / v_total_grupo_30d * 100)::NUMERIC, 2);
  END IF;

  -- Penalty por confiabilidad muy baja
  IF v_confiabilidad_pct < 10 THEN v_penalty := 50; ELSE v_penalty := 0; END IF;

  v_score_bruto := (0.45 * v_margen_pct)
                 + (0.30 * v_rotacion_score)
                 + (0.15 * v_confiabilidad_pct)
                 + (0.10 * v_vol_relativo_pct);

  v_score_final := GREATEST(0, v_score_bruto - v_penalty);

  RETURN json_build_object(
    'producto_id',         p_producto_id,
    'grupo_id',            p_grupo_id,
    'margen_pct',          v_margen_pct,
    'rotacion_score',      v_rotacion_score,
    'confiabilidad_pct',   v_confiabilidad_pct,
    'vol_relativo_pct',    v_vol_relativo_pct,
    'penalty',             v_penalty,
    'score_bruto',         ROUND(v_score_bruto, 2),
    'score_final',         ROUND(v_score_final, 2),
    'ventas_30d',          v_ventas_30d,
    'stock_actual',        v_stock,
    'breakdown_pesos',     '{"margen":0.45,"rotacion":0.30,"confiabilidad":0.15,"volumen":0.10}'::JSON
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- PRUEBA — contra las piezas que lo rompian
-- ============================================================
-- Se puntuan las que tienen existencia negativa DE VERDAD. Si el arreglo no
-- sirve, esto revienta con el mismo `division by zero` de la pantalla.
-- Solo lectura: no cambia ningun preferido.
DO $prueba$
DECLARE
  r        RECORD;
  v_json   json;
  v_cuenta INT := 0;
BEGIN
  FOR r IN
    SELECT m.producto_id, m.grupo_id, p.descripcion,
           public.get_stock_actual(m.producto_id) AS stock
    FROM public.producto_grupo_miembros m
    JOIN public.productos p ON p.id = m.producto_id
    WHERE public.get_stock_actual(m.producto_id) < 0
  LOOP
    v_json := public.calcular_score_producto_en_grupo(r.producto_id, r.grupo_id);
    IF (v_json->>'score_final') IS NULL THEN
      RAISE EXCEPTION 'La pieza % (existencia %) no devolvio score.', r.descripcion, r.stock;
    END IF;
    v_cuenta := v_cuenta + 1;
    RAISE NOTICE 'OK  %  (existencia %)  score %', r.descripcion, r.stock, v_json->>'score_final';
  END LOOP;

  IF v_cuenta = 0 THEN
    RAISE NOTICE 'Ahora mismo no hay piezas con existencia negativa dentro de grupos. Arreglo puesto igual.';
  ELSE
    RAISE NOTICE 'Puntuadas % piezas con existencia negativa sin dividir por cero.', v_cuenta;
  END IF;
END $prueba$;
