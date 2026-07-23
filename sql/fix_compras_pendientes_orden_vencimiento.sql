-- =====================================================================
-- FIX: las compras pendientes del suplidor salen desordenadas
-- ---------------------------------------------------------------------
-- Reportado 2026-07-22: en Pago a Suplidores los pagarés de una factura
-- (ej. 28071: 2/6, 3/6, 4/6...) salían en desorden porque el RPC
-- get_compras_pendientes_suplidor no tenía ORDER BY.
--
-- Arreglo: ordenar por FECHA DE VENCIMIENTO ascendente (el que primero se
-- vence va arriba); desempate por emisión y por referencia (así los pagarés
-- de una misma fecha quedan 1,2,3... por su número). Solo cambia el orden;
-- las columnas y filtros quedan idénticos a sql/compras_dolares.sql.
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_compras_pendientes_suplidor(p_suplidor_id uuid)
RETURNS TABLE(
  id uuid, fecha_emision date, fecha_vencimiento date, referencia text,
  monto_total numeric, monto_pendiente numeric,
  moneda text, tasa_compra numeric, total_usd numeric, pendiente_usd numeric
)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $function$
SELECT
    c.id,
    c.fecha AS fecha_emision,
    (c.fecha + (COALESCE(c.dias_credito, 0) || ' days')::interval)::date AS fecha_vencimiento,
    c.referencia,
    c.total_compra AS monto_total,
    COALESCE(c.monto_pendiente, c.total_compra - COALESCE(c.monto_pagado, 0)) AS monto_pendiente,
    COALESCE(c.moneda, 'DOP') AS moneda,
    c.tasa_cambio AS tasa_compra,
    c.total_usd,
    COALESCE(c.pendiente_usd, c.total_usd) AS pendiente_usd
FROM public.compras c
WHERE c.suplidor_id = p_suplidor_id
  AND c.forma_pago ILIKE 'CREDITO'
  AND c.estado = 'PENDIENTE'
  AND (COALESCE(c.monto_pendiente, c.total_compra - COALESCE(c.monto_pagado, 0)) > 0
       OR COALESCE(c.pendiente_usd, 0) > 0)
ORDER BY
  (c.fecha + (COALESCE(c.dias_credito, 0) || ' days')::interval)::date ASC,  -- primero el que antes vence
  c.fecha ASC,
  c.referencia ASC NULLS LAST,
  c.numero ASC NULLS LAST;
$function$;

GRANT EXECUTE ON FUNCTION public.get_compras_pendientes_suplidor(uuid) TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_compras_pendientes_orden_vencimiento.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Verificacion: los pagarés de Motores del Sur (Caminero) deben salir por
-- vencimiento ascendente (2/6 el 04/08, luego 3/6 el 04/09, ...).
SELECT r.fecha_vencimiento, r.referencia, r.pendiente_usd
FROM public.proveedores p
CROSS JOIN LATERAL public.get_compras_pendientes_suplidor(p.id) r
WHERE p.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND p.nombre ILIKE '%motores del sur%';
