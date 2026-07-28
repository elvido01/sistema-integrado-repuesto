-- =====================================================================
-- Transferencia entre cuentas bancarias (con cambio de moneda)
-- ---------------------------------------------------------------------
-- (2026-07-28) Hasta ahora solo se podía registrar un ingreso o un retiro
-- suelto en cada cuenta. Para mover plata de una cuenta a otra había que
-- hacer dos apuntes a mano y confiar en que cuadraran.
--
-- Esta función lo hace de una sola vez y ATÓMICO: o entran los dos
-- movimientos o no entra ninguno. Nunca queda la salida sin su entrada.
--
-- >>> LA TASA <<<
-- Si las dos cuentas son de la misma moneda, la tasa se ignora y entra lo
-- mismo que sale. Si son de monedas distintas, la tasa es OBLIGATORIA y se
-- expresa como en todo el sistema: RD$ por US$ (ej. 61.25).
--
--   de RD$ a US$   ->  entran   monto / tasa      (61,250 a 61.25 = US$1,000)
--   de US$ a RD$   ->  entran   monto * tasa      (US$1,000 a 61.25 = 61,250)
--
-- Sale el monto que se escribe (en la moneda de la cuenta de origen) y entra
-- el convertido. El concepto de cada movimiento dice la otra cuenta y la tasa
-- usada, para que al leer el historial se entienda sin buscar en otro lado.
--
-- Las dos filas comparten el mismo origen_id, así que se pueden encontrar
-- juntas: son las dos patas de la misma transferencia.
--
-- No permite transferir a la misma cuenta ni montos <= 0, y valida que ambas
-- cuentas sean de la empresa (o compartidas con ella).
-- =====================================================================

-- 'transferencia_interna' ya está permitido en el CHECK de origen_tipo.

CREATE OR REPLACE FUNCTION public.transferir_entre_cuentas(
  p_origen_id  uuid,
  p_destino_id uuid,
  p_monto      numeric,
  p_tasa       numeric DEFAULT NULL,
  p_concepto   text    DEFAULT NULL,
  p_fecha      date    DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  o          record;
  d          record;
  v_fecha    date := COALESCE(p_fecha, (now() AT TIME ZONE 'America/Santo_Domingo')::date);
  v_monto    numeric := round(COALESCE(p_monto, 0), 2);
  v_destino  numeric;
  v_tasa     numeric := COALESCE(p_tasa, 0);
  v_par      uuid := gen_random_uuid();   -- une las dos patas
  v_txt      text;
  v_concepto text := NULLIF(btrim(COALESCE(p_concepto, '')), '');
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF p_origen_id = p_destino_id THEN
    RAISE EXCEPTION 'La cuenta de origen y la de destino son la misma';
  END IF;
  IF v_monto <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor que cero'; END IF;

  SELECT * INTO o FROM public.cuentas_bancarias WHERE id = p_origen_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta de origen no encontrada'; END IF;
  SELECT * INTO d FROM public.cuentas_bancarias WHERE id = p_destino_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta de destino no encontrada'; END IF;

  -- Ambas deben ser de la empresa. (Las cuentas compartidas entre dealer y
  -- financiera se manejan con su propia RPC; aquí se exige mismo tenant.)
  IF o.tenant_id <> v_tenant OR d.tenant_id <> v_tenant THEN
    RAISE EXCEPTION 'Alguna de las cuentas no pertenece a esta empresa';
  END IF;

  -- ---------- la conversión ----------
  IF o.moneda = d.moneda THEN
    v_destino := v_monto;
    v_txt := '';
  ELSE
    IF v_tasa <= 0 THEN
      RAISE EXCEPTION 'Falta la tasa de cambio: vas de % a %, hay que indicar cuántos RD$ vale un US$',
        o.moneda, d.moneda;
    END IF;
    IF o.moneda = 'USD' AND d.moneda = 'DOP' THEN
      v_destino := round(v_monto * v_tasa, 2);
    ELSIF o.moneda = 'DOP' AND d.moneda = 'USD' THEN
      v_destino := round(v_monto / v_tasa, 2);
    ELSE
      RAISE EXCEPTION 'Solo se puede convertir entre DOP y USD (vienen % y %)', o.moneda, d.moneda;
    END IF;
    v_txt := ' (tasa ' || trim(to_char(v_tasa, 'FM999990.0099')) || ')';
  END IF;

  IF v_destino <= 0 THEN
    RAISE EXCEPTION 'La conversión da cero: revisa el monto y la tasa';
  END IF;

  -- ---------- las dos patas ----------
  INSERT INTO public.movimientos_bancarios
    (tenant_id, cuenta_id, tipo, monto, concepto, origen_tipo, origen_id, fecha, usuario_id)
  VALUES (
    v_tenant, p_origen_id, 'SALIDA', v_monto,
    COALESCE(v_concepto || ' — ', '') || 'Transferencia a ' || d.banco
      || COALESCE(' ' || NULLIF(d.alias, ''), '') || v_txt,
    'transferencia_interna', v_par, v_fecha, auth.uid());

  INSERT INTO public.movimientos_bancarios
    (tenant_id, cuenta_id, tipo, monto, concepto, origen_tipo, origen_id, fecha, usuario_id)
  VALUES (
    v_tenant, p_destino_id, 'ENTRADA', v_destino,
    COALESCE(v_concepto || ' — ', '') || 'Transferencia desde ' || o.banco
      || COALESCE(' ' || NULLIF(o.alias, ''), '') || v_txt,
    'transferencia_interna', v_par, v_fecha, auth.uid());

  RETURN json_build_object(
    'ok', true,
    'par_id', v_par,
    'sale',  json_build_object('cuenta', o.banco, 'moneda', o.moneda, 'monto', v_monto),
    'entra', json_build_object('cuenta', d.banco, 'moneda', d.moneda, 'monto', v_destino),
    'tasa', CASE WHEN o.moneda = d.moneda THEN NULL ELSE v_tasa END);
END;
$$;

GRANT EXECUTE ON FUNCTION public.transferir_entre_cuentas(uuid, uuid, numeric, numeric, text, date) TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('transferencia_entre_cuentas.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) La función quedó creada
SELECT to_regprocedure('public.transferir_entre_cuentas(uuid,uuid,numeric,numeric,text,date)')::text AS firma;
-- esperado: no NULL

-- 2) 'transferencia_interna' está permitido como origen
SELECT pg_get_constraintdef(oid) AS regla
FROM pg_constraint
WHERE conrelid = 'public.movimientos_bancarios'::regclass
  AND conname LIKE '%origen_tipo%';
-- esperado: la lista debe incluir 'transferencia_interna'

-- 3) Transferencias hechas (las dos patas juntas por origen_id)
SELECT m.origen_id, m.fecha,
       string_agg(c.banco || ' ' || m.tipo || ' ' || m.moneda_txt, '  ->  ' ORDER BY m.tipo DESC) AS movimiento
FROM (SELECT mb.*, mb.monto::text AS moneda_txt FROM public.movimientos_bancarios mb
      WHERE mb.origen_tipo = 'transferencia_interna') m
JOIN public.cuentas_bancarias c ON c.id = m.cuenta_id
GROUP BY m.origen_id, m.fecha
ORDER BY m.fecha DESC;
-- cada transferencia debe salir con SUS DOS patas
