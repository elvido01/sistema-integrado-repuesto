-- ════════════════════════════════════════════════════════════════════
-- Gestión de Cobro: los préstamos que deben interés vuelven a la lista
-- (03/11/2026)
-- ════════════════════════════════════════════════════════════════════
-- MotoPréstamos: FLOR ALEJANDRA LAPPOT MOTA (PT-0025708, interés pagado
-- hasta 03/08) y DANILO MORLA (PT-0026097, hasta 28/07) no salían en
-- Gestión de Cobro.
-- Son préstamos "a interés": el capital va en una sola cuota que vence en
-- 2027/2028, y cada pago graba el interés como una cuota ya PAGADA.
-- La página buscaba la fecha del último interés solo entre las cuotas sin
-- pagar. Ahí no hay ninguna con interés, así que no veía nada atrasado.
-- El Recibo de Pago (get_prestamos_cliente) sí mira todas las cuotas.
-- Préstamos escondidos ese día:
--   MotoPréstamos 53, Inversiones Los Naranjos 36, Odalys 15,
--   Inversiones El Naranjo 11.
--
-- Esta función devuelve, por préstamo, lo mismo que calcula el Recibo de
-- Pago:
--   - el ancla (ult_int_venc): las mismas reglas, también es_solo_interes
--     e interes_cobrado_hasta;
--   - el interés acumulado hasta hoy (public.interes_corriente: base
--     30/365 y los días reales de Odalys);
--   - la fecha en que ese interés se vuelve exigible: el ancla más un
--     período según la frecuencia del préstamo.
-- Solo lee. Corre con los permisos del usuario (RLS de prestamos y
-- prestamo_cuotas), así que cada empresa ve solo lo suyo.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.interes_atrasado_prestamos(p_ids uuid[])
 RETURNS TABLE (
   prestamo_id    uuid,
   ult_int_venc   date,
   cap_base       numeric,
   interes_corr   numeric,
   interes_vence  date
 )
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  WITH hoy AS (SELECT (now() AT TIME ZONE 'America/Santo_Domingo')::date AS d),
  ic AS (
    SELECT
      p.id,
      p.tenant_id,
      p.frecuencia,
      MAX(p.tasa_interes) AS tasa,
      MAX(COALESCE(p.base_interes_dias, 365)) AS base_dias,
      SUM(GREATEST(q.capital - q.capital_pagado, 0)) AS cap_base,
      -- Misma ancla que get_prestamos_cliente (ver sus comentarios).
      CASE WHEN p.es_solo_interes
           THEN GREATEST(MAX(q.fecha_vencimiento) FILTER (WHERE q.interes > 0),
                         COALESCE(p.interes_cobrado_hasta, p.fecha_inicio),
                         p.fecha_inicio)
           ELSE MAX(q.fecha_vencimiento) FILTER (WHERE q.interes > 0)
      END AS ult_int_venc
    FROM public.prestamos p
    JOIN public.prestamo_cuotas q ON q.prestamo_id = p.id AND q.tenant_id = p.tenant_id
    WHERE p.id = ANY (p_ids)
      AND p.tenant_id = public.get_user_tenant()
      AND p.estado = 'activo'
    GROUP BY p.id, p.tenant_id, p.frecuencia, p.es_solo_interes, p.interes_cobrado_hasta, p.fecha_inicio
  )
  SELECT
    ic.id,
    ic.ult_int_venc,
    ic.cap_base,
    CASE WHEN ic.ult_int_venc IS NOT NULL AND ic.cap_base > 0 AND ic.ult_int_venc < hoy.d
         THEN public.interes_corriente(ic.cap_base, ic.tasa, ic.ult_int_venc, hoy.d, ic.base_dias, ic.tenant_id)
         ELSE 0
    END,
    CASE WHEN ic.ult_int_venc IS NULL THEN NULL
         ELSE (ic.ult_int_venc + CASE ic.frecuencia
                 WHEN 'diario'    THEN interval '1 day'
                 WHEN 'semanal'   THEN interval '7 days'
                 WHEN 'quincenal' THEN interval '15 days'
                 ELSE interval '1 month'
               END)::date
    END
  FROM ic CROSS JOIN hoy
$function$;

REVOKE ALL ON FUNCTION public.interes_atrasado_prestamos(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.interes_atrasado_prestamos(uuid[]) TO authenticated;

SELECT public.registrar_migracion('gestion_cobro_interes_atrasado.sql');
