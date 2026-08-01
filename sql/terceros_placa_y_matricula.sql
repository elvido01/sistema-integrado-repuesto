-- =====================================================================
-- Placa y matrícula son un solo concepto
-- ---------------------------------------------------------------------
-- (2026-08-01) "Placa y matrícula es lo mismo."
--
-- Se pagan juntas y por el mismo trámite, así que tenerlas separadas solo
-- alargaba la lista y obligaba a marcar dos casillas para una sola cosa.
-- Quedan como un concepto: PLACA Y MATRICULA.
--
-- Si alguno de los dos ya tenía monto configurado, sobrevive el mayor: es
-- el único de los dos que se sabe que alguien escribió a propósito.
--
-- Idempotente / re-ejecutable: si ya está unido, no hace nada.
-- =====================================================================

DO $$
DECLARE
  v_ten   uuid;
  v_monto numeric;
  v_orden integer;
  v_n     int := 0;
BEGIN
  -- Un pago ya registrado con el concepto viejo no se pierde: se renombra.
  UPDATE public.gastos_diarios
     SET concepto_tercero = 'PLACA Y MATRICULA'
   WHERE concepto_tercero IN ('PLACA', 'MATRICULA');

  FOR v_ten IN
    SELECT DISTINCT tenant_id FROM public.conceptos_terceros
    WHERE upper(btrim(nombre)) IN ('PLACA', 'MATRICULA')
  LOOP
    SELECT COALESCE(MAX(monto), 0), COALESCE(MIN(orden), 4)
      INTO v_monto, v_orden
    FROM public.conceptos_terceros
    WHERE tenant_id = v_ten AND upper(btrim(nombre)) IN ('PLACA', 'MATRICULA');

    DELETE FROM public.conceptos_terceros
    WHERE tenant_id = v_ten AND upper(btrim(nombre)) IN ('PLACA', 'MATRICULA');

    INSERT INTO public.conceptos_terceros (tenant_id, nombre, monto, orden)
    VALUES (v_ten, 'PLACA Y MATRICULA', v_monto, v_orden)
    ON CONFLICT DO NOTHING;

    v_n := v_n + 1;
  END LOOP;

  RAISE NOTICE 'Placa y matrícula unidas en % empresa(s).', v_n;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('terceros_placa_y_matricula.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
SELECT ce.nombre AS empresa, ct.nombre, ct.monto, ct.orden
FROM public.conceptos_terceros ct
JOIN public.config_empresa ce ON ce.tenant_id = ct.tenant_id
ORDER BY ce.nombre, ct.orden;
-- esperado (CAMINERO MOTORS): GPS 3600 · SEGURO 1000 · CASCO 0 ·
--                             PLACA Y MATRICULA 0    → cuatro conceptos
