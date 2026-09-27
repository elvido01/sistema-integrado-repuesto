-- ═══════════════════════════════════════════════════════════════════════════
--  EQUIPO IA — PUBLICADOR PROPIO · FASE 1: la promoción y su cola
--  sql/equipo_ia_publicador_fase1.sql
-- ═══════════════════════════════════════════════════════════════════════════
--
--  >>> POR QUE ESTO NO INVENTA UNA COLA NUEVA <<<
--  Ya había uno. `hermes_publication_jobs` y `hermes_publication_targets` ya
--  son una fila por promoción y una fila por destino, con estado, error, id y
--  enlace propios; ya hay dos cron cada minuto (hermes.supervise_publications
--  y renotify_pending_publication_jobs) que sueltan lo programado, sueltan las
--  reclamaciones huérfanas, marcan como "sin confirmar" lo que el proveedor no
--  contestó, y deducen si una promoción está publicada MIRANDO SUS DESTINOS y
--  no la palabra de un trabajador. Eso se respeta entero.
--
--  Lo que le faltaba para ser el publicador que se pidió es esto:
--
--   1. La prueba de que una red PUEDE publicar. `status = 'connected'` es un
--      texto que alguien escribió el día que conectó la cuenta y que nadie
--      actualiza cuando el token se muere: el 27/09/2026 decía "connected" en
--      Facebook e Instagram con el token vencido desde el 11 de agosto. Ahora
--      la respuesta de la plataforma se guarda (publicacion_habilitada), la
--      escribe `node scripts/social-estado.mjs`, y NADA se programa a una red
--      que no lo tenga puesto.
--
--   2. Un destino sin autorizar no es un destino fallido. TikTok y YouTube no
--      pueden publicar en público hasta pasar sus auditorías — sus propias
--      documentaciones lo dicen: "all content posted by unaudited clients will
--      be restricted to private viewing mode". Un destino así lleva
--      `bloqueo_motivo` y se queda fuera de la cola, a la vista, sin fingir
--      que falló ni que salió.
--
--   3. Lo publicado no se reescribe. No había nada que lo impidiera: un
--      UPDATE podía devolver a la cola un destino que ya tenía su id y su
--      enlace, y eso es publicar dos veces la misma promoción. Ahora hay un
--      disparador que lo prohíbe.
--
--   4. La existencia física se confirma A MANO. La cifra del sistema no
--      prueba que la pieza esté en el estante, y una promoción de algo que no
--      hay es peor que no publicar. Sin esa confirmación, con nombre y hora,
--      la promoción no se puede aprobar.
--
--   5. El precio va en el TEXTO. Se comprueba al crear: si el texto de una
--      red no dice el precio, no se crea. Encima del arte no va.
--
--  Una promoción son hasta DOS trabajos que comparten `publication_bundle_id`
--  —uno de imagen (feed e historia) y uno de video (TikTok y Short)— porque el
--  trabajo lleva un solo `media_type`. Seis destinos, una sola hora.
--
--  Aditivo: no se borra ni se reescribe ninguna columna, ningún estado y
--  ninguna política existente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. La prueba de conexión vive en la base ──────────────────────────────
alter table public.social_accounts
  add column if not exists publicacion_habilitada boolean not null default false,
  add column if not exists verificado_at timestamptz,
  add column if not exists verificacion_detalle text;

comment on column public.social_accounts.publicacion_habilitada is
  'Lo que contestó la plataforma la última vez que se le preguntó, no lo que alguien escribió al conectar. Lo escribe scripts/social-estado.mjs.';

-- ── 2. Lo que hace falta para poder aprobar ───────────────────────────────
alter table public.hermes_publication_jobs
  add column if not exists precio_mostrado numeric(14,2),
  add column if not exists existencia_confirmada boolean not null default false,
  add column if not exists existencia_confirmada_por uuid references auth.users(id) on delete set null,
  add column if not exists existencia_confirmada_at timestamptz,
  add column if not exists textos jsonb not null default '{}'::jsonb,
  add column if not exists zona_horaria text not null default 'America/Santo_Domingo';

-- ── 3. El destino que no está autorizado ──────────────────────────────────
alter table public.hermes_publication_targets
  add column if not exists bloqueo_motivo text,
  add column if not exists idempotency_key text,
  add column if not exists scheduled_for timestamptz;

