-- =====================================================================
-- Excedente de caja + caja del dia + ancla rodante  (Dashboard / Inicio)
-- ---------------------------------------------------------------------
-- 1) get_caja_excedente_dashboard(): mueve al servidor el calculo que el
--    navegador hacia trayendo TODO el historial y sumandolo en JS. La BD
--    lo suma indexado en un solo viaje. NO cambia ningun numero.
--
-- 2) rodar_ancla_caja(): "cierre" mensual automatico. Congela lo acumulado
--    ANTES del inicio del mes dentro de saldo_inicial_caja y avanza
--    caja_historial_desde al 1ro del mes. Asi el excedente vale IGUAL
--    (saldo_inicial + movimientos desde el ancla), pero el RPC ya solo
--    suma el mes en curso -> nunca vuelve a escanear la historia completa.
--    Es idempotente y usa los MISMOS limites que el RPC de lectura, por lo
--    que el excedente es invariante al rodar el ancla.
--
-- Replica EXACTAMENTE los filtros que usaba HomePage.jsx:
--   Excedente = saldo_inicial_caja
--     + ventas de contado (facturas, forma_pago~contado, no anuladas)
--     + cobros (recibos_ingreso, no anulados)
--     - compromisos pagados (activo=false)
--     - pagos a suplidores (no anulados)
--     - compras de contado (no anuladas)
--     - gastos diarios (no anulados)
--   ...desde caja_historial_desde (created_at para timestamp; fecha para gastos).
--   Caja de hoy = ventas contado hoy + cobros hoy - gastos hoy.
--
-- Ancla de fecha: caja_historial_desde y "hoy" se interpretan a medianoche
-- hora America/Santo_Domingo.
--
-- Seguridad: SECURITY DEFINER + get_user_tenant(); nunca confia en un
-- tenant enviado desde el frontend.
-- =====================================================================

