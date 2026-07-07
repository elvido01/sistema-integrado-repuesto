-- ============================================================
-- Presupuesto de compras: INTERRUPTOR de modelo (elegido por el dueño)
-- ============================================================
-- Reporte 2026-07-06: convivian DOS modelos y "recuperacion" pisaba al
-- presupuesto fijo sin avisar (a un suplidor con deuda le mostraba
-- pagos*factor e ignoraba el monto base de 400k). El dueno pidio un
-- interruptor: elegir UN modelo que gobierne para TODOS los suplidores.
--
--   modelo_presupuesto = 'recuperacion'  (default, modelo payment-driven)
--       limite por suplidor = pagos_30d * factor - comprado_30d (si hay
--       deuda); sin deuda usa la caja global.
--   modelo_presupuesto = 'fijo'
--       limite = monto base mensual (400k) - compras del mes - caja
--       minima, compartido entre todos los suplidores. NUNCA cambia a
--       recuperacion. La asignacion manual por suplidor sigue mandando.
--
-- Solo cambia get_presupuesto_suplidor_auto. Idempotente.
-- ============================================================

ALTER TABLE public.presupuesto_config
  ADD COLUMN IF NOT EXISTS modelo_presupuesto TEXT NOT NULL DEFAULT 'recuperacion';

ALTER TABLE public.presupuesto_config
  DROP CONSTRAINT IF EXISTS presupuesto_config_modelo_check;
ALTER TABLE public.presupuesto_config
  ADD CONSTRAINT presupuesto_config_modelo_check
  CHECK (modelo_presupuesto IN ('recuperacion', 'fijo'));