create unique index if not exists hermes_publication_targets_idem_unique
  on public.hermes_publication_targets (tenant_id, idempotency_key)
  where idempotency_key is not null;

-- ── 4. Lo publicado no se reescribe ───────────────────────────────────────
create or replace function public.no_republicar_destino_confirmado()
returns trigger
language plpgsql
as $$
begin
  -- Sin confirmación del proveedor no hay nada que proteger.
  if old.external_post_id is null and old.external_url is null then
    return new;
  end if;

  if new.external_post_id is distinct from old.external_post_id
     or new.external_url is distinct from old.external_url then
    raise exception
      'El destino % (% %) ya tiene publicación confirmada: %. Eso no se reescribe.',
      old.id, old.platform, old.placement,
      coalesce(old.external_post_id, old.external_url);
  end if;

  if new.status is distinct from old.status
     and new.status in ('draft','awaiting_upload','awaiting_approval','scheduled','queued','processing') then
    raise exception
      'El destino % (% %) ya se publicó: %. Devolverlo a "%" lo publicaría dos veces.',
      old.id, old.platform, old.placement,
      coalesce(old.external_post_id, old.external_url), new.status;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_no_republicar_destino on public.hermes_publication_targets;
create trigger trg_no_republicar_destino
  before update on public.hermes_publication_targets
  for each row execute function public.no_republicar_destino_confirmado();

-- ── 5. Auditoría: quién aprobó, quién programó, quién reintentó ───────────
create table if not exists public.publicacion_auditoria (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  bundle_id  uuid,
  job_id     uuid,
  target_id  uuid,
  accion     text not null,
  actor      uuid,
  detalle    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists publicacion_auditoria_bundle_idx
  on public.publicacion_auditoria (tenant_id, bundle_id, created_at desc);

alter table public.publicacion_auditoria enable row level security;

drop policy if exists publicacion_auditoria_tenant_select on public.publicacion_auditoria;
create policy publicacion_auditoria_tenant_select
  on public.publicacion_auditoria for select
  using (tenant_id = (select public.get_user_tenant()));
-- Sin política de INSERT a propósito: la auditoría solo la escriben las
-- funciones de abajo, que van con SECURITY DEFINER. Nadie la escribe a mano.

-- ── 6. Quién puede tocar esto ─────────────────────────────────────────────
create or replace function public.promo_tenant_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
begin
  v_tenant := public.get_user_tenant();
  if v_tenant is null then
    raise exception 'No hay empresa activa para tu usuario.';
  end if;
  if not exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.tenant_id = v_tenant
      and ue.rol in ('owner','admin')
  ) then
    raise exception 'Solo el dueño o un administrador de la empresa puede manejar publicaciones.';
  end if;
  return v_tenant;
end;
$$;

