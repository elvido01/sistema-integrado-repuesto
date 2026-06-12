-- ============================================================
-- Scoring automatico del producto preferido (⭐) por grupo
-- ============================================================
-- Fundamentos (investigacion retail / supply chain):
--   - Profit Velocity (margen × rotacion): clasico en retail mediano
--   - GMROII (Gross Margin Return on Inventory Investment): standard industria
--   - ABC × XYZ Analysis: classificacion por valor + predictibilidad
--   - Sell-through Rate: ratio vendido/disponible (mas e-commerce)
--
-- Decision: Weighted Score Multi-criterio adaptado para Repuestos Morla.
-- Razon: combina margen (rentabilidad) + rotacion (cashflow) +
-- confiabilidad (sin stock-outs) + volumen (preferencia cliente),
-- todo calculable con la data que ya tenemos.
--
-- Formula:
--   Score = 0.45 × Margen_pct
--         + 0.30 × Rotacion_score
--         + 0.15 × Confiabilidad_pct
--         + 0.10 × Vol_relativo_pct
--
-- Penalty: si confiabilidad < 10% -> score -= 50 (anti stock-out)
-- Estabilidad: solo cambia preferido si diferencia score >= 5 puntos
-- Manual override: prioridad_manual=true bloquea recalculo automatico
-- ============================================================

-- 1) Columna prioridad_manual: si true, el override manual gana sobre el calculo
ALTER TABLE public.producto_grupo_miembros
  ADD COLUMN IF NOT EXISTS prioridad_manual BOOLEAN DEFAULT false;

ALTER TABLE public.producto_grupo_miembros
  ADD COLUMN IF NOT EXISTS score_ultimo NUMERIC DEFAULT 0;

ALTER TABLE public.producto_grupo_miembros
  ADD COLUMN IF NOT EXISTS scoreado_at TIMESTAMPTZ;

COMMENT ON COLUMN public.producto_grupo_miembros.prioridad_manual IS
  'Si true, el usuario fijo manualmente la prioridad y el recalculo automatico lo respeta.';
COMMENT ON COLUMN public.producto_grupo_miembros.score_ultimo IS
  'Score weighted multi-criterio calculado en el ultimo recalculo automatico (0-100+).';

