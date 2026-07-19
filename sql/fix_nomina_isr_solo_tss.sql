-- =====================================================================
-- FIX NÓMINA: sin la casilla "Cotiza TSS" no se aplica NINGÚN descuento
-- ---------------------------------------------------------------------
-- Reporte del dueño: un empleado SIN cotizar TSS (informal) igual recibía
-- retención de ISR (ej. sueldo 60,000 quincenal → neto 27,902.07 en vez
-- de 30,000). Regla correcta: el switch cotiza_tss marca al empleado
-- FORMAL → TSS + ISR; sin el switch = sueldo simple, cero descuentos de
-- ley. Se re-crea nomina_generar con el ISR condicionado (todo lo demás
-- idéntico a nomina_modulo.sql, que ya quedó corregido igual).
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.nomina_generar(
  p_frecuencia text,
  p_desde      date,
  p_hasta      date,
  p_fecha_pago date
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_nomina uuid;
  v_comp   uuid;
  v_emp    record;
  v_det    uuid;
  v_factor numeric := public.nomina_factor(p_frecuencia);
  v_afp_m  numeric; v_sfs_m numeric; v_isr_m numeric;
  v_adel   record;
  v_n      int := 0;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF p_frecuencia NOT IN ('mensual','quincenal','semanal') THEN
    RAISE EXCEPTION 'Frecuencia inválida: %', p_frecuencia;
  END IF;
  IF p_hasta < p_desde THEN RAISE EXCEPTION 'Rango de fechas inválido'; END IF;

  INSERT INTO public.nominas (tenant_id, numero, frecuencia, fecha_desde, fecha_hasta, fecha_pago, created_by)
  VALUES (v_tenant,
          COALESCE((SELECT max(numero) FROM public.nominas WHERE tenant_id = v_tenant), 0) + 1,
          p_frecuencia, p_desde, p_hasta, p_fecha_pago, auth.uid())
  RETURNING id INTO v_nomina;

  FOR v_emp IN
    SELECT * FROM public.empleados
    WHERE tenant_id = v_tenant AND activo = true AND frecuencia_pago = p_frecuencia
    ORDER BY nombre
  LOOP
    v_afp_m := CASE WHEN v_emp.cotiza_tss THEN round(LEAST(v_emp.sueldo_mensual, 464460) * 0.0287, 2) ELSE 0 END;
    v_sfs_m := CASE WHEN v_emp.cotiza_tss THEN round(LEAST(v_emp.sueldo_mensual, 232230) * 0.0304, 2) ELSE 0 END;
    -- ISR SOLO para el empleado formal (cotiza_tss); informal = sueldo simple
    v_isr_m := CASE WHEN v_emp.cotiza_tss
                    THEN public.nomina_isr_mensual(v_emp.sueldo_mensual - v_afp_m - v_sfs_m)
                    ELSE 0 END;

    INSERT INTO public.nomina_detalle (tenant_id, nomina_id, empleado_id, sueldo_base,
                                       tss_afp, tss_sfs, isr)
    VALUES (v_tenant, v_nomina, v_emp.id,
            round(v_emp.sueldo_mensual * v_factor, 2),
            round(v_afp_m * v_factor, 2), round(v_sfs_m * v_factor, 2),
            round(v_isr_m * v_factor, 2))
    RETURNING id INTO v_det;

    FOR v_adel IN
      SELECT g.id,
             g.monto - COALESCE((SELECT sum(x.monto) FROM public.nomina_adelanto_descuentos x
                                 JOIN public.nomina_detalle dd ON dd.id = x.nomina_detalle_id
                                 JOIN public.nominas nn ON nn.id = dd.nomina_id
                                 WHERE x.gasto_id = g.id AND nn.estado <> 'anulada'), 0) AS pendiente
      FROM public.gastos_diarios g
      WHERE g.tenant_id = v_tenant AND g.empleado_id = v_emp.id
        AND g.tipo_gasto = 'Adelanto de sueldo' AND g.anulado = false
      ORDER BY g.fecha, g.created_at
    LOOP
      IF v_adel.pendiente > 0 THEN
        INSERT INTO public.nomina_adelanto_descuentos (tenant_id, nomina_detalle_id, gasto_id, monto)
        VALUES (v_tenant, v_det, v_adel.id, round(v_adel.pendiente, 2));
      END IF;
    END LOOP;

    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 THEN
    DELETE FROM public.nominas WHERE id = v_nomina;
    RAISE EXCEPTION 'No hay empleados activos con frecuencia %', p_frecuencia;
  END IF;

  PERFORM public._nomina_recalcular(v_nomina);

  INSERT INTO public.compromisos (tenant_id, nombre, monto, fecha, tipo, activo, recurrente, frecuencia, solo_admin)
  SELECT v_tenant,
         'Nómina ' || p_frecuencia || ' ' || to_char(p_desde, 'DD/MM') || '–' || to_char(p_hasta, 'DD/MM'),
         n.total_neto, p_fecha_pago, 'nomina', true, false, p_frecuencia, true
  FROM public.nominas n WHERE n.id = v_nomina
  RETURNING id INTO v_comp;

  UPDATE public.nominas SET compromiso_id = v_comp WHERE id = v_nomina;

  RETURN jsonb_build_object('ok', true, 'nomina_id', v_nomina, 'empleados', v_n,
    'total_neto', (SELECT total_neto FROM public.nominas WHERE id = v_nomina));
END $$;

REVOKE ALL ON FUNCTION public.nomina_generar(text,date,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nomina_generar(text,date,date,date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_nomina_isr_solo_tss.sql');
  END IF;
END $$;

SELECT 'Nómina: sin cotiza_tss no hay TSS ni ISR (sueldo simple)' AS status;
