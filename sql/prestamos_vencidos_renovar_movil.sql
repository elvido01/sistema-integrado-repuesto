-- =====================================================================
-- Préstamo vencido — se recomienda renovar: también en la app (14/11/2026)
-- ---------------------------------------------------------------------
-- Sigue a sql/prestamos_vencidos_renovar.sql. El Recibo de Pago de la app
-- cobra para la financiera desde OTRA empresa (get_prestamos_cliente_
-- financiera_externa / _get_financiera_externa_tenant), así que necesita su
-- propia puerta con la misma regla de empresa que ya usa ese recibo.
--   · _prestamos_vencidos(empresa, cliente): la lógica, una sola vez.
--   · get_prestamos_vencidos(cliente): empresa activa (web y extensión).
--   · get_prestamos_vencidos_financiera_externa(cliente): la de la app; el
--     cliente tiene que ser de la empresa activa o de la financiera externa.
-- Un préstamo vencido = de cuotas (no solo interés), activo, última cuota
-- ya pasada y con capital o interés de cuota pendiente. Solo un aviso:
-- no cobra nada. Solo lee. Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._prestamos_vencidos(p_tenant uuid, p_cliente_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
  WITH t AS (SELECT p_tenant AS id, (now() AT TIME ZONE 'America/Santo_Domingo')::date AS hoy),
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
           -- capital + interés de cuotas sin pagar (sin mora ni cargos)
           'pendiente', p.pendiente)
         ORDER BY p.ultima_cuota), '[]'::jsonb)
    FROM p, t
   WHERE t.id IS NOT NULL
     AND p.ultima_cuota < t.hoy
     AND p.pendiente > 0.01
$f$;
REVOKE ALL ON FUNCTION public._prestamos_vencidos(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_prestamos_vencidos(p_cliente_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
  SELECT public._prestamos_vencidos(public.get_user_tenant(), p_cliente_id)
$f$;
REVOKE ALL ON FUNCTION public.get_prestamos_vencidos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_prestamos_vencidos(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_prestamos_vencidos_financiera_externa(p_cliente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
DECLARE
  v_propia uuid := public.get_user_tenant();
  v_fin uuid;
  v_cli uuid;
BEGIN
  IF p_cliente_id IS NULL OR v_propia IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT tenant_id INTO v_cli FROM public.clientes WHERE id = p_cliente_id;
  IF v_cli IS NULL THEN RETURN '[]'::jsonb; END IF;
  IF v_cli <> v_propia THEN
    BEGIN
      v_fin := public._get_financiera_externa_tenant();
    EXCEPTION WHEN OTHERS THEN
      RETURN '[]'::jsonb;
    END;
    IF v_cli IS DISTINCT FROM v_fin THEN RETURN '[]'::jsonb; END IF;
  END IF;
  RETURN public._prestamos_vencidos(v_cli, p_cliente_id);
END $f$;
REVOKE ALL ON FUNCTION public.get_prestamos_vencidos_financiera_externa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_prestamos_vencidos_financiera_externa(uuid) TO authenticated;

SELECT registrar_migracion('prestamos_vencidos_renovar_movil.sql');