-- ────────────────────────────────────────────────
-- 2) RPC: calcular_score_producto_en_grupo (helper)
-- ────────────────────────────────────────────────
-- Devuelve los componentes del score para un producto en su grupo.
-- Util para debug y para mostrar al usuario que justifica la decision.
CREATE OR REPLACE FUNCTION public.calcular_score_producto_en_grupo(
  p_producto_id UUID,
  p_grupo_id    UUID
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_tenant            UUID;
  v_costo             NUMERIC := 0;
  v_precio            NUMERIC := 0;
  v_margen_pct        NUMERIC := 0;
  v_ventas_30d        NUMERIC := 0;
  v_ventas_90d        NUMERIC := 0;
  v_stock             NUMERIC := 0;
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

  -- Stock actual
  v_stock := COALESCE(public.get_stock_actual(p_producto_id), 0);

  -- Rotacion score: ventas / (stock + 1). Multiplicado por 10 para escalar a ~0-100
  v_rotacion_score := LEAST(100, ROUND((v_ventas_30d / (v_stock + 1) * 10)::NUMERIC, 2));

  -- Confiabilidad de stock (% de dias con stock en ultimos 90 dias)
  -- Aproximacion: si stock actual > 0 y ventas_90d / 3 = promedio diario,
  -- estimar dias con stock como min(90, stock / promedio_diario_ventas)
  IF v_ventas_90d > 0 THEN
    v_dias_con_stock := LEAST(90, GREATEST(0, (v_stock * 90 / NULLIF(v_ventas_90d, 0))::INT));
    v_confiabilidad_pct := ROUND((v_dias_con_stock::NUMERIC / 90.0 * 100), 2);
  ELSE
    -- Sin ventas pero con stock: confiabilidad neutral
    v_confiabilidad_pct := CASE WHEN v_stock > 0 THEN 70 ELSE 0 END;
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
$$;

GRANT EXECUTE ON FUNCTION public.calcular_score_producto_en_grupo(UUID, UUID) TO authenticated, service_role;

-- ────────────────────────────────────────────────
-- 3) RPC: recalcular_preferido_grupo (1 grupo)
-- ────────────────────────────────────────────────
-- Calcula el score de TODOS los miembros del grupo y asigna el mejor
-- como preferido (prioridad=1). Los demas pasan a prioridad=2.
-- Respeta prioridad_manual=true (no cambia esos).
CREATE OR REPLACE FUNCTION public.recalcular_preferido_grupo(
  p_grupo_id UUID
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant         UUID;
  v_miembro        RECORD;
  v_mejor_id       UUID;
  v_mejor_score    NUMERIC := -1;
  v_score_actual_preferido NUMERIC := -1;
  v_score_data     JSON;
  v_score_value    NUMERIC;
  v_actual_preferido UUID;
  v_hubo_manual    BOOLEAN := false;
  v_count_evaluados INT := 0;
  v_cambio         BOOLEAN := false;
BEGIN
  v_tenant := public.get_user_tenant();

  -- ¿Hay alguno manual? Si si, no tocamos nada (respetamos override del usuario)
  SELECT bool_or(prioridad_manual) INTO v_hubo_manual
  FROM public.producto_grupo_miembros
  WHERE grupo_id = p_grupo_id;

  IF COALESCE(v_hubo_manual, false) THEN
    RETURN json_build_object('ok', true, 'cambio', false, 'razon', 'preferido_manual');
  END IF;

  -- Preferido actual
  SELECT producto_id INTO v_actual_preferido
  FROM public.producto_grupo_miembros
  WHERE grupo_id = p_grupo_id AND prioridad = 1
  LIMIT 1;

  -- Calcular score de cada miembro
  FOR v_miembro IN
    SELECT producto_id FROM public.producto_grupo_miembros WHERE grupo_id = p_grupo_id
  LOOP
    v_score_data := public.calcular_score_producto_en_grupo(v_miembro.producto_id, p_grupo_id);
    v_score_value := (v_score_data->>'score_final')::NUMERIC;

    -- Persistir el score en la fila para auditoria
    UPDATE public.producto_grupo_miembros
       SET score_ultimo = v_score_value, scoreado_at = NOW()
     WHERE grupo_id = p_grupo_id AND producto_id = v_miembro.producto_id;

    IF v_miembro.producto_id = v_actual_preferido THEN
      v_score_actual_preferido := v_score_value;
    END IF;

    IF v_score_value > v_mejor_score THEN
      v_mejor_score := v_score_value;
      v_mejor_id := v_miembro.producto_id;
    END IF;

    v_count_evaluados := v_count_evaluados + 1;
  END LOOP;

  -- Estabilidad: solo cambiar si la diferencia es >= 5 puntos
  IF v_mejor_id IS NOT NULL
     AND v_mejor_id <> v_actual_preferido
     AND (v_mejor_score - COALESCE(v_score_actual_preferido, 0)) >= 5
  THEN
    -- Demote todos a prioridad 2
    UPDATE public.producto_grupo_miembros
       SET prioridad = 2
     WHERE grupo_id = p_grupo_id;

    -- Promote el mejor a prioridad 1
    UPDATE public.producto_grupo_miembros
       SET prioridad = 1
     WHERE grupo_id = p_grupo_id AND producto_id = v_mejor_id;

    v_cambio := true;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'cambio', v_cambio,
    'evaluados', v_count_evaluados,
    'preferido_anterior', v_actual_preferido,
    'preferido_nuevo', v_mejor_id,
    'score_anterior', v_score_actual_preferido,
    'score_nuevo', v_mejor_score,
    'diferencia', v_mejor_score - COALESCE(v_score_actual_preferido, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalcular_preferido_grupo(UUID) TO authenticated, service_role;

-- ────────────────────────────────────────────────
-- 4) RPC: recalcular_preferidos_todos
-- ────────────────────────────────────────────────
-- Ejecuta recalcular para TODOS los grupos del tenant. Util para el
-- boton "Recalcular preferidos" o para un cron mensual.
CREATE OR REPLACE FUNCTION public.recalcular_preferidos_todos()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant       UUID;
  v_grupo        RECORD;
  v_result       JSON;
  v_total_grupos INT := 0;
  v_cambiados    INT := 0;
  v_omitidos_manual INT := 0;
BEGIN
  v_tenant := public.get_user_tenant();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin tenant'; END IF;

  FOR v_grupo IN
    SELECT id FROM public.producto_grupos WHERE tenant_id = v_tenant
  LOOP
    v_total_grupos := v_total_grupos + 1;
    v_result := public.recalcular_preferido_grupo(v_grupo.id);
    IF (v_result->>'cambio')::BOOLEAN THEN
      v_cambiados := v_cambiados + 1;
    ELSIF v_result->>'razon' = 'preferido_manual' THEN
      v_omitidos_manual := v_omitidos_manual + 1;
    END IF;
  END LOOP;

  RETURN json_build_object(
    'ok', true,
    'total_grupos', v_total_grupos,
    'cambiados', v_cambiados,
    'omitidos_por_manual', v_omitidos_manual,
    'sin_cambio', v_total_grupos - v_cambiados - v_omitidos_manual
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalcular_preferidos_todos() TO authenticated;

-- ────────────────────────────────────────────────
-- 5) RPC: set_preferido_manual
-- ────────────────────────────────────────────────
-- El usuario fuerza un producto como preferido. Marca prioridad_manual=true
-- para que el recalculo automatico lo respete.
CREATE OR REPLACE FUNCTION public.set_preferido_manual(
  p_grupo_id    UUID,
  p_producto_id UUID
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Demote todos a prioridad 2 y prioridad_manual=false
  UPDATE public.producto_grupo_miembros
     SET prioridad = 2, prioridad_manual = false
   WHERE grupo_id = p_grupo_id;

  -- Promote el elegido a prioridad 1 con manual=true
  UPDATE public.producto_grupo_miembros
     SET prioridad = 1, prioridad_manual = true
   WHERE grupo_id = p_grupo_id AND producto_id = p_producto_id;

  RETURN json_build_object('ok', true, 'grupo_id', p_grupo_id, 'producto_id', p_producto_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_preferido_manual(UUID, UUID) TO authenticated;

-- ────────────────────────────────────────────────
-- 6) RPC: limpiar_manual_grupo (volver a modo automatico)
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.limpiar_manual_grupo(p_grupo_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.producto_grupo_miembros
     SET prioridad_manual = false
   WHERE grupo_id = p_grupo_id;
  RETURN public.recalcular_preferido_grupo(p_grupo_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.limpiar_manual_grupo(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'Scoring de preferido listo' AS status,
       (SELECT count(*) FROM pg_proc
        WHERE proname IN ('calcular_score_producto_en_grupo','recalcular_preferido_grupo',
                          'recalcular_preferidos_todos','set_preferido_manual','limpiar_manual_grupo')) AS rpcs;
