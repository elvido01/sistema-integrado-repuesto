-- =====================================================================
-- Lo que cobró el dealer, para el Flujo neto de la financiera
-- ---------------------------------------------------------------------
-- (2026-07-30) "En MotoPréstamos, en el desglose del Flujo neto, en Ingresos
-- cobrados / Ventas de contado, quiero poner ahí el dato de Caminero Motors:
-- ventas de contado + recibos de ingreso, como está en Ingresos del mes de
-- Gestión Empresarial, que son 473,500."
--
-- MotoPréstamos no vende, así que esa línea siempre decía RD$0 mientras
-- Caminero cobraba de verdad. Son la misma empresa; el efectivo del dealer
-- tiene que verse desde la financiera.
--
--   Contado    RD$ 180,000   1 factura   (la moto de hoy, FT-18)
--   Iniciales  RD$ 293,500   6 recibos   (el abono del día de la venta)
--             ────────────
--   Total      RD$ 473,500
--
-- >>> EL PERÍODO ES EL MES COMPLETO <<<
-- A propósito. El desglose del Flujo neto de MotoPréstamos abre en una
-- ventana más corta (arranca en el ancla de caja, no el día 1), pero el
-- número que se pidió es el de «Ingresos del mes» de Gestión Empresarial,
-- que va del 1 al último día. Se calcula igual aquí para que las dos
-- pantallas digan lo mismo, y la fila lo dice en su nota.
--
-- >>> QUIÉN ES EL DEALER <<<
-- Sale del enlace `financiera_tenant_id` de config_empresa, igual que en
-- todo el resto del sistema. Nunca por nombre. Si la empresa activa no es
-- financiera de nadie, devuelve null y la fila ni aparece.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_ingresos_dealer_mes()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant  uuid := public.get_user_tenant();
  v_dealer  uuid;
  v_nombre  text;
  v_ini     date;
  v_fin     date;
  v_contado   numeric := 0;  v_contado_n int := 0;
  v_recibos   numeric := 0;  v_recibos_n int := 0;
BEGIN
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  -- El dealer que financia SUS ventas con esta empresa.
  SELECT ce.tenant_id, ce.nombre INTO v_dealer, v_nombre
  FROM public.config_empresa ce
  WHERE ce.financiera_tenant_id = v_tenant
    AND COALESCE(ce.financiamiento_tipo, 'propio') = 'terceros'
    AND ce.tenant_id <> v_tenant
  LIMIT 1;

  IF v_dealer IS NULL THEN RETURN NULL; END IF;

  v_ini := date_trunc('month', (now() AT TIME ZONE 'America/Santo_Domingo')::date)::date;
  v_fin := (v_ini + interval '1 month')::date;   -- exclusivo

  -- Contado: la factura ya trae el dinero, no deja recibo aparte.
  SELECT COUNT(*), COALESCE(SUM(fa.total), 0) INTO v_contado_n, v_contado
  FROM public.facturas fa
  WHERE fa.tenant_id = v_dealer
    AND fa.fecha >= v_ini AND fa.fecha < v_fin
    AND fa.forma_pago ILIKE '%contado%'
    AND COALESCE(fa.estado, '') <> 'ANULADA';

  -- Recibos: la inicial de las financiadas y los abonos posteriores.
  SELECT COUNT(*), COALESCE(SUM(ri.monto_pagado), 0) INTO v_recibos_n, v_recibos
  FROM public.recibos_ingreso ri
  WHERE ri.tenant_id = v_dealer
    AND ri.fecha >= v_ini AND ri.fecha < v_fin
    AND COALESCE(ri.anulado, false) = false;

  RETURN json_build_object(
    'dealer_nombre', COALESCE(v_nombre, 'Dealer'),
    'desde',         v_ini,
    'hasta',         (v_fin - 1),
    'contado',       ROUND(v_contado, 2),
    'contado_cant',  v_contado_n,
    'recibos',       ROUND(v_recibos, 2),
    'recibos_cant',  v_recibos_n,
    'total',         ROUND(v_contado + v_recibos, 2)
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_ingresos_dealer_mes() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_ingresos_dealer_mes() TO authenticated, service_role;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('flujo_neto_ingresos_del_dealer.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- No se llama a la función desde aquí: usa get_user_tenant() y el editor SQL
-- no tiene sesión. Se replica su cuenta en SQL plano.
WITH mes AS (SELECT date_trunc('month', CURRENT_DATE)::date AS ini,
                    (date_trunc('month', CURRENT_DATE) + interval '1 month')::date AS fin),
cam AS (SELECT 'b39506c3-27dc-467d-830b-096731b83113'::uuid AS id)
SELECT 'Contado' AS concepto, COUNT(*) AS cant, COALESCE(SUM(fa.total), 0) AS monto
FROM public.facturas fa CROSS JOIN cam CROSS JOIN mes
WHERE fa.tenant_id = cam.id AND fa.fecha >= mes.ini AND fa.fecha < mes.fin
  AND fa.forma_pago ILIKE '%contado%' AND COALESCE(fa.estado, '') <> 'ANULADA'
UNION ALL
SELECT 'Recibos', COUNT(*), COALESCE(SUM(ri.monto_pagado), 0)
FROM public.recibos_ingreso ri CROSS JOIN cam CROSS JOIN mes
WHERE ri.tenant_id = cam.id AND ri.fecha >= mes.ini AND ri.fecha < mes.fin
  AND NOT COALESCE(ri.anulado, false);
-- esperado: Contado 1 · 180,000.00 · Recibos 6 · 293,500.00
--           Total 473,500.00 — el mismo de «Ingresos del mes» del panel.

-- 2) QUE EL ENLACE ESTÉ PUESTO (si no, la fila no aparece)
SELECT ce.nombre AS dealer, ce.financiamiento_tipo, fi.nombre AS financiera
FROM public.config_empresa ce
LEFT JOIN public.config_empresa fi ON fi.tenant_id = ce.financiera_tenant_id
WHERE ce.financiera_tenant_id IS NOT NULL;
-- esperado: CAMINERO MOTORS · terceros · MotoPréstamos Los Naranjos
