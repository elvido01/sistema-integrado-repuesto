-- =====================================================================
-- PUBLICACIÓN DIARIA: LA FRANJA VACÍA SE LLENA AUNQUE SU HORA HAYA PASADO
-- =====================================================================
-- (13/10/2026) Segunda parte de sql/publicacion_reintenta_franja_vacia.sql.
-- Hoy a "Más de RD$1,000" le tocaba la 1:30 pm; la foto del Asiento CG
-- Thermoliner (RD$3,643) se subió después y la franja siguió vacía, porque
-- solo se reintentaba si faltaba media hora para su salida.
-- Ahora se llena mientras quede día de publicaciones (hasta 30 min antes de
-- la última hora configurada) y sale 35 min después de llenarse.
-- =====================================================================

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
      CONTINUE WHEN v_vacia IS NOT NULL;  -- sigue vacía: ya tiene su nota
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
END $function$;;

SELECT public.registrar_migracion('publicacion_franja_vacia_misma_tarde.sql');
