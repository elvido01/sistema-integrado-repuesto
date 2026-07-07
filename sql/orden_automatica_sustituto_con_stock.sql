-- ============================================================
-- FIX: Orden Automatica no debe pedir un SUSTITUTO que ya tiene stock
-- ============================================================
-- Reporte 2026-07-06 (producto 016167 ESPEJOS CG300 RACING HAO):
-- aparecia en la Orden Automatica con 6 unidades en existencia y sin
-- movimiento propio. Causa: es SUSTITUTO (prioridad 2) de un grupo de
-- equivalentes; el analisis se hace por BUCKET del grupo, y como el
-- grupo tenia demanda (por otro miembro), el sustituto heredaba una
-- cantidad sugerida. La v2 lo reducia a 30% pero no a 0.
--
-- Regla nueva en la v2:
--   - El PREFERIDO (prioridad 1) carga el deficit del grupo (sin cambio).
--   - Un SUSTITUTO que YA TIENE stock propio (existencia > 0) -> 0
--     (no se pide; el preferido cubre la demanda del grupo).
--   - Un sustituto SIN stock propio mantiene la reduccion al 30%
--     (por si el preferido no alcanza / es de otro suplidor).
--
-- Solo cambia la v2 (get_productos_para_orden_automatica_v2), que es la
-- que usa el frontend. Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_productos_para_orden_automatica_v2(
  p_suplidor_id UUID
)
RETURNS TABLE(
  id                          UUID,
  codigo                      TEXT,
  descripcion                 TEXT,
  existencia                  NUMERIC,
  min_stock                   NUMERIC,
  max_stock                   NUMERIC,
  precio                      NUMERIC,
  costo                       NUMERIC,
  itbis_pct                   NUMERIC,
  ventas_90d                  NUMERIC,
  cantidad_sugerida           INT,
  grupo_id                    UUID,
  grupo_nombre                TEXT,
  es_preferido                BOOLEAN,
  grupo_miembros              INT,
  grupo_stock_combinado       NUMERIC,
  grupo_ventas_30d_combinada  NUMERIC,
  cantidad_ajustada           INT,
  razon_ajuste                TEXT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
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
    LIMIT 1;

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
      FROM public.facturas_detalle fd
      JOIN public.facturas f ON f.id = fd.factura_id
      JOIN public.producto_grupo_miembros m ON m.producto_id = fd.producto_id
      WHERE m.grupo_id = v_grupo_id
        AND f.estado <> 'Anulada'
        AND f.fecha >= CURRENT_DATE - 30;

      IF v_demand_combo > 0 AND v_stock_combo >= v_demand_combo * 1.5 THEN
        v_ajustada := 0;
        v_razon := 'Grupo ya tiene ' ||
          ROUND((v_stock_combo / NULLIF(v_demand_combo, 0) * 30)::NUMERIC, 0)::TEXT ||
          ' dias de stock';
      ELSIF v_es_pref THEN
        -- El preferido cubre el deficit total del grupo
        v_deficit := GREATEST(0, v_demand_combo - v_stock_combo);
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
$$;

GRANT EXECUTE ON FUNCTION public.get_productos_para_orden_automatica_v2(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'v2 orden automatica: sustituto con stock ya no se pide' AS status;
