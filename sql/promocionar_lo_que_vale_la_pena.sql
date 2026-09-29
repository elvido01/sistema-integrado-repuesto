-- "Paso 1 · Qué promocionar hoy": misma regla de cinco cajones y ronda, pero
-- cada cajón se ordena por lo que de verdad importa. Decisión del dueño
-- 29/09/2026, después de ver con sus datos que salían piezas de RD$25:
--
--  * Alta existencia: por DINERO parado (existencia × costo), no por
--    unidades; y solo si hay más de dos meses de venta en el estante (si no,
--    no es "más de lo que se vende"). Antes ganaba la pesita de RD$25.
--  * Buen margen: por GANANCIA en pesos por unidad, no por porcentaje. Antes
--    ganaba la placa de RD$125 al 53% (RD$66) sobre el pistón al 35% (RD$495).
--  * Una por familia: la familia es la primera palabra de la descripción
--    (CAJA, ACEITE, FAROL...). El tipo_id no sirve: el Motul 7100 está como
--    "CORREA". Salen primero una de cada familia; las repetidas, después.
--    Antes seis de las diez primeras eran cajas de bola.
--  * Mínimo 2 en existencia: con una sola, si se vende antes de publicar,
--    se anuncia lo que ya no hay.
--  * El texto de baja rotación dice 60 días, que es lo que mide la regla.
--  * La pausa del encargo directo de Hermes baja de 30 a 14 días, la misma
--    del panel: el panel y Hermes dicen lo mismo.
--
-- get_marketing_candidates NO se toca: la usa Marketing IA
-- (motoflow-ai-marketing). El cálculo se hace aquí, en una función interna
-- por empresa, para poder probarlo sin sesión.

CREATE OR REPLACE FUNCTION public._equipo_candidatos_de(p_tenant uuid, p_limite integer)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT p.id, p.codigo, p.descripcion, p.precio, p.costo, p.imagen_url, p.created_at,
           COALESCE(public.get_stock_actual(p.id), 0) AS existencia,
           CASE WHEN p.precio > 0 AND p.costo > 0
                THEN ROUND(((p.precio - p.costo) / p.precio * 100)::numeric, 1) END AS margen_pct,
           CASE WHEN p.costo > 0 THEN p.precio - p.costo END AS ganancia_unidad,
           COALESCE((SELECT SUM(fd.cantidad) FROM public.facturas_detalle fd
                     JOIN public.facturas f ON f.id = fd.factura_id
                     WHERE fd.producto_id = p.id AND f.tenant_id = p_tenant
                       AND f.fecha >= CURRENT_DATE - INTERVAL '30 days'
                       AND f.estado <> 'Anulada'), 0) AS vendidos_30d,
           COALESCE((SELECT SUM(fd.cantidad) FROM public.facturas_detalle fd
                     JOIN public.facturas f ON f.id = fd.factura_id
                     WHERE fd.producto_id = p.id AND f.tenant_id = p_tenant
                       AND f.fecha >= CURRENT_DATE - INTERVAL '60 days'
                       AND f.estado <> 'Anulada'), 0) AS vendidos_60d
    FROM public.productos p
    WHERE p.tenant_id = p_tenant
      AND COALESCE(p.activo, true)
      AND p.precio > 0
      AND COALESCE(p.imagen_url, '') <> ''
  ),
  enr AS (
    SELECT b.*,
           ROUND((b.existencia * COALESCE(b.costo, 0))::numeric, 2) AS capital_inmovilizado,
           upper(split_part(btrim(b.descripcion), ' ', 1)) AS familia
    FROM base b
    WHERE b.existencia >= 2
  ),
  elegibles AS (
    SELECT e.* FROM enr e
    WHERE NOT EXISTS (
            SELECT 1 FROM public.marketing_promocion_manual m
            WHERE m.tenant_id = p_tenant AND m.producto_id = e.id
              AND (m.permanente OR m.fecha > now() - interval '14 days'))
      AND NOT EXISTS (
            SELECT 1 FROM public.equipo_trabajos w
            WHERE w.tenant_id = p_tenant AND w.tipo = 'promocion'
              AND w.creado_en > now() - interval '14 days'
              AND w.estado <> 'cancelled'
              AND w.peticion LIKE '%' || e.codigo || '%')
  ),
  cajones AS (
    SELECT 'baja_rotacion' AS cajon, 1 AS prio, e.*,
           row_number() OVER (ORDER BY e.capital_inmovilizado DESC) AS pos
    FROM elegibles e WHERE e.existencia > 5 AND e.vendidos_60d < 3
    UNION ALL
    SELECT 'alta_existencia', 2, e.*,
           row_number() OVER (ORDER BY e.capital_inmovilizado DESC)
    FROM elegibles e WHERE e.existencia > 10 AND e.existencia > 2 * e.vendidos_30d
    UNION ALL
    SELECT 'buen_margen', 3, e.*,
           row_number() OVER (ORDER BY e.ganancia_unidad DESC)
    FROM elegibles e WHERE e.margen_pct >= 30
    UNION ALL
    SELECT 'recien_llegados', 4, e.*,
           row_number() OVER (ORDER BY e.created_at DESC)
    FROM elegibles e WHERE e.created_at >= CURRENT_DATE - INTERVAL '21 days'
    UNION ALL
    SELECT 'mas_vendidos', 5, e.*,
           row_number() OVER (ORDER BY e.vendidos_30d DESC)
    FROM elegibles e WHERE e.vendidos_30d > 0
  ),
  -- Una pieza en varios cajones se queda en el de más prioridad.
  unico AS (
    SELECT DISTINCT ON (c.id) c.* FROM cajones c ORDER BY c.id, c.prio
  ),
  con_ronda AS (
    SELECT u.*, row_number() OVER (PARTITION BY u.cajon ORDER BY u.pos) AS ronda
    FROM unico u
  ),
  con_familia AS (
    SELECT r.*, row_number() OVER (PARTITION BY r.familia ORDER BY r.ronda, r.prio) AS vez_familia
    FROM con_ronda r
  ),
  ordenado AS (
    SELECT c.vez_familia, c.ronda, c.prio,
           jsonb_build_object(
             'id', c.id, 'codigo', c.codigo, 'descripcion', c.descripcion,
             'precio', c.precio, 'costo', c.costo, 'imagen_url', c.imagen_url,
             'created_at', c.created_at, 'existencia', c.existencia,
             'margen_pct', c.margen_pct, 'vendidos_30d', c.vendidos_30d,
             'vendidos_60d', c.vendidos_60d, 'tiene_imagen', true, 'modo', 'normal',
             'capital_inmovilizado', c.capital_inmovilizado, 'cajon', c.cajon,
             'razon', CASE c.cajon
               WHEN 'baja_rotacion' THEN format('Casi no se mueve: %s vendidos en 60 días y tienes RD$%s dormidos ahí.',
                 c.vendidos_60d, to_char(c.capital_inmovilizado, 'FM999G999G990D00'))
               WHEN 'alta_existencia' THEN format('Tienes %s en el estante (RD$%s parados), más de lo que se vende.',
                 c.existencia, to_char(c.capital_inmovilizado, 'FM999G999G990D00'))
               WHEN 'buen_margen' THEN format('Te deja RD$%s por unidad (%s%% de margen).',
                 to_char(c.ganancia_unidad, 'FM999G999G990'), round(c.margen_pct))
               WHEN 'recien_llegados' THEN 'Acaba de entrar. Nadie sabe todavía que lo tienes.'
               ELSE format('Se vende bien (%s en 30 días): la gente ya lo busca.', c.vendidos_30d)
             END) AS fila
    FROM con_familia c
    ORDER BY c.vez_familia, c.ronda, c.prio
    LIMIT p_limite
  )
  SELECT COALESCE(jsonb_agg(o.fila ORDER BY o.vez_familia, o.ronda, o.prio), '[]'::jsonb)
  FROM ordenado o;
