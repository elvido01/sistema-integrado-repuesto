-- =====================================================================
-- PUBLICACIÓN DIARIA: CADA PIEZA CON SU OBJETIVO (19/10/2026)
-- ---------------------------------------------------------------------
-- El alcance de Morla es muy bajo (27–123 personas por promoción, ver
-- sql/medicion_publicaciones.sql) y las 3 piezas del día eran todas de
-- VENTA: pieza, precio y botón. Las redes no reparten anuncios. Idea del
-- video "agente IA para redes" que el dueño mandó: cada publicación con un
-- objetivo. Desde hoy las 3 del día son una de cada:
--
--   venta        como siempre (precio de catálogo, sin descuento)
--   educativo    enseña algo útil de ese tipo de pieza (para qué sirve,
--                cada cuánto se cambia, señales de desgaste) → alcance.
--                Reel "¿Sabías que?".
--   interaccion  una pregunta fácil sobre su moto para que comenten (los
--                comentarios ya se contestan desde el CRM) → alcance y
--                conversación. Reel "¿Le sirve a tu moto?".
--
-- Siguen ancladas a una pieza real con su foto (la elección de las 3 no se
-- toca: lo que se vende, mínimo 5 en estante...), así la medición por
-- movimiento del producto sigue valiendo, ahora por objetivo.
--
-- ROTACIÓN: cada franja de precio pasa por los 3 objetivos en días
-- seguidos (franja + día), así cada objetivo sale en todas las horas y en
-- todos los precios: la comparación es pareja. equipo_auto_publicacion.
-- objetivos manda; {venta} vuelve a lo de antes.
--
-- El objetivo se pone al elegir (trigger) y viaja en la petición al
-- Creativo (_equipo_auto_encargar), en la receta del reel
-- (hermes.equipo_reel_para → plantilla) y en el aviso de "lista para
-- publicar" (_equipo_auto_avanzar). Las tres funciones parten de su versión
-- de producción del 19/10/2026.
-- =====================================================================

ALTER TABLE public.equipo_auto_publicacion
  ADD COLUMN IF NOT EXISTS objetivos text[] NOT NULL DEFAULT ARRAY['venta', 'educativo', 'interaccion'];
ALTER TABLE public.equipo_auto_elegidas
  ADD COLUMN IF NOT EXISTS objetivo text;
ALTER TABLE public.equipo_auto_elegidas DROP CONSTRAINT IF EXISTS equipo_auto_elegidas_objetivo_chk;
ALTER TABLE public.equipo_auto_elegidas ADD CONSTRAINT equipo_auto_elegidas_objetivo_chk
  CHECK (objetivo IS NULL OR objetivo IN ('venta', 'educativo', 'interaccion'));

