-- =====================================================================
-- El movimiento pertenece al DUEÑO DE LA CUENTA, no a quien lo registra
-- ---------------------------------------------------------------------
-- (2026-07-29) "Sigue la diferencia en pesos RD."
--
-- Y era real. El módulo de Cuentas Bancarias mostraba RD$247,022.57 y
-- Gestión Empresarial RD$281,822.57. Diferencia: RD$34,800.00 — exactamente
-- dos movimientos:
--
--   23/07  +10,400.00  Cierre de caja turno 1  →  cuenta BANCO POPULAR
--   24/07  +24,400.00  Cierre de caja turno 1  →  cuenta CAJA CHICA Pesos
--
-- Las dos cuentas son de MotoPréstamos, pero los movimientos quedaron
-- grabados con el tenant_id de CAMINERO: son cierres de caja de Caminero
-- depositados en cuentas de la financiera.
--
-- >>> POR QUÉ CADA MÓDULO DECÍA UNA COSA <<<
-- El módulo de bancos lee la vista como el usuario, y RLS le esconde los
-- movimientos de otra empresa: por eso le faltaban los 34,800. Gestión
-- Empresarial es SECURITY DEFINER, ve todo, y por eso los sumaba.
--
-- Ninguno de los dos estaba "mal programado": el dato estaba mal. Y el
-- efecto grave no es la diferencia en pantalla — es que RD$34,800 que están
-- en la cuenta de MotoPréstamos son INVISIBLES para MotoPréstamos.
--
-- >>> LA CAUSA <<<
-- registrar_movimiento_bancario no pone tenant_id en el INSERT, así que lo
-- toma el DEFAULT de la columna: la empresa de quien está usando el sistema.
-- Cuando Caminero deposita su cierre en una cuenta de MotoPréstamos, el
-- movimiento sale a nombre de Caminero.
--
-- Es la misma lección que ya se aplicó en
-- registrar_movimiento_bancario_compartido (transferencias entre cuentas):
-- un movimiento pertenece a la empresa DUEÑA DE LA CUENTA. Ahora la función
-- normal hace lo mismo, así que no vuelve a pasar por ningún camino.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) La causa: el movimiento se graba bajo el dueño de la cuenta
-- ------------------------------------------------------------
-- Reescritura directa: es más claro y menos frágil que parchear texto.
CREATE OR REPLACE FUNCTION public.registrar_movimiento_bancario(
  p_cuenta_id   uuid,
  p_tipo        text,
  p_monto       numeric,
  p_concepto    text,
  p_referencia  text    DEFAULT NULL,
  p_origen_tipo text    DEFAULT NULL,
  p_origen_id   uuid    DEFAULT NULL,
  p_fecha       date    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id     uuid;
  v_fecha  date := COALESCE(p_fecha, (now() AT TIME ZONE 'America/Santo_Domingo')::date);
  -- EL DUEÑO DE LA CUENTA. Aquí estaba el problema: sin tenant_id explícito,
  -- el INSERT tomaba el DEFAULT de la columna — la empresa de quien usa el
  -- sistema. Cuando Caminero depositaba su cierre de caja en una cuenta de
  -- MotoPréstamos, el movimiento salía a nombre de Caminero y RLS se lo
  -- escondía a MotoPréstamos: RD$34,800 dentro de su cuenta, invisibles.
  v_dueno  uuid;
BEGIN
  IF p_cuenta_id IS NULL THEN RETURN NULL; END IF;   -- sin cuenta: no registra (flujo opcional)
  IF p_tipo NOT IN ('ENTRADA','SALIDA') THEN
    RAISE EXCEPTION 'tipo debe ser ENTRADA o SALIDA (%)', p_tipo;
  END IF;

  SELECT c.tenant_id INTO v_dueno
  FROM public.cuentas_bancarias c WHERE c.id = p_cuenta_id;
  IF v_dueno IS NULL THEN
    RAISE EXCEPTION 'La cuenta % no existe', p_cuenta_id;
  END IF;

  IF p_origen_id IS NOT NULL THEN
    -- upsert por documento: no duplica y refleja ediciones
    INSERT INTO public.movimientos_bancarios
      (cuenta_id, fecha, tipo, monto, concepto, referencia, origen_tipo, origen_id, usuario_id, tenant_id)
    VALUES
      (p_cuenta_id, v_fecha, p_tipo, ABS(p_monto), p_concepto, p_referencia,
       COALESCE(p_origen_tipo, 'ajuste'), p_origen_id, auth.uid(), v_dueno)
    ON CONFLICT (tenant_id, origen_tipo, origen_id) WHERE origen_id IS NOT NULL
    DO UPDATE SET
      cuenta_id  = EXCLUDED.cuenta_id,
      fecha      = EXCLUDED.fecha,
      tipo       = EXCLUDED.tipo,
      monto      = EXCLUDED.monto,
      concepto   = EXCLUDED.concepto,
      referencia = EXCLUDED.referencia
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.movimientos_bancarios
      (cuenta_id, fecha, tipo, monto, concepto, referencia, origen_tipo, origen_id, usuario_id, tenant_id)
    VALUES
      (p_cuenta_id, v_fecha, p_tipo, ABS(p_monto), p_concepto, p_referencia,
       COALESCE(p_origen_tipo, 'ajuste'), NULL, auth.uid(), v_dueno)
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.registrar_movimiento_bancario(uuid,text,numeric,text,text,text,uuid,date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_movimiento_bancario(uuid,text,numeric,text,text,text,uuid,date) TO authenticated;

-- ------------------------------------------------------------
-- 2) Los dos movimientos que ya estaban mal
-- ------------------------------------------------------------
-- Se reasignan al dueño de su cuenta. No se mueve dinero ni se cambia el
-- monto: solo se corrige de quién es el movimiento, para que la empresa que
-- tiene la plata pueda verla.
WITH mal AS (
  SELECT m.id, c.tenant_id AS dueno
  FROM public.movimientos_bancarios m
  JOIN public.cuentas_bancarias c ON c.id = m.cuenta_id
  WHERE m.tenant_id <> c.tenant_id
)
UPDATE public.movimientos_bancarios m
   SET tenant_id = mal.dueno
  FROM mal WHERE m.id = mal.id;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_movimiento_tenant_dueno_cuenta.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) NINGÚN movimiento debe quedar en una cuenta de otra empresa
