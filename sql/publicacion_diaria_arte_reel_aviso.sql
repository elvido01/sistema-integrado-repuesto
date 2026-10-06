-- =====================================================================
-- PUBLICACIÓN DIARIA: A SU HORA, ARTE + REEL + AVISO AL DUEÑO
-- =====================================================================
-- (06/10/2026) El dueño: "cuando llegue la hora Hermes tiene que mandar a
-- hacer el arte y el reel y además notificarme para que yo lo mande a
-- publicar; eso será durante los 30 días de prueba".
--
--   hora de elegir (7:30)        → elige las 3 y la hora de cada una (sin encargar)
--   30 min antes de cada hora    → encarga el arte (igual que el Paso 1, sin descuento)
--   llega el arte con su guion   → pide el reel con el guion del Creativo (sin revisión)
--   arte + reel listos (o el reel
--   falla / tarda > 25 min)      → Hermes avisa por su chat y en la campanita
--
-- Todo lo mueve hermes.equipo_auto_del_dia_todos(), que el worker del
-- Creativo llama cada 5 minutos. Si la pieza ya se mandó a publicar por otra
-- vía, no se pide reel ni se avisa.
-- =====================================================================

ALTER TABLE public.equipo_auto_elegidas
  ADD COLUMN IF NOT EXISTS encargada_at timestamptz,
  ADD COLUMN IF NOT EXISTS reel_pedido_id uuid,
  ADD COLUMN IF NOT EXISTS reel_pedido_at timestamptz,
  ADD COLUMN IF NOT EXISTS avisado_at timestamptz;

-- Los avisos de la publicación diaria llevan su propio origen en el chat de Hermes.
ALTER TABLE public.hermes_chat DROP CONSTRAINT IF EXISTS hermes_chat_surface_chk;
ALTER TABLE public.hermes_chat ADD CONSTRAINT hermes_chat_surface_chk CHECK (
  source_surface IS NULL OR source_surface = ANY (ARRAY['web', 'mobile', 'whatsapp', 'telegram', 'api',
    'centinela', 'hermes_vps', 'publicacion_diaria']));

-- Las de hoy que ya se encargaron con la versión anterior cuentan como encargadas.
UPDATE public.equipo_auto_elegidas SET encargada_at = created_at
 WHERE trabajo_id IS NOT NULL AND encargada_at IS NULL;

CREATE OR REPLACE FUNCTION public._equipo_auto_del_dia(p_tenant uuid, p_forzar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
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
  v_trabajo uuid;
  v_hechas jsonb := '[]'::jsonb;
  v_usados uuid[] := '{}';
BEGIN
  SELECT * INTO cfg FROM public.equipo_auto_publicacion WHERE tenant_id = p_tenant;
  IF NOT FOUND OR (NOT cfg.activo AND NOT p_forzar) THEN
    RETURN jsonb_build_object('ok', true, 'hecho', false, 'motivo', 'apagado');
  END IF;
  IF NOT p_forzar AND v_ahora < cfg.hora_local THEN
    RETURN jsonb_build_object('ok', true, 'hecho', false, 'motivo', 'todavía no es la hora');
  END IF;

  v_cands := public._equipo_candidatos_de(p_tenant, 1000);

  FOR rr IN SELECT t.value AS rg, t.ord FROM jsonb_array_elements(cfg.rangos) WITH ORDINALITY AS t(value, ord) LOOP
    rg := rr.rg;
    -- La hora de salida rota cada día entre los rangos: así se aprende qué
    -- hora le va a cada tipo de pieza (sql/publicacion_tres_horarios.sql).
    v_hora := cfg.horarios[1 + ((rr.ord - 1 + extract(doy FROM v_hoy)::int) % array_length(cfg.horarios, 1))];
    -- Ya hecha hoy para este rango: no se repite.
    IF EXISTS (SELECT 1 FROM public.equipo_auto_elegidas
                WHERE tenant_id = p_tenant AND fecha = v_hoy AND rango = rg->>'nombre') THEN
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
      INSERT INTO public.equipo_auto_elegidas (tenant_id, fecha, rango, nota)
      VALUES (p_tenant, v_hoy, rg->>'nombre', 'sin candidata en este rango (faltan fotos o ya salieron en 14 días)')
      ON CONFLICT DO NOTHING;
      v_hechas := v_hechas || jsonb_build_object('rango', rg->>'nombre', 'pieza', NULL);
      CONTINUE;
    END IF;

    -- (06/10/2026) Aquí solo se ELIGE. El arte y el reel se encargan 30 min
    -- antes de su hora (_equipo_auto_avanzar), para que lleguen listos.
    v_trabajo := NULL;
    v_usados := v_usados || (v_pick->>'id')::uuid;
    INSERT INTO public.equipo_auto_elegidas (tenant_id, fecha, rango, producto_id, trabajo_id, nota, hora_publicar)
    VALUES (p_tenant, v_hoy, rg->>'nombre', (v_pick->>'id')::uuid, v_trabajo, v_pick->>'razon', v_hora)
    ON CONFLICT DO NOTHING;
    v_hechas := v_hechas || jsonb_build_object('rango', rg->>'nombre', 'pieza', v_pick->>'descripcion', 'trabajo_id', v_trabajo, 'hora', v_hora);
    v_pick := NULL;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'hecho', true, 'fecha', v_hoy, 'elegidas', v_hechas);
