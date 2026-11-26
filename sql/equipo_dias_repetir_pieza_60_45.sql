-- =====================================================================
-- Publicación diaria: más días antes de repetir una pieza (26/11/2026)
-- ---------------------------------------------------------------------
-- El dueño: "14 y 30 días son muy pocos. Súbelo a 60 y a 45".
--   · Pieza NUEVA (arte nuevo): 30 → 60 días desde que se mandó a publicar
--     (o se marcó promocionada a mano).
--   · REUTILIZADA (mismo arte, texto nuevo): 14 → 45 días desde que se
--     mandó a publicar, se propuso para reutilizar o se marcó a mano.
-- No cambia: los 14 días de "ya se le pidió arte al Creativo", ni los de lo
-- que anuncia el suplidor / las fotos recientes (son otra cosa).
-- Base: las versiones de producción del 26/11/2026 (mismas firmas).
-- =====================================================================

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
                       AND f.estado <> 'Anulada'), 0) AS vendidos_60d,
           -- Cuándo se subió la foto: la fecha del archivo en product-images.
           (SELECT o.created_at FROM storage.objects o
             WHERE o.bucket_id = 'product-images'
               AND o.name = regexp_replace(split_part(p.imagen_url, '?', 1), '^.*/product-images/', '')
             LIMIT 1) AS foto_at
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
    -- (05/10/2026, noche) El dueño: "no soy mayorista, con que tenga 1 en
    -- existencia es candidato a publicar". Antes pedía 5 (3 con foto nueva).
    WHERE b.existencia >= 1
  ),
  elegibles AS (
    SELECT e.* FROM enr e
    WHERE NOT EXISTS (
            SELECT 1 FROM public.marketing_promocion_manual m
            WHERE m.tenant_id = p_tenant AND m.producto_id = e.id
              AND (m.permanente OR m.fecha > now() - interval '60 days'))
      -- (06/10/2026) El dueño: "cuando el producto sea mandado a publicar
      -- tiene que desaparecer de la lista por lo menos por 30 días".
      -- (26/11/2026) Subido a 60 días: "14 y 30 días son muy pocos".
      -- Mandado = programado, publicándose o publicado (no borrador ni fallido).
      AND NOT EXISTS (
            SELECT 1 FROM public.hermes_publication_jobs j
            WHERE j.tenant_id = p_tenant AND j.producto_id = e.id
              AND j.status NOT IN ('draft', 'failed', 'cancelled', 'rejected')
              AND COALESCE(j.scheduled_for, j.created_at) > now() - interval '60 days')
      AND NOT EXISTS (
            SELECT 1 FROM public.equipo_trabajos w
            WHERE w.tenant_id = p_tenant AND w.tipo = 'promocion'
              AND w.creado_en > now() - interval '14 days'
              AND w.estado <> 'cancelled'
              AND w.peticion LIKE '%' || e.codigo || '%')
  ),
  cajones AS (
    -- (04/10/2026, tarde) Lo que el suplidor está anunciando en Instagram en
    -- los últimos 14 días va ANTES que todo: la gente la está buscando ahora.
    SELECT 'anuncio_suplidor' AS cajon, 0 AS prio, e.*,
           row_number() OVER (ORDER BY e.vendidos_30d DESC) AS pos
    FROM elegibles e
    WHERE EXISTS (SELECT 1 FROM public.equipo_videos_suplidor v
                   WHERE v.tenant_id = p_tenant AND v.producto_id = e.id
                     AND v.created_at > now() - interval '14 days')
    UNION ALL
    -- (05/10/2026) "Subí par de fotos y no se agregan": la que acabas de
    -- fotografiar sale justo detrás de lo que anuncia el suplidor.
    SELECT 'foto_nueva', 1, e.*,
           row_number() OVER (ORDER BY e.foto_at DESC)
    FROM elegibles e WHERE e.foto_at > now() - interval '7 days'
    UNION ALL
    -- (04/10/2026) Lo que se vende va PRIMERO: es el gancho que trae gente.
    SELECT 'mas_vendidos', 2, e.*,
           row_number() OVER (ORDER BY e.vendidos_30d DESC, e.vendidos_60d DESC) AS pos
    FROM elegibles e WHERE e.vendidos_30d > 0
    UNION ALL
    SELECT 'buen_margen', 3, e.*,
           row_number() OVER (ORDER BY e.ganancia_unidad DESC)
    FROM elegibles e WHERE e.margen_pct >= 30
    UNION ALL
    SELECT 'recien_llegados', 4, e.*,
           row_number() OVER (ORDER BY e.created_at DESC)
    FROM elegibles e WHERE e.created_at >= CURRENT_DATE - INTERVAL '21 days'
    UNION ALL
    SELECT 'alta_existencia', 5, e.*,
           row_number() OVER (ORDER BY e.capital_inmovilizado DESC)
    FROM elegibles e WHERE e.existencia > 10 AND e.existencia > 2 * e.vendidos_30d
    UNION ALL
    SELECT 'baja_rotacion', 6, e.*,
           row_number() OVER (ORDER BY e.capital_inmovilizado DESC)
    FROM elegibles e WHERE e.existencia > 5 AND e.vendidos_60d < 3
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
           CASE c.cajon WHEN 'anuncio_suplidor' THEN 0 WHEN 'foto_nueva' THEN 1 ELSE 2 END AS delante,
           jsonb_build_object(
             'id', c.id, 'codigo', c.codigo, 'descripcion', c.descripcion,
             'precio', c.precio, 'costo', c.costo, 'imagen_url', c.imagen_url,
             'created_at', c.created_at, 'existencia', c.existencia,
             'margen_pct', c.margen_pct, 'vendidos_30d', c.vendidos_30d,
             'vendidos_60d', c.vendidos_60d, 'tiene_imagen', true, 'modo', 'normal',
             'capital_inmovilizado', c.capital_inmovilizado, 'cajon', c.cajon,
             'razon', CASE c.cajon
               WHEN 'foto_nueva' THEN format('Le acabas de poner foto. Tienes %s en el estante: que la gente sepa que la tienes.',
                 c.existencia)
               WHEN 'anuncio_suplidor' THEN 'Tu suplidor la está anunciando en Instagram: la gente la está buscando esta semana.'
               WHEN 'mas_vendidos' THEN format('Gancho: se vende bien (%s en 30 días). La gente ya lo busca y, al venir, se lleva más cosas.',
                 c.vendidos_30d)
               WHEN 'baja_rotacion' THEN format('Casi no se mueve: %s vendidos en 60 días y tienes RD$%s dormidos ahí.',
                 c.vendidos_60d, to_char(c.capital_inmovilizado, 'FM999G999G990D00'))
               WHEN 'alta_existencia' THEN format('Tienes %s en el estante (RD$%s parados), más de lo que se vende.',
                 c.existencia, to_char(c.capital_inmovilizado, 'FM999G999G990D00'))
               WHEN 'buen_margen' THEN format('Te deja RD$%s por unidad (%s%% de margen).',
                 to_char(c.ganancia_unidad, 'FM999G999G990'), round(c.margen_pct))
               ELSE 'Acaba de entrar. Nadie sabe todavía que lo tienes.'
             END) AS fila
    FROM con_familia c
    ORDER BY delante, c.vez_familia, c.ronda, c.prio
    LIMIT p_limite
  )
  SELECT COALESCE(jsonb_agg(o.fila ORDER BY o.delante, o.vez_familia, o.ronda, o.prio), '[]'::jsonb)
  FROM ordenado o;
