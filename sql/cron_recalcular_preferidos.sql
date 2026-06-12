-- ============================================================
-- RPC y schedule: recalcular preferidos semanalmente
-- ============================================================
-- Como recalcular_preferidos_todos depende de get_user_tenant(),
-- desde service_role no puede operar. Esta RPC service-friendly
-- itera por TODOS los tenants y llama recalcular_preferido_grupo
-- para cada grupo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cron_recalcular_preferidos_all_tenants()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_grupo               RECORD;
  v_result              JSON;
  v_total_grupos        INT := 0;
  v_total_cambiados     INT := 0;
  v_total_omitidos_man  INT := 0;
  v_tenant_actual       UUID;
  v_count_tenants       INT := 0;
BEGIN
  -- Iterar por todos los grupos de todos los tenants
  FOR v_grupo IN
    SELECT g.id, g.tenant_id
    FROM public.producto_grupos g
    ORDER BY g.tenant_id, g.id
  LOOP
    v_total_grupos := v_total_grupos + 1;

    -- Contar tenants distintos
    IF v_grupo.tenant_id IS DISTINCT FROM v_tenant_actual THEN
      v_count_tenants := v_count_tenants + 1;
      v_tenant_actual := v_grupo.tenant_id;
    END IF;

    -- Reusamos la logica de recalcular_preferido_grupo pero adaptada
    -- a una version sin filtro de get_user_tenant
    DECLARE
      v_miembro          RECORD;
      v_mejor_id         UUID;
      v_mejor_score      NUMERIC := -1;
      v_score_actual_pf  NUMERIC := -1;
      v_score_data       JSON;
      v_score_value      NUMERIC;
      v_actual_preferido UUID;
      v_hubo_manual      BOOLEAN := false;
      v_cambio           BOOLEAN := false;
    BEGIN
      SELECT bool_or(prioridad_manual) INTO v_hubo_manual
      FROM public.producto_grupo_miembros
      WHERE grupo_id = v_grupo.id;

      IF COALESCE(v_hubo_manual, false) THEN
        v_total_omitidos_man := v_total_omitidos_man + 1;
        CONTINUE;
      END IF;

      SELECT producto_id INTO v_actual_preferido
      FROM public.producto_grupo_miembros
      WHERE grupo_id = v_grupo.id AND prioridad = 1
      LIMIT 1;

      FOR v_miembro IN
        SELECT producto_id FROM public.producto_grupo_miembros WHERE grupo_id = v_grupo.id
      LOOP
        -- Calcular score manualmente (sin SECURITY DEFINER que requiere tenant en sesion).
        -- Replicamos la formula de calcular_score_producto_en_grupo aqui.
        DECLARE
          v_costo            NUMERIC := 0;
          v_precio           NUMERIC := 0;
          v_margen_pct       NUMERIC := 0;
          v_ventas_30d       NUMERIC := 0;
          v_ventas_90d       NUMERIC := 0;
          v_stock            NUMERIC := 0;
          v_rotacion_score   NUMERIC := 0;
          v_confiabilidad    NUMERIC := 0;
          v_dias_con_stock   INT := 0;
          v_total_grupo_30d  NUMERIC := 0;
          v_vol_rel          NUMERIC := 0;
          v_penalty          NUMERIC := 0;
          v_score_b          NUMERIC := 0;
        BEGIN
          SELECT COALESCE(costo, 0), COALESCE(precio, 0)
            INTO v_costo, v_precio FROM public.productos WHERE id = v_miembro.producto_id;

          IF v_precio > 0 AND v_costo > 0 AND v_precio > v_costo THEN
            v_margen_pct := ROUND(((v_precio - v_costo) / v_precio * 100)::NUMERIC, 2);
          END IF;

          SELECT COALESCE(SUM(fd.cantidad), 0) INTO v_ventas_30d
          FROM public.facturas_detalle fd JOIN public.facturas f ON f.id = fd.factura_id
          WHERE fd.producto_id = v_miembro.producto_id
            AND f.estado <> 'Anulada' AND f.fecha >= CURRENT_DATE - 30;

          SELECT COALESCE(SUM(fd.cantidad), 0) INTO v_ventas_90d
          FROM public.facturas_detalle fd JOIN public.facturas f ON f.id = fd.factura_id
          WHERE fd.producto_id = v_miembro.producto_id
            AND f.estado <> 'Anulada' AND f.fecha >= CURRENT_DATE - 90;

          v_stock := COALESCE(public.get_stock_actual(v_miembro.producto_id), 0);
          v_rotacion_score := LEAST(100, ROUND((v_ventas_30d / (v_stock + 1) * 10)::NUMERIC, 2));

          IF v_ventas_90d > 0 THEN
            v_dias_con_stock := LEAST(90, GREATEST(0, (v_stock * 90 / NULLIF(v_ventas_90d, 0))::INT));
            v_confiabilidad := ROUND((v_dias_con_stock::NUMERIC / 90.0 * 100), 2);
          ELSE
            v_confiabilidad := CASE WHEN v_stock > 0 THEN 70 ELSE 0 END;
          END IF;

          SELECT COALESCE(SUM(fd.cantidad), 0) INTO v_total_grupo_30d
          FROM public.facturas_detalle fd
          JOIN public.facturas f ON f.id = fd.factura_id
          JOIN public.producto_grupo_miembros m2 ON m2.producto_id = fd.producto_id
          WHERE m2.grupo_id = v_grupo.id AND f.estado <> 'Anulada' AND f.fecha >= CURRENT_DATE - 30;

          IF v_total_grupo_30d > 0 THEN
            v_vol_rel := ROUND((v_ventas_30d / v_total_grupo_30d * 100)::NUMERIC, 2);
          END IF;

          IF v_confiabilidad < 10 THEN v_penalty := 50; END IF;

          v_score_b := (0.45 * v_margen_pct) + (0.30 * v_rotacion_score)
                     + (0.15 * v_confiabilidad) + (0.10 * v_vol_rel);
          v_score_value := GREATEST(0, v_score_b - v_penalty);
        END;

        UPDATE public.producto_grupo_miembros
           SET score_ultimo = v_score_value, scoreado_at = NOW()
         WHERE grupo_id = v_grupo.id AND producto_id = v_miembro.producto_id;

        IF v_miembro.producto_id = v_actual_preferido THEN
          v_score_actual_pf := v_score_value;
        END IF;

        IF v_score_value > v_mejor_score THEN
          v_mejor_score := v_score_value;
          v_mejor_id := v_miembro.producto_id;
        END IF;
      END LOOP;

      IF v_mejor_id IS NOT NULL
         AND v_mejor_id <> v_actual_preferido
         AND (v_mejor_score - COALESCE(v_score_actual_pf, 0)) >= 5
      THEN
        UPDATE public.producto_grupo_miembros SET prioridad = 2 WHERE grupo_id = v_grupo.id;
        UPDATE public.producto_grupo_miembros SET prioridad = 1
         WHERE grupo_id = v_grupo.id AND producto_id = v_mejor_id;
        v_cambio := true;
        v_total_cambiados := v_total_cambiados + 1;
      END IF;
    END;
  END LOOP;

  RETURN json_build_object(
    'ok', true,
    'tenants_evaluados', v_count_tenants,
    'grupos_evaluados', v_total_grupos,
    'cambiados', v_total_cambiados,
    'omitidos_por_manual', v_total_omitidos_man,
    'ejecutado_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cron_recalcular_preferidos_all_tenants() TO service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'cron_recalcular_preferidos_all_tenants listo' AS status;
