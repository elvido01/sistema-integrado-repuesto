-- =====================================================================
-- FIX: crear_prestamo reventaba con "out of range for type integer"
-- ---------------------------------------------------------------------
-- Error (2026-07-22, MotoPréstamos): al crear un préstamo
--   value "0000002200000002" is out of range for type integer
--
-- Causa: la secuencia juntaba TODOS los digitos del numero y los casteaba
-- a int4:
--   MAX((regexp_replace(numero,'\D','','g'))::int)
-- La migracion del SiiF dejo 622 prestamos con numero legacy tipo
-- 'PT-0000002-200000002'; al quitarle los guiones da 2,200,000,002, que se
-- pasa del maximo de integer (2,147,483,647).
--
-- Arreglo: misma secuencia a prueba de legacy que ya usa
-- procesar_financiamiento_terceros — solo numeros con formato exacto
-- 'PT-<digitos>', casteados a bigint y descartando los legacy (>= 9000000).
-- Max valido hoy: 26586 → el proximo sale PT-0026587.
--
-- El resto de la funcion queda IGUAL que sql/prestamo_desembolso.sql
-- (columna desembolso, cuota ajustada, generacion de cuotas).
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.crear_prestamo(
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
  v_seq      bigint;
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

  -- Secuencia a prueba de numeros legacy: solo 'PT-<digitos>' exacto, en
  -- bigint, ignorando los del sistema viejo (>= 9000000).
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

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_crear_prestamo_numeracion.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Verificacion: proximo numero por empresa (debe ser el consecutivo real)
SELECT ce.nombre AS empresa,
       'PT-' || lpad((COALESCE(MAX(t.n), 0) + 1)::text, 7, '0') AS proximo_numero
FROM public.config_empresa ce
LEFT JOIN LATERAL (
  SELECT substring(p.numero from 4)::bigint AS n
  FROM public.prestamos p
  WHERE p.tenant_id = ce.tenant_id AND p.numero ~ '^PT-\d+$'
) t ON t.n < 9000000
GROUP BY ce.nombre
HAVING COALESCE(MAX(t.n), 0) > 0
ORDER BY ce.nombre;