SELECT count(*) AS movimientos_de_otra_empresa
FROM public.movimientos_bancarios m
JOIN public.cuentas_bancarias c ON c.id = m.cuenta_id
WHERE m.tenant_id <> c.tenant_id;
-- esperado: 0  (eran 2, por RD$34,800)

-- 2) LOS DOS MÓDULOS DEBEN DECIR LO MISMO
SELECT COALESCE(c.alias, c.banco) AS cuenta, c.moneda, s.saldo
FROM public.cuentas_bancarias_saldos s
JOIN public.cuentas_bancarias c ON c.id = s.id
WHERE c.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4' AND c.activo
UNION ALL
SELECT '— TOTAL DOP —', 'DOP', SUM(s.saldo)
FROM public.cuentas_bancarias_saldos s
JOIN public.cuentas_bancarias c ON c.id = s.id
WHERE c.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4' AND c.activo
  AND upper(COALESCE(c.moneda,'DOP')) <> 'USD';
-- esperado: BANCO POPULAR 133,500 · ODALYS 23,922.57 · Pesos 124,400
--           TOTAL DOP 281,822.57 — el mismo número que Gestión Empresarial

-- 3) Los dos movimientos, ya a nombre de quien tiene la plata
SELECT m.fecha, COALESCE(c.alias, c.banco) AS cuenta, m.monto, m.concepto,
       (m.tenant_id = c.tenant_id) AS coincide_con_la_cuenta
FROM public.movimientos_bancarios m
JOIN public.cuentas_bancarias c ON c.id = m.cuenta_id
WHERE m.origen_tipo = 'cierre_caja' AND m.fecha IN (DATE '2026-07-23', DATE '2026-07-24')
ORDER BY m.fecha;
-- esperado: coincide_con_la_cuenta = true en los dos
