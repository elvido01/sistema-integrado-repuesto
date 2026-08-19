-- Un prestamo puede entrar con la fecha en que de verdad empezo.
--
-- >>> EL CASO <<<
-- (2026-08-19) Se digito un prestamo hace dos semanas con el monto
-- equivocado. Hoy se dieron cuenta, le hicieron nota de credito, y hay que
-- volver a entrarlo con el monto bueno -- pero con SU fecha, no con la de
-- hoy. Si entra fechado hoy, el cliente se ahorra dos semanas de interes y
-- el papel dice una fecha que no es la que firmo.
--
-- crear_prestamo nunca escribio fecha_inicio: dejaba que la columna tomara
-- su DEFAULT, que es CURRENT_DATE. Ahora se puede mandar, y por defecto
-- sigue siendo hoy.
--
-- >>> QUE MUEVE Y QUE NO <<<
-- fecha_inicio es el ancla del interes corriente en los prestamos a
-- vencimiento: atrasarla dos semanas hace que nazcan debiendo dos semanas
-- de interes. Eso es lo correcto -- el prestamo existio esas dos semanas --
-- pero conviene saberlo antes de teclear.
--
-- La CAJA no se mueve. Los desembolsos se cuentan por created_at, no por
-- fecha_inicio (get_caja_excedente_dashboard, lineas 71 y 133), asi que
-- fechar un prestamo hacia atras NO toca un cierre ya cuadrado. Se
-- comprobo antes de escribir esto, porque era el riesgo real.
--
-- >>> LAS GUARDAS <<<
--   * hacia adelante no: un prestamo empieza cuando se entrega el dinero.
--   * mas de dos anos atras tampoco: ataja el dedo que escribe 2020 en vez
--     de 2026, que en un prestamo a interes corriente naceria debiendo seis
--     anos de intereses.
--
-- Generado desde la definicion viva en produccion: solo cambian la firma,
-- dos lineas del INSERT y las guardas.

