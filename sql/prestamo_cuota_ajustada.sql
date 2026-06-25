-- =====================================================================
-- crear_prestamo: soporte de CUOTA AJUSTADA (redondeo manual del operador)
-- ---------------------------------------------------------------------
-- Como el sistema viejo: el operador puede redondear la cuota a un numero
-- "redondo". Si p_cuota_ajustada > 0, la cuota fija pasa a ese valor;
-- el capital se mantiene (monto/plazo) y el interes = cuota - capital
-- (el ajuste de redondeo se suma a los intereses). Re-ejecutable.
-- =====================================================================

DROP FUNCTION IF EXISTS public.crear_prestamo(uuid,numeric,numeric,int,text,text,numeric,text,date,text,text);

CREATE OR REPLACE FUNCTION public.crear_prestamo(
  p_cliente_id     uuid,
  p_monto          numeric,
  p_tasa           numeric,
  p_plazo          int,
  p_metodo         text DEFAULT 'simple',
  p_frecuencia     text DEFAULT 'mensual',
  p_mora_pct       numeric DEFAULT 0,
  p_tipo           text DEFAULT 'financiamiento',
  p_fecha_primera  date DEFAULT NULL,
  p_garantia       text DEFAULT NULL,
  p_notas          text DEFAULT NULL,
  p_cuota_ajustada numeric DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'cliente_id es requerido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'Cliente no encontrado en este tenant';
  END IF;

  SELECT COALESCE(MAX((regexp_replace(numero, '\D','','g'))::int), 0) + 1
    INTO v_seq FROM public.prestamos WHERE tenant_id = v_tenant;
  v_numero := 'PT-' || lpad(v_seq::text, 7, '0');

  INSERT INTO public.prestamos (
    tenant_id, numero, cliente_id, tipo, metodo_interes, monto_capital,
    tasa_interes, plazo_cuotas, frecuencia, mora_pct, fecha_primera_cuota,
    garantia, notas
  ) VALUES (
    v_tenant, v_numero, p_cliente_id, COALESCE(p_tipo,'financiamiento'),
    COALESCE(p_metodo,'simple'), p_monto, COALESCE(p_tasa,0), p_plazo,
    COALESCE(p_frecuencia,'mensual'), COALESCE(p_mora_pct,0), v_fecha1,
    p_garantia, p_notas
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
$$;

REVOKE EXECUTE ON FUNCTION public.crear_prestamo(uuid,numeric,numeric,int,text,text,numeric,text,date,text,text,numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.crear_prestamo(uuid,numeric,numeric,int,text,text,numeric,text,date,text,text,numeric) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'crear_prestamo con cuota ajustada listo' AS status;
