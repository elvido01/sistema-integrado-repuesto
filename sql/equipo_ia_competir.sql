-- =====================================================================
-- Equipo IA a la altura de los módulos de promoción con agentes (21/11/2026)
-- ---------------------------------------------------------------------
-- El dueño: "busca referencia de un módulo de promoción con agentes y
-- modifícalo para que compita". Comparado con Shopify Campaign Autopilot,
-- Klaviyo Composer y ContentStudio faltaban: calendario, recomendaciones
-- en palabras, preguntarle al agente por las promociones y la voz de marca.
-- Esta parte es la de la base:
--   1) _efectividad_de(tenant): la misma medición de "¿Qué publicación
--      vende?" por empresa, para que Jarvis (que corre con service_role y
--      no tiene get_user_tenant) la lea. efectividad_publicaciones queda
--      como envoltorio: una sola consulta, no dos copias.
--   2) Voz de marca: criterios de tipo 'voz' que llegan al Creativo en el
--      brief del arte, donde escribe el título y la descripción de cada red.
--      Con 5 reglas de inicio para Repuestos Morla (se cambian en Estilo).
-- Base: versiones de producción del 21/11/2026.
-- =====================================================================
BEGIN;

-- 1) La medición por empresa ------------------------------------------
CREATE OR REPLACE FUNCTION public._efectividad_de(p_tenant uuid, p_dias integer DEFAULT 60)
 RETURNS TABLE(bundle_id uuid, producto_id uuid, codigo text, descripcion text, publicado_at timestamp with time zone, formato text, redes text[], con_descuento boolean, codigo_promo integer, costo_ia_usd numeric, alcance bigint, vistas bigint, interacciones bigint, clics bigint, dias_despues numeric, uds_antes numeric, uds_despues numeric, ventas_antes numeric, ventas_despues numeric, uds_dia_antes numeric, uds_dia_despues numeric, ventas_con_codigo bigint, objetivo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH emp AS (
    SELECT p_tenant AS t
     WHERE EXISTS (SELECT 1 FROM config_empresa c
                    WHERE c.tenant_id = p_tenant AND c.feat_medicion_publicaciones)
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
REVOKE ALL ON FUNCTION public._efectividad_de(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._efectividad_de(uuid, integer) TO service_role;

-- La pantalla sigue llamando a la misma función, con la empresa activa.
CREATE OR REPLACE FUNCTION public.efectividad_publicaciones(p_dias integer DEFAULT 60)
 RETURNS TABLE(bundle_id uuid, producto_id uuid, codigo text, descripcion text, publicado_at timestamp with time zone, formato text, redes text[], con_descuento boolean, codigo_promo integer, costo_ia_usd numeric, alcance bigint, vistas bigint, interacciones bigint, clics bigint, dias_despues numeric, uds_antes numeric, uds_despues numeric, ventas_antes numeric, ventas_despues numeric, uds_dia_antes numeric, uds_dia_despues numeric, ventas_con_codigo bigint, objetivo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public._efectividad_de(public.get_user_tenant(), p_dias);
$function$;

-- 2) Voz de marca -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.equipo_criterio_guardar(p_tipo text, p_clave text, p_texto text, p_orden integer DEFAULT 100, p_activo boolean DEFAULT true)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_tenant uuid := public.get_user_tenant();
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Este módulo es del dueño.';
  END IF;
  IF p_tipo NOT IN ('promocion','arte','seguimiento','consulta','voz') THEN
    RAISE EXCEPTION 'Tipo no admitido: %', p_tipo;
  END IF;
  IF COALESCE(btrim(p_texto), '') = '' THEN
    RAISE EXCEPTION 'La regla viene vacía';
  END IF;

  UPDATE public.equipo_criterios
     SET texto = btrim(p_texto), orden = COALESCE(p_orden, orden), activo = p_activo
   WHERE tenant_id = v_tenant AND tipo = p_tipo AND clave = p_clave;

  IF NOT FOUND THEN
    INSERT INTO public.equipo_criterios (tenant_id, tipo, clave, texto, orden, bloqueante, activo)
    VALUES (v_tenant, p_tipo, COALESCE(NULLIF(btrim(p_clave), ''), 'regla_' || extract(epoch from now())::bigint),
            btrim(p_texto), COALESCE(p_orden, 100), false, p_activo);
  END IF;

  RETURN json_build_object('ok', true);
END $function$;

CREATE OR REPLACE FUNCTION hermes.equipo_brief_arte(p_tenant uuid, p_peticion text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_foto text; v_logo text; v_tel text; v_nom text; v_reglas text; v_refs text; v_voz text;
BEGIN
  SELECT p.imagen_url INTO v_foto FROM public.productos p
  WHERE p.id = public._equipo_producto_de_peticion(p_tenant, p_peticion);

  SELECT e.logo_url, e.telefono, e.nombre INTO v_logo, v_tel, v_nom
  FROM public.config_empresa e WHERE e.tenant_id = p_tenant;

  -- Mismo criterio que usa la pantalla del dueño (equipo_criterios_ver): las
  -- de arte y las universales. Si él las ve en la lista, tienen que llegarle
  -- al creativo.
  SELECT string_agg('· ' || c.texto, E'\n' ORDER BY c.tipo, c.orden) INTO v_reglas
  FROM public.equipo_criterios c
  WHERE c.tenant_id = p_tenant AND c.activo AND c.tipo IN ('arte', '*');

  -- (21/11/2026) La voz de la marca: cómo se escriben los textos de cada red.
  SELECT string_agg('· ' || c.texto, E'\n' ORDER BY c.orden) INTO v_voz
  FROM public.equipo_criterios c
  WHERE c.tenant_id = p_tenant AND c.activo AND c.tipo = 'voz';

  SELECT string_agg(
           '· ' || upper(r.uso) || ' imagen_id=' || r.imagen_id::text
           || COALESCE(' — ' || r.nota, ''), E'\n' ORDER BY r.creado_en)
    INTO v_refs
  FROM public.equipo_referencias r
  JOIN public.hermes_imagenes i ON i.imagen_id = r.imagen_id
  WHERE r.tenant_id = p_tenant AND r.activo AND i.deleted_at IS NULL;

  RETURN 'CONCEPTO APROBADO por el dueño. Ahora monta el ARTE FINAL.'
    || E'\n\nMateriales (úsalos tal cual, no busques ni generes otros):'
    || COALESCE(E'\n· Foto real del producto: ' || v_foto, E'\n· Foto: no hay en el catálogo, dilo')
    || COALESCE(E'\n· Logo oficial: ' || v_logo, '')
    || COALESCE(E'\n· Empresa: ' || v_nom, '')
    || COALESCE(E'\n· Teléfono: ' || v_tel, '')
    || COALESCE(E'\n\nREFERENCIAS QUE DEJÓ EL DUEÑO:' || E'\n' || v_refs
        || E'\nLas de tipo FONDO se montan de fondo automáticamente: no las describas,'
        || ' elige colores de texto que se lean encima.'
        || E'\nLas de tipo ESTILO son el listón: imita su estructura, no su producto.', '')
    || COALESCE(E'\n\nCÓMO DEBE VERSE LA PIEZA (reglas de la casa):' || E'\n' || v_reglas, '')
    || E'\n\nDevuelve el objeto "arte" con lo que decidas. Campos que el montador dibuja:'
    || E'\n  titulo          — lo que se LEE, 2 renglones cortos'
    || E'\n  titulo_acento   — UNA palabra del título que va en color de acento'
    || E'\n  subtitulo       — la marca, va en una cinta bajo el título'
    || E'\n  tagline         — una línea fina, opcional'
    || E'\n  bullets         — hasta 3 ventajas de 2-3 palabras (solo en historia)'
    || E'\n  sello           — palabra del sello redondo, o null. No prometas garantías que no existen.'
    || E'\n  precio, fondo, acento — hexadecimal en los dos colores'
    || E'\n\nLa foto real, el logo, el teléfono y la ciudad los pone el montador.'
    || E'\n\nY entrega, para CADA red, un ejemplo de TÍTULO y otro de DESCRIPCIÓN.'
    || COALESCE(E'\n\nCÓMO SE ESCRIBEN LOS TEXTOS (voz de la marca, para títulos y descripciones):' || E'\n' || v_voz, '')
    || E'\n\nNo se publica nada: esto vuelve a pasar por aprobación.';
END $function$;

-- Reglas de inicio para Repuestos Morla (el dueño las cambia en Estilo).
INSERT INTO public.equipo_criterios (tenant_id, tipo, clave, texto, orden, bloqueante, activo) VALUES
  ('00000000-0000-0000-0000-000000000001', 'voz', 'tutea_y_dominicano', 'Tutea al cliente y habla como se habla en la tienda: claro, cercano y dominicano, sin palabras rebuscadas.', 10, false, true),
  ('00000000-0000-0000-0000-000000000001', 'voz', 'frases_cortas', 'Frases cortas. La primera línea dice para qué sirve la pieza o qué problema resuelve.', 20, false, true),
  ('00000000-0000-0000-0000-000000000001', 'voz', 'precio_y_telefono', 'Siempre el precio de catálogo (RD$) y el teléfono 809-390-5965. Nunca el código interno.', 30, false, true),
  ('00000000-0000-0000-0000-000000000001', 'voz', 'pocos_emojis', 'Máximo dos emojis y tres hashtags por texto.', 40, false, true),
  ('00000000-0000-0000-0000-000000000001', 'voz', 'sin_promesas_falsas', 'No digas "solo hoy", "últimas unidades" ni "garantía" si no es verdad.', 50, false, true)
ON CONFLICT (tenant_id, tipo, clave) DO NOTHING;

COMMIT;

SELECT public.registrar_migracion('equipo_ia_competir.sql');
