-- =====================================================================
-- GASTO DIARIO pagado desde una CUENTA BANCARIA
-- ---------------------------------------------------------------------
-- Caso (2026-07-22, MotoPréstamos): cuando hay un gasto grande que supera
-- el efectivo en caja, se paga por transferencia/cheque desde una cuenta
-- del banco. Hasta ahora todo gasto restaba de la CAJA (efectivo), asi que
-- un gasto pagado por banco descuadraba la gaveta.
--
-- Arreglo:
--   1) gastos_diarios.cuenta_bancaria_id — si esta lleno, el gasto salio
--      del BANCO (la app registra ademas la SALIDA en esa cuenta).
--   2) get_caja_excedente_dashboard EXCLUYE esos gastos de la caja del dia
--      y del excedente: ese dinero nunca estuvo en la gaveta. Los gastos en
--      efectivo (cuenta_bancaria_id NULL) siguen restando igual que siempre.
--
-- El resto de la funcion se conserva TAL CUAL de
-- sql/caja_recibos_por_fecha_real.sql (recibos por fecha real + ancla en la
-- caja del dia). OJO: esa version ya no restaba los desembolsos de
-- prestamos que si restaba sql/prestamo_desembolso.sql — se mantiene el
-- comportamiento actual a proposito; restaurarlo es una decision aparte.
-- Idempotente / re-ejecutable.
-- =====================================================================

ALTER TABLE public.gastos_diarios
  ADD COLUMN IF NOT EXISTS cuenta_bancaria_id uuid
  REFERENCES public.cuentas_bancarias(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.gastos_diarios.cuenta_bancaria_id IS
  'Si esta lleno, el gasto se pago desde esa cuenta bancaria y NO resta de la caja en efectivo. Ver sql/gasto_desde_cuenta_bancaria.sql';

-- Origen 'gasto' en el libro bancario (la app registra la SALIDA).
ALTER TABLE public.movimientos_bancarios DROP CONSTRAINT IF EXISTS movimientos_bancarios_origen_tipo_check;
ALTER TABLE public.movimientos_bancarios ADD CONSTRAINT movimientos_bancarios_origen_tipo_check
  CHECK (origen_tipo IN ('venta','recibo','cierre_caja','pago_suplidor','compromiso',
                         'san','san_completado','ingreso','retiro','desembolso','gasto',
                         'ajuste','transferencia_interna'));

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
    -- solo los gastos pagados EN EFECTIVO: los de banco salen de la cuenta
    - COALESCE((SELECT SUM(monto) FROM public.gastos_diarios
        WHERE tenant_id = v_tenant AND fecha >= v_anchor_date
          AND COALESCE(anulado, false) = false
          AND cuenta_bancaria_id IS NULL), 0);

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
            AND COALESCE(anulado, false) = false
            AND cuenta_bancaria_id IS NULL), 0);
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

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('gasto_desde_cuenta_bancaria.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

SELECT 'gastos_diarios.cuenta_bancaria_id' AS objeto,
       (SELECT count(*)::text FROM information_schema.columns
        WHERE table_schema='public' AND table_name='gastos_diarios'
          AND column_name='cuenta_bancaria_id') AS existe;
