-- =====================================================================
-- Publicación diaria: reutilizar publicaciones anteriores (21/11/2026)
-- ---------------------------------------------------------------------
-- El dueño: "hay que poner la manera de reutilizar imágenes de
-- publicaciones anteriores de manera semi automatizada".
--
-- Cuando a una franja del día no le queda pieza nueva ("sin candidata"),
-- Hermes la llena con una publicación YA HECHA de una pieza que:
--   · tiene existencia (1 basta) y sigue activa, en el rango de precio,
--   · no se ha mandado a publicar en 14 días ni se reutilizó en 14 días,
--   · se vende (las que más salen en 60 días van primero).
-- No se encarga arte nuevo: se usa el mismo arte (feed, historia y reel)
-- y en Equipo IA se escribe un texto nuevo con el precio de hoy.
-- Decisión del dueño: "el mismo arte, diferente texto" (aunque el precio
-- haya cambiado; el aviso dice qué precio trae el arte).
-- Nunca sale sola: llega a "Revisar y publicar" y el dueño la aprueba.
--
-- Base: las versiones de producción del 21/11/2026 de
-- _equipo_auto_del_dia y _equipo_auto_avanzar (no las del repo).
-- =====================================================================
BEGIN;

ALTER TABLE public.equipo_auto_elegidas
  ADD COLUMN IF NOT EXISTS reuso_bundle_id uuid;
COMMENT ON COLUMN public.equipo_auto_elegidas.reuso_bundle_id IS
  'Publicación anterior (publication_bundle_id) cuyo arte se reutiliza. NULL = pieza nueva con arte del Creativo.';

