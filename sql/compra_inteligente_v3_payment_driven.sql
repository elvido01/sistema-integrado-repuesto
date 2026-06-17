-- ============================================================
-- Compra Inteligente v3 — Liberacion de fondos por suplidor
--                          basada en PAGOS (recuperacion gradual)
-- ============================================================
-- Cambio de modelo solicitado por el dueño (2026-06):
--
-- ANTES: disponible_suplidor = presupuesto_global x share_historico − comprado_mes
--   Problema: el pago a un suplidor NO liberaba fondos. Pagabas 29K y
--   solo te dejaba comprar 4K. Demasiado drastico.
--
-- AHORA (payment-driven con factor de recuperacion):
--   fondo_liberado = pagos_al_suplidor_30d * factor_recuperacion
--   disponible     = fondo_liberado − comprado_al_suplidor_30d
--
--   factor_recuperacion < 1 (default 0.85) garantiza que la deuda con
--   el suplidor BAJA cada ciclo:
--     pagas 29,000 -> puedes comprar 29,000 * 0.85 = 24,650
--     deuda neta baja 29,000 − 24,650 = 4,350
--
--   Suplidor SIN deuda (al dia / nuevo): no aplica el gate de
--   recuperacion; el limite es la caja global disponible.
--
-- Ventana: 30 dias rodante (pagos y compras).
-- ============================================================

-- 1) Config: factor de recuperacion (configurable por tenant)
ALTER TABLE public.presupuesto_config
  ADD COLUMN IF NOT EXISTS factor_recuperacion NUMERIC NOT NULL DEFAULT 0.85
    CHECK (factor_recuperacion > 0 AND factor_recuperacion <= 1);

COMMENT ON COLUMN public.presupuesto_config.factor_recuperacion IS
  'Fraccion de lo pagado a un suplidor que se libera para comprarle de nuevo. 0.85 = repones 85% de lo que pagas, tu deuda baja 15% por ciclo. Mas bajo = recuperas mas rapido pero compras menos.';


-- 2) Reescritura del RPC por-suplidor con modelo payment-driven
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
  v_presup_total_json   JSON;
  v_global_disponible   NUMERIC := 0;
  v_asignado_manual     NUMERIC := NULL;

  v_deuda_suplidor      NUMERIC := 0;   -- lo que le debes HOY a este suplidor
  v_pagos_sup_30d       NUMERIC := 0;   -- lo que le pagaste en 30d rodante
  v_comprado_sup_30d    NUMERIC := 0;   -- lo que le compraste (nueva deuda) en 30d
  v_fondo_liberado      NUMERIC := 0;
  v_disponible_sup      NUMERIC := 0;
  v_presup_suplidor     NUMERIC := 0;   -- "techo" para mostrar (= fondo o global)
  v_modo                TEXT;
  v_color               TEXT;
BEGIN
  v_tenant := COALESCE(p_tenant_id, public.get_user_tenant());
  IF v_tenant IS NULL OR p_suplidor_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id y suplidor_id son requeridos';
  END IF;

  SELECT * INTO v_config FROM public.presupuesto_config WHERE tenant_id = v_tenant;
  v_factor := COALESCE(v_config.factor_recuperacion, 0.85);

  -- Presupuesto/caja global (para suplidores sin deuda)
  v_presup_total_json := public.get_presupuesto_compras_v2(v_tenant, p_mes);
  v_global_disponible := COALESCE((v_presup_total_json->>'disponible')::NUMERIC, 0);

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

  -- Asignacion manual (override de mayor prioridad)
  SELECT monto_asignado INTO v_asignado_manual
  FROM public.presupuesto_asignaciones_suplidor
  WHERE tenant_id = v_tenant AND suplidor_id = p_suplidor_id AND mes = p_mes;

  IF v_asignado_manual IS NOT NULL THEN
    -- El dueño fijo un monto manual para este suplidor este mes
    v_modo := 'manual';
    v_presup_suplidor := v_asignado_manual;
    v_disponible_sup  := GREATEST(0, v_asignado_manual - v_comprado_sup_30d);

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

  -- Semaforo
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
    -- shape compatible con el frontend actual:
    'presupuesto_total',     ROUND(v_global_disponible, 2),
    'presupuesto_suplidor',  ROUND(v_presup_suplidor, 2),
    'comprado_suplidor',     ROUND(v_comprado_sup_30d, 2),
    'disponible_suplidor',   ROUND(v_disponible_sup, 2),
    'color',                 v_color,
    'presupuesto_total_json', v_presup_total_json,
    -- datos nuevos del modelo payment-driven (para el desglose en UI):
    'deuda_suplidor',        ROUND(v_deuda_suplidor, 2),
    'pagos_suplidor_30d',    ROUND(v_pagos_sup_30d, 2),
    'fondo_liberado',        ROUND(v_fondo_liberado, 2),
    'factor_recuperacion',   v_factor,
    'ventana_dias',          30
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_presupuesto_suplidor_auto(UUID, UUID, DATE) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_presupuesto_suplidor_auto(UUID, UUID, DATE) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_presupuesto_suplidor_auto(UUID, UUID, DATE) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'Compra Inteligente v3 payment-driven listo (factor recuperacion configurable)' AS status;
