-- =====================================================================
-- REEL CON TUS PROPIOS VIDEOS
-- ---------------------------------------------------------------------
-- (2026-10-04) Idea del dueño: subir videos grabados con el teléfono y que
-- el sistema les ponga guion, voz en off, letras, música y cierre. Mejor que
-- las tomas hechas con IA: es la pieza real, y solo se paga la voz.
--
--  · Bucket público equipo-clips (300 MB por archivo, solo video), carpeta
--    de la empresa; sube y borra solo el dueño de Equipo IA. Público porque
--    el worker de la PC lo baja sin llave y el reel final es público igual.
--    El límite global del proyecto se subió a 300 MB el mismo día.
--  · equipo_encargar_promocion gana p_clips (URLs): se BORRA la de 4
--    argumentos antes de crear la de 5 (otra firma = sobrecarga). La
--    petición lleva "VIDEO DEL DUEÑO" y una línea "Clip N: url" por clip.
--  · El Creativo mira los clips y escribe el guion con tomas "Clip N +
--    momento"; el montador recorta y une los clips (scripts/armarReel.mjs).
-- =====================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('equipo-clips', 'equipo-clips', true, 314572800,
        ARRAY['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/x-m4v'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS equipo_clips_subir ON storage.objects;
CREATE POLICY equipo_clips_subir ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'equipo-clips' AND (storage.foldername(name))[1] = public.get_user_tenant()::text
              AND public.equipo_ia_permitido());
DROP POLICY IF EXISTS equipo_clips_ver ON storage.objects;
CREATE POLICY equipo_clips_ver ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'equipo-clips' AND (storage.foldername(name))[1] = public.get_user_tenant()::text
         AND public.equipo_ia_permitido());
DROP POLICY IF EXISTS equipo_clips_cambiar ON storage.objects;
CREATE POLICY equipo_clips_cambiar ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'equipo-clips' AND (storage.foldername(name))[1] = public.get_user_tenant()::text
         AND public.equipo_ia_permitido());
DROP POLICY IF EXISTS equipo_clips_borrar ON storage.objects;
CREATE POLICY equipo_clips_borrar ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'equipo-clips' AND (storage.foldername(name))[1] = public.get_user_tenant()::text
         AND public.equipo_ia_permitido());

DROP FUNCTION IF EXISTS public.equipo_encargar_promocion(uuid[], text, text, boolean);

