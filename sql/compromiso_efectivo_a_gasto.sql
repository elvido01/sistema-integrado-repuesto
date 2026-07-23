-- =====================================================================
-- Compromisos pagados en EFECTIVO -> se registran como GASTO DIARIO
-- ---------------------------------------------------------------------
-- Pedido 2026-07-23: al pagar un compromiso en efectivo no quedaba
-- ningun registro que ayudara a cuadrar la caja al final del dia (ni en
-- gastos). Ahora el pago en efectivo se engancha a gastos_diarios (el
-- front lo inserta en HomePage.handleConfirmPayCommitment).
--
-- Para NO duplicar el egreso, la fuente unica pasa a ser el GASTO:
--   * get_caja_excedente_dashboard deja de restar los compromisos
--     pagados en EFECTIVO (esos ya entran como gasto). Sigue restando
--     los de transferencia/cheque y los historicos con forma_pago NULL.
--   * el cierre de caja ya cuenta gastos_diarios (no toca compromisos).
--
-- Incluye:
--   1) columna gastos_diarios.compromiso_id (enlace + idempotencia).
--   2) BACKFILL: crea el gasto de los compromisos ya pagados en efectivo
--      que aun no lo tengan (incluye el pago de hoy).
--   3) get_caja_excedente_dashboard ajustada.
-- Idempotente / re-ejecutable. Correr en PRODUCCION.
-- =====================================================================

-- 1) Enlace gasto <-> compromiso (para idempotencia y trazabilidad)
ALTER TABLE public.gastos_diarios
  ADD COLUMN IF NOT EXISTS compromiso_id uuid;

-- 2) Backfill: compromisos pagados en EFECTIVO que aun no tienen su gasto.
--    La fecha del gasto = fecha de pago del compromiso (zona RD).
INSERT INTO public.gastos_diarios (tenant_id, fecha, tipo_gasto, monto, descripcion, anulado, compromiso_id)
SELECT c.tenant_id,
       (c.fecha_pago AT TIME ZONE 'America/Santo_Domingo')::date,
       'Compromiso',
       c.monto,
       c.nombre,
       false,
       c.id
FROM public.compromisos c
WHERE c.activo = false
  AND c.fecha_pago IS NOT NULL
  AND c.forma_pago ILIKE '%efectivo%'
  AND NOT EXISTS (
    SELECT 1 FROM public.gastos_diarios g WHERE g.compromiso_id = c.id
  );

-- 3) Dashboard de caja: el excedente ya no resta los compromisos en
--    efectivo (ahora son gasto). La caja de HOY tampoco los resta aparte
--    (entran por gastos_diarios). Los de transferencia/cheque y los
--    historicos con forma_pago NULL siguen restando en el excedente.
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

  -- ---------- EXCEDENTE ----------
  v_excedente := v_seed
    + COALESCE((SELECT SUM(total) FROM public.facturas
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND forma_pago ILIKE 'contado' AND COALESCE(estado, '') <> 'ANULADA'), 0)
    + COALESCE((SELECT SUM(monto_pagado) FROM public.recibos_ingreso
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND COALESCE(anulado, false) = false), 0)
    -- Compromisos: los pagados en EFECTIVO ya entran como gasto_diario; aqui
    -- solo se restan los de transferencia/cheque y los historicos (NULL).
    - COALESCE((SELECT SUM(monto) FROM public.compromisos
        WHERE tenant_id = v_tenant AND fecha_pago >= v_anchor_ts
          AND activo = false
          AND COALESCE(forma_pago, '') NOT ILIKE '%efectivo%'), 0)
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
          AND COALESCE(anulado, false) = false), 0);

  -- ---------- CAJA DE HOY (efectivo fisico del dia) ----------
  -- Los compromisos pagados hoy en efectivo entran por gastos_diarios; no se
  -- restan aparte aqui (evita el doble conteo).
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
      ), 0);

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
    PERFORM public.registrar_migracion('compromiso_efectivo_a_gasto.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Verificacion: compromisos en efectivo ya enganchados como gasto
SELECT c.nombre, c.monto, c.fecha_pago::date AS pagado,
       (g.id IS NOT NULL) AS tiene_gasto
FROM public.compromisos c
LEFT JOIN public.gastos_diarios g ON g.compromiso_id = c.id
WHERE c.activo = false AND c.forma_pago ILIKE '%efectivo%'
ORDER BY c.fecha_pago DESC
LIMIT 20;
