-- ============================================================
-- Fase 3: OPTIMIZAR COMPRA por RETORNO (margen x rotacion)
-- ============================================================
-- El "rejugo" manual del dueño (subir/bajar cantidades hasta cuadrar
-- con el disponible) ahora lo resuelve el optimizador con un criterio
-- financiero: cuando hay que recortar, entra primero lo que MAS dinero
-- genera por peso invertido y se recorta primero lo de peor retorno.
--
--   score_retorno = margen% x velocidad de venta
--                 = ((precio - costo) / costo) x (ventas_90d / 90)
--
-- Reglas que se conservan del optimizador anterior:
--   - URGENTE (stock 0 + con ventas) SIEMPRE entra, aunque exceda.
--   - Lo demas entra por score hasta llenar el presupuesto; el resto
--     se reduce (si cabe >= 50%) o se quita.
-- El resultado agrega score_retorno y margen_pct por item (informativo).
-- Re-ejecutable. Correr en PRODUCCION.
-- ============================================================

CREATE OR REPLACE FUNCTION public.optimizar_orden_compra(
  p_tenant_id     UUID,
  p_items         JSONB,                          -- [{producto_id, cantidad, subtotal}]
  p_presupuesto   NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
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
          WHERE fd.producto_id = b.producto_id
            AND f.tenant_id = v_tenant
            AND f.fecha >= NOW() - INTERVAL '90 days'
            AND COALESCE(f.estado, '') <> 'Anulada'
        ), 0) AS ventas_90d
      FROM base b
      LEFT JOIN public.productos p ON p.id = b.producto_id
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
$$;

GRANT EXECUTE ON FUNCTION public.optimizar_orden_compra(UUID, JSONB, NUMERIC)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regproc('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('optimizar_por_retorno.sql');
  END IF;
END $$;

SELECT 'Optimizar Compra por retorno (margen x rotacion) listo' AS status;
