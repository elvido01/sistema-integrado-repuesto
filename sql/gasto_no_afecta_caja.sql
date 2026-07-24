-- =====================================================================
-- GASTO DIARIO que NO afecta la caja (pagado desde una cuenta externa)
-- ---------------------------------------------------------------------
-- Caso (2026-07-24, Caminero/Odalys): un gasto de la empresa (ej. "COMPRA
-- PARA CASA" RD$5,000) lo pagó Odalys de SU cuenta, no la gaveta. Debe
-- REGISTRARSE como gasto de la empresa (para el control de gastos) pero NO
-- puede rebajar la Caja Actual (excedente) ni la Caja del Día.
--
-- Ya existía gastos_diarios.cuenta_bancaria_id (gasto pagado desde una
-- cuenta bancaria de la empresa → tampoco resta de la gaveta). Pero la
-- "cuenta de Odalys" NO es una cuenta bancaria de la empresa: es un tercero.
-- Se agrega una marca general:
--
--   gastos_diarios.afecta_caja  (default true)
--     true  = salió de la gaveta (efectivo)  → resta de la caja (igual que siempre)
--     false = pagado por banco de la empresa O por un tercero/otra cuenta
--             → NO resta de la caja, pero SÍ cuenta como gasto de la empresa.
--
-- get_caja_excedente_dashboard deja de restar los gastos con afecta_caja=false
-- o con cuenta_bancaria_id lleno. TODO lo demás de la función queda IDÉNTICO a
-- la versión viva (sql/revertir_compromiso_a_gasto.sql): recibos, compromisos,
-- suplidores, compras, comisiones — no se toca nada más (cambio quirúrgico).
--
-- Idempotente / re-ejecutable. Correr en PRODUCCIÓN (SQL editor de Supabase).
-- =====================================================================

ALTER TABLE public.gastos_diarios
  ADD COLUMN IF NOT EXISTS afecta_caja boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.gastos_diarios.afecta_caja IS
  'false = el gasto NO salió de la gaveta (banco de la empresa o un tercero/otra cuenta): cuenta como gasto pero NO resta de la caja. Ver sql/gasto_no_afecta_caja.sql';

-- Los gastos ya pagados por cuenta bancaria de la empresa no salieron de la
-- gaveta: dejarlos consistentes con la marca nueva.
UPDATE public.gastos_diarios
   SET afecta_caja = false
 WHERE cuenta_bancaria_id IS NOT NULL
   AND afecta_caja = true;

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

  -- ---------- EXCEDENTE ----------
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
    -- solo los gastos que SALIERON DE LA GAVETA (efectivo): los de banco de la
    -- empresa o los pagados por un tercero (afecta_caja=false) no restan.
    - COALESCE((SELECT SUM(monto) FROM public.gastos_diarios
        WHERE tenant_id = v_tenant AND fecha >= v_anchor_date
          AND COALESCE(anulado, false) = false
          AND cuenta_bancaria_id IS NULL
          AND COALESCE(afecta_caja, true) = true), 0)
    - COALESCE((SELECT SUM(total_comision) FROM public.pagos_comisiones
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND UPPER(COALESCE(forma_pago,'EFECTIVO')) = 'TRANSFERENCIA'
          AND COALESCE(anulado, false) = false), 0);

  -- ---------- CAJA DE HOY (efectivo fisico del dia) ----------
  v_caja_hoy :=
      COALESCE((SELECT SUM(total) FROM public.facturas
        WHERE tenant_id = v_tenant AND created_at >= v_today_ts
          AND forma_pago ILIKE 'contado' AND COALESCE(estado, '') <> 'ANULADA'), 0)
    + COALESCE((SELECT SUM(monto_pagado) FROM public.recibos_ingreso
        WHERE tenant_id = v_tenant AND created_at >= v_today_ts
          AND COALESCE(anulado, false) = false), 0)
    - COALESCE((SELECT SUM(monto) FROM public.gastos_diarios
        WHERE tenant_id = v_tenant AND fecha = v_today
          AND COALESCE(anulado, false) = false
          AND cuenta_bancaria_id IS NULL
          AND COALESCE(afecta_caja, true) = true), 0)
    - COALESCE((
        SELECT SUM((f->>'monto')::numeric)
        FROM public.pagos_suplidores ps,
             jsonb_array_elements(COALESCE(ps.formas_pago, '[]'::jsonb)) f
        WHERE ps.tenant_id = v_tenant
          AND ps.created_at >= v_today_ts
          AND COALESCE(ps.anulado, false) = false
          AND (f->>'forma') ILIKE '%efectivo%'
      ), 0)
    - COALESCE((SELECT SUM(monto) FROM public.compromisos
        WHERE tenant_id = v_tenant AND activo = false
          AND fecha_pago >= v_today_ts
          AND COALESCE(forma_pago, 'Efectivo') ILIKE '%efectivo%'), 0);

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
    PERFORM public.registrar_migracion('gasto_no_afecta_caja.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Verificación: la columna existe
SELECT 'gastos_diarios.afecta_caja' AS objeto,
       (SELECT count(*)::text FROM information_schema.columns
        WHERE table_schema='public' AND table_name='gastos_diarios'
          AND column_name='afecta_caja') AS existe;