$function$;

REVOKE ALL ON FUNCTION public._equipo_candidatos_de(uuid, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.equipo_candidatos_promocion(p_limite integer DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Este módulo es del dueño.';
  END IF;
  RETURN public._equipo_candidatos_de(public.get_user_tenant(), p_limite);
END $function$;

REVOKE ALL ON FUNCTION public.equipo_candidatos_promocion(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_candidatos_promocion(int) TO authenticated;

-- Hermes: la pausa de "no promocionar" baja de 30 a 14 días. Se cambia solo
-- esa línea sobre la definición viva, y se exige que exista una vez.
DO $$
DECLARE
  v_def text := pg_get_functiondef('hermes.proponer_encargo_promocion(text,text,text)'::regprocedure);
  v_viejo text := $q$m.fecha > now() - interval '30 days'$q$;
BEGIN
  IF (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 THEN
    RAISE EXCEPTION 'hermes.proponer_encargo_promocion ya no tiene la pausa de 30 días; revisar a mano';
  END IF;
  EXECUTE replace(v_def, v_viejo, $q$m.fecha > now() - interval '14 days'$q$);
END $$;

SELECT public.registrar_migracion('promocionar_lo_que_vale_la_pena.sql');

-- ===== VERIFICACION =====
SELECT (x ->> 'cajon') AS cajon, x ->> 'codigo' AS codigo, left(x ->> 'descripcion', 30) AS descripcion,
       x ->> 'precio' AS precio, x ->> 'existencia' AS existencia, x ->> 'razon' AS razon,
       (SELECT position($q$interval '14 days'$q$ in pg_get_functiondef('hermes.proponer_encargo_promocion(text,text,text)'::regprocedure)) > 0) AS hermes_14
FROM jsonb_array_elements(public._equipo_candidatos_de('00000000-0000-0000-0000-000000000001', 15)) AS x;
