-- =====================================================================
-- El Flujo neto de la financiera pasa a ser el del GRUPO
-- ---------------------------------------------------------------------
-- (2026-07-30) Sobre el desglose de MotoPréstamos:
--
--   "Quítame Ventas de contado porque MotoPréstamos no vende.
--    Combíname los gastos diarios de MotoPréstamos y Caminero Motors.
--    El pago a suplidores será únicamente el de Caminero Motors.
--    Y el flujo neto será únicamente el de ambas empresas combinado."
--
-- Se amplía get_ingresos_dealer_mes: además de lo que cobró el dealer,
-- devuelve lo que pagó, con los MISMOS criterios que usa
-- get_flujo_neto_dashboard para la empresa activa —copiados de
-- sql/flujo_terceros_ventas_mes.sql, no reinventados— para que las dos
-- mitades se puedan sumar sin comparar cosas distintas:
--
--   gastos diarios      gastos_diarios      no anulados
--   compromisos fijos   compromisos         activo=false y fecha_pago llena
--   pagos a suplidores  pagos_suplidores    no anulados
--   compras de contado  compras             forma_pago contado, no anulada
--   comisiones          pagos_comisiones    por transferencia, no anuladas
--
-- >>> POR QUÉ SUPLIDORES ES SOLO DEL DEALER <<<
-- Lo que MotoPréstamos le paga a "suplidores" es, en la práctica, plata que
-- le pasa a Caminero: dinero de un bolsillo al otro del mismo grupo. Contarlo
-- sería inventar un egreso que el grupo no tuvo. La compra de verdad —al
-- suplidor de afuera— la hace Caminero, y esa es la que cuenta. Es la misma
-- regla de eliminación que ya usa Gestión Empresarial.
--
-- >>> EL PERÍODO, QUE NO ES EL MISMO <<<
-- El desglose de MotoPréstamos arranca en su ancla de caja (20/07), no el
-- día 1. El dealer se cuenta del 1 al último día, que es lo que se pidió
-- ("como está en Ingresos del mes... que son 473,500"). O sea que el flujo
-- combinado suma dos ventanas distintas. La pantalla lo dice en la nota al
-- pie para que nadie lo lea como si fuera un solo período.
--
-- Idempotente / re-ejecutable. Reemplaza la versión de
-- sql/flujo_neto_ingresos_del_dealer.sql.
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
  v_contado     numeric := 0;  v_contado_n int := 0;
  v_recibos     numeric := 0;  v_recibos_n int := 0;
  v_gastos      numeric := 0;
  v_compromisos numeric := 0;
  v_suplidores  numeric := 0;
  v_compras     numeric := 0;
  v_comisiones  numeric := 0;
