-- =====================================================================
-- Piezas de la semana: el aviso usaba un canal que la base no acepta (01/11/2026)
-- ---------------------------------------------------------------------
-- hermes_chat solo admite source_surface en una lista fija; 'piezas_semana'
-- no está y el video ya armado y subido se marcaba como error (3 intentos
-- el 01/11). Ahora va por 'publicacion_diaria' y, si el aviso fallara por
-- otra cosa, el video queda listo igual.
-- Mismos argumentos que la versión viva.
-- =====================================================================

CREATE OR REPLACE FUNCTION hermes.equipo_semanal_listo(p_id uuid, p_video_url text, p_duracion numeric, p_avisos jsonb, p_guion jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v record;
  v_n int;
BEGIN
  IF p_video_url NOT LIKE 'https://zdvxowpuklbypweyqqki.supabase.co/storage/%' THEN
    RAISE EXCEPTION 'El video tiene que estar en el almacenamiento de MotoFlow.';
  END IF;
  UPDATE public.equipo_semanal
     SET estado = 'listo', video_url = p_video_url, duracion = p_duracion, avisos = p_avisos,
         guion = p_guion, listo_at = now(), error = NULL
   WHERE id = p_id AND estado = 'armando'
  RETURNING * INTO v;
  IF v.id IS NULL THEN RETURN json_build_object('ok', false); END IF;

  SELECT count(*) INTO v_n FROM jsonb_array_elements(v.piezas) x WHERE COALESCE((x ->> 'incluir')::boolean, true);
  -- El aviso no puede tumbar el video ya subido: si falla, se sigue.
  BEGIN
  PERFORM public.hermes_decir(v.tenant_id, format(
    E'🎬 **Piezas de la semana listo** — %s piezas, %s.\nEntra a Equipo IA → Piezas de la semana para verlo. Puedes quitar piezas o corregir lo que dice la voz, o aprobarlo para que salga el sábado.',
    v_n, CASE WHEN p_duracion >= 60 THEN format('%s min %s s', floor(p_duracion / 60), round(p_duracion) % 60)
              ELSE format('%s s', round(p_duracion)) END), NULL, 'publicacion_diaria');
  INSERT INTO public.notificaciones (tenant_id, user_id, tipo, titulo, mensaje)
  SELECT v.tenant_id, pr.id, 'promo_lista', '🎬 Piezas de la semana: listo para revisar',
         'Equipo IA → Piezas de la semana. Apruébalo para que salga el sábado.'
    FROM public.profiles pr
   WHERE pr.tenant_id = v.tenant_id AND pr.role IN ('owner', 'admin');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'piezas de la semana: el aviso falló: %', SQLERRM;
  END;
  RETURN json_build_object('ok', true);
END $function$;

-- El de hoy quedó en error por esto: vuelve a la cola.
UPDATE public.equipo_semanal
   SET estado = 'pendiente', intentos = 0, error = NULL
 WHERE estado = 'error' AND error LIKE '%hermes_chat_surface_chk%';

SELECT public.registrar_migracion('piezas_de_la_semana_aviso.sql');
