-- =====================================================================
-- PUBLICACIÓN DIARIA: TRES HORARIOS ENTRE 8 AM Y 5 PM
-- =====================================================================
-- (05/10/2026) El dueño: "las 3 publicaciones en automático tienen que ser
-- en 3 horarios diferentes durante las 8 am y las 5 pm".
-- Por defecto 9:30, 12:30 y 3:30 pm: un poco antes de los picos de venta
-- medidos (10–11 am y 3–6 pm). Cada pieza elegida guarda su hora
-- (equipo_auto_elegidas.hora_publicar) y la hora rota por día entre los
-- rangos. Mientras el dueño aprueba, el Paso 3 trae esa hora puesta.
-- =====================================================================

ALTER TABLE public.equipo_auto_publicacion
  ADD COLUMN IF NOT EXISTS horarios time[] NOT NULL DEFAULT '{09:30,12:30,15:30}';
DO $$ BEGIN
  ALTER TABLE public.equipo_auto_publicacion ADD CONSTRAINT equipo_auto_horarios_chk
    CHECK (array_length(horarios, 1) = 3 AND '08:00' <= ALL(horarios) AND '17:00' >= ALL(horarios));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.equipo_auto_elegidas ADD COLUMN IF NOT EXISTS hora_publicar time;

DROP FUNCTION IF EXISTS public.equipo_auto_configurar(boolean, text, time);
CREATE FUNCTION public.equipo_auto_configurar(
  p_activo boolean, p_modo text DEFAULT NULL, p_hora time DEFAULT NULL, p_horarios time[] DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_row public.equipo_auto_publicacion;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN RAISE EXCEPTION 'Este módulo es del dueño.'; END IF;
  IF p_modo IS NOT NULL AND p_modo NOT IN ('aprobar', 'automatico') THEN
    RAISE EXCEPTION 'Modo no admitido: %', p_modo;
  END IF;
  IF p_horarios IS NOT NULL THEN
    IF array_length(p_horarios, 1) <> 3 OR NOT ('08:00' <= ALL(p_horarios) AND '17:00' >= ALL(p_horarios)) THEN
      RAISE EXCEPTION 'Son 3 horas entre las 8:00 am y las 5:00 pm.';
    END IF;
    IF (SELECT count(DISTINCT h) FROM unnest(p_horarios) h) <> 3 THEN
      RAISE EXCEPTION 'Las 3 horas tienen que ser distintas.';
    END IF;
    p_horarios := ARRAY(SELECT h FROM unnest(p_horarios) h ORDER BY h);
  END IF;

  INSERT INTO public.equipo_auto_publicacion (tenant_id, activo, modo, hora_local, horarios, activado_at, updated_by)
  VALUES (v_tenant, COALESCE(p_activo, false), COALESCE(p_modo, 'aprobar'), COALESCE(p_hora, '07:30'),
          COALESCE(p_horarios, '{09:30,12:30,15:30}'), CASE WHEN p_activo THEN now() END, auth.uid())
  ON CONFLICT (tenant_id) DO UPDATE
     SET activo = COALESCE(p_activo, equipo_auto_publicacion.activo),
         modo = COALESCE(p_modo, equipo_auto_publicacion.modo),
         hora_local = COALESCE(p_hora, equipo_auto_publicacion.hora_local),
         horarios = COALESCE(p_horarios, equipo_auto_publicacion.horarios),
         activado_at = COALESCE(equipo_auto_publicacion.activado_at, CASE WHEN p_activo THEN now() END),
         updated_at = now(), updated_by = auth.uid()
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END $function$;
REVOKE ALL ON FUNCTION public.equipo_auto_configurar(boolean, text, time, time[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_auto_configurar(boolean, text, time, time[]) TO authenticated;

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

    v_trabajo := public._equipo_auto_encargar(p_tenant, (v_pick->>'id')::uuid, rg->>'nombre', cfg.formato);
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

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('publicacion_tres_horarios.sql');