$function$;

CREATE OR REPLACE FUNCTION public._equipo_reusable(p_tenant uuid, p_desde numeric, p_hasta numeric, p_excluir uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ult AS (
    -- La última publicación con imagen de feed de cada pieza.
    SELECT DISTINCT ON (j.producto_id)
           j.producto_id, j.publication_bundle_id, j.precio_mostrado,
           COALESCE(j.completed_at, j.scheduled_for, j.created_at) AS publicado_el
      FROM public.hermes_publication_jobs j
     WHERE j.tenant_id = p_tenant
       AND j.producto_id IS NOT NULL
       AND j.publication_bundle_id IS NOT NULL
       AND j.status IN ('published', 'partially_published')
       AND j.media_type = 'image'
       AND j.placement IN ('feed', 'both')
       AND COALESCE(j.image_url, j.media_url, '') <> ''
     ORDER BY j.producto_id, COALESCE(j.completed_at, j.scheduled_for, j.created_at) DESC
  ),
  pz AS (
    SELECT u.*, p.descripcion, p.codigo, p.precio
      FROM ult u
      JOIN public.productos p ON p.id = u.producto_id AND p.tenant_id = p_tenant
     WHERE COALESCE(p.activo, true)
       AND p.precio > 0
       AND p.precio >= p_desde
       AND (p_hasta IS NULL OR p.precio <= p_hasta)
       AND NOT (p.id = ANY(COALESCE(p_excluir, '{}')))
       -- Nada mandado a publicar en 45 días (programado, publicándose o publicado).
       -- (26/11/2026) Era 14; el dueño: "14 y 30 días son muy pocos".
       AND NOT EXISTS (
             SELECT 1 FROM public.hermes_publication_jobs j2
              WHERE j2.tenant_id = p_tenant AND j2.producto_id = p.id
                AND j2.status NOT IN ('draft', 'failed', 'cancelled', 'rejected')
                AND COALESCE(j2.scheduled_for, j2.created_at) > now() - interval '45 days')
       -- Ni propuesta para reutilizar en 45 días (aunque no se haya publicado).
       AND NOT EXISTS (
             SELECT 1 FROM public.equipo_auto_elegidas e
              WHERE e.tenant_id = p_tenant AND e.producto_id = p.id
                AND e.reuso_bundle_id IS NOT NULL
                AND e.fecha > (now() AT TIME ZONE 'America/Santo_Domingo')::date - 45)
       -- Lo que el dueño sacó a mano de las promociones automáticas.
       AND NOT EXISTS (
             SELECT 1 FROM public.marketing_promocion_manual m
              WHERE m.tenant_id = p_tenant AND m.producto_id = p.id
                AND (m.permanente OR m.fecha > now() - interval '45 days'))
  ),
  medido AS (
    SELECT z.*,
           COALESCE(public.get_stock_actual(z.producto_id), 0) AS existencia,
           COALESCE((SELECT SUM(fd.cantidad) FROM public.facturas_detalle fd
                     JOIN public.facturas f ON f.id = fd.factura_id
                     WHERE fd.producto_id = z.producto_id AND f.tenant_id = p_tenant
                       AND f.fecha >= CURRENT_DATE - INTERVAL '60 days'
                       AND f.estado <> 'Anulada'), 0) AS vendidos_60d
      FROM pz z
  )
  SELECT jsonb_build_object(
           'id', m.producto_id, 'codigo', m.codigo, 'descripcion', m.descripcion,
           'precio', m.precio, 'bundle_id', m.publication_bundle_id,
           'precio_arte', m.precio_mostrado, 'publicado_el', m.publicado_el,
           'existencia', m.existencia, 'vendidos_60d', m.vendidos_60d,
           'razon', format('♻ Reutilizada: ya salió el %s y se vende (%s en 60 días). Mismo arte, texto nuevo.',
                           to_char(m.publicado_el AT TIME ZONE 'America/Santo_Domingo', 'DD/MM'),
                           to_char(round(m.vendidos_60d), 'FM999G990'))
             || CASE WHEN m.precio_mostrado IS NOT NULL AND round(m.precio_mostrado) <> round(m.precio)
                     THEN format(' Ojo: el arte dice RD$%s y hoy cuesta RD$%s.',
                                 to_char(m.precio_mostrado, 'FM999G999G990'), to_char(m.precio, 'FM999G999G990'))
                     ELSE '' END)
    FROM medido m
   WHERE m.existencia >= 1
   ORDER BY m.vendidos_60d DESC, m.publicado_el ASC
   LIMIT 1;
$function$;

NOTIFY pgrst, 'reload schema';

DO $prueba$
DECLARE s text;
BEGIN
  SELECT prosrc INTO s FROM pg_proc WHERE proname = '_equipo_candidatos_de';
  IF s NOT LIKE '%interval ''60 days'')%' OR s LIKE '%m.fecha > now() - interval ''30 days''%' THEN RAISE EXCEPTION 'candidatos sin 60 días'; END IF;
  SELECT prosrc INTO s FROM pg_proc WHERE proname = '_equipo_reusable';
  IF s LIKE '%14 days%' OR s LIKE '%::date - 14)%' THEN RAISE EXCEPTION 'reutilizable con 14 días'; END IF;
  -- Que sigan corriendo (Morla)
  PERFORM public._equipo_reusable('00000000-0000-0000-0000-000000000001', 100, 500, '{}');
END $prueba$;

SELECT public.registrar_migracion('equipo_dias_repetir_pieza_60_45.sql');