-- El objetivo de una franja un día dado.
CREATE OR REPLACE FUNCTION public._equipo_auto_objetivo(p_tenant uuid, p_fecha date, p_rango text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_obj text[];
  v_idx int;
BEGIN
  SELECT COALESCE(NULLIF(c.objetivos, '{}'), ARRAY['venta']),
         (SELECT t.ord - 1 FROM jsonb_array_elements(c.rangos) WITH ORDINALITY t(r, ord)
           WHERE t.r ->> 'nombre' = p_rango LIMIT 1)
    INTO v_obj, v_idx
    FROM public.equipo_auto_publicacion c WHERE c.tenant_id = p_tenant;
  IF v_obj IS NULL THEN RETURN NULL; END IF;
  RETURN v_obj[((COALESCE(v_idx, 0) + (p_fecha - DATE '2026-01-01')) % cardinality(v_obj)) + 1];
END $$;

CREATE OR REPLACE FUNCTION public._equipo_auto_objetivo_nombre(p_obj text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_obj WHEN 'venta' THEN '💰 Venta'
                    WHEN 'educativo' THEN '📚 Educar (alcance)'
                    WHEN 'interaccion' THEN '💬 Conversación (comentarios)' END
$$;

-- Lo que se le pide al Creativo según el objetivo (va en la petición).
CREATE OR REPLACE FUNCTION public._equipo_auto_instruccion_objetivo(p_obj text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_obj
    WHEN 'educativo' THEN
      E'\n\nOBJETIVO DE ESTA PIEZA: EDUCAR, para llegar a más gente (no es un anuncio).'
      || E'\n· El titular del arte es una enseñanza útil sobre este TIPO de pieza: para qué sirve, cada cuánto se cambia, señales de que está gastada o cómo escoger la correcta. Ejemplo: "3 señales de que tu cadena ya no da más".'
      || E'\n· Solo datos generales y ciertos del tipo de pieza: nada de medidas, compatibilidades ni cifras inventadas.'
      || E'\n· La pieza sale en la foto como la solución. El precio de catálogo va, pero pequeño y al final.'
      || E'\n· El texto de la publicación termina invitando a escribir: "¿Te pasó? Escríbenos y te ayudamos a escoger la tuya".'
      || E'\n· Reel: formato ¿Sabías que?.'
    WHEN 'interaccion' THEN
      E'\n\nOBJETIVO DE ESTA PIEZA: CONVERSACIÓN. Que la gente comente: Instagram y Facebook le enseñan a más gente lo que se comenta.'
      || E'\n· El titular del arte es una pregunta fácil de contestar en pocas palabras sobre SU moto. Ejemplos: "¿Qué moto tienes? Te digo si te sirve", "¿Cada cuánto le cambias esto a la tuya?".'
      || E'\n· El texto de la publicación pide comentar el modelo de su moto y promete contestar cada comentario.'
      || E'\n· El precio de catálogo va, pero pequeño.'
      || E'\n· Reel: formato ¿Le sirve a tu moto?.'
    ELSE ''
  END
$$;

-- Se pone al elegir la pieza (y en la franja que se llena más tarde).
CREATE OR REPLACE FUNCTION public.trg_equipo_auto_objetivo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.objetivo IS NULL AND NEW.producto_id IS NOT NULL THEN
    NEW.objetivo := public._equipo_auto_objetivo(NEW.tenant_id, NEW.fecha, NEW.rango);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_equipo_auto_objetivo ON public.equipo_auto_elegidas;
CREATE TRIGGER trg_equipo_auto_objetivo BEFORE INSERT OR UPDATE OF producto_id ON public.equipo_auto_elegidas
  FOR EACH ROW EXECUTE FUNCTION public.trg_equipo_auto_objetivo();

-- Las de hoy que todavía no se encargaron entran ya con objetivo.
UPDATE public.equipo_auto_elegidas e
   SET objetivo = public._equipo_auto_objetivo(e.tenant_id, e.fecha, e.rango)
 WHERE e.fecha = (now() AT TIME ZONE 'America/Santo_Domingo')::date
   AND e.producto_id IS NOT NULL AND e.trabajo_id IS NULL AND e.objetivo IS NULL;

-- ---------------------------------------------------------------------
-- Las tres funciones, desde su versión de producción (19/10/2026)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._equipo_auto_encargar(p_tenant uuid, p_producto_id uuid, p_rango text, p_formato text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_pet text;
  v_abierto json;
  v_trabajo uuid;
  v_obj text;
BEGIN
  SELECT p.codigo, p.descripcion, p.precio INTO r
    FROM public.productos p WHERE p.id = p_producto_id AND p.tenant_id = p_tenant;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- (19/10/2026) El objetivo de la pieza (sql/publicacion_diaria_objetivos.sql).
  SELECT e.objetivo INTO v_obj FROM public.equipo_auto_elegidas e
   WHERE e.tenant_id = p_tenant AND e.producto_id = p_producto_id
     AND e.fecha = (now() AT TIME ZONE 'America/Santo_Domingo')::date
   ORDER BY e.created_at DESC LIMIT 1;

  v_pet := 'Prepara la promoción de:' || E'\n'
    || format(E'· %s (código %s). Precio de catálogo: RD$ %s.\n', r.descripcion, r.codigo, to_char(r.precio, 'FM999G999G990D00'))
    || format(E'\nFormato principal: %s.', p_formato)
    || E'\nDescuento: NO. Esta promoción NO ofrece descuento: no menciones descuento, rebaja ni código.'
    || public._equipo_auto_instruccion_objetivo(v_obj)
    || format(E'\nElegida por Hermes (publicación diaria, rango %s).', p_rango)
    || E'\n\nEntrega un BORRADOR para aprobación: no publiques nada.';

  v_abierto := hermes.equipo_abrir_trabajo(
    p_tenant   => p_tenant,
    p_titulo   => 'Promoción ' || left(r.descripcion, 120),
    p_peticion => v_pet,
    p_tipo     => 'promocion',
    p_origin_platform => 'panel',
    p_solicitado_por => NULL,
    p_idempotency_key => 'promo-auto:' || p_tenant::text || ':' || r.codigo || ':'
                         || (now() AT TIME ZONE 'America/Santo_Domingo')::date::text);
  v_trabajo := (v_abierto ->> 'trabajo_id')::uuid;
  PERFORM hermes.equipo_encargar_a(v_trabajo, 'comercial_creativo', 1, hermes.equipo_brief_arte(p_tenant, v_pet));
  RETURN v_trabajo;
END $function$;

CREATE OR REPLACE FUNCTION hermes.equipo_reel_para(p_mensaje_id uuid, p_claim_token uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_m      record;
  v_w      record;
  v_prod   record;
  v_modelo record;
  v_obj    text;
BEGIN
  SELECT m.id, m.tenant_id, m.claim_token, m.trabajo_id INTO v_m
    FROM public.equipo_mensajes m WHERE m.id = p_mensaje_id;
  IF v_m.id IS NULL OR v_m.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_w FROM public.equipo_trabajos WHERE id = v_m.trabajo_id;

  -- La pieza, por su código en el pedido (igual que la revisión de Hermes).
  SELECT p.id, p.codigo, p.descripcion, p.precio,
         ma.nombre AS marca,
         NULLIF(public.get_nombres_modelos(p.modelos_ids), '') AS modelos
    INTO v_prod
    FROM public.productos p
    LEFT JOIN public.marcas ma ON ma.id = p.marca_id AND ma.tenant_id = p.tenant_id
   WHERE p.tenant_id = v_m.tenant_id
     AND p.id = public._equipo_producto_de_peticion(v_m.tenant_id, v_w.peticion);
  IF v_prod.id IS NULL THEN RETURN NULL; END IF;

  -- El formato que hace más tiempo que no sale; dentro, un modelo al azar.
  SELECT r.* INTO v_modelo
    FROM public.equipo_reels_modelo r
    LEFT JOIN LATERAL (
      SELECT max(h.created_at) AS ultimo FROM public.equipo_reels_hechos h
       WHERE h.tenant_id = r.tenant_id AND h.formato = r.formato) u ON true
   WHERE r.tenant_id = v_m.tenant_id AND r.estado = 'listo' AND r.receta IS NOT NULL
   ORDER BY u.ultimo NULLS FIRST, random()
   LIMIT 1;
  IF v_modelo.id IS NULL THEN RETURN NULL; END IF;

  -- (19/10/2026) Pieza de la publicación diaria con objetivo: su plantilla
  -- (armarReel la usa si la pieza la admite; si no, rota como siempre).
  SELECT e.objetivo INTO v_obj FROM public.equipo_auto_elegidas e
   WHERE e.trabajo_id = v_m.trabajo_id ORDER BY e.created_at DESC LIMIT 1;

  RETURN json_build_object(
    'modelo_id', v_modelo.id, 'formato', v_modelo.formato, 'receta', v_modelo.receta,
    'nota_dueno', v_modelo.nota_dueno,
    'objetivo', v_obj,
    'plantilla', CASE v_obj WHEN 'educativo' THEN 'sabias_que' WHEN 'interaccion' THEN 'le_sirve' END,
    'producto', json_build_object('id', v_prod.id, 'codigo', v_prod.codigo,
      'descripcion', v_prod.descripcion, 'precio', v_prod.precio,
      'marca', v_prod.marca, 'modelos', v_prod.modelos));
END $function$;

CREATE OR REPLACE FUNCTION public._equipo_auto_avanzar(p_tenant uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cfg public.equipo_auto_publicacion;
  v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_ahora time := (now() AT TIME ZONE 'America/Santo_Domingo')::time;
  e record;
  v_ap record;
  v_reel record;
  v_prod record;
  v_trabajo uuid;
  v_pedido uuid;
  v_hechos jsonb := '[]'::jsonb;
  v_txt text;
  v_hora12 text;
  v_estado_reel text;
BEGIN
  SELECT * INTO cfg FROM public.equipo_auto_publicacion WHERE tenant_id = p_tenant;
  IF NOT FOUND THEN RETURN v_hechos; END IF;

  FOR e IN
    SELECT * FROM public.equipo_auto_elegidas
     WHERE tenant_id = p_tenant AND fecha = v_hoy AND producto_id IS NOT NULL AND avisado_at IS NULL
     ORDER BY hora_publicar NULLS LAST
  LOOP
    -- Ya se mandó a publicar por otra vía: nada más que hacer.
    IF EXISTS (SELECT 1 FROM public.hermes_publication_jobs j
                WHERE j.tenant_id = p_tenant AND j.producto_id = e.producto_id
                  AND j.status NOT IN ('draft', 'failed', 'cancelled', 'rejected')
                  AND j.created_at >= e.created_at) THEN
      UPDATE public.equipo_auto_elegidas
         SET avisado_at = now(), nota = COALESCE(nota, '') || ' · ya publicada'
       WHERE id = e.id;
      CONTINUE;
    END IF;

    -- 1) Encargar el arte 30 minutos antes de su hora.
    IF e.trabajo_id IS NULL THEN
      IF v_ahora >= COALESCE(e.hora_publicar, '08:00'::time) - interval '30 minutes' THEN
        v_trabajo := public._equipo_auto_encargar(p_tenant, e.producto_id, e.rango, cfg.formato);
        UPDATE public.equipo_auto_elegidas SET trabajo_id = v_trabajo, encargada_at = now() WHERE id = e.id;
        v_hechos := v_hechos || jsonb_build_object('encargada', e.rango);
      END IF;
      CONTINUE;
    END IF;

    -- El borrador del Creativo (arte + guion del reel).
    v_ap := NULL;
    SELECT a.mensaje_id, a.contenido, a.creado_en INTO v_ap
      FROM public.equipo_aprobaciones a
     WHERE a.trabajo_id = e.trabajo_id AND a.tenant_id = p_tenant AND a.contenido ? 'arte_imagen_id'
     ORDER BY a.revision_num DESC, a.creado_en DESC NULLS LAST
     LIMIT 1;
    IF v_ap.mensaje_id IS NULL THEN CONTINUE; END IF;  -- el arte todavía no llega

    -- 2) Pedir el reel con el guion del Creativo, sin esperar revisión.
    IF e.reel_pedido_at IS NULL THEN
      v_pedido := NULL;
      IF jsonb_typeof(v_ap.contenido -> 'reel_guion' -> 'guion' -> 'tomas') = 'array'
         AND jsonb_array_length(v_ap.contenido -> 'reel_guion' -> 'guion' -> 'tomas') >= 2 THEN
        SELECT id INTO v_pedido FROM public.equipo_reels_pedidos
         WHERE trabajo_id = e.trabajo_id ORDER BY created_at DESC LIMIT 1;
        IF v_pedido IS NULL THEN
          INSERT INTO public.equipo_reels_pedidos
            (tenant_id, trabajo_id, mensaje_id, guion, para, foto_url, logo_url, telefono, empresa)
          VALUES (p_tenant, e.trabajo_id, v_ap.mensaje_id,
                  v_ap.contenido -> 'reel_guion' -> 'guion', v_ap.contenido -> 'reel_guion' -> 'para',
                  v_ap.contenido -> 'reel_guion' ->> 'foto_url', v_ap.contenido -> 'reel_guion' ->> 'logo_url',
                  v_ap.contenido -> 'reel_guion' ->> 'telefono', v_ap.contenido -> 'reel_guion' ->> 'empresa')
          RETURNING id INTO v_pedido;
        END IF;
      END IF;
      UPDATE public.equipo_auto_elegidas SET reel_pedido_id = v_pedido, reel_pedido_at = now() WHERE id = e.id;
      v_hechos := v_hechos || jsonb_build_object('reel', e.rango);
      CONTINUE;
    END IF;

    -- 3) Avisar cuando el reel está (o falló, o tarda más de 25 minutos).
    v_estado_reel := NULL;
    IF e.reel_pedido_id IS NOT NULL THEN
      SELECT estado INTO v_estado_reel FROM public.equipo_reels_pedidos WHERE id = e.reel_pedido_id;
      IF COALESCE(v_estado_reel, '') NOT IN ('listo', 'error') AND now() < e.reel_pedido_at + interval '25 minutes' THEN
        CONTINUE;
      END IF;
    END IF;

    SELECT descripcion, precio, codigo INTO v_prod FROM public.productos WHERE id = e.producto_id;
    v_hora12 := to_char(e.hora_publicar, 'FMHH12:MI') || CASE WHEN e.hora_publicar < '12:00' THEN ' am' ELSE ' pm' END;
    v_txt := format(
      E'📣 **Lista para publicar** — %s (RD$%s)\nHora prevista: %s · rango %s.%s\n%s\n\nEntra a Equipo IA → Publicación diaria con Hermes → "Revisar en el Paso 2", acepta y pulsa **Programar** (la hora ya viene puesta). Sin descuento.',
      v_prod.descripcion, to_char(v_prod.precio, 'FM999G999G990'), v_hora12, e.rango,
      COALESCE(E'\nObjetivo: ' || public._equipo_auto_objetivo_nombre(e.objetivo) || '.', ''),
      CASE WHEN v_estado_reel = 'listo' THEN '🎬 Arte y reel listos.'
           WHEN v_estado_reel = 'error' THEN '🎨 Arte listo. ⚠️ El reel falló: puedes rehacerlo en el Paso 2 o publicar sin él.'
           WHEN e.reel_pedido_id IS NOT NULL THEN '🎨 Arte listo. 🎬 El reel todavía se está armando.'
           ELSE '🎨 Arte listo (sin guion de reel).' END);
    PERFORM public.hermes_decir(p_tenant, v_txt, NULL, 'publicacion_diaria');
    -- La campanita es por persona: a los dueños y administradores de la empresa.
    INSERT INTO public.notificaciones (tenant_id, user_id, tipo, titulo, mensaje, producto_id)
    SELECT p_tenant, pr.id, 'promo_lista', '📣 Lista para publicar: ' || left(v_prod.descripcion, 60),
           format('Sale a las %s. Equipo IA → Publicación diaria → Revisar en el Paso 2.', v_hora12), e.producto_id
      FROM public.profiles pr
     WHERE pr.tenant_id = p_tenant AND pr.role IN ('owner', 'admin');
    UPDATE public.equipo_auto_elegidas SET avisado_at = now() WHERE id = e.id;
    v_hechos := v_hechos || jsonb_build_object('avisada', e.rango);
  END LOOP;

  RETURN v_hechos;
END $function$;


-- ---------------------------------------------------------------------
-- La medición por objetivo: efectividad_publicaciones devuelve 'objetivo'
-- (la tarjeta "¿Qué publicación vende?" agrupa el alcance y las ventas por
-- objetivo). Cambia lo que devuelve: hay que soltarla y volverla a crear,
-- con los mismos permisos (authenticated y service_role; anon no).
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.efectividad_publicaciones(integer);
CREATE FUNCTION public.efectividad_publicaciones(p_dias integer DEFAULT 60)
 RETURNS TABLE(bundle_id uuid, producto_id uuid, codigo text, descripcion text, publicado_at timestamp with time zone, formato text, redes text[], con_descuento boolean, codigo_promo integer, costo_ia_usd numeric, alcance bigint, vistas bigint, interacciones bigint, clics bigint, dias_despues numeric, uds_antes numeric, uds_despues numeric, ventas_antes numeric, ventas_despues numeric, uds_dia_antes numeric, uds_dia_despues numeric, ventas_con_codigo bigint, objetivo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH emp AS (
    SELECT get_user_tenant() AS t
     WHERE EXISTS (SELECT 1 FROM config_empresa c
                    WHERE c.tenant_id = get_user_tenant() AND c.feat_medicion_publicaciones)
  ),
  b AS (
    SELECT j.publication_bundle_id                                   AS bundle_id,
           (array_agg(j.producto_id))[1]                             AS producto_id,
           min(coalesce(j.completed_at, j.scheduled_for, j.created_at)) AS publicado_at,
           CASE WHEN bool_or(j.media_type = 'video') THEN 'reel' ELSE 'imagen' END AS formato,
           array_agg(DISTINCT ch ORDER BY ch) FILTER (WHERE ch IS NOT NULL) AS redes,
           NOT bool_or(coalesce((j.channel_config->>'sin_descuento')::boolean, false)) AS con_descuento,
           array_agg(DISTINCT j.id)                                  AS jobs
      FROM hermes_publication_jobs j
      LEFT JOIN LATERAL unnest(j.channels) ch ON true
     WHERE j.tenant_id = (SELECT t FROM emp)
       AND j.status = 'published'
       AND j.publication_bundle_id IS NOT NULL
       AND j.producto_id IS NOT NULL
       AND j.created_at > now() - make_interval(days => p_dias)
     GROUP BY j.publication_bundle_id
  ),
  met AS (   -- última foto de métricas de cada post de la promoción
    SELECT b.bundle_id,
           sum(m.reach)       AS alcance,
           sum(m.views)       AS vistas,
           sum(coalesce(m.likes,0) + coalesce(m.comments,0) + coalesce(m.shares,0) + coalesce(m.saves,0)) AS interacciones,
           sum(m.clicks)      AS clics
      FROM b
      JOIN social_posts sp ON sp.publication_job_id = ANY (b.jobs)
      JOIN LATERAL (SELECT * FROM social_post_metrics x WHERE x.post_id = sp.id
                     ORDER BY x.snapshot_date DESC NULLS LAST, x.captured_at DESC LIMIT 1) m ON true
     GROUP BY b.bundle_id
  ),
  ven AS (
    SELECT b.bundle_id,
           sum(d.cantidad) FILTER (WHERE f.fecha <  b.publicado_at)              AS uds_antes,
           sum(d.cantidad) FILTER (WHERE f.fecha >= b.publicado_at)              AS uds_despues,
           sum(d.importe)  FILTER (WHERE f.fecha <  b.publicado_at)              AS ventas_antes,
           sum(d.importe)  FILTER (WHERE f.fecha >= b.publicado_at)              AS ventas_despues
      FROM b
      JOIN facturas_detalle d ON d.producto_id = b.producto_id AND d.tenant_id = (SELECT t FROM emp)
      JOIN facturas f ON f.id = d.factura_id
     WHERE f.estado IS DISTINCT FROM 'ANULADA'
       AND f.fecha >= b.publicado_at - interval '7 days'
       AND f.fecha <  b.publicado_at + interval '7 days'
     GROUP BY b.bundle_id
  )
  SELECT b.bundle_id, b.producto_id, p.codigo, p.descripcion, b.publicado_at, b.formato, b.redes,
         b.con_descuento,
         pc.numero                                                            AS codigo_promo,
         (CASE b.formato WHEN 'reel' THEN 0.21 ELSE 0.163 END)::numeric        AS costo_ia_usd,
         coalesce(met.alcance, 0)::bigint                                     AS alcance,
         coalesce(met.vistas, 0)::bigint                                      AS vistas,
         coalesce(met.interacciones, 0)::bigint                               AS interacciones,
         coalesce(met.clics, 0)::bigint                                       AS clics,
         round(least(7, extract(epoch FROM now() - b.publicado_at) / 86400)::numeric, 1) AS dias_despues,
         coalesce(ven.uds_antes, 0)                                           AS uds_antes,
         coalesce(ven.uds_despues, 0)                                         AS uds_despues,
         round(coalesce(ven.ventas_antes, 0), 2)                              AS ventas_antes,
         round(coalesce(ven.ventas_despues, 0), 2)                            AS ventas_despues,
         round(coalesce(ven.uds_antes, 0) / 7.0, 2)                           AS uds_dia_antes,
         round(coalesce(ven.uds_despues, 0)
               / greatest(1, least(7, extract(epoch FROM now() - b.publicado_at) / 86400))::numeric, 2) AS uds_dia_despues,
         (SELECT count(*) FROM facturas f2
           WHERE f2.promo_codigo_id = pc.id AND f2.estado IS DISTINCT FROM 'ANULADA') AS ventas_con_codigo,
         -- (19/10/2026) El objetivo con que la eligió la publicación diaria;
         -- antes de hoy todas eran de venta; 'manual' = encargada a mano en el Paso 1.
         COALESCE((SELECT COALESCE(e.objetivo, 'venta') FROM equipo_auto_elegidas e
                    WHERE e.tenant_id = (SELECT t FROM emp) AND e.producto_id = b.producto_id
                      AND e.fecha BETWEEN (b.publicado_at AT TIME ZONE 'America/Santo_Domingo')::date - 1
                                      AND (b.publicado_at AT TIME ZONE 'America/Santo_Domingo')::date
                    ORDER BY e.fecha DESC LIMIT 1), 'manual')                AS objetivo
    FROM b
    JOIN productos p ON p.id = b.producto_id
    LEFT JOIN promo_codigos pc ON pc.bundle_id = b.bundle_id
    LEFT JOIN met ON met.bundle_id = b.bundle_id
    LEFT JOIN ven ON ven.bundle_id = b.bundle_id
   ORDER BY b.publicado_at DESC;
$function$;
REVOKE ALL ON FUNCTION public.efectividad_publicaciones(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.efectividad_publicaciones(integer) TO authenticated, service_role;

SELECT public.registrar_migracion('publicacion_diaria_objetivos.sql');

-- Verificación: las de hoy y los próximos días de cada franja
SELECT e.rango, e.hora_publicar, e.objetivo,
       public._equipo_auto_objetivo(e.tenant_id, e.fecha + 1, e.rango) AS manana,
       public._equipo_auto_objetivo(e.tenant_id, e.fecha + 2, e.rango) AS pasado
  FROM public.equipo_auto_elegidas e
 WHERE e.fecha = (now() AT TIME ZONE 'America/Santo_Domingo')::date
 ORDER BY e.hora_publicar;
