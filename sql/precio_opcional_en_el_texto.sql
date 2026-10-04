-- =====================================================================
-- EL PRECIO EN EL TEXTO: OPCIONAL, PERO NUNCA EQUIVOCADO
-- ---------------------------------------------------------------------
-- (2026-10-04) Publicar el Havoline (RD$ 399.98) falló con "El texto de
-- facebook no dice el precio (399.98)" aunque lo decía: se buscaba "400".
-- Y el dueño pidió que el precio no sea obligatorio. Copia de producción de
-- promo_crear con solo ese cambio (misma firma). La pantalla aplica la
-- misma regla (PromocionPublicar.jsx, precioEquivocado).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.promo_crear(p_titulo text, p_producto_id uuid, p_precio numeric, p_textos jsonb, p_media jsonb, p_destinos jsonb, p_idempotency_key text DEFAULT NULL::text, p_design_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tenant     uuid;
  v_bundle     uuid;
  -- La clave de idempotencia es NOT NULL en la tabla: si no la dan, se pone
  -- una. Sin ella el insert revienta con un mensaje que no dice nada.
  v_key        text := coalesce(nullif(trim(coalesce(p_idempotency_key, '')), ''), 'promo-' || gen_random_uuid()::text);
  v_destino    jsonb;
  v_plat       text;
  v_place      text;
  v_texto      text;
  v_precio_txt text;
  v_img_feed   text := nullif(p_media->>'imagen_feed', '');
  v_img_hist   text := nullif(p_media->>'imagen_historia', '');
  v_video      text := nullif(p_media->>'video', '');
  v_design     uuid := p_design_id;
  v_habil      boolean;
  v_bloqueo    text;
  v_job        uuid;
  v_jobs       uuid[] := '{}';
  v_places     text[];
  v_place_job  text;
  v_media_tipo text;
  v_media_url  text;
  v_grupo      text;
  v_grupos_red int;
begin
  v_tenant := public.promo_tenant_admin();

  -- Idempotencia: la misma clave no crea una promoción nueva.
  if v_key is not null then
    select publication_bundle_id into v_bundle
      from public.hermes_publication_jobs
     where tenant_id = v_tenant and idempotency_key like v_key || ':%'
     limit 1;
    if v_bundle is not null then
      return jsonb_build_object('bundle_id', v_bundle, 'ya_existia', true);
    end if;
  end if;

  if p_destinos is null or jsonb_typeof(p_destinos) <> 'array' or jsonb_array_length(p_destinos) = 0 then
    raise exception 'Hay que decir a qué destinos va la promoción.';
  end if;
  if nullif(trim(coalesce(p_titulo, '')), '') is null then
    raise exception 'La promoción necesita un título.';
  end if;

  -- (04/10/2026) El precio ya NO es obligatorio en el texto (decisión del
  -- dueño: "en algún momento puedo publicar sin poner el precio"). Lo que sí
  -- se prohíbe es un precio EQUIVOCADO: cada monto escrito con RD$ o $ tiene
  -- que ser el del catálogo, exacto (399.98) o redondeado (400 / 399).
  -- Antes se exigía el entero redondeado ("400") y un texto con "399.98"
  -- correcto se rechazaba.

  for v_destino in select * from jsonb_array_elements(p_destinos) loop
    v_plat  := v_destino->>'platform';
    v_place := v_destino->>'placement';
    if v_plat not in ('facebook','instagram','tiktok','youtube') then
      raise exception 'Red desconocida: %', v_plat;
    end if;
    if v_place not in ('feed','story','reel','short') then
      raise exception 'Formato desconocido: %', v_place;
    end if;

    v_texto := nullif(trim(coalesce(p_textos->>v_plat, '')), '');
    if v_texto is null then
      raise exception 'Falta el texto de %. Cada red lleva el suyo.', v_plat;
    end if;
    if p_precio is not null and p_precio > 0 then
      select m[1] into v_precio_txt
        from regexp_matches(v_texto, '(?:RD\s*\$|\$)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)', 'gi') as m
       where abs(replace(m[1], ',', '')::numeric - p_precio) >= 0.01
         and replace(m[1], ',', '')::numeric not in (round(p_precio), trunc(p_precio))
       limit 1;
      if v_precio_txt is not null then
        raise exception 'El texto de % dice RD$ % y el precio del catálogo es RD$ %. Corrígelo o quita el precio del texto.',
          v_plat, v_precio_txt, to_char(p_precio, 'FM999G999G990D00');
      end if;
    end if;
  end loop;

  -- Medios: cada formato pedido necesita el suyo.
  if exists (select 1 from jsonb_array_elements(p_destinos) d where d->>'placement' = 'feed') and v_img_feed is null then
    raise exception 'Falta la imagen del feed.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_destinos) d where d->>'placement' = 'story') and v_img_hist is null then
    raise exception 'Falta la imagen de la historia.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_destinos) d where d->>'placement' in ('reel','short')) and v_video is null then
    raise exception 'Falta el video vertical.';
  end if;

  v_bundle := gen_random_uuid();

  -- >>> UN TRABAJO POR RED <<<
  -- Los destinos NO se insertan a mano: el disparador
  -- hermes_publication_jobs_sync_targets ya los deriva de channels x placement
  -- y, cuando uno ya esta publicado, su ON CONFLICT lo deja en paz. Meterlos a
  -- mano chocaba con la clave unica (job_id, platform, placement).
  -- Uno por red, ademas, porque el texto (caption) es de la red, no de la
  -- promocion: asi cada una lleva el suyo de verdad.
  -- (04/10/2026) Y uno por TIPO dentro de la red: imagenes (feed/historia)
  -- y video (reel/short). Antes Instagram con feed + historia + reel se
  -- juntaba en un trabajo 'both' de imagen y el reel se perdia callado.
  for v_plat, v_grupo in
    select distinct d->>'platform',
           case when d->>'placement' in ('reel','short') then 'video' else 'imagen' end
      from jsonb_array_elements(p_destinos) d
  loop
    select array_agg(distinct d->>'placement') into v_places
      from jsonb_array_elements(p_destinos) d
     where d->>'platform' = v_plat
       and (case when d->>'placement' in ('reel','short') then 'video' else 'imagen' end) = v_grupo;
    select count(distinct case when d->>'placement' in ('reel','short') then 'video' else 'imagen' end)
      into v_grupos_red
      from jsonb_array_elements(p_destinos) d where d->>'platform' = v_plat;

    if v_places @> array['feed','story'] then
      v_place_job := 'both';
    else
      v_place_job := v_places[1];
    end if;

    if v_place_job in ('feed','story','both') then
      v_media_tipo := 'image';
      v_media_url := case when v_place_job = 'story'
                          then coalesce(v_img_hist, v_img_feed)
                          else coalesce(v_img_feed, v_img_hist) end;
      -- El arte necesita su ficha: la restriccion de la tabla no deja
      -- programar una imagen sin design_id, y es una buena regla — asi el arte
      -- queda guardado y no es una URL suelta que nadie sabe de donde salio.
      if v_design is null then
        insert into public.design_documents (tenant_id, name, content, status, rendered_url, thumbnail_url, producto_id)
        values (v_tenant, p_titulo, jsonb_build_object('origen','promocion_equipo_ia'), 'listo',
                coalesce(v_img_feed, v_img_hist), coalesce(v_img_feed, v_img_hist), p_producto_id)
        returning id into v_design;
      end if;
    else
      v_media_tipo := 'video';
      v_media_url := v_video;
    end if;

    insert into public.hermes_publication_jobs (
      tenant_id, producto_id, design_id, requested_by, title, caption, channels, placement,
      approval_status, status, media_type, media_url, image_url,
      precio_mostrado, textos, idempotency_key, publication_bundle_id, channel_config
    ) values (
      v_tenant, p_producto_id,
      case when v_media_tipo = 'image' then v_design else null end,
      auth.uid(), p_titulo, p_textos->>v_plat,
      array[v_plat], v_place_job,
      'draft', 'draft', v_media_tipo, v_media_url,
      case when v_media_tipo = 'image' then v_media_url else null end,
      p_precio, coalesce(p_textos, '{}'::jsonb),
      -- La clave de siempre (v_key:red); el video lleva ':video' solo cuando
      -- la misma red tiene tambien imagenes, para no chocar.
      case when v_key is null then null
           else v_key || ':' || v_plat || case when v_grupos_red > 1 and v_grupo = 'video' then ':video' else '' end end,
      v_bundle,
      jsonb_build_object('imagen_feed', v_img_feed, 'imagen_historia', v_img_hist, 'video', v_video,
        -- (04/10/2026) Sin descuento: el disparador no crea código.
        'sin_descuento', COALESCE((p_media->>'sin_descuento')::boolean, false))
    ) returning id into v_job;
    v_jobs := v_jobs || v_job;

    -- ¿Esa red puede publicar de verdad? Lo dice la ultima comprobacion contra
    -- la plataforma, no la palabra "connected" de la tabla.
    select coalesce(bool_or(publicacion_habilitada), false) into v_habil
      from public.social_accounts
     where tenant_id = v_tenant and platform = v_plat;

    v_bloqueo := case when v_habil then null
      else 'La cuenta de ' || v_plat || ' no esta autorizada para publicar (token vencido o sin conectar). '
           || 'Comprobar con scripts/social-estado.mjs.' end;

    update public.hermes_publication_targets t
       set bloqueo_motivo = v_bloqueo,
           idempotency_key = case when v_key is null then null
                                  else v_key || ':' || t.platform || ':' || t.placement end,
           updated_at = now()
     where t.job_id = v_job;
  end loop;

  insert into public.publicacion_auditoria (tenant_id, bundle_id, job_id, accion, actor, detalle)
  values (v_tenant, v_bundle, v_jobs[1], 'crear', auth.uid(),
          jsonb_build_object('titulo', p_titulo, 'destinos', p_destinos, 'precio', p_precio));

  return jsonb_build_object(
    'bundle_id', v_bundle,
    'trabajos', to_jsonb(v_jobs),
    'destinos', (select jsonb_agg(jsonb_build_object(
        'platform', t.platform, 'placement', t.placement,
        'status', t.status, 'bloqueo_motivo', t.bloqueo_motivo))
      from public.hermes_publication_targets t
      join public.hermes_publication_jobs j on j.id = t.job_id
      where j.publication_bundle_id = v_bundle)
  );
end;
$function$;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('precio_opcional_en_el_texto.sql');