CREATE OR REPLACE FUNCTION public.get_presupuesto_suplidor_auto(
  p_suplidor_id UUID,
  p_tenant_id   UUID DEFAULT NULL,
  p_mes         DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant              UUID;
  v_config              public.presupuesto_config%ROWTYPE;
  v_factor              NUMERIC := 0.85;
  v_modelo              TEXT := 'recuperacion';
  v_presup_total_json   JSON;
  v_global_disponible   NUMERIC := 0;
  v_monto_base_global   NUMERIC := 0;
  v_asignado_manual     NUMERIC := NULL;

  v_deuda_suplidor      NUMERIC := 0;
  v_pagos_sup_30d       NUMERIC := 0;
  v_comprado_sup_30d    NUMERIC := 0;
  v_fondo_liberado      NUMERIC := 0;
  v_disponible_sup      NUMERIC := 0;
  v_presup_suplidor     NUMERIC := 0;
  v_modo                TEXT;
  v_color               TEXT;
BEGIN
  v_tenant := COALESCE(p_tenant_id, public.get_user_tenant());
  IF v_tenant IS NULL OR p_suplidor_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id y suplidor_id son requeridos';
  END IF;

  SELECT * INTO v_config FROM public.presupuesto_config WHERE tenant_id = v_tenant;
  v_factor := COALESCE(v_config.factor_recuperacion, 0.85);
  v_modelo := COALESCE(v_config.modelo_presupuesto, 'recuperacion');

  -- Presupuesto/caja global
  v_presup_total_json := public.get_presupuesto_compras_v2(v_tenant, p_mes);
  v_global_disponible := COALESCE((v_presup_total_json->>'disponible')::NUMERIC, 0);
  v_monto_base_global := COALESCE((v_presup_total_json->>'monto_base_mensual')::NUMERIC, 0);

  -- Deuda actual con este suplidor
  SELECT COALESCE(SUM(
           COALESCE(c.monto_pendiente, c.total_compra - COALESCE(c.monto_pagado,0), 0)
         ), 0)
    INTO v_deuda_suplidor
  FROM public.compras c
  WHERE c.tenant_id = v_tenant
    AND c.suplidor_id = p_suplidor_id
    AND COALESCE(c.estado,'') NOT ILIKE '%anul%'
    AND COALESCE(c.monto_pendiente, c.total_compra - COALESCE(c.monto_pagado,0), 0) > 0.01;

  -- Pagos a este suplidor en 30 dias rodante
  SELECT COALESCE(SUM(monto_pagado), 0) INTO v_pagos_sup_30d
  FROM public.pagos_suplidores
  WHERE tenant_id = v_tenant
    AND suplidor_id = p_suplidor_id
    AND COALESCE(anulado, false) = false
    AND fecha >= CURRENT_DATE - 30;

  -- Compras (nueva deuda) a este suplidor en 30 dias rodante
  SELECT COALESCE(SUM(total_compra), 0) INTO v_comprado_sup_30d
  FROM public.compras
  WHERE tenant_id = v_tenant
    AND suplidor_id = p_suplidor_id
    AND COALESCE(estado,'') NOT ILIKE '%anul%'
    AND fecha >= CURRENT_DATE - 30;

  -- Asignacion manual (override de mayor prioridad, en cualquier modelo)
  SELECT monto_asignado INTO v_asignado_manual
  FROM public.presupuesto_asignaciones_suplidor
  WHERE tenant_id = v_tenant AND suplidor_id = p_suplidor_id AND mes = p_mes;

  IF v_asignado_manual IS NOT NULL THEN
    v_modo := 'manual';
    v_presup_suplidor := v_asignado_manual;
    v_disponible_sup  := GREATEST(0, v_asignado_manual - v_comprado_sup_30d);

  ELSIF v_modelo = 'fijo' THEN
    -- PRESUPUESTO FIJO: el monto base mensual mande, tenga o no deuda el
    -- suplidor. Es un pozo compartido: disponible global (ya neto de las
    -- compras del mes y la caja minima). No se resta 2 veces por suplidor.
    v_modo := 'presupuesto_fijo';
    v_presup_suplidor := v_monto_base_global;
    v_disponible_sup  := v_global_disponible;

  ELSIF v_deuda_suplidor > 0.01 THEN
    -- MODO RECUPERACION: liberar fondos segun lo pagado
    v_modo := 'recuperacion';
    v_fondo_liberado  := v_pagos_sup_30d * v_factor;
    v_presup_suplidor := v_fondo_liberado;
    v_disponible_sup  := GREATEST(0, v_fondo_liberado - v_comprado_sup_30d);

  ELSE
    -- SIN DEUDA (al dia o suplidor nuevo): limita la caja global
    v_modo := 'sin_deuda';
    v_presup_suplidor := v_global_disponible;
    v_disponible_sup  := GREATEST(0, v_global_disponible - v_comprado_sup_30d);
  END IF;

  v_color := CASE
    WHEN v_presup_suplidor <= 0 THEN 'gris'
    WHEN v_disponible_sup <= 0 THEN 'rojo'
    WHEN v_disponible_sup / NULLIF(v_presup_suplidor, 0) < 0.25 THEN 'amarillo'
    ELSE 'verde'
  END;

  RETURN json_build_object(
    'suplidor_id',           p_suplidor_id,
    'mes',                   p_mes,
    'modo_distribucion',     v_modo,
    'modelo_presupuesto',    v_modelo,
    'presupuesto_total',     ROUND(v_global_disponible, 2),
    'presupuesto_suplidor',  ROUND(v_presup_suplidor, 2),
    'comprado_suplidor',     ROUND(v_comprado_sup_30d, 2),
    'disponible_suplidor',   ROUND(v_disponible_sup, 2),
    'color',                 v_color,
    'presupuesto_total_json', v_presup_total_json,
    'deuda_suplidor',        ROUND(v_deuda_suplidor, 2),
    'pagos_suplidor_30d',    ROUND(v_pagos_sup_30d, 2),
    'fondo_liberado',        ROUND(v_fondo_liberado, 2),
    'factor_recuperacion',   v_factor,
    'ventana_dias',          30
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_presupuesto_suplidor_auto(UUID, UUID, DATE) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_presupuesto_suplidor_auto(UUID, UUID, DATE) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'presupuesto: interruptor de modelo (recuperacion | fijo) listo' AS status;
