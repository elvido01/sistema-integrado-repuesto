-- =====================================================================
-- calc_amortizacion: agregar metodo 'vencimiento' (bullet / interes periodico)
-- ---------------------------------------------------------------------
-- A Vencimiento: cada periodo se paga SOLO el interes (monto x tasa), y el
-- capital completo se paga en la ULTIMA cuota. Muy usado por la financiera.
--   cuotas 1..n-1: cuota = interes,  capital = 0
--   cuota n:       cuota = interes + capital total
-- Re-ejecutable (misma firma, CREATE OR REPLACE).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.calc_amortizacion(
  p_monto        numeric,
  p_tasa         numeric,
  p_plazo        int,
  p_metodo       text,
  p_frecuencia   text,
  p_fecha_primera date
)
RETURNS json
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  i           numeric := COALESCE(p_tasa,0) / 100.0;
  saldo       numeric := p_monto;
  cuota_fija  numeric;
  cap         numeric;
  interes     numeric;
  cuota       numeric;
  k           int;
  v_fecha     date;
  sum_cap     numeric := 0;
  arr         jsonb := '[]'::jsonb;
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 OR p_plazo IS NULL OR p_plazo <= 0 THEN
    RETURN '[]'::json;
  END IF;

  IF p_metodo = 'frances' AND i > 0 THEN
    cuota_fija := round(p_monto * i / (1 - power(1 + i, -p_plazo)), 2);
  END IF;

  FOR k IN 1..p_plazo LOOP
    v_fecha := CASE p_frecuencia
                 WHEN 'semanal'   THEN p_fecha_primera + ((k-1) * 7)
                 WHEN 'quincenal' THEN p_fecha_primera + ((k-1) * 15)
                 ELSE (p_fecha_primera + ((k-1) || ' months')::interval)::date
               END;

    IF p_metodo = 'frances' THEN
      IF i > 0 THEN
        interes := round(saldo * i, 2);
        cuota   := cuota_fija;
        cap     := round(cuota - interes, 2);
      ELSE
        cap     := round(p_monto / p_plazo, 2);
        interes := 0;
        cuota   := cap;
      END IF;
    ELSIF p_metodo = 'vencimiento' THEN
      -- interes periodico; capital se paga al final (lo arma el bloque de la ultima cuota)
      interes := round(p_monto * i, 2);
      cap     := 0;
      cuota   := round(cap + interes, 2);
    ELSE
      -- simple / flat: capital igual por cuota, interes fijo sobre el capital original
      cap     := round(p_monto / p_plazo, 2);
      interes := round(p_monto * i, 2);
      cuota   := cap + interes;
    END IF;

    -- ultima cuota: ajustar capital por redondeo (y en 'vencimiento' paga todo el capital)
    IF k = p_plazo THEN
      cap   := round(p_monto - sum_cap, 2);
      cuota := round(cap + interes, 2);
    END IF;
    sum_cap := sum_cap + cap;
    saldo   := round(saldo - cap, 2);

    arr := arr || jsonb_build_object(
      'numero_cuota',      k,
      'fecha_vencimiento', v_fecha,
      'capital',           cap,
      'interes',           interes,
      'monto_cuota',       cuota
    );
  END LOOP;

  RETURN arr::json;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calc_amortizacion(numeric,numeric,int,text,text,date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.calc_amortizacion(numeric,numeric,int,text,text,date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'calc_amortizacion con metodo a-vencimiento listo' AS status;
