-- =====================================================================
-- Desembolso del préstamo (efectivo | transferencia | cheque)
-- Al originar un préstamo, el capital que se entrega al cliente sale
-- de una caja:
--   · efectivo      -> resta de la CAJA DEL DÍA (y del balance total)
--   · transferencia -> resta solo del EXCEDENTE (banco/acumulado)
--   · cheque        -> resta solo del EXCEDENTE
-- Los préstamos migrados del viejo y los del financiamiento terceros
-- tienen desembolso NULL y NO tocan la caja.
-- =====================================================================

ALTER TABLE public.prestamos
  ADD COLUMN IF NOT EXISTS desembolso text;

-- 1) crear_prestamo con el nuevo parámetro (se elimina la firma vieja
--    para no dejar una sobrecarga ambigua)
DROP FUNCTION IF EXISTS public.crear_prestamo(uuid, numeric, numeric, integer, text, text, numeric, text, date, text, text, numeric);

CREATE FUNCTION public.crear_prestamo(
  p_cliente_id uuid, p_monto numeric, p_tasa numeric, p_plazo integer,
  p_metodo text DEFAULT 'simple', p_frecuencia text DEFAULT 'mensual',
  p_mora_pct numeric DEFAULT 0, p_tipo text DEFAULT 'financiamiento',
  p_fecha_primera date DEFAULT NULL, p_garantia text DEFAULT NULL,
  p_notas text DEFAULT NULL, p_cuota_ajustada numeric DEFAULT NULL,
  p_desembolso text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_id       uuid;
  v_numero   text;
  v_seq      int;
  v_fecha1   date := COALESCE(p_fecha_primera, (current_date + interval '1 month')::date);
  v_cuotas   json;
  c          jsonb;
  v_cap      numeric;
  v_int      numeric;
  v_cuota_m  numeric;
  v_adj      numeric := COALESCE(p_cuota_ajustada, 0);
  v_desemb   text := lower(NULLIF(trim(COALESCE(p_desembolso, '')), ''));
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'cliente_id es requerido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'Cliente no encontrado en este tenant';
  END IF;
  IF v_desemb IS NOT NULL AND v_desemb NOT IN ('efectivo', 'transferencia', 'cheque') THEN
    RAISE EXCEPTION 'Desembolso inválido: %', p_desembolso;
  END IF;

  SELECT COALESCE(MAX((regexp_replace(numero, '\D','','g'))::int), 0) + 1
    INTO v_seq FROM public.prestamos WHERE tenant_id = v_tenant;
  v_numero := 'PT-' || lpad(v_seq::text, 7, '0');

  INSERT INTO public.prestamos (
    tenant_id, numero, cliente_id, tipo, metodo_interes, monto_capital,
    tasa_interes, plazo_cuotas, frecuencia, mora_pct, fecha_primera_cuota,
    garantia, notas, desembolso
  ) VALUES (
    v_tenant, v_numero, p_cliente_id, COALESCE(p_tipo,'financiamiento'),
    COALESCE(p_metodo,'simple'), p_monto, COALESCE(p_tasa,0), p_plazo,
    COALESCE(p_frecuencia,'mensual'), COALESCE(p_mora_pct,0), v_fecha1,
    p_garantia, p_notas, v_desemb
  ) RETURNING id INTO v_id;

  v_cuotas := public.calc_amortizacion(p_monto, p_tasa, p_plazo, COALESCE(p_metodo,'simple'), COALESCE(p_frecuencia,'mensual'), v_fecha1);

  FOR c IN SELECT * FROM jsonb_array_elements(v_cuotas::jsonb) LOOP
    v_cap := (c->>'capital')::numeric;
    IF v_adj > 0 THEN
      -- Cuota ajustada: capital igual, interes = cuota - capital
      v_cuota_m := v_adj;
      v_int     := round(v_adj - v_cap, 2);
    ELSE
      v_cuota_m := (c->>'monto_cuota')::numeric;
      v_int     := (c->>'interes')::numeric;
    END IF;

    INSERT INTO public.prestamo_cuotas (
      tenant_id, prestamo_id, numero_cuota, fecha_vencimiento, capital, interes, monto_cuota
    ) VALUES (
      v_tenant, v_id, (c->>'numero_cuota')::int, (c->>'fecha_vencimiento')::date,
      v_cap, v_int, v_cuota_m
    );
  END LOOP;

  RETURN json_build_object('id', v_id, 'numero', v_numero, 'cuota_ajustada', v_adj, 'cuotas', v_cuotas);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.crear_prestamo(uuid, numeric, numeric, integer, text, text, numeric, text, date, text, text, numeric, text) TO authenticated;

-- 2) Caja del día y excedente: el desembolso sale de la caja que toca
CREATE OR REPLACE FUNCTION public.get_caja_excedente_dashboard()
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    - COALESCE((SELECT SUM(monto) FROM public.gastos_diarios
        WHERE tenant_id = v_tenant AND fecha >= v_anchor_date
          AND COALESCE(anulado, false) = false), 0)
    - COALESCE((SELECT SUM(total_comision) FROM public.pagos_comisiones
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND UPPER(COALESCE(forma_pago,'EFECTIVO')) = 'TRANSFERENCIA'
          AND COALESCE(anulado, false) = false), 0)
    -- desembolsos de préstamos originados en la app (efectivo, transferencia
    -- o cheque): dinero que salió; los migrados (desembolso NULL) no cuentan
    - COALESCE((SELECT SUM(monto_capital) FROM public.prestamos
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND desembolso IS NOT NULL), 0);

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
          AND COALESCE(anulado, false) = false), 0)
    -- pagos a suplidores de HOY: solo la porcion EN EFECTIVO (pagos mixtos)
    - COALESCE((
        SELECT SUM((f->>'monto')::numeric)
        FROM public.pagos_suplidores ps,
             jsonb_array_elements(COALESCE(ps.formas_pago, '[]'::jsonb)) f
        WHERE ps.tenant_id = v_tenant
          AND ps.created_at >= v_today_ts
          AND COALESCE(ps.anulado, false) = false
          AND (f->>'forma') ILIKE '%efectivo%'
      ), 0)
    -- compromisos pagados HOY en efectivo (nomina, alquiler, etc.)
    - COALESCE((SELECT SUM(monto) FROM public.compromisos
        WHERE tenant_id = v_tenant AND activo = false
          AND fecha_pago >= v_today_ts
          AND COALESCE(forma_pago, 'Efectivo') ILIKE '%efectivo%'), 0)
    -- desembolsos de préstamos de HOY entregados EN EFECTIVO
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
$function$;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('prestamo_desembolso.sql');
  END IF;
END $$;

SELECT 'Desembolso de préstamos (efectivo/transferencia/cheque) listo' AS status;