END $function$;
REVOKE ALL ON FUNCTION public._equipo_auto_del_dia(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- ── Mueve las del día: encargar, pedir reel, avisar ──
CREATE OR REPLACE FUNCTION public._equipo_auto_avanzar(p_tenant uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
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
      E'📣 **Lista para publicar** — %s (RD$%s)\nHora prevista: %s · rango %s.\n%s\n\nEntra a Equipo IA → Publicación diaria con Hermes → "Revisar en el Paso 2", acepta y pulsa **Programar** (la hora ya viene puesta). Sin descuento.',
      v_prod.descripcion, to_char(v_prod.precio, 'FM999G999G990'), v_hora12, e.rango,
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
REVOKE ALL ON FUNCTION public._equipo_auto_avanzar(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION hermes.equipo_auto_del_dia_todos()
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a record;
  v_res jsonb := '[]'::jsonb;
  v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_sel jsonb;
  v_av jsonb;
BEGIN
  FOR a IN SELECT * FROM public.equipo_auto_publicacion WHERE activo LOOP
    v_sel := NULL;
    IF (now() AT TIME ZONE 'America/Santo_Domingo')::time >= a.hora_local
       AND (SELECT count(*) FROM public.equipo_auto_elegidas e
             WHERE e.tenant_id = a.tenant_id AND e.fecha = v_hoy) < jsonb_array_length(a.rangos) THEN
      v_sel := public._equipo_auto_del_dia(a.tenant_id, false);
    END IF;
    v_av := public._equipo_auto_avanzar(a.tenant_id);
    IF v_sel IS NOT NULL OR jsonb_array_length(v_av) > 0 THEN
      v_res := v_res || jsonb_build_object('tenant', a.tenant_id, 'r', v_sel, 'avance', v_av);
    END IF;
  END LOOP;
  RETURN v_res;
END $function$;
REVOKE ALL ON FUNCTION hermes.equipo_auto_del_dia_todos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.equipo_auto_del_dia_todos() TO hermes_readonly;

-- "Elegir las de hoy ahora": elige y avanza lo que ya toque (no espera al worker).
CREATE OR REPLACE FUNCTION public.equipo_auto_elegir_ahora()
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_sel jsonb;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN RAISE EXCEPTION 'Este módulo es del dueño.'; END IF;
  INSERT INTO public.equipo_auto_publicacion (tenant_id) VALUES (public.get_user_tenant()) ON CONFLICT DO NOTHING;
  v_sel := public._equipo_auto_del_dia(public.get_user_tenant(), true);
  RETURN v_sel || jsonb_build_object('avance', public._equipo_auto_avanzar(public.get_user_tenant()));
END $function$;
REVOKE ALL ON FUNCTION public.equipo_auto_elegir_ahora() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_auto_elegir_ahora() TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('publicacion_diaria_arte_reel_aviso.sql');