-- ── 7. Crear la promoción ─────────────────────────────────────────────────
create or replace function public.promo_crear(
  p_titulo           text,
  p_producto_id      uuid,
  p_precio           numeric,
  p_textos           jsonb,   -- {"facebook":"...", "instagram":"...", ...}
  p_media            jsonb,   -- {"imagen_feed":"url","imagen_historia":"url","video":"url"}
  p_destinos         jsonb,   -- [{"platform":"facebook","placement":"feed"}, ...]
  p_idempotency_key  text default null,
  p_design_id        uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  -- El precio se comprueba DENTRO del texto de cada red: en el arte no va.
  if p_precio is not null and p_precio > 0 then
    v_precio_txt := trim(to_char(p_precio, 'FM999999990'));
  end if;

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
    if v_precio_txt is not null
       and position(v_precio_txt in replace(v_texto, ',', '')) = 0 then
      raise exception 'El texto de % no dice el precio (%). El precio va en el texto, nunca encima del arte.', v_plat, p_precio;
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
  for v_plat in select distinct d->>'platform' from jsonb_array_elements(p_destinos) d loop
    select array_agg(distinct d->>'placement') into v_places
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
      case when v_key is null then null else v_key || ':' || v_plat end,
      v_bundle,
      jsonb_build_object('imagen_feed', v_img_feed, 'imagen_historia', v_img_hist, 'video', v_video)
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
$$;

-- ── 8. Confirmar que la pieza está en el estante ──────────────────────────
create or replace function public.promo_confirmar_existencia(p_bundle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_n integer;
begin
  v_tenant := public.promo_tenant_admin();
  update public.hermes_publication_jobs
     set existencia_confirmada = true,
         existencia_confirmada_por = auth.uid(),
         existencia_confirmada_at = now(),
         updated_at = now()
   where publication_bundle_id = p_bundle_id and tenant_id = v_tenant;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Esa promoción no es de tu empresa activa.'; end if;

  insert into public.publicacion_auditoria (tenant_id, bundle_id, accion, actor)
  values (v_tenant, p_bundle_id, 'confirmar_existencia', auth.uid());
  return jsonb_build_object('ok', true, 'trabajos', v_n);
end;
$$;

-- ── 9. Aprobar ────────────────────────────────────────────────────────────
create or replace function public.promo_aprobar(p_bundle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_n integer;
begin
  v_tenant := public.promo_tenant_admin();

  if exists (
    select 1 from public.hermes_publication_jobs
     where publication_bundle_id = p_bundle_id and tenant_id = v_tenant
       and existencia_confirmada = false
  ) then
    raise exception 'Antes de aprobar hay que confirmar que la pieza está físicamente. La cifra del sistema no lo prueba.';
  end if;

  update public.hermes_publication_jobs
     set approval_status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now()
   where publication_bundle_id = p_bundle_id and tenant_id = v_tenant
     and approval_status <> 'approved';
  get diagnostics v_n = row_count;

  insert into public.publicacion_auditoria (tenant_id, bundle_id, accion, actor)
  values (v_tenant, p_bundle_id, 'aprobar', auth.uid());
  return jsonb_build_object('ok', true, 'trabajos', v_n);
end;
$$;

-- ── 10. Programar ─────────────────────────────────────────────────────────
create or replace function public.promo_programar(p_bundle_id uuid, p_cuando timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_prog integer;
  v_bloq integer;
begin
  v_tenant := public.promo_tenant_admin();

  if p_cuando is null or p_cuando <= now() then
    raise exception 'La hora tiene que ser futura. Se recibió: %', p_cuando;
  end if;
  if not exists (
    select 1 from public.hermes_publication_jobs
     where publication_bundle_id = p_bundle_id and tenant_id = v_tenant
       and approval_status = 'approved') then
    raise exception 'Esa promoción no está aprobada.';
  end if;

  -- La red sin autorizar NO entra en la cola: su trabajo se queda en borrador
  -- y su destino a la vista. Al mover el trabajo, el disparador del motor pone
  -- sus destinos en 'scheduled' solo.
  update public.hermes_publication_jobs j
     set status = 'scheduled', scheduled_for = p_cuando, error_message = null, updated_at = now()
   where j.publication_bundle_id = p_bundle_id
     and j.tenant_id = v_tenant
     and j.approval_status = 'approved'
     and not exists (select 1 from public.hermes_publication_targets t
                      where t.job_id = j.id and t.bloqueo_motivo is not null)
     and exists (select 1 from public.hermes_publication_targets t
                  where t.job_id = j.id
                    and t.external_post_id is null and t.external_url is null);

  update public.hermes_publication_targets t
     set scheduled_for = p_cuando, updated_at = now()
    from public.hermes_publication_jobs j
   where j.id = t.job_id and j.publication_bundle_id = p_bundle_id
     and t.tenant_id = v_tenant and t.status = 'scheduled';
  get diagnostics v_prog = row_count;

  if v_prog = 0 then
    raise exception 'No hay ni un destino que se pueda programar: o están bloqueados, o ya están publicados.';
  end if;

  select count(*) into v_bloq
    from public.hermes_publication_targets t
    join public.hermes_publication_jobs j on j.id = t.job_id
   where j.publication_bundle_id = p_bundle_id and t.bloqueo_motivo is not null;

  insert into public.publicacion_auditoria (tenant_id, bundle_id, accion, actor, detalle)
  values (v_tenant, p_bundle_id, 'programar', auth.uid(),
          jsonb_build_object('cuando', p_cuando, 'programados', v_prog, 'bloqueados', v_bloq));

  return jsonb_build_object('ok', true, 'programados', v_prog, 'sin_autorizar', v_bloq, 'cuando', p_cuando);
end;
$$;

-- ── 11. Reintentar solo lo que falló ──────────────────────────────────────
create or replace function public.promo_reintentar(p_bundle_id uuid, p_target_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_n integer;
begin
  v_tenant := public.promo_tenant_admin();

  -- Lo que tiene id o enlace NO se reintenta: ya salió. El disparador lo
  -- impediría igual, pero aquí se dice con palabras.
  select count(*) into v_n
    from public.hermes_publication_targets t
    join public.hermes_publication_jobs j on j.id = t.job_id
   where j.publication_bundle_id = p_bundle_id
     and t.tenant_id = v_tenant
     and t.status = 'failed'
     and t.bloqueo_motivo is null
     and t.external_post_id is null and t.external_url is null
     and (p_target_id is null or t.id = p_target_id);

  if v_n = 0 then
    raise exception 'No hay ningún destino fallido que reintentar (los publicados no se tocan).';
  end if;

  -- Vuelve por su TRABAJO: el disparador del motor devuelve a la cola los
  -- destinos de ese trabajo, y al que ya está publicado lo deja como está
  -- (su ON CONFLICT lo protege, y encima está el disparador de aquí).
  update public.hermes_publication_jobs j
     set status = 'scheduled', scheduled_for = now(), error_message = null, updated_at = now()
   where j.publication_bundle_id = p_bundle_id
     and j.tenant_id = v_tenant
     and j.approval_status = 'approved'
     and exists (select 1 from public.hermes_publication_targets t
                  where t.job_id = j.id and t.status = 'failed'
                    and t.bloqueo_motivo is null
                    and t.external_post_id is null and t.external_url is null
                    and (p_target_id is null or t.id = p_target_id));

  insert into public.publicacion_auditoria (tenant_id, bundle_id, target_id, accion, actor, detalle)
  values (v_tenant, p_bundle_id, p_target_id, 'reintentar', auth.uid(), jsonb_build_object('destinos', v_n));

  return jsonb_build_object('ok', true, 'reintentados', v_n);
end;
$$;

-- ── 12. Lo que ve el panel ────────────────────────────────────────────────
create or replace function public.promo_panel(p_limite integer default 3)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
begin
  v_tenant := public.get_user_tenant();
  if v_tenant is null then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(p order by p->>'creada' desc)
    from (
      select jsonb_build_object(
        'bundle_id', b.publication_bundle_id,
        'titulo', max(b.title),
        'creada', max(b.created_at),
        'programada', max(b.scheduled_for),
        'precio', max(b.precio_mostrado),
        'existencia_confirmada', bool_and(b.existencia_confirmada),
        'aprobada', bool_and(b.approval_status = 'approved'),
        'estado', case
          when bool_and(b.status = 'published') then 'PUBLICADO'
          when bool_or(b.status = 'partially_published') then 'PARCIAL'
          when bool_or(b.status = 'failed') then 'FALLO'
          when bool_or(b.status in ('queued','processing')) then 'PUBLICANDO'
          when bool_or(b.status = 'scheduled') then 'PROGRAMADO'
          when bool_and(b.approval_status = 'approved') then 'APROBADO'
          else 'BORRADOR' end,
        'destinos', (
          select jsonb_agg(jsonb_build_object(
            'id', t.id, 'platform', t.platform, 'placement', t.placement,
            'estado', case
              when t.bloqueo_motivo is not null then 'SIN AUTORIZAR'
              when t.status = 'published' then 'PUBLICADO'
              when t.status = 'failed' then 'FALLO'
              when t.status = 'awaiting_confirmation' then 'SIN CONFIRMAR'
              when t.status in ('queued','processing') then 'PUBLICANDO'
              when t.status = 'scheduled' then 'PROGRAMADO'
              else 'BORRADOR' end,
            'bloqueo_motivo', t.bloqueo_motivo,
            'external_post_id', t.external_post_id,
            'external_url', t.external_url,
            'error', t.error_message,
            'intentos', t.attempt_count,
            'publicado_en', t.published_at)
            order by t.platform, t.placement)
          from public.hermes_publication_targets t
          join public.hermes_publication_jobs jj on jj.id = t.job_id
          where jj.publication_bundle_id = b.publication_bundle_id)
      ) p
      from public.hermes_publication_jobs b
      where b.tenant_id = v_tenant and b.publication_bundle_id is not null
      group by b.publication_bundle_id
      order by max(b.created_at) desc
      limit greatest(1, coalesce(p_limite, 3))
    ) q
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.promo_crear(text, uuid, numeric, jsonb, jsonb, jsonb, text, uuid) to authenticated;
grant execute on function public.promo_confirmar_existencia(uuid) to authenticated;
grant execute on function public.promo_aprobar(uuid) to authenticated;
grant execute on function public.promo_programar(uuid, timestamptz) to authenticated;
grant execute on function public.promo_reintentar(uuid, uuid) to authenticated;
grant execute on function public.promo_panel(integer) to authenticated;
grant execute on function public.promo_tenant_admin() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
--  SIMULACRO — se ejecuta de verdad contra producción y se borra solo.
--  Los CHECK y los try/catch fallan en silencio; esto no.
-- ═══════════════════════════════════════════════════════════════════════════
do $prueba$
declare
  v_admin  uuid := '0a751661-5ec4-4136-a75c-b4d8493beae0';  -- admin@repuestosmorla.com
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_res    jsonb;
  v_bundle uuid;
  v_target uuid;
  v_n      integer;
  v_fallos text := '';
  v_habilitadas uuid[];
  v_disenos     uuid[];
begin
  -- >>> PREPARACION <<<
  -- Hoy NINGUNA red esta habilitada para publicar: las cuatro tienen el token
  -- muerto o no lo tienen. Para poder probar la logica (que lo bloqueado se
  -- queda fuera y lo autorizado entra) se habilitan dos a proposito, y al
  -- final se dejan exactamente como estaban.
  with cambio as (
    update public.social_accounts set publicacion_habilitada = true
     where tenant_id = v_tenant and platform in ('facebook','instagram')
       and publicacion_habilitada = false
    returning id)
  select array_agg(id) into v_habilitadas from cambio;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);

  -- 1. Crear: 6 destinos, y los de TikTok/YouTube tienen que nacer bloqueados
  --    porque sus cuentas no están habilitadas.
  v_res := public.promo_crear(
    'PRUEBA INTERNA — no publicar',
    null, 1500,
    jsonb_build_object(
      'facebook',  'Prueba interna. Precio RD$ 1,500. No publicar.',
      'instagram', 'Prueba interna. Precio RD$ 1,500. No publicar.',
      'tiktok',    'Prueba interna. Precio RD$ 1,500. No publicar.',
      'youtube',   'Prueba interna. Precio RD$ 1,500. No publicar.'),
    jsonb_build_object('imagen_feed','https://ejemplo/feed.png',
                       'imagen_historia','https://ejemplo/historia.png',
                       'video','https://ejemplo/video.mp4'),
    '[{"platform":"facebook","placement":"feed"},
      {"platform":"facebook","placement":"story"},
      {"platform":"instagram","placement":"feed"},
      {"platform":"instagram","placement":"story"},
      {"platform":"tiktok","placement":"reel"},
      {"platform":"youtube","placement":"short"}]'::jsonb,
    'simulacro-' || gen_random_uuid()::text);
  v_bundle := (v_res->>'bundle_id')::uuid;

  select count(*) into v_n from public.hermes_publication_targets t
    join public.hermes_publication_jobs j on j.id = t.job_id
   where j.publication_bundle_id = v_bundle;
  if v_n <> 6 then v_fallos := v_fallos || format('[1] se esperaban 6 destinos y hay %s. ', v_n); end if;

  select count(*) into v_n from public.hermes_publication_targets t
    join public.hermes_publication_jobs j on j.id = t.job_id
   where j.publication_bundle_id = v_bundle and t.bloqueo_motivo is not null;
  if v_n <> 2 then v_fallos := v_fallos || format('[2] TikTok y YouTube debian nacer bloqueados; bloqueados=%s. ', v_n); end if;

  -- 2. El precio tiene que estar en el texto de cada red.
  begin
    perform public.promo_crear('Sin precio en el texto', null, 999,
      jsonb_build_object('facebook','Oferta buenisima sin decir cuanto vale'),
      jsonb_build_object('imagen_feed','https://ejemplo/x.png'),
      '[{"platform":"facebook","placement":"feed"}]'::jsonb, null);
    v_fallos := v_fallos || '[3] dejo crear una promocion cuyo texto no dice el precio. ';
  exception when others then null;
  end;

  -- 3. No se puede aprobar sin confirmar la existencia física.
  begin
    perform public.promo_aprobar(v_bundle);
    v_fallos := v_fallos || '[4] aprobo sin confirmar la existencia fisica. ';
  exception when others then null;
  end;

  -- 4. Confirmar, aprobar y programar.
  perform public.promo_confirmar_existencia(v_bundle);
  perform public.promo_aprobar(v_bundle);
  v_res := public.promo_programar(v_bundle, now() + interval '30 minutes');
  if (v_res->>'programados')::int <> 4 then
    v_fallos := v_fallos || format('[5] debian programarse 4 destinos y se programaron %s. ', v_res->>'programados');
  end if;
  if (v_res->>'sin_autorizar')::int <> 2 then
    v_fallos := v_fallos || format('[6] debian quedar 2 sin autorizar y quedaron %s. ', v_res->>'sin_autorizar');
  end if;

  -- 5. Un destino publicado de verdad: ya no se toca.
  select t.id into v_target from public.hermes_publication_targets t
    join public.hermes_publication_jobs j on j.id = t.job_id
   where j.publication_bundle_id = v_bundle and t.platform = 'facebook' and t.placement = 'feed';
  update public.hermes_publication_targets
     set status = 'published', external_post_id = 'PRUEBA-123',
         external_url = 'https://facebook.com/PRUEBA-123', published_at = now()
   where id = v_target;

  begin
    update public.hermes_publication_targets set status = 'scheduled' where id = v_target;
    v_fallos := v_fallos || '[7] dejo devolver a la cola un destino ya publicado. ';
  exception when others then null;
  end;

  begin
    update public.hermes_publication_targets set external_post_id = 'OTRO' where id = v_target;
    v_fallos := v_fallos || '[8] dejo reescribir el id de una publicacion confirmada. ';
  exception when others then null;
  end;

  -- 6. Reintentar toca lo fallido y NADA más.
  update public.hermes_publication_targets t
     set status = 'failed', error_message = 'prueba'
    from public.hermes_publication_jobs j
   where j.id = t.job_id and j.publication_bundle_id = v_bundle
     and t.platform = 'instagram' and t.placement = 'story';

  v_res := public.promo_reintentar(v_bundle);
  if (v_res->>'reintentados')::int <> 1 then
    v_fallos := v_fallos || format('[9] el reintento debia tocar 1 destino y toco %s. ', v_res->>'reintentados');
  end if;
  if (select status from public.hermes_publication_targets where id = v_target) <> 'published' then
    v_fallos := v_fallos || '[10] el reintento movio un destino ya publicado. ';
  end if;

  -- 7. El panel lo cuenta como es.
  v_res := public.promo_panel(3);
  if v_res = '[]'::jsonb then v_fallos := v_fallos || '[11] el panel no devolvio nada. '; end if;

  reset role;

  -- Limpieza: la prueba no deja basura. Va DESPUES de soltar el rol, porque
  -- 'authenticated' no tiene politica de DELETE en la auditoria y se quedaba.
  delete from public.publicacion_auditoria where bundle_id = v_bundle;
  delete from public.social_posts sp
   using public.hermes_publication_jobs j
   where sp.publication_job_id = j.id and j.publication_bundle_id = v_bundle;
  delete from public.hermes_publication_targets t
   using public.hermes_publication_jobs j
   where t.job_id = j.id and j.publication_bundle_id = v_bundle;

  -- OJO CON EL ORDEN: design_id es una clave foranea ON DELETE SET NULL, asi
  -- que borrar el arte ANTES que el trabajo le deja el trabajo sin diseno...
  -- y un trabajo de imagen ya programado SIN diseno viola su propia
  -- restriccion (hermes_publication_jobs_approved_state). Primero el trabajo.
  select array_agg(distinct design_id) into v_disenos
    from public.hermes_publication_jobs
   where publication_bundle_id = v_bundle and design_id is not null;
  delete from public.hermes_publication_jobs where publication_bundle_id = v_bundle;
  delete from public.design_documents where id = any(coalesce(v_disenos, '{}'::uuid[]));

  -- Y las redes vuelven a como estaban.
  update public.social_accounts set publicacion_habilitada = false
   where id = any(coalesce(v_habilitadas, '{}'::uuid[]));

  if v_fallos <> '' then
    raise exception 'SIMULACRO FALLIDO: %', v_fallos;
  end if;
  raise notice 'Simulacro del publicador: las 11 comprobaciones pasaron.';
end;
$prueba$;

select public.registrar_migracion('equipo_ia_publicador_fase1.sql');
