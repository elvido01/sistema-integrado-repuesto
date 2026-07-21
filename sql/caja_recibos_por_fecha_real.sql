-- =====================================================================
-- Caja: los cobros cuentan por su FECHA REAL, no por cuando se digitaron
-- ---------------------------------------------------------------------
-- Problema (MotoPrestamos Los Naranjos, 2026-07-21): la migracion diaria
-- del SiiF inserta de golpe los recibos de varios dias. El RPC sumaba los
-- cobros por `created_at` (cuando entro la fila), asi que los recibos del
-- 13 al 21 de julio aparecieron TODOS como caja de hoy: RD$540,622.79 en
-- "Caja actual", "Excedente" y "Caja del dia", cuando lo cobrado hoy de
-- verdad era RD$1,000. El "Flujo neto del mes" ya usaba `fecha` y por eso
-- era el unico correcto.
--
-- Arreglo:
--   1) recibos_ingreso se suma por `fecha` (la del cobro), igual que
--      gastos_diarios y que el RPC de flujo neto. Un recibo con fecha de
--      ayer nunca mas cuenta como caja de hoy, lo digites cuando lo
--      digites.
--   2) "Caja del dia" respeta el ancla: si el historial arranca despues de
--      hoy, la caja del dia es 0 (la empresa todavia no empezo a contar).
--      Antes el ancla solo aplicaba al excedente, por eso una empresa
--      recien reseteada seguia viendo caja del dia vieja.
--   3) rodar_ancla_caja usa el mismo criterio, para que el excedente siga
--      valiendo igual antes y despues de congelar el mes.
--
-- Para las empresas que digitan el mismo dia (Morla, Caminero) no cambia
-- ningun numero: ahi `fecha` y `created_at` caen en el mismo dia.
-- Idempotente / re-ejecutable.
-- =====================================================================

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
    -- por FECHA del cobro (no por cuando se digito/migro)
    + COALESCE((SELECT SUM(monto_pagado) FROM public.recibos_ingreso
        WHERE tenant_id = v_tenant AND fecha >= v_anchor_date
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
  -- Si el historial arranca despues de hoy, la empresa todavia no cuenta.
  IF v_today < v_anchor_date THEN
    v_caja_hoy := 0;
  ELSE
    v_caja_hoy :=
        COALESCE((SELECT SUM(total) FROM public.facturas
          WHERE tenant_id = v_tenant AND created_at >= v_today_ts
            AND forma_pago ILIKE 'contado' AND COALESCE(estado, '') <> 'ANULADA'), 0)
      + COALESCE((SELECT SUM(monto_pagado) FROM public.recibos_ingreso
          WHERE tenant_id = v_tenant AND fecha = v_today
            AND COALESCE(anulado, false) = false), 0)
      - COALESCE((SELECT SUM(monto) FROM public.gastos_diarios
          WHERE tenant_id = v_tenant AND fecha = v_today
            AND COALESCE(anulado, false) = false), 0);
  END IF;

  RETURN json_build_object(
    'excedente',     ROUND(v_excedente, 2),
    'caja_hoy',      ROUND(v_caja_hoy, 2),
    'saldo_inicial', ROUND(v_seed, 2),
    'anchor',        v_anchor_date,
    'debe_rodar',    (v_anchor_date < v_mes_ini)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_caja_excedente_dashboard() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_caja_excedente_dashboard() TO authenticated, service_role;

-- --------------------------------------------------------------------
-- Ancla rodante: mismo criterio, para que el excedente sea invariante.
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

  IF v_anchor_date >= v_corte THEN
    RETURN json_build_object('rodada', false, 'anchor', v_anchor_date, 'saldo_inicial', ROUND(v_seed, 2));
  END IF;

  v_anchor_ts := (v_anchor_date::timestamp AT TIME ZONE 'America/Santo_Domingo');
  v_corte_ts  := (v_corte::timestamp     AT TIME ZONE 'America/Santo_Domingo');

  v_fold :=
      COALESCE((SELECT SUM(total) FROM public.facturas
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts AND created_at < v_corte_ts
          AND forma_pago ILIKE 'contado' AND COALESCE(estado, '') <> 'ANULADA'), 0)
    + COALESCE((SELECT SUM(monto_pagado) FROM public.recibos_ingreso
        WHERE tenant_id = v_tenant AND fecha >= v_anchor_date AND fecha < v_corte
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

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('caja_recibos_por_fecha_real.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

SELECT 'get_caja_excedente_dashboard' AS objeto,
       to_regprocedure('public.get_caja_excedente_dashboard()')::text AS existe;
