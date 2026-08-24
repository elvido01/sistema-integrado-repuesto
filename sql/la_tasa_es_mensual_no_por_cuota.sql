-- =====================================================================
-- La tasa es MENSUAL, no "por cuota"
-- ---------------------------------------------------------------------
-- (2026-08-24) El dueno origino un prestamo diario y salio esto:
--
--   Capital 15,000 · tasa 10 · 60 cuotas diarias
--   -> Interes: 90,000 · Total a pagar: 105,000 · Cuota: 1,750
--
-- Lo correcto son 60 cuotas de 300 (18,000 en total).
--
-- >>> QUE ESTABA PASANDO <<<
-- La formula aplicaba la tasa al capital COMPLETO en CADA cuota, sin
-- mirar la frecuencia:
--
--     interes := round(p_monto * i, 2);
--
-- Para un prestamo mensual eso es correcto y es la convencion de la casa:
-- 10% mensual, una cuota al mes. Pero en uno diario se convierte en 10%
-- DIARIO — 600% en 60 dias. El campo decia "Tasa % por cuota" y la
-- formula le hacia caso al pie de la letra.
--
-- >>> LA REGLA REAL DEL NEGOCIO <<<
-- La tasa siempre se piensa POR MES. Lo que cambia es cuanto mes cabe en
-- una cuota:
--
--     mensual    1 cuota = 1 mes      -> factor 1
--     quincenal  1 cuota = medio mes  -> factor 0.5
--     semanal    1 cuota = 7/30 mes   -> factor 0.2333
--     diario     1 cuota = 1/30 mes   -> factor 0.0333
--
-- Con eso: 15,000 x 10% / 30 = 50 de interes al dia. Cuota = 250 + 50 =
-- 300. Total 18,000 en 60 dias, que es 20% — el 10% mensual por los dos
-- meses que dura. Exactamente lo que dijo el dueno.
--
-- >>> COMO SE SABE QUE ESTO LLEVABA TIEMPO ROTO <<<
-- Los prestamos diarios que ya existen delatan el apano. Todos tienen
-- cuotas redondas imposibles de sacar de la formula:
--
--   74,600 · tasa 3 · 365 cuotas -> cuota 300.00 (interes 95.62)
--   78,100 · tasa 3 · 365 cuotas -> cuota 300.00 (interes 86.03)
--   10,000 · tasa 0 ·  60 cuotas -> cuota 200.00 (interes 33.33)
--
-- Son cuotas TECLEADAS A MANO en el campo de cuota ajustada. Quien los
-- creo ya sabia que la formula no servia para diario y la esquivaba
-- escribiendo el pago que queria. El sistema nunca dio el numero bueno.
--
-- >>> LO QUE NO CAMBIA <<<
-- Los 28,430 prestamos mensuales llevan factor 1: dan exactamente lo
-- mismo que antes. Y ningun prestamo ya creado se recalcula — sus cuotas
-- estan guardadas en prestamo_cuotas. Esto solo afecta a los NUEVOS.
--
-- El metodo frances tambien queda arreglado (usaba la tasa cruda por
-- periodo); hoy no hay ni un prestamo frances, asi que no mueve nada.
--
-- Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.calc_amortizacion(
  p_monto         numeric,
  p_tasa          numeric,
  p_plazo         integer,
  p_metodo        text DEFAULT 'simple'::text,
  p_frecuencia    text DEFAULT 'mensual'::text,
  p_fecha_primera date DEFAULT NULL::date
)
RETURNS json
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  -- Cuanto mes cabe en una cuota. Es lo unico que se anade, y es lo que
  -- convierte "10% mensual" en lo que toca cobrar en cada cuota.
  factor      numeric := CASE COALESCE(p_frecuencia, 'mensual')
                           WHEN 'diario'    THEN 1.0 / 30.0
                           WHEN 'semanal'   THEN 7.0 / 30.0
                           WHEN 'quincenal' THEN 0.5
                           ELSE 1.0
                         END;
  i           numeric := (COALESCE(p_tasa, 0) / 100.0) * factor;   -- tasa DEL PERIODO
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

  -- A VENCIMIENTO: el interes es corriente (se acumula dia a dia), no se
  -- generan cuotas de interes. Solo la linea del capital al final del plazo.
  IF p_metodo = 'vencimiento' THEN
    v_fecha := CASE p_frecuencia
                 WHEN 'diario'    THEN p_fecha_primera + p_plazo
                 WHEN 'semanal'   THEN p_fecha_primera + (p_plazo * 7)
                 WHEN 'quincenal' THEN p_fecha_primera + (p_plazo * 15)
                 ELSE (p_fecha_primera + (p_plazo || ' months')::interval)::date
               END;
    RETURN jsonb_build_array(jsonb_build_object(
      'numero_cuota',      1,
      'fecha_vencimiento', v_fecha,
      'capital',           round(p_monto, 2),
      'interes',           0,
      'monto_cuota',       round(p_monto, 2)
    ))::json;
  END IF;

  IF p_metodo = 'frances' AND i > 0 THEN
    cuota_fija := round(p_monto * i / (1 - power(1 + i, -p_plazo)), 2);
  END IF;

  FOR k IN 1..p_plazo LOOP
    v_fecha := CASE p_frecuencia
                 WHEN 'diario'    THEN p_fecha_primera + (k-1)
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
    ELSE
      -- simple / flat: capital igual por cuota, interes fijo sobre el
      -- capital original — pero solo por el trozo de mes que dura la cuota.
      cap     := round(p_monto / p_plazo, 2);
      interes := round(p_monto * i, 2);
      cuota   := cap + interes;
    END IF;

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
$function$;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('la_tasa_es_mensual_no_por_cuota.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- EL CASO DEL DUENO: 15,000 · 10% · 60 cuotas diarias -> 60 de 300.
WITH c AS (SELECT jsonb_array_elements(
  public.calc_amortizacion(15000, 10, 60, 'simple', 'diario', '2026-08-25')::jsonb) x)
SELECT
  count(*)                                         AS cuotas,
  round((c.x->>'monto_cuota')::numeric, 2)         AS cuota,
  round(SUM((c.x->>'interes')::numeric) OVER (), 2) AS interes_total,
  round(SUM((c.x->>'monto_cuota')::numeric) OVER (), 2) AS total_a_pagar
FROM c GROUP BY c.x LIMIT 1;

-- REGRESION: un mensual tiene que dar EXACTAMENTE lo mismo que antes.
-- 15,000 · 10% · 12 mensuales -> cuota 2,750 (1,250 capital + 1,500 interes)
SELECT
  (public.calc_amortizacion(15000, 10, 12, 'simple', 'mensual', '2026-09-24')::jsonb -> 0 ->> 'monto_cuota')::numeric AS mensual_cuota,
  (public.calc_amortizacion(15000, 10, 12, 'simple', 'mensual', '2026-09-24')::jsonb -> 0 ->> 'interes')::numeric     AS mensual_interes,
  -- Y las otras frecuencias, para verlas de un vistazo
  (public.calc_amortizacion(15000, 10, 24, 'simple', 'quincenal', '2026-09-08')::jsonb -> 0 ->> 'monto_cuota')::numeric AS quincenal_cuota,
  (public.calc_amortizacion(15000, 10, 52, 'simple', 'semanal',  '2026-08-31')::jsonb -> 0 ->> 'monto_cuota')::numeric  AS semanal_cuota;
