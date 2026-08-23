-- =====================================================================
-- Cada aviso tiene que entenderse sin el de al lado
-- ---------------------------------------------------------------------
-- (2026-08-23) Al mandar el primer aviso de verdad al canal salio esto:
--
--   🟡 Un suplidor dejo de venir (2)
--      • Viene cada 10 dias y ya van 45 desde el 09/07/2026...
--      • Viene cada 21 dias y ya van 110 desde el 05/05/2026...
--
-- Quien? El nombre del suplidor estaba en el TITULO del hallazgo, y el
-- resumen agrupa por centinela y solo saca los detalles. Dos lineas que
-- no dicen de quien hablan no son un aviso, son un acertijo.
--
-- Lo mismo con el cierre descuadrado: decia el turno y el cajero pero no
-- el dia.
--
-- >>> LA REGLA <<<
-- El `detalle` de un hallazgo tiene que sostenerse solo, porque es lo
-- unico que viaja al canal. Nunca dar por hecho el titulo.
--
-- Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.centinela_suplidor_no_ha_venido(p_tenant_id uuid)
RETURNS TABLE(huella text, titulo text, detalle text, monto numeric, datos jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  WITH ritmo AS (
    SELECT c.suplidor_id,
           count(*) AS compras,
           max(c.fecha)::date AS ultima,
           GREATEST(
             round((max(c.fecha)::date - min(c.fecha)::date)::numeric
                   / GREATEST(count(*) - 1, 1))::int, 3) AS intervalo
    FROM public.compras c
    WHERE c.tenant_id = p_tenant_id
      AND c.fecha >= now() - interval '365 days'
      AND c.suplidor_id IS NOT NULL
    GROUP BY 1
    HAVING count(*) >= 3
  ),
  esperando AS (
    SELECT oc.suplidor_id, count(d.id) AS lineas
    FROM public.ordenes_compra oc
    JOIN public.ordenes_compra_detalle d ON d.orden_compra_id = oc.id
    WHERE oc.tenant_id = p_tenant_id
      AND COALESCE(oc.estado, 'Pendiente') = 'Pendiente'
    GROUP BY 1
  )
  SELECT
    r.suplidor_id::text,
    format('%s lleva %s dias sin venir', pr.nombre, (CURRENT_DATE - r.ultima)),
    -- El nombre va DELANTE: es lo unico que identifica la linea.
    format('%s viene cada %s dias y ya van %s desde el %s. Tiene %s producto(s) esperandolo en la lista%s.',
           pr.nombre, r.intervalo, (CURRENT_DATE - r.ultima),
           to_char(r.ultima, 'DD/MM/YYYY'), e.lineas,
           CASE WHEN ag.n > 0
                THEN format(', y %s pieza(s) suyas ya estan agotadas', ag.n)
                ELSE '' END),
    NULL::numeric,
    jsonb_build_object(
      'suplidor_id', r.suplidor_id, 'suplidor', pr.nombre,
      'intervalo_dias', r.intervalo, 'dias_sin_venir', (CURRENT_DATE - r.ultima),
      'ultima_compra', r.ultima, 'lineas_esperando', e.lineas,
      'agotados_suyos', ag.n)
  FROM ritmo r
  JOIN esperando e ON e.suplidor_id = r.suplidor_id
  JOIN public.proveedores pr ON pr.id = r.suplidor_id
  CROSS JOIN LATERAL (
    SELECT count(*) AS n FROM public.productos p
    WHERE p.tenant_id = p_tenant_id AND p.suplidor_id = r.suplidor_id
      AND COALESCE(p.activo, true) AND public.get_stock_actual(p.id) <= 0
  ) ag
  WHERE (CURRENT_DATE - r.ultima) > GREATEST(r.intervalo * 3, 21)
  ORDER BY ag.n DESC, (CURRENT_DATE - r.ultima) DESC;
$fn$;

CREATE OR REPLACE FUNCTION public.centinela_cierre_no_cuadra(p_tenant_id uuid)
RETURNS TABLE(huella text, titulo text, detalle text, monto numeric, datos jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT
    cc.id::text,
    format('El cierre del %s no cuadra por RD$%s',
           to_char(cc.fecha, 'DD/MM'),
           to_char(round(abs(cc.diferencia), 0), 'FM999,999,999')),
    -- La fecha va delante por lo mismo: sin ella no se sabe que cierre es.
    format('Cierre del %s, turno %s (%s): se conto RD$%s en efectivo y el desglose da RD$%s. %s RD$%s.',
           to_char(cc.fecha, 'DD/MM/YYYY'), COALESCE(cc.turno, 1),
           COALESCE(cc.cajero_nombre, 'sin cajero'),
           to_char(round(COALESCE(cc.efectivo_en_caja, 0), 2), 'FM999,999,999.00'),
           to_char(round(COALESCE(cc.total_desglose, 0), 2), 'FM999,999,999.00'),
           CASE WHEN cc.diferencia > 0 THEN 'Sobra' ELSE 'Falta' END,
           to_char(round(abs(cc.diferencia), 2), 'FM999,999,999.00')),
    round(abs(cc.diferencia), 2),
    jsonb_build_object('cierre_id', cc.id, 'fecha', cc.fecha, 'turno', cc.turno,
                       'diferencia', cc.diferencia, 'cajero', cc.cajero_nombre)
  FROM public.cierres_caja cc
  WHERE cc.tenant_id = p_tenant_id
    AND cc.fecha >= CURRENT_DATE - 10
    AND abs(COALESCE(cc.diferencia, 0)) >= 200
  ORDER BY abs(cc.diferencia) DESC;
$fn$;

SELECT public.registrar_migracion('centinelas_que_se_lean_solos.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT public.correr_centinelas('00000000-0000-0000-0000-000000000001'::uuid) AS corrida;

SELECT left(detalle, 120) AS asi_se_leera_en_el_canal
FROM public.centinela_hallazgos
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND murio_en IS NULL
  AND centinela IN ('suplidor_no_ha_venido', 'cierre_no_cuadra')
ORDER BY centinela;
