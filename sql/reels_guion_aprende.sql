-- =====================================================================
-- REELS: EL GUION APRENDE Y NO SE REPITE (20/10/2026)
-- ---------------------------------------------------------------------
-- El dueño: "el agente tiene que ir aprendiendo, siempre pone lo mismo en
-- los reels". En los últimos 18 guiones "¡Tu moto merece lo mejor!" salió
-- 6 veces, "¡Ya llegó!" 8 y "No te quedes sin el tuyo" 7: eran los
-- EJEMPLOS del prompt (armarReel.mjs) y el modelo los copiaba, sin ver nunca
-- lo que ya había escrito ni cómo lo corrige el dueño.
--
-- hermes.equipo_reel_para ahora también entrega:
--   voces_recientes  lo que dijeron los últimos 20 reels (45 días)
--   correcciones     las 8 últimas veces que el dueño cambió la voz o el
--                    titular antes de "Hacer el reel" (antes → después)
-- y armarReel.mjs (worker de la PC) prohíbe repetir esas frases, saca solas
-- las frases gastadas y le enseña al modelo cómo corrige el dueño.
-- Parte de la versión de producción del 20/10/2026 (la de los objetivos).
-- =====================================================================

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
  v_voces  json;
  v_corr   json;
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

  -- (20/10/2026) Para que el guion no salga siempre igual y aprenda:
  -- lo que ya dijeron los últimos reels (escrito por el Creativo y lo que
  -- quedó después de que el dueño lo revisó) y las correcciones del dueño
  -- (antes → después). armarReel.mjs se lo enseña al modelo.
  SELECT json_agg(v ORDER BY f DESC) INTO v_voces FROM (
    SELECT DISTINCT ON (v) v, f FROM (
      SELECT a.contenido -> 'reel_guion' -> 'guion' ->> 'voz' AS v, a.creado_en AS f
        FROM public.equipo_aprobaciones a
       WHERE a.tenant_id = v_m.tenant_id AND a.contenido ? 'reel_guion'
         AND a.creado_en > now() - interval '45 days'
      UNION ALL
      SELECT p.guion ->> 'voz', p.created_at
        FROM public.equipo_reels_pedidos p
       WHERE p.tenant_id = v_m.tenant_id AND p.created_at > now() - interval '45 days'
    ) x WHERE nullif(btrim(v), '') IS NOT NULL AND f IS NOT NULL
    ORDER BY v, f DESC
  ) y;
  -- solo las 20 más recientes
  SELECT json_agg(e) INTO v_voces FROM (SELECT json_array_elements_text(v_voces) e LIMIT 20) t;

  SELECT json_agg(c ORDER BY f DESC) INTO v_corr FROM (
    SELECT json_build_object(
             'plantilla', a.contenido -> 'reel_guion' -> 'guion' ->> 'plantilla',
             'voz_antes', a.contenido -> 'reel_guion' -> 'guion' ->> 'voz',
             'voz_despues', p.guion ->> 'voz',
             'titular_antes', a.contenido -> 'reel_guion' -> 'guion' ->> 'titular',
             'titular_despues', p.guion ->> 'titular') AS c,
           p.created_at AS f
      FROM public.equipo_reels_pedidos p
      JOIN public.equipo_aprobaciones a ON a.mensaje_id = p.mensaje_id AND a.contenido ? 'reel_guion'
     WHERE p.tenant_id = v_m.tenant_id
       AND ((a.contenido -> 'reel_guion' -> 'guion' ->> 'voz') IS DISTINCT FROM (p.guion ->> 'voz')
         OR (a.contenido -> 'reel_guion' -> 'guion' ->> 'titular') IS DISTINCT FROM (p.guion ->> 'titular'))
     ORDER BY p.created_at DESC
     LIMIT 8
  ) z;

  RETURN json_build_object(
    'voces_recientes', COALESCE(v_voces, '[]'::json),
    'correcciones', COALESCE(v_corr, '[]'::json),
    'modelo_id', v_modelo.id, 'formato', v_modelo.formato, 'receta', v_modelo.receta,
    'nota_dueno', v_modelo.nota_dueno,
    'objetivo', v_obj,
    'plantilla', CASE v_obj WHEN 'educativo' THEN 'sabias_que' WHEN 'interaccion' THEN 'le_sirve' END,
    'producto', json_build_object('id', v_prod.id, 'codigo', v_prod.codigo,
      'descripcion', v_prod.descripcion, 'precio', v_prod.precio,
      'marca', v_prod.marca, 'modelos', v_prod.modelos));
END $function$;

SELECT public.registrar_migracion('reels_guion_aprende.sql');
