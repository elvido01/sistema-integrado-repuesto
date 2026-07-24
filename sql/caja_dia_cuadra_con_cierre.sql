-- =====================================================================
-- CAJA DEL DÍA = "Efectivo en Caja" del Cierre (cuadre 1:1)
-- ---------------------------------------------------------------------
-- (2026-07-24, MotoPréstamos) La CAJA DEL DÍA del dashboard no cuadraba con
-- el Cierre de Caja por 3 cosas. Este script las alinea, sobre la versión
-- viva (sql/caja_resta_desembolso_prestamo.sql). Incluye TODO lo anterior.
--
--   1) Desembolsos de préstamo: ya restados (efectivo hoy en caja del día;
--      desembolso IS NOT NULL en el excedente). Migrados = NULL, no cuentan.
--   2) Recibos en la CAJA DEL DÍA: ahora solo la porción EN EFECTIVO de
--      `formas_pago` (transferencia/cheque/tarjeta van al banco, NO a la
--      gaveta). Sin formas_pago = todo efectivo (igual que el cierre).
--   3) Recibos en la CAJA DEL DÍA: por `fecha` real del recibo (no por
--      created_at), para que un recibo con fecha de ayer no infle la caja
--      de hoy. Igual criterio que el Cierre.
--
-- OJO: el EXCEDENTE (balance acumulado = efectivo + banco) NO cambia: sigue
-- sumando TODOS los recibos (incluye transferencias, que están en el banco).
-- Solo cambia la CAJA DEL DÍA (efectivo físico), que es la que se compara
-- contra "Efectivo en Caja" del cierre.
--
-- Idempotente / re-ejecutable. Correr en PRODUCCIÓN (SQL editor de Supabase).
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

  -- ---------- EXCEDENTE (efectivo + banco acumulado; NO se toca) ----------
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
          AND COALESCE(anulado, false) = false
          AND cuenta_bancaria_id IS NULL
          AND COALESCE(afecta_caja, true) = true), 0)
    - COALESCE((SELECT SUM(total_comision) FROM public.pagos_comisiones
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND UPPER(COALESCE(forma_pago,'EFECTIVO')) = 'TRANSFERENCIA'
          AND COALESCE(anulado, false) = false), 0)
    - COALESCE((SELECT SUM(monto_capital) FROM public.prestamos
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND desembolso IS NOT NULL), 0);

  -- ---------- CAJA DE HOY (efectivo físico del día = "Efectivo en Caja") ----------
  v_caja_hoy :=
      COALESCE((SELECT SUM(total) FROM public.facturas
        WHERE tenant_id = v_tenant AND created_at >= v_today_ts
          AND forma_pago ILIKE 'contado' AND COALESCE(estado, '') <> 'ANULADA'), 0)
    -- recibos: SOLO la porción en efectivo y por FECHA real (igual que el cierre)
    + COALESCE((
        SELECT SUM(
          CASE
            WHEN jsonb_typeof(COALESCE(ri.formas_pago, '[]'::jsonb)) = 'array'
                 AND jsonb_array_length(COALESCE(ri.formas_pago, '[]'::jsonb)) > 0
            THEN COALESCE((
                   SELECT SUM((f->>'monto')::numeric)
                   FROM jsonb_array_elements(COALESCE(ri.formas_pago, '[]'::jsonb)) f
                   WHERE lower(COALESCE(f->>'forma','')) LIKE '%efectivo%'
                 ), 0)
            ELSE COALESCE(ri.monto_pagado, 0)
          END
        )
        FROM public.recibos_ingreso ri
        WHERE ri.tenant_id = v_tenant
          AND ri.fecha = v_today
          AND COALESCE(ri.anulado, false) = false
      ), 0)
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
          AND COALESCE(forma_pago, 'Efectivo') ILIKE '%efectivo%'), 0)
    - COALESCE((SELECT SUM(monto_capital) FROM public.prestamos
        WHERE tenant_id = v_tenant AND created_at >= v_today_ts
          AND desembolso ILIKE 'efectivo'), 0);

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
    PERFORM public.registrar_migracion('caja_dia_cuadra_con_cierre.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

SELECT 'CAJA DEL DÍA alineada con el Cierre (efectivo por fecha + desembolsos)' AS status;