-- Las firmas viejas se quitan para que no queden tres puertas a la misma
-- funcion: con parametros con nombre, PostgREST no sabria cual elegir.
DROP FUNCTION IF EXISTS public.crear_prestamo(uuid, numeric, numeric, integer, text, text, numeric, text, date, text, text, numeric);
DROP FUNCTION IF EXISTS public.crear_prestamo(uuid, numeric, numeric, integer, text, text, numeric, text, date, text, text, numeric, text);
CREATE OR REPLACE FUNCTION public.crear_prestamo(p_cliente_id uuid, p_monto numeric, p_tasa numeric, p_plazo integer, p_metodo text DEFAULT 'simple'::text, p_frecuencia text DEFAULT 'mensual'::text, p_mora_pct numeric DEFAULT 0, p_tipo text DEFAULT 'financiamiento'::text, p_fecha_primera date DEFAULT NULL::date, p_garantia text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_cuota_ajustada numeric DEFAULT NULL::numeric, p_desembolso text DEFAULT NULL::text, p_fecha_inicio date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_id       uuid;
  v_numero   text;
  v_seq      bigint;
  -- La fecha en que el prestamo EMPEZO, que no siempre es hoy: un prestamo
  -- mal digitado se anula con nota de credito y se vuelve a entrar con el
  -- monto bueno, pero tiene que conservar su fecha original.
  v_inicio   date := COALESCE(p_fecha_inicio, current_date);
  -- Si no dan primera cuota, cuelga de la fecha de INICIO. Colgarla de hoy
  -- en un prestamo atrasado dos semanas le regalaria dos semanas al cliente.
  v_fecha1   date := COALESCE(p_fecha_primera, (COALESCE(p_fecha_inicio, current_date) + interval '1 month')::date);
  v_cuotas   json;
  c          jsonb;
  v_cap      numeric;
  v_int      numeric;
  v_cuota_m  numeric;
  v_adj      numeric := COALESCE(p_cuota_ajustada, 0);
  v_desemb   text := lower(NULLIF(trim(COALESCE(p_desembolso, '')), ''));
  v_metodo   text := COALESCE(p_metodo, 'simple');
  v_venc     boolean := (v_metodo = 'vencimiento');
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;

  -- Hacia atras si, hacia adelante no: un prestamo empieza cuando se
  -- entrega el dinero, y eso ya paso.
  IF v_inicio > current_date THEN
    RAISE EXCEPTION 'La fecha del prestamo no puede ser futura';
  END IF;
  -- Dos anos es de sobra para corregir un error de digitacion, y ataja el
  -- dedo que escribe 2020 en vez de 2026. Sin este tope, un prestamo a
  -- interes corriente naceria debiendo seis anos de intereses.
  IF v_inicio < current_date - interval '2 years' THEN
    RAISE EXCEPTION 'La fecha del prestamo esta demasiado atras (%). Revisa el ano.', v_inicio;
  END IF;
  IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'cliente_id es requerido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'Cliente no encontrado en este tenant';
  END IF;
  IF v_desemb IS NOT NULL AND v_desemb NOT IN ('efectivo', 'transferencia', 'cheque') THEN
    RAISE EXCEPTION 'Desembolso inválido: %', p_desembolso;
  END IF;

  -- Secuencia a prueba de numeros legacy ('PT-0000002-200000002' del SiiF).
  SELECT COALESCE(MAX(t.n), 0) + 1
    INTO v_seq
  FROM (
    SELECT substring(numero from 4)::bigint AS n
    FROM public.prestamos
    WHERE tenant_id = v_tenant AND numero ~ '^PT-\d+$'
  ) t
  WHERE t.n < 9000000;

  v_numero := 'PT-' || lpad(v_seq::text, 7, '0');

  INSERT INTO public.prestamos (
    tenant_id, numero, cliente_id, tipo, metodo_interes, monto_capital,
    tasa_interes, plazo_cuotas, frecuencia, mora_pct, fecha_primera_cuota, fecha_inicio,
    garantia, notas, desembolso, es_solo_interes, base_interes_dias
  ) VALUES (
    v_tenant, v_numero, p_cliente_id, COALESCE(p_tipo,'financiamiento'),
    v_metodo, p_monto, COALESCE(p_tasa,0), p_plazo,
    COALESCE(p_frecuencia,'mensual'), COALESCE(p_mora_pct,0), v_fecha1, v_inicio,
    p_garantia, p_notas, v_desemb, v_venc,
    30   -- mes comercial: los prestamos nuevos cobran 333.33/dia en 100k al 10%
  ) RETURNING id INTO v_id;

  v_cuotas := public.calc_amortizacion(p_monto, p_tasa, p_plazo, v_metodo, COALESCE(p_frecuencia,'mensual'), v_fecha1);

  FOR c IN SELECT * FROM jsonb_array_elements(v_cuotas::jsonb) LOOP
    v_cap := (c->>'capital')::numeric;
    -- En 'vencimiento' la unica linea es capital puro: la cuota ajustada no aplica.
    IF v_adj > 0 AND NOT v_venc THEN
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
$function$
;

GRANT EXECUTE ON FUNCTION public.crear_prestamo(uuid, numeric, numeric, integer, text, text, numeric, text, date, text, text, numeric, text, date) TO authenticated;

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'crear_prestamo') AS firmas,
  CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname='public' AND p.proname='crear_prestamo') = 1
       THEN 'OK  una sola puerta' ELSE '*** FALLO *** quedan varias firmas' END AS puertas,
  CASE WHEN position('p_fecha_inicio' in (
         SELECT pg_get_functiondef(p.oid) FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='crear_prestamo')) > 0
       THEN 'OK  acepta la fecha' ELSE '*** FALLO ***' END AS parametro,
  CASE WHEN position('fecha_inicio,' in (
         SELECT pg_get_functiondef(p.oid) FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='crear_prestamo')) > 0
       THEN 'OK  la escribe en la tabla' ELSE '*** FALLO *** no la guarda' END AS guardada;

SELECT public.registrar_migracion('prestamo_fecha_inicio.sql');
