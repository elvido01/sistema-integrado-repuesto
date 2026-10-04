-- =====================================================================
-- LO QUE ANUNCIA TU SUPLIDOR — aprovechar la demanda que crea Pedro Racing
-- ---------------------------------------------------------------------
-- (2026-10-04) Pedro Racing (mayorista) publica reels de piezas que Morla le
-- compra; el dueño los repostea. Un repost no lleva precio ni WhatsApp, pero
-- SÍ dice algo valioso: esa pieza la va a buscar la gente esta semana.
--
-- El dueño pega el enlace del reel. El Comercial-Creativo (PC) lo baja, mira
-- las tomas, lee el texto de la publicación y escucha la voz, y dice QUÉ
-- pieza es. La base busca candidatas en el catálogo; el dueño confirma
-- "es esta" o "no la tengo". Con eso:
--   · si no la tiene o le queda poca → un botón la manda a Suplidor Virtual
--     (se le pide al mismo suplidor antes de que se agote);
--   · si la tiene → sube PRIMERO en "Qué promocionar hoy" durante 14 días,
--     mientras el anuncio del suplidor está fresco.
--
-- No se republica su video: eso queda para cuando Pedro Racing dé permiso.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.equipo_videos_suplidor (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  url           text NOT NULL CHECK (url ~* '^https://'),
  estado        text NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente', 'estudiando', 'listo', 'error')),
  cuenta        text,          -- quien lo publicó (ej. pedroracingrd)
  texto_publicacion text,
  pieza         text,          -- lo que el Creativo vio: "protector de barras de horquilla"
  busqueda      text,          -- cómo se buscaría en el catálogo
  detalles      jsonb,         -- colores, motos, marca, etc.
  miniatura     text,
  candidatos    jsonb,         -- las del catálogo que podrían ser
  producto_id   uuid REFERENCES public.productos(id),
  sin_catalogo  boolean NOT NULL DEFAULT false,
  decidido_at   timestamptz,
  pedido_sv_id  uuid,          -- la fila de Suplidor Virtual si se pidió
  error         text,
  intentos      integer NOT NULL DEFAULT 0,
  tomado_at     timestamptz,
  estudiado_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid DEFAULT auth.uid(),
  UNIQUE (tenant_id, url)
);

ALTER TABLE public.equipo_videos_suplidor ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS equipo_videos_suplidor_dueno ON public.equipo_videos_suplidor;
CREATE POLICY equipo_videos_suplidor_dueno ON public.equipo_videos_suplidor
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant() AND public.equipo_ia_permitido())
  WITH CHECK (tenant_id = public.get_user_tenant() AND public.equipo_ia_permitido());


-- ── EL WORKER (hermes_readonly) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION hermes.equipo_video_sup_tomar()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v public.equipo_videos_suplidor;
BEGIN
  UPDATE public.equipo_videos_suplidor
     SET estado = 'error', error = COALESCE(error, 'No se pudo estudiar en 3 intentos.')
   WHERE estado = 'estudiando' AND tomado_at < now() - interval '20 minutes' AND intentos >= 3;

  SELECT * INTO v FROM public.equipo_videos_suplidor
   WHERE estado = 'pendiente'
      OR (estado = 'estudiando' AND tomado_at < now() - interval '20 minutes')
   ORDER BY created_at
   LIMIT 1
   FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.equipo_videos_suplidor
     SET estado = 'estudiando', tomado_at = now(), intentos = intentos + 1, error = NULL
   WHERE id = v.id;
  RETURN json_build_object('id', v.id, 'url', v.url, 'intento', v.intentos + 1);
END $function$;

