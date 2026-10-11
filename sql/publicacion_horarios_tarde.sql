-- =====================================================================
-- PUBLICACIÓN DIARIA: HORARIOS HASTA LAS 9 PM (Morla: 1:30, 5:30 y 7:30 pm)
-- =====================================================================
-- (11/10/2026) El dueño cambia la regla del 05/10 ("entre 8 am y 5 pm").
-- El análisis de alcance mostró que las publicaciones de la mañana casi no
-- se ven; las de la tarde y la noche, sí. El rango permitido pasa a 8:00 am –
-- 9:00 pm y Morla queda en 13:30, 17:30 y 19:30.
-- El arte se encarga 30 min antes: el worker del Creativo en la PC tiene que
-- estar encendido hasta las ~7:30 pm (Hermes revisa cada 5 min, a toda hora).
-- Deshacer: horarios '{09:30,12:30,15:30}' y volver el CHECK a 17:00.
-- =====================================================================

BEGIN;

ALTER TABLE public.equipo_auto_publicacion DROP CONSTRAINT IF EXISTS equipo_auto_horarios_chk;
ALTER TABLE public.equipo_auto_publicacion ADD CONSTRAINT equipo_auto_horarios_chk
  CHECK (array_length(horarios, 1) = 3 AND '08:00' <= ALL(horarios) AND '21:00' >= ALL(horarios));

CREATE OR REPLACE FUNCTION public.equipo_auto_configurar(p_activo boolean, p_modo text DEFAULT NULL::text, p_hora time without time zone DEFAULT NULL::time without time zone, p_horarios time without time zone[] DEFAULT NULL::time without time zone[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
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
    IF array_length(p_horarios, 1) <> 3 OR NOT ('08:00' <= ALL(p_horarios) AND '21:00' >= ALL(p_horarios)) THEN
      RAISE EXCEPTION 'Son 3 horas entre las 8:00 am y las 9:00 pm.';
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

UPDATE public.equipo_auto_publicacion
   SET horarios = '{13:30,17:30,19:30}', updated_at = now()
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001';

COMMIT;

SELECT tenant_id, horarios FROM public.equipo_auto_publicacion;
SELECT public.registrar_migracion('publicacion_horarios_tarde.sql');