BEGIN
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  -- El dealer que financia SUS ventas con esta empresa. Por el enlace de
  -- config_empresa, nunca por nombre.
  SELECT ce.tenant_id, ce.nombre INTO v_dealer, v_nombre
  FROM public.config_empresa ce
  WHERE ce.financiera_tenant_id = v_tenant
    AND COALESCE(ce.financiamiento_tipo, 'propio') = 'terceros'
    AND ce.tenant_id <> v_tenant
  LIMIT 1;

  IF v_dealer IS NULL THEN RETURN NULL; END IF;

  v_ini := date_trunc('month', (now() AT TIME ZONE 'America/Santo_Domingo')::date)::date;
  v_fin := (v_ini + interval '1 month')::date;   -- exclusivo

  -- ---------- lo que cobró ----------
  -- Contado: la factura ya trae el dinero, no deja recibo aparte.
  SELECT COUNT(*), COALESCE(SUM(fa.total), 0) INTO v_contado_n, v_contado
  FROM public.facturas fa
  WHERE fa.tenant_id = v_dealer
    AND (fa.fecha AT TIME ZONE 'America/Santo_Domingo')::date >= v_ini
    AND (fa.fecha AT TIME ZONE 'America/Santo_Domingo')::date <  v_fin
    AND fa.forma_pago ILIKE '%contado%'
    AND COALESCE(fa.estado, '') <> 'ANULADA';

  -- Recibos: la inicial de las financiadas y los abonos posteriores.
  SELECT COUNT(*), COALESCE(SUM(ri.monto_pagado), 0) INTO v_recibos_n, v_recibos
  FROM public.recibos_ingreso ri
  WHERE ri.tenant_id = v_dealer
    AND ri.fecha >= v_ini AND ri.fecha < v_fin
    AND COALESCE(ri.anulado, false) = false;

  -- ---------- lo que pagó ----------
  SELECT COALESCE(SUM(g.monto), 0) INTO v_gastos
  FROM public.gastos_diarios g
  WHERE g.tenant_id = v_dealer
    AND g.fecha >= v_ini AND g.fecha < v_fin
    AND COALESCE(g.anulado, false) = false;

  SELECT COALESCE(SUM(c.monto), 0) INTO v_compromisos
  FROM public.compromisos c
  WHERE c.tenant_id = v_dealer
    AND c.activo = false
    AND c.fecha_pago IS NOT NULL
    AND c.fecha >= v_ini AND c.fecha < v_fin;

  SELECT COALESCE(SUM(ps.monto_pagado), 0) INTO v_suplidores
  FROM public.pagos_suplidores ps
  WHERE ps.tenant_id = v_dealer
    AND ps.fecha >= v_ini AND ps.fecha < v_fin
    AND COALESCE(ps.anulado, false) = false;

  SELECT COALESCE(SUM(co.total_compra), 0) INTO v_compras
  FROM public.compras co
  WHERE co.tenant_id = v_dealer
    AND co.fecha >= v_ini AND co.fecha < v_fin
    AND co.forma_pago ILIKE '%contado%'
    AND COALESCE(co.estado, '') <> 'ANULADA';

  SELECT COALESCE(SUM(pc.total_comision), 0) INTO v_comisiones
  FROM public.pagos_comisiones pc
  WHERE pc.tenant_id = v_dealer
    AND pc.fecha_pago >= v_ini AND pc.fecha_pago < v_fin
    AND UPPER(COALESCE(pc.forma_pago, 'EFECTIVO')) = 'TRANSFERENCIA'
    AND COALESCE(pc.anulado, false) = false;

  RETURN json_build_object(
    'dealer_nombre',  COALESCE(v_nombre, 'Dealer'),
    'desde',          v_ini,
    'hasta',          (v_fin - 1),
    'contado',        ROUND(v_contado, 2),
    'contado_cant',   v_contado_n,
    'recibos',        ROUND(v_recibos, 2),
    'recibos_cant',   v_recibos_n,
    'total',          ROUND(v_contado + v_recibos, 2),
    'gastos',         ROUND(v_gastos, 2),
    'compromisos',    ROUND(v_compromisos, 2),
    'suplidores',     ROUND(v_suplidores, 2),
    'compras',        ROUND(v_compras, 2),
    'comisiones',     ROUND(v_comisiones, 2),
    'egresos',        ROUND(v_gastos + v_compromisos + v_suplidores + v_compras + v_comisiones, 2),
    'neto',           ROUND(v_contado + v_recibos
                            - (v_gastos + v_compromisos + v_suplidores + v_compras + v_comisiones), 2)
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_ingresos_dealer_mes() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_ingresos_dealer_mes() TO authenticated, service_role;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('flujo_neto_del_grupo.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- La función usa get_user_tenant() y el editor no tiene sesión: se replica.
WITH mes AS (SELECT date_trunc('month', CURRENT_DATE)::date AS ini,
                    (date_trunc('month', CURRENT_DATE) + interval '1 month')::date AS fin),
cam AS (SELECT 'b39506c3-27dc-467d-830b-096731b83113'::uuid AS id)
SELECT 'Contado (ingreso)' AS concepto, COALESCE(SUM(fa.total), 0) AS monto
FROM public.facturas fa CROSS JOIN cam CROSS JOIN mes
WHERE fa.tenant_id = cam.id
  AND (fa.fecha AT TIME ZONE 'America/Santo_Domingo')::date >= mes.ini
  AND (fa.fecha AT TIME ZONE 'America/Santo_Domingo')::date <  mes.fin
  AND fa.forma_pago ILIKE '%contado%' AND COALESCE(fa.estado, '') <> 'ANULADA'
UNION ALL
SELECT 'Recibos (ingreso)', COALESCE(SUM(ri.monto_pagado), 0)
FROM public.recibos_ingreso ri CROSS JOIN cam CROSS JOIN mes
WHERE ri.tenant_id = cam.id AND ri.fecha >= mes.ini AND ri.fecha < mes.fin
  AND NOT COALESCE(ri.anulado, false)
UNION ALL
SELECT 'Gastos diarios (egreso)', COALESCE(SUM(g.monto), 0)
FROM public.gastos_diarios g CROSS JOIN cam CROSS JOIN mes
WHERE g.tenant_id = cam.id AND g.fecha >= mes.ini AND g.fecha < mes.fin
  AND NOT COALESCE(g.anulado, false)
UNION ALL
SELECT 'Pagos a suplidores (egreso)', COALESCE(SUM(ps.monto_pagado), 0)
FROM public.pagos_suplidores ps CROSS JOIN cam CROSS JOIN mes
WHERE ps.tenant_id = cam.id AND ps.fecha >= mes.ini AND ps.fecha < mes.fin
  AND NOT COALESCE(ps.anulado, false)
UNION ALL
SELECT 'Compras de contado (egreso)', COALESCE(SUM(co.total_compra), 0)
FROM public.compras co CROSS JOIN cam CROSS JOIN mes
WHERE co.tenant_id = cam.id AND co.fecha >= mes.ini AND co.fecha < mes.fin
  AND co.forma_pago ILIKE '%contado%' AND COALESCE(co.estado, '') <> 'ANULADA'
UNION ALL
SELECT 'Compromisos pagados (egreso)', COALESCE(SUM(c.monto), 0)
FROM public.compromisos c CROSS JOIN cam CROSS JOIN mes
WHERE c.tenant_id = cam.id AND c.activo = false AND c.fecha_pago IS NOT NULL
  AND c.fecha >= mes.ini AND c.fecha < mes.fin;
-- esperado: Contado 180,000 · Recibos 293,500 · Gastos diarios 8,200
--           Suplidores 0 · Compras contado 0 · Compromisos 0
--           → neto del dealer 465,300, el mismo que muestra su propio
--             dashboard en "Flujo neto del mes".