-- La mejor publicación anterior para reutilizar en un rango de precio.
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
       -- Nada mandado a publicar en 14 días (programado, publicándose o publicado).
       AND NOT EXISTS (
             SELECT 1 FROM public.hermes_publication_jobs j2
              WHERE j2.tenant_id = p_tenant AND j2.producto_id = p.id
                AND j2.status NOT IN ('draft', 'failed', 'cancelled', 'rejected')
                AND COALESCE(j2.scheduled_for, j2.created_at) > now() - interval '14 days')
       -- Ni propuesta para reutilizar en 14 días (aunque no se haya publicado).
       AND NOT EXISTS (
             SELECT 1 FROM public.equipo_auto_elegidas e
              WHERE e.tenant_id = p_tenant AND e.producto_id = p.id
                AND e.reuso_bundle_id IS NOT NULL
                AND e.fecha > (now() AT TIME ZONE 'America/Santo_Domingo')::date - 14)
       -- Lo que el dueño sacó a mano de las promociones automáticas.
       AND NOT EXISTS (
             SELECT 1 FROM public.marketing_promocion_manual m
              WHERE m.tenant_id = p_tenant AND m.producto_id = p.id
                AND (m.permanente OR m.fecha > now() - interval '14 days'))
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
REVOKE ALL ON FUNCTION public._equipo_reusable(uuid, numeric, numeric, uuid[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._equipo_auto_del_dia(p_tenant uuid, p_forzar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cfg public.equipo_auto_publicacion;
  v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_ahora time := (now() AT TIME ZONE 'America/Santo_Domingo')::time;
  v_cands jsonb;
  rr record;
  rg jsonb;
  v_hora time;
  v_pick jsonb;
  v_reuso jsonb;
  v_trabajo uuid;
  v_hechas jsonb := '[]'::jsonb;
  v_usados uuid[] := '{}';
  v_vacia uuid;
BEGIN
  SELECT * INTO cfg FROM public.equipo_auto_publicacion WHERE tenant_id = p_tenant;
  IF NOT FOUND OR (NOT cfg.activo AND NOT p_forzar) THEN
    RETURN jsonb_build_object('ok', true, 'hecho', false, 'motivo', 'apagado');
  END IF;
  IF NOT p_forzar AND v_ahora < cfg.hora_local THEN
    RETURN jsonb_build_object('ok', true, 'hecho', false, 'motivo', 'todavía no es la hora');
  END IF;

  v_cands := public._equipo_candidatos_de(p_tenant, 1000);
  -- Lo ya elegido hoy no se repite en otra franja.
  SELECT coalesce(array_agg(producto_id), '{}') INTO v_usados
    FROM public.equipo_auto_elegidas
   WHERE tenant_id = p_tenant AND fecha = v_hoy AND producto_id IS NOT NULL;

  FOR rr IN SELECT t.value AS rg, t.ord FROM jsonb_array_elements(cfg.rangos) WITH ORDINALITY AS t(value, ord) LOOP
    rg := rr.rg;
    -- La hora de salida rota cada día entre los rangos: así se aprende qué
    -- hora le va a cada tipo de pieza (sql/publicacion_tres_horarios.sql).
    v_hora := cfg.horarios[1 + ((rr.ord - 1 + extract(doy FROM v_hoy)::int) % array_length(cfg.horarios, 1))];
    -- Ya hecha hoy para este rango (con pieza): no se repite.
    IF EXISTS (SELECT 1 FROM public.equipo_auto_elegidas
                WHERE tenant_id = p_tenant AND fecha = v_hoy AND rango = rg->>'nombre'
                  AND producto_id IS NOT NULL) THEN
      CONTINUE;
    END IF;
    -- (13/10/2026) Franja que quedó vacía a la hora de elegir: se vuelve a
    -- buscar (por ejemplo, después de subir fotos). Si su hora ya pasó, sale
    -- 35 min después de llenarse, mientras quede día de publicaciones (hasta
    -- media hora antes de la última hora). El botón "Elegir ahora" la llena
    -- a cualquier hora.
    SELECT id INTO v_vacia FROM public.equipo_auto_elegidas
     WHERE tenant_id = p_tenant AND fecha = v_hoy AND rango = rg->>'nombre' AND producto_id IS NULL;
    IF v_vacia IS NOT NULL AND NOT p_forzar
       AND v_ahora > (SELECT max(h) FROM unnest(cfg.horarios) h) - interval '30 minutes' THEN
      CONTINUE;
    END IF;

    -- La primera del rango en el orden del Paso 1 (lo que se vende, anuncio
    -- del suplidor, foto nueva...). Nunca por debajo del precio mínimo.
    SELECT c INTO v_pick
      FROM jsonb_array_elements(v_cands) WITH ORDINALITY AS t(c, ord)
     WHERE (c->>'precio')::numeric >= GREATEST(cfg.precio_minimo, (rg->>'desde')::numeric)
       AND (rg->>'hasta' IS NULL OR (c->>'precio')::numeric <= (rg->>'hasta')::numeric)
       AND NOT ((c->>'id')::uuid = ANY(v_usados))
     ORDER BY ord
     LIMIT 1;

    IF v_pick IS NULL THEN
      -- (21/11/2026) Sin pieza nueva: una publicación anterior que se vende,
      -- con el mismo arte. Sin arte que encargar; el dueño la aprueba.
      v_reuso := public._equipo_reusable(p_tenant, GREATEST(cfg.precio_minimo, (rg->>'desde')::numeric),
                                         (rg->>'hasta')::numeric, v_usados);
      IF v_reuso IS NOT NULL THEN
        v_usados := v_usados || (v_reuso->>'id')::uuid;
        IF v_vacia IS NOT NULL THEN
          UPDATE public.equipo_auto_elegidas
             SET producto_id = (v_reuso->>'id')::uuid, reuso_bundle_id = (v_reuso->>'bundle_id')::uuid,
                 objetivo = 'venta', nota = v_reuso->>'razon',
                 hora_publicar = CASE WHEN v_ahora > v_hora - interval '30 minutes'
                                      THEN (date_trunc('minute', now() AT TIME ZONE 'America/Santo_Domingo') + interval '35 minutes')::time
                                      ELSE v_hora END
           WHERE id = v_vacia;
        ELSE
          INSERT INTO public.equipo_auto_elegidas (tenant_id, fecha, rango, producto_id, nota, hora_publicar, reuso_bundle_id, objetivo)
          VALUES (p_tenant, v_hoy, rg->>'nombre', (v_reuso->>'id')::uuid, v_reuso->>'razon', v_hora,
                  (v_reuso->>'bundle_id')::uuid, 'venta')
          ON CONFLICT DO NOTHING;
        END IF;
        v_hechas := v_hechas || jsonb_build_object('rango', rg->>'nombre', 'pieza', v_reuso->>'descripcion', 'reuso', true);
        v_reuso := NULL;
        v_vacia := NULL;
        CONTINUE;
      END IF;

      CONTINUE WHEN v_vacia IS NOT NULL;  -- sigue vacía: ya tiene su nota
      INSERT INTO public.equipo_auto_elegidas (tenant_id, fecha, rango, nota)
      VALUES (p_tenant, v_hoy, rg->>'nombre', 'sin candidata en este rango (faltan fotos o ya salieron hace poco, y no hay publicación anterior para reutilizar)')
      ON CONFLICT DO NOTHING;
      v_hechas := v_hechas || jsonb_build_object('rango', rg->>'nombre', 'pieza', NULL);
      CONTINUE;
    END IF;

    -- (06/10/2026) Aquí solo se ELIGE. El arte y el reel se encargan 30 min
    -- antes de su hora (_equipo_auto_avanzar), para que lleguen listos.
    v_trabajo := NULL;
    v_usados := v_usados || (v_pick->>'id')::uuid;
    IF v_vacia IS NOT NULL THEN
      UPDATE public.equipo_auto_elegidas
         SET producto_id = (v_pick->>'id')::uuid, nota = v_pick->>'razon',
             hora_publicar = CASE WHEN v_ahora > v_hora - interval '30 minutes'
                                  THEN (date_trunc('minute', now() AT TIME ZONE 'America/Santo_Domingo') + interval '35 minutes')::time
                                  ELSE v_hora END
       WHERE id = v_vacia;
      v_hechas := v_hechas || jsonb_build_object('rango', rg->>'nombre', 'pieza', v_pick->>'descripcion', 'reintento', true);
      v_pick := NULL;
      v_vacia := NULL;
      CONTINUE;
    END IF;
    INSERT INTO public.equipo_auto_elegidas (tenant_id, fecha, rango, producto_id, trabajo_id, nota, hora_publicar)
    VALUES (p_tenant, v_hoy, rg->>'nombre', (v_pick->>'id')::uuid, v_trabajo, v_pick->>'razon', v_hora)
    ON CONFLICT DO NOTHING;
    v_hechas := v_hechas || jsonb_build_object('rango', rg->>'nombre', 'pieza', v_pick->>'descripcion', 'trabajo_id', v_trabajo, 'hora', v_hora);
    v_pick := NULL;
    v_vacia := NULL;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'hecho', true, 'fecha', v_hoy, 'elegidas', v_hechas);
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
  v_precio_arte numeric;
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

    -- (21/11/2026) Reutilizada: el arte ya existe. Se avisa 30 minutos antes
    -- de su hora para que el dueño revise el texto nuevo y la programe.
    IF e.reuso_bundle_id IS NOT NULL THEN
      IF v_ahora < COALESCE(e.hora_publicar, '08:00'::time) - interval '30 minutes' THEN
        CONTINUE;
      END IF;
      SELECT descripcion, precio, codigo INTO v_prod FROM public.productos WHERE id = e.producto_id;
      SELECT j.precio_mostrado INTO v_precio_arte
        FROM public.hermes_publication_jobs j
       WHERE j.publication_bundle_id = e.reuso_bundle_id AND j.precio_mostrado IS NOT NULL
       ORDER BY j.created_at DESC LIMIT 1;
      v_hora12 := to_char(e.hora_publicar, 'FMHH12:MI') || CASE WHEN e.hora_publicar < '12:00' THEN ' am' ELSE ' pm' END;
      v_txt := format(
        E'♻️ **Lista para publicar (reutilizada)** — %s (RD$%s)\nHora prevista: %s · rango %s.\nMismo arte de la publicación anterior, texto nuevo.%s\n\nEntra a Equipo IA → Hoy → "Revisar y publicar", revisa el texto y pulsa **Programar** (la hora ya viene puesta). Sin descuento.',
        v_prod.descripcion, to_char(v_prod.precio, 'FM999G999G990'), v_hora12, e.rango,
        CASE WHEN v_precio_arte IS NOT NULL AND round(v_precio_arte) <> round(v_prod.precio)
             THEN format(E'\n⚠️ El arte dice RD$%s y hoy cuesta RD$%s.', to_char(v_precio_arte, 'FM999G999G990'), to_char(v_prod.precio, 'FM999G999G990'))
             ELSE '' END);
      PERFORM public.hermes_decir(p_tenant, v_txt, NULL, 'publicacion_diaria');
      INSERT INTO public.notificaciones (tenant_id, user_id, tipo, titulo, mensaje, producto_id)
      SELECT p_tenant, pr.id, 'promo_lista', '♻️ Lista para publicar: ' || left(v_prod.descripcion, 60),
             format('Reutilizada (mismo arte, texto nuevo). Sale a las %s. Equipo IA → Hoy → Revisar y publicar.', v_hora12), e.producto_id
        FROM public.profiles pr
       WHERE pr.tenant_id = p_tenant AND pr.role IN ('owner', 'admin');
      UPDATE public.equipo_auto_elegidas SET avisado_at = now() WHERE id = e.id;
      v_hechos := v_hechos || jsonb_build_object('avisada', e.rango, 'reuso', true);
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
      E'📣 **Lista para publicar** — %s (RD$%s)\nHora prevista: %s · rango %s.%s\n%s\n\nEntra a Equipo IA → Hoy → Publicación diaria → "Revisar en el Paso 2", acepta y pulsa **Programar** (la hora ya viene puesta). Sin descuento.',
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
           format('Sale a las %s. Equipo IA → Hoy → Publicación diaria → Revisar en el Paso 2.', v_hora12), e.producto_id
      FROM public.profiles pr
     WHERE pr.tenant_id = p_tenant AND pr.role IN ('owner', 'admin');
    UPDATE public.equipo_auto_elegidas SET avisado_at = now() WHERE id = e.id;
    v_hechos := v_hechos || jsonb_build_object('avisada', e.rango);
  END LOOP;

  RETURN v_hechos;
END $function$;

COMMIT;

SELECT public.registrar_migracion('equipo_reusar_publicaciones.sql');