CREATE OR REPLACE FUNCTION public.equipo_encargar_promocion(p_producto_ids uuid[], p_enfoque text DEFAULT NULL::text, p_formato text DEFAULT 'historia'::text, p_con_descuento boolean DEFAULT true, p_clips text[] DEFAULT NULL::text[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant  uuid := public.get_user_tenant();
  v_n       int;
  v_titulo  text;
  v_cuerpo  text := '';
  v_codigos text := '';
  v_pet     text;
  v_idem    text;
  v_abierto json;
  v_trabajo uuid;
  v_encargo json;
  v_dup     boolean;
  r         record;
  v_clip    text;
  v_lineas_clips text := '';
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Este módulo es del dueño.';
  END IF;

  SELECT count(*) INTO v_n FROM unnest(COALESCE(p_producto_ids, '{}'::uuid[]));
  IF v_n = 0 THEN
    RAISE EXCEPTION 'No elegiste ningún producto.';
  END IF;
  IF v_n > 2 THEN
    RAISE EXCEPTION 'Máximo dos productos por promoción.';
  END IF;
  IF p_formato NOT IN ('historia', 'feed') THEN
    RAISE EXCEPTION 'Formato no admitido: %', p_formato;
  END IF;

  FOR r IN
    SELECT p.codigo, p.descripcion, p.precio, p.imagen_url
    FROM public.productos p
    WHERE p.tenant_id = v_tenant AND p.id = ANY(p_producto_ids)
    ORDER BY p.precio DESC
  LOOP
    v_cuerpo := v_cuerpo || format(
      E'· %s (código %s). Precio de catálogo: RD$ %s.\n',
      r.descripcion, r.codigo, to_char(r.precio, 'FM999G999G990D00'));
    v_codigos := v_codigos || r.codigo || '|';
    v_titulo := COALESCE(v_titulo, r.descripcion);
  END LOOP;

  -- (04/10/2026) Los videos del dueño: solo del bucket equipo-clips de SU
  -- empresa, y como mucho 4. El Creativo los encuentra por la línea "Clip N:".
  IF COALESCE(array_length(p_clips, 1), 0) > 4 THEN
    RAISE EXCEPTION 'Máximo 4 clips por reel.';
  END IF;
  FOREACH v_clip IN ARRAY COALESCE(p_clips, '{}'::text[]) LOOP
    IF v_clip NOT LIKE 'https://zdvxowpuklbypweyqqki.supabase.co/storage/v1/object/public/equipo-clips/' || v_tenant::text || '/%' THEN
      RAISE EXCEPTION 'Ese video no está en el almacenamiento de la empresa.';
    END IF;
    v_lineas_clips := v_lineas_clips || format(E'\nClip %s: %s', array_position(p_clips, v_clip), v_clip);
  END LOOP;

  IF v_cuerpo = '' THEN
    RAISE EXCEPTION 'Esos productos no son de esta empresa.';
  END IF;

  v_pet := 'Prepara la promoción de:' || E'\n' || v_cuerpo
    || COALESCE(E'\nEnfoque pedido: ' || NULLIF(btrim(p_enfoque), '') || E'\n', '')
    || format(E'\nFormato principal: %s.', p_formato)
    -- (04/10/2026) El dueño no siempre quiere competir por precio. El
    -- Creativo lee esta línea (scripts/equipo-worker.mjs) y, con NO, no
    -- menciona descuento ni código en textos, guion ni cierre del reel.
    || CASE WHEN COALESCE(p_con_descuento, true)
            THEN E'\nDescuento: SÍ (código de 5% por red).'
            ELSE E'\nDescuento: NO. Esta promoción NO ofrece descuento: no menciones descuento, rebaja ni código.' END
    || CASE WHEN v_lineas_clips <> ''
            THEN E'\nVIDEO DEL DUEÑO: el reel se hace con SUS clips (no se generan tomas).' || v_lineas_clips
            ELSE '' END
    || E'\n\nEntrega un BORRADOR para aprobación: no publiques nada.';

  -- El día, en hora local. Sin esto la clave sale del contenido de la
  -- petición —que para la misma pieza es siempre igual— y la promoción de
  -- hace dos semanas se come la de hoy.
  v_idem := 'promo-panel:' || v_tenant::text || ':' || v_codigos
         || ':' || p_formato || CASE WHEN COALESCE(p_con_descuento, true) THEN '' ELSE ':sin-descuento' END
         || ':' || md5(COALESCE(btrim(p_enfoque), '') || COALESCE(array_to_string(p_clips, ','), ''))
         || ':' || (now() AT TIME ZONE 'America/Santo_Domingo')::date::text;

  v_abierto := hermes.equipo_abrir_trabajo(
    p_tenant   => v_tenant,
    p_titulo   => 'Promoción ' || left(v_titulo, 120),
    p_peticion => v_pet,
    p_tipo     => 'promocion',
    p_origin_platform => 'panel',
    p_solicitado_por => auth.uid(),
    p_idempotency_key => v_idem);

  v_trabajo := (v_abierto ->> 'trabajo_id')::uuid;

  -- El encargo va derecho al creativo. Si ya existía y murió, revive.
  v_encargo := hermes.equipo_encargar_a(v_trabajo, 'comercial_creativo', 1, hermes.equipo_brief_arte(v_tenant, v_pet));

  -- Duplicado de verdad: el trabajo ya existía Y el encargo tampoco se movió.
  -- Si el encargo revivió, esto SÍ hizo algo y no debe decir lo contrario.
  v_dup := COALESCE((v_abierto ->> 'duplicado')::boolean, false)
       AND COALESCE((v_encargo ->> 'duplicado')::boolean, false);

  RETURN json_build_object('ok', true, 'trabajo_id', v_trabajo,
                           'duplicado', v_dup,
                           'revivido', COALESCE((v_encargo ->> 'revivido')::boolean, false),
                           'trabajo', v_abierto, 'encargo', v_encargo);
END $function$;
REVOKE ALL ON FUNCTION public.equipo_encargar_promocion(uuid[], text, text, boolean, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_encargar_promocion(uuid[], text, text, boolean, text[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('reel_con_tus_videos.sql');
