-- =====================================================================
-- La nómina pagada por empleado se estaba cobrando DOS VECES a la caja
-- ---------------------------------------------------------------------
-- (2026-08-01) "En el cuadre de MotoPréstamos de hoy la nómina se pagó una
-- parte ayer y otra parte hoy, pero el sistema la está aplicando completa
-- nuevamente hoy."
--
-- >>> CONFIRMADO, Y ES PEOR QUE UNA FECHA MAL PUESTA <<<
-- Nómina quincenal 16/07–31/07, RD$65,000. Se pagó empleado por empleado:
--
--   31/07  GUYVENSON 9,000 · KETIA 8,000 · JACKY LOUIS 9,000
--          YERLIN 15,000 · JULIO 9,000                        = 50,000
--   01/08  ADARBERTO 5,000 · ODALIS MORLA 10,000              = 15,000
--
-- Cada pago dejó su propio gasto diario, que descontó de la caja EL DÍA QUE
-- SALIÓ. Correcto. Pero al pagarse el último empleado, el compromiso quedó
-- marcado como pagado con su monto COMPLETO (65,000) y la caja lo vuelve a
-- restar entero hoy.
--
-- O sea que la nómina se cobra dos veces: 65,000 por los gastos + 65,000
-- por el compromiso = 130,000 por una nómina de 65,000. Y encima 50,000 de
-- esos caen en el día equivocado, porque salieron ayer.
--
-- No es solo el cierre: la misma cuenta está en la caja del dashboard y en
-- el flujo neto, que suman gastos y compromisos por separado. Por eso el
-- arreglo va en una función, no repetido en cada sitio: la próxima vez que
-- alguien toque una de esas cuentas, la regla sigue estando en un solo lugar.
--
-- >>> LA REGLA <<<
-- Un compromiso aporta a la caja SOLO lo que no salió ya por otra puerta:
--
--   efectivo real = monto - lo que ya se pagó como gasto por empleado
--
--   quincenal 65,000 - 65,000 (los 7 con gasto)  = 0    ← ya salió todo
--   semanal    8,000 -      0 (ninguno)          = 8,000 ← sí sale hoy
--
-- Los dos casos siguen funcionando: el que se paga de un tirón desde el
-- compromiso descuenta ahí, y el que se paga por empleado descuenta el día
-- de cada pago. Lo que ya no pasa es que descuente por los dos lados.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) LA REGLA, EN UN SOLO SITIO
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compromiso_efectivo_pendiente(
  p_compromiso_id uuid,
  p_monto         numeric
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT GREATEST(
    COALESCE(p_monto, 0) - COALESCE((
      SELECT SUM(d.neto)
      FROM public.nominas n
      JOIN public.nomina_detalle d ON d.nomina_id = n.id
      LEFT JOIN public.gastos_diarios g ON g.id = d.gasto_id
      WHERE n.compromiso_id = p_compromiso_id
        AND COALESCE(n.estado, '') <> 'anulada'
        AND d.gasto_id IS NOT NULL
        AND COALESCE(g.anulado, false) = false
    ), 0),
  0);
$$;

COMMENT ON FUNCTION public.compromiso_efectivo_pendiente(uuid, numeric) IS
  'Lo que un compromiso saca de la caja de verdad: su monto menos lo que ya salió como gasto diario al pagar empleado por empleado. Evita contar la nómina dos veces.';

GRANT EXECUTE ON FUNCTION public.compromiso_efectivo_pendiente(uuid, numeric) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 2) LA CAJA DEL DASHBOARD (excedente y caja del día)
-- ------------------------------------------------------------
DO $$
DECLARE v_src text; v_n int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_caja_excedente_dashboard'
  LIMIT 1;

  IF v_src IS NULL THEN RAISE EXCEPTION 'No existe get_caja_excedente_dashboard'; END IF;

  IF position('compromiso_efectivo_pendiente' in v_src) > 0 THEN
    RAISE NOTICE 'La caja ya descuenta la nomina una sola vez.';
  ELSE
    -- Patrón corto a propósito: aparece en el excedente y en la caja del
    -- día, y sobrevive a cualquier otro cambio alrededor.
    v_src := replace(v_src,
      'SUM(monto) FROM public.compromisos',
      'SUM(public.compromiso_efectivo_pendiente(id, monto)) FROM public.compromisos');

    IF position('compromiso_efectivo_pendiente' in v_src) = 0 THEN
      RAISE EXCEPTION 'No se pudo ajustar la caja — revisar a mano.';
    END IF;

    EXECUTE v_src;
    RAISE NOTICE 'Caja del dashboard: la nomina ya no se cuenta dos veces.';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3) EL FLUJO NETO DEL DASHBOARD