-- Guarda lo que vio el Creativo y busca candidatas en el catálogo con el
-- mismo buscador de Hermes (marca, modelos y existencia incluidos).
CREATE OR REPLACE FUNCTION hermes.equipo_video_sup_guardar(
  p_id uuid, p_pieza text, p_busqueda text, p_detalles jsonb,
  p_cuenta text, p_texto text, p_miniatura text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_cand   json;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.equipo_videos_suplidor
   WHERE id = p_id AND estado = 'estudiando';
  IF v_tenant IS NULL THEN RETURN json_build_object('ok', false); END IF;

  IF p_miniatura IS NOT NULL AND (p_miniatura !~ '^data:image/jpeg;base64,' OR length(p_miniatura) > 200000) THEN
    p_miniatura := NULL;
  END IF;

  BEGIN
    v_cand := public._hermes_buscar_en(v_tenant,
      public._hermes_palabras(COALESCE(NULLIF(btrim(p_busqueda), ''), p_pieza, '')), 6);
  EXCEPTION WHEN others THEN
    v_cand := '[]'::json;   -- sin candidatas el dueño elige "no la tengo"
  END;

  UPDATE public.equipo_videos_suplidor
     SET estado = 'listo',
         pieza = left(NULLIF(btrim(COALESCE(p_pieza, '')), ''), 200),
         busqueda = left(NULLIF(btrim(COALESCE(p_busqueda, '')), ''), 120),
         detalles = p_detalles,
         cuenta = left(NULLIF(btrim(COALESCE(p_cuenta, '')), ''), 80),
         texto_publicacion = left(p_texto, 2000),
         miniatura = COALESCE(p_miniatura, miniatura),
         candidatos = COALESCE(v_cand::jsonb, '[]'::jsonb),
         estudiado_at = now(), error = NULL
   WHERE id = p_id;
  RETURN json_build_object('ok', true, 'candidatos', json_array_length(COALESCE(v_cand, '[]'::json)));
END $function$;

CREATE OR REPLACE FUNCTION hermes.equipo_video_sup_error(p_id uuid, p_motivo text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.equipo_videos_suplidor
     SET estado = CASE WHEN intentos >= 3 THEN 'error' ELSE 'pendiente' END,
         error = left(COALESCE(p_motivo, 'sin detalle'), 500)
   WHERE id = p_id AND estado = 'estudiando';
  RETURN json_build_object('ok', FOUND);
END $function$;

REVOKE ALL ON FUNCTION hermes.equipo_video_sup_tomar() FROM PUBLIC;
REVOKE ALL ON FUNCTION hermes.equipo_video_sup_guardar(uuid, text, text, jsonb, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hermes.equipo_video_sup_error(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.equipo_video_sup_tomar() TO hermes_readonly;
GRANT EXECUTE ON FUNCTION hermes.equipo_video_sup_guardar(uuid, text, text, jsonb, text, text, text) TO hermes_readonly;
GRANT EXECUTE ON FUNCTION hermes.equipo_video_sup_error(uuid, text) TO hermes_readonly;


-- ── LA PANTALLA ─────────────────────────────────────────────────────
-- Cada video con el estado de SU pieza: existencia, venta, si ya está
-- pedida (orden abierta o Suplidor Virtual) y qué conviene hacer.
CREATE OR REPLACE FUNCTION public.equipo_videos_suplidor_lista()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_res jsonb;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Este módulo es del dueño.';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x.created_at DESC), '[]'::jsonb) INTO v_res
  FROM (
    SELECT v.id, v.url, v.estado, v.cuenta, v.pieza, v.busqueda, v.detalles, v.miniatura,
           v.candidatos, v.sin_catalogo, v.error, v.created_at,
           v.created_at > now() - interval '14 days' AS fresco,
           v.pedido_sv_id IS NOT NULL AS pedido,
           CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
             'id', p.id, 'codigo', p.codigo, 'descripcion', p.descripcion, 'precio', p.precio,
             'foto', COALESCE(p.imagen_url, '') <> '',
             'existencia', COALESCE(public.get_stock_actual(p.id), 0),
             'vendidos_30d', (SELECT COALESCE(sum(fd.cantidad), 0) FROM public.facturas_detalle fd
                               JOIN public.facturas f ON f.id = fd.factura_id
                              WHERE fd.producto_id = p.id AND f.tenant_id = v_tenant
                                AND f.fecha >= CURRENT_DATE - 30 AND f.estado <> 'Anulada'),
             'en_orden', (SELECT o.numero FROM public.ordenes_compra_detalle d
                            JOIN public.ordenes_compra o ON o.id = d.orden_compra_id
                           WHERE o.tenant_id = v_tenant AND o.estado IN ('Pendiente', 'Enviada', 'Parcial')
                             AND d.cerrada_at IS NULL AND COALESCE(d.cantidad_pendiente, d.cantidad, 0) > 0
                             AND d.producto_id = p.id
                           ORDER BY o.fecha_orden DESC LIMIT 1),
             'en_suplidor_virtual', EXISTS (SELECT 1 FROM public.suplidor_virtual_items s
                                     WHERE s.tenant_id = v_tenant AND s.producto_id = p.id
                                       AND s.estado = 'pendiente' AND s.orden_compra_pedida_id IS NULL)
           ) END AS producto
      FROM public.equipo_videos_suplidor v
      LEFT JOIN public.productos p ON p.id = v.producto_id AND p.tenant_id = v.tenant_id
     WHERE v.tenant_id = v_tenant
       AND v.created_at > now() - interval '60 days'
  ) x;
  RETURN v_res;
END $function$;

-- "Es esta" (por código) o "no la tengo".
CREATE OR REPLACE FUNCTION public.equipo_video_sup_elegir(p_id uuid, p_codigo text, p_sin_catalogo boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_prod uuid;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN RAISE EXCEPTION 'Este módulo es del dueño.'; END IF;
  -- Sin código y sin "no la tengo": volver atrás ("me equivoqué").
  IF NOT COALESCE(p_sin_catalogo, false) AND NULLIF(btrim(COALESCE(p_codigo, '')), '') IS NULL THEN
    UPDATE public.equipo_videos_suplidor
       SET producto_id = NULL, sin_catalogo = false, decidido_at = NULL
     WHERE id = p_id AND tenant_id = v_tenant;
    RETURN jsonb_build_object('ok', true, 'deshecho', true);
  END IF;
  IF NOT COALESCE(p_sin_catalogo, false) THEN
    -- Por código y, si hay varios con el mismo, el activo más reciente.
    SELECT id INTO v_prod FROM public.productos
     WHERE tenant_id = v_tenant AND codigo = btrim(p_codigo) AND COALESCE(activo, true)
     ORDER BY created_at DESC LIMIT 1;
    IF v_prod IS NULL THEN RAISE EXCEPTION 'No hay ninguna pieza con el código %.', p_codigo; END IF;
  END IF;
  UPDATE public.equipo_videos_suplidor
     SET producto_id = v_prod, sin_catalogo = COALESCE(p_sin_catalogo, false), decidido_at = now()
   WHERE id = p_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ese video no es de esta empresa.'; END IF;
  RETURN jsonb_build_object('ok', true, 'producto_id', v_prod);
END $function$;

-- Pedirla: con pieza, la misma ruta que "Agotados que se venden"; sin pieza
-- en el catálogo, una nota libre en Suplidor Virtual con lo que se vio.
CREATE OR REPLACE FUNCTION public.equipo_video_sup_pedir(p_id uuid, p_cantidad numeric DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v record;
  v_r jsonb;
  v_sv uuid;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN RAISE EXCEPTION 'Este módulo es del dueño.'; END IF;
  SELECT * INTO v FROM public.equipo_videos_suplidor WHERE id = p_id AND tenant_id = v_tenant;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Ese video no es de esta empresa.'; END IF;

  IF v.producto_id IS NOT NULL THEN
    v_r := public.equipo_agotado_a_suplidor_virtual(v.producto_id, p_cantidad);
    v_sv := (v_r ->> 'id')::uuid;
  ELSE
    SELECT id INTO v_sv FROM public.suplidor_virtual_items
     WHERE tenant_id = v_tenant AND producto_id IS NULL AND estado = 'pendiente'
       AND notas LIKE '%' || v.url || '%' LIMIT 1;
    IF v_sv IS NULL THEN
      INSERT INTO public.suplidor_virtual_items
        (tenant_id, producto_id, codigo, descripcion, cantidad_sugerida, notas, created_by)
      VALUES (v_tenant, NULL, NULL,
              upper(left(COALESCE(v.pieza, 'Pieza del video del suplidor'), 120)),
              GREATEST(COALESCE(p_cantidad, 2), 1),
              'La anuncia ' || COALESCE(v.cuenta, 'el suplidor') || ' en Instagram (Equipo IA): ' || v.url,
              auth.uid())
      RETURNING id INTO v_sv;
    END IF;
    v_r := jsonb_build_object('ok', true, 'id', v_sv);
  END IF;

  UPDATE public.equipo_videos_suplidor SET pedido_sv_id = v_sv WHERE id = v.id;
  RETURN v_r;
END $function$;

REVOKE ALL ON FUNCTION public.equipo_videos_suplidor_lista() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.equipo_video_sup_elegir(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.equipo_video_sup_pedir(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_videos_suplidor_lista() TO authenticated;
GRANT EXECUTE ON FUNCTION public.equipo_video_sup_elegir(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equipo_video_sup_pedir(uuid, numeric) TO authenticated;

-- ── PRIMERO EN "QUÉ PROMOCIONAR HOY" ───────────────────────────────
-- Copia de la versión de producción (sql/promocionar_lo_que_se_vende.sql, de
-- hoy) con un cajón más: 'anuncio_suplidor'. Misma firma.
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
    -- (04/10/2026) Antes >= 2: se anunciaban piezas con 2 en estante.
    WHERE b.existencia >= 5
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
    -- (04/10/2026, tarde) Lo que el suplidor está anunciando en Instagram en
    -- los últimos 14 días va ANTES que todo: la gente la está buscando ahora.
    SELECT 'anuncio_suplidor' AS cajon, 0 AS prio, e.*,
           row_number() OVER (ORDER BY e.vendidos_30d DESC) AS pos
    FROM elegibles e
    WHERE EXISTS (SELECT 1 FROM public.equipo_videos_suplidor v
                   WHERE v.tenant_id = p_tenant AND v.producto_id = e.id
                     AND v.created_at > now() - interval '14 days')
    UNION ALL
    -- (04/10/2026) Lo que se vende va PRIMERO: es el gancho que trae gente.
    SELECT 'mas_vendidos', 1, e.*,
           row_number() OVER (ORDER BY e.vendidos_30d DESC, e.vendidos_60d DESC) AS pos
    FROM elegibles e WHERE e.vendidos_30d > 0
    UNION ALL
    SELECT 'buen_margen', 2, e.*,
           row_number() OVER (ORDER BY e.ganancia_unidad DESC)
    FROM elegibles e WHERE e.margen_pct >= 30
    UNION ALL
    SELECT 'recien_llegados', 3, e.*,
           row_number() OVER (ORDER BY e.created_at DESC)
    FROM elegibles e WHERE e.created_at >= CURRENT_DATE - INTERVAL '21 days'
    UNION ALL
    SELECT 'alta_existencia', 4, e.*,
           row_number() OVER (ORDER BY e.capital_inmovilizado DESC)
    FROM elegibles e WHERE e.existencia > 10 AND e.existencia > 2 * e.vendidos_30d
    UNION ALL
    SELECT 'baja_rotacion', 5, e.*,
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
    SELECT c.vez_familia, c.ronda, c.prio, (c.cajon = 'anuncio_suplidor') AS anuncio,
           jsonb_build_object(
             'id', c.id, 'codigo', c.codigo, 'descripcion', c.descripcion,
             'precio', c.precio, 'costo', c.costo, 'imagen_url', c.imagen_url,
             'created_at', c.created_at, 'existencia', c.existencia,
             'margen_pct', c.margen_pct, 'vendidos_30d', c.vendidos_30d,
             'vendidos_60d', c.vendidos_60d, 'tiene_imagen', true, 'modo', 'normal',
             'capital_inmovilizado', c.capital_inmovilizado, 'cajon', c.cajon,
             'razon', CASE c.cajon
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
    ORDER BY (c.cajon = 'anuncio_suplidor') DESC, c.vez_familia, c.ronda, c.prio
    LIMIT p_limite
  )
  SELECT COALESCE(jsonb_agg(o.fila ORDER BY o.anuncio DESC, o.vez_familia, o.ronda, o.prio), '[]'::jsonb)
  FROM ordenado o;
$function$;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('videos_del_suplidor.sql');
