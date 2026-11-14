-- =====================================================================
-- Financiera: préstamos vencidos — se recomienda renovar (14/11/2026)
-- ---------------------------------------------------------------------
-- Un préstamo de cuotas cuya ÚLTIMA cuota ya venció y todavía debe. El SiiF
-- no le cobraba interés después del plazo y MotoFlow tampoco (las cuotas
-- migradas tienen interés 0): la compañía lo resuelve a mano con un "saldo
-- para renovar", según el cliente. Decisión del dueño 14/11: no cobrar
-- interés automático; solo AVISAR.
--   · Recibo de Pago (web): aviso al buscar el cliente.
--   · Extensión de WhatsApp (Gestión de Cobro): pestaña e indicador.
-- No se cuentan los préstamos de solo interés (no tienen plazo que vencer)
-- ni los castigados / saldados (estado <> 'activo').
--
-- get_prestamos_vencidos(cliente): empresa activa del usuario; sin cliente
-- devuelve todos los de la empresa. Solo lee.
-- Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_prestamos_vencidos(p_cliente_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
  WITH t AS (SELECT public.get_user_tenant() AS id,
                    (now() AT TIME ZONE 'America/Santo_Domingo')::date AS hoy),
  p AS (
    SELECT pr.id, pr.numero, pr.cliente_id, cl.nombre AS cliente_nombre,
           MAX(q.fecha_vencimiento) AS ultima_cuota,
           round(SUM(GREATEST(COALESCE(q.capital, 0) - COALESCE(q.capital_pagado, 0), 0)
                   + GREATEST(COALESCE(q.interes, 0) - COALESCE(q.interes_pagado, 0), 0)), 2) AS pendiente
      FROM t
      JOIN public.prestamos pr ON pr.tenant_id = t.id
      JOIN public.clientes cl ON cl.id = pr.cliente_id
      JOIN public.prestamo_cuotas q ON q.prestamo_id = pr.id
     WHERE pr.estado = 'activo'
       AND NOT COALESCE(pr.es_solo_interes, false)
       AND (p_cliente_id IS NULL OR pr.cliente_id = p_cliente_id)
     GROUP BY pr.id, pr.numero, pr.cliente_id, cl.nombre
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'prestamo_id', p.id,
           'numero', regexp_replace(p.numero::text, '^(PT-[0-9]+)-2[0-9]+$', '\1', 'i'),
           'cliente_id', p.cliente_id,
           'cliente_nombre', p.cliente_nombre,
           'ultima_cuota', p.ultima_cuota,
           'dias_vencido', t.hoy - p.ultima_cuota,
           'pendiente', p.pendiente)
         ORDER BY p.ultima_cuota), '[]'::jsonb)
    FROM p, t
   WHERE t.id IS NOT NULL
     AND p.ultima_cuota < t.hoy
     AND p.pendiente > 0.01
$f$;
REVOKE ALL ON FUNCTION public.get_prestamos_vencidos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_prestamos_vencidos(uuid) TO authenticated;

SELECT registrar_migracion('prestamos_vencidos_renovar.sql');