-- ------------------------------------------------------------
DO $$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_flujo_neto_dashboard'
  LIMIT 1;

  IF v_src IS NULL THEN
    RAISE NOTICE 'get_flujo_neto_dashboard no existe: se salta.';
  ELSIF position('compromiso_efectivo_pendiente' in v_src) > 0 THEN
    RAISE NOTICE 'El flujo neto ya estaba ajustado.';
  ELSE
    v_src := replace(v_src,
      'c.monto::numeric, ''compromiso_fijo''',
      'public.compromiso_efectivo_pendiente(c.id, c.monto)::numeric, ''compromiso_fijo''');
    IF position('compromiso_efectivo_pendiente' in v_src) = 0 THEN
      RAISE NOTICE 'El flujo neto no coincidio con el patron: queda igual (revisar a mano).';
    ELSE
      EXECUTE v_src;
      RAISE NOTICE 'Flujo neto ajustado.';
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 4) EL DESGLOSE DEL GRUPO (dealer visto desde la financiera)
-- ------------------------------------------------------------
DO $$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_ingresos_dealer_mes'
  LIMIT 1;

  IF v_src IS NULL THEN
    RAISE NOTICE 'get_ingresos_dealer_mes no existe: se salta.';
  ELSIF position('compromiso_efectivo_pendiente' in v_src) > 0 THEN
    RAISE NOTICE 'El desglose del grupo ya estaba ajustado.';
  ELSE
    v_src := replace(v_src,
      'SELECT COALESCE(SUM(c.monto), 0) INTO v_compromisos',
      'SELECT COALESCE(SUM(public.compromiso_efectivo_pendiente(c.id, c.monto)), 0) INTO v_compromisos');
    IF position('compromiso_efectivo_pendiente' in v_src) = 0 THEN
      RAISE NOTICE 'El desglose del grupo no coincidio con el patron: queda igual.';
    ELSE
      EXECUTE v_src;
      RAISE NOTICE 'Desglose del grupo ajustado.';
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('compromiso_nomina_no_se_cuenta_dos_veces.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) LOS DOS COMPROMISOS DE HOY, ANTES Y DESPUÉS
SELECT c.nombre, c.monto AS monto_compromiso,
       public.compromiso_efectivo_pendiente(c.id, c.monto) AS sale_de_la_caja,
       c.monto - public.compromiso_efectivo_pendiente(c.id, c.monto) AS ya_salio_por_gastos
FROM public.compromisos c
WHERE c.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND c.activo = false AND c.fecha_pago IS NOT NULL
ORDER BY c.fecha_pago DESC LIMIT 5;
-- esperado:
--   Nómina quincenal 16/07–31/07 · 65,000 · sale 0      · ya salió 65,000
--   Nómina semanal sábado 01/08  ·  8,000 · sale 8,000  · ya salió 0

-- 2) EL DÍA DE CADA PAGO, QUE ES LO QUE CUADRA EL CIERRE
SELECT g.fecha, SUM(g.monto) AS nomina_que_salio_ese_dia
FROM public.nomina_detalle d
JOIN public.gastos_diarios g ON g.id = d.gasto_id
JOIN public.nominas n ON n.id = d.nomina_id
WHERE n.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND COALESCE(g.anulado, false) = false
GROUP BY g.fecha ORDER BY g.fecha DESC LIMIT 5;
-- esperado: 31/07 → 50,000 · 01/08 → 15,000
-- Cada peso en su día, y ninguno repetido en el compromiso.