-- --------------------------------------------------------------------
-- 1) LECTURA: excedente + caja de hoy (+ bandera debe_rodar)
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_caja_excedente_dashboard()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant      uuid := public.get_user_tenant();
  v_seed        numeric := 0;
  v_anchor_date date := DATE '1970-01-01';
  v_anchor_ts   timestamptz;
  v_today       date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_today_ts    timestamptz;
  v_mes_ini     date := date_trunc('month', (now() AT TIME ZONE 'America/Santo_Domingo')::date)::date;
  v_excedente   numeric := 0;
  v_caja_hoy    numeric := 0;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant del usuario';
  END IF;

  SELECT COALESCE(saldo_inicial_caja, 0),
         COALESCE(caja_historial_desde, DATE '1970-01-01')
    INTO v_seed, v_anchor_date
  FROM public.config_empresa
  WHERE tenant_id = v_tenant
  LIMIT 1;

  v_anchor_ts := (v_anchor_date::timestamp AT TIME ZONE 'America/Santo_Domingo');
  v_today_ts  := (v_today::timestamp     AT TIME ZONE 'America/Santo_Domingo');

  -- ---------- EXCEDENTE (saldo inicial + acumulado desde el anchor) ----------
  v_excedente := v_seed
    + COALESCE((SELECT SUM(total) FROM public.facturas
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND forma_pago ILIKE 'contado' AND COALESCE(estado, '') <> 'ANULADA'), 0)
    + COALESCE((SELECT SUM(monto_pagado) FROM public.recibos_ingreso
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND COALESCE(anulado, false) = false), 0)
    - COALESCE((SELECT SUM(monto) FROM public.compromisos
        WHERE tenant_id = v_tenant AND fecha_pago >= v_anchor_ts
          AND activo = false), 0)
    - COALESCE((SELECT SUM(monto_pagado) FROM public.pagos_suplidores
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND COALESCE(anulado, false) = false), 0)
    - COALESCE((SELECT SUM(total_compra) FROM public.compras
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND forma_pago ILIKE 'contado' AND COALESCE(estado, '') <> 'ANULADA'), 0)
    - COALESCE((SELECT SUM(monto) FROM public.gastos_diarios
        WHERE tenant_id = v_tenant AND fecha >= v_anchor_date
          AND COALESCE(anulado, false) = false), 0);

  -- ---------- CAJA DE HOY ----------
  v_caja_hoy :=
      COALESCE((SELECT SUM(total) FROM public.facturas
        WHERE tenant_id = v_tenant AND created_at >= v_today_ts
          AND forma_pago ILIKE 'contado' AND COALESCE(estado, '') <> 'ANULADA'), 0)
    + COALESCE((SELECT SUM(monto_pagado) FROM public.recibos_ingreso
        WHERE tenant_id = v_tenant AND created_at >= v_today_ts
          AND COALESCE(anulado, false) = false), 0)
    - COALESCE((SELECT SUM(monto) FROM public.gastos_diarios
        WHERE tenant_id = v_tenant AND fecha = v_today
          AND COALESCE(anulado, false) = false), 0);

  RETURN json_build_object(
    'excedente',     ROUND(v_excedente, 2),
    'caja_hoy',      ROUND(v_caja_hoy, 2),
    'saldo_inicial', ROUND(v_seed, 2),
    'anchor',        v_anchor_date,
    -- true si el ancla quedo antes de este mes -> conviene rodarla
    'debe_rodar',    (v_anchor_date < v_mes_ini)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_caja_excedente_dashboard() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_caja_excedente_dashboard() TO authenticated, service_role;


-- --------------------------------------------------------------------
-- 2) ANCLA RODANTE: congela lo anterior al mes y avanza el ancla.
--    Invariante: el excedente vale exactamente lo mismo antes y despues.
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rodar_ancla_caja()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant      uuid := public.get_user_tenant();
  v_seed        numeric := 0;
  v_anchor_date date := DATE '1970-01-01';
  v_corte       date := date_trunc('month', (now() AT TIME ZONE 'America/Santo_Domingo')::date)::date;
  v_anchor_ts   timestamptz;
  v_corte_ts    timestamptz;
  v_fold        numeric := 0;
  v_nuevo_saldo numeric := 0;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant del usuario';
  END IF;

  SELECT COALESCE(saldo_inicial_caja, 0),
         COALESCE(caja_historial_desde, DATE '1970-01-01')
    INTO v_seed, v_anchor_date
  FROM public.config_empresa
  WHERE tenant_id = v_tenant
  LIMIT 1;

  -- Ya esta al dia (ancla en este mes o despues): nada que congelar.
  IF v_anchor_date >= v_corte THEN
    RETURN json_build_object('rodada', false, 'anchor', v_anchor_date, 'saldo_inicial', ROUND(v_seed, 2));
  END IF;

  v_anchor_ts := (v_anchor_date::timestamp AT TIME ZONE 'America/Santo_Domingo');
  v_corte_ts  := (v_corte::timestamp     AT TIME ZONE 'America/Santo_Domingo');

  -- Suma de TODO lo anterior al corte, con los MISMOS limites del RPC de lectura.
  v_fold :=
      COALESCE((SELECT SUM(total) FROM public.facturas
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts AND created_at < v_corte_ts
          AND forma_pago ILIKE 'contado' AND COALESCE(estado, '') <> 'ANULADA'), 0)
    + COALESCE((SELECT SUM(monto_pagado) FROM public.recibos_ingreso
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts AND created_at < v_corte_ts
          AND COALESCE(anulado, false) = false), 0)
    - COALESCE((SELECT SUM(monto) FROM public.compromisos
        WHERE tenant_id = v_tenant AND fecha_pago >= v_anchor_ts AND fecha_pago < v_corte_ts
          AND activo = false), 0)
    - COALESCE((SELECT SUM(monto_pagado) FROM public.pagos_suplidores
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts AND created_at < v_corte_ts
          AND COALESCE(anulado, false) = false), 0)
    - COALESCE((SELECT SUM(total_compra) FROM public.compras
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts AND created_at < v_corte_ts
          AND forma_pago ILIKE 'contado' AND COALESCE(estado, '') <> 'ANULADA'), 0)
    - COALESCE((SELECT SUM(monto) FROM public.gastos_diarios
        WHERE tenant_id = v_tenant AND fecha >= v_anchor_date AND fecha < v_corte
          AND COALESCE(anulado, false) = false), 0);

  v_nuevo_saldo := v_seed + v_fold;

  UPDATE public.config_empresa
     SET saldo_inicial_caja   = v_nuevo_saldo,
         caja_historial_desde = v_corte
   WHERE tenant_id = v_tenant;

  RETURN json_build_object(
    'rodada',        true,
    'anchor',        v_corte,
    'saldo_inicial', ROUND(v_nuevo_saldo, 2),
    'congelado',     ROUND(v_fold, 2)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rodar_ancla_caja() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rodar_ancla_caja() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'get_caja_excedente_dashboard + rodar_ancla_caja listos' AS status;
