-- ═══════════════════════════════════════════════════════════════════════════
--  EL PUBLICADOR: lo programado sale a su hora
--  sql/promo_publicador.sql
-- ═══════════════════════════════════════════════════════════════════════════
--
--  >>> POR QUÉ <<<
--  "Programar" guardaba la promoción y a la hora no pasaba nada. El que
--  publicaba lo que Hermes programaba —hermes-publication-worker-v1, en el
--  VPS— tomó su último trabajo el 13/09/2026; dos promociones programadas
--  después vencieron sin que nadie las tocara ("Programación vencida"). El
--  28/09 Meta quedó reconectado y verificado, así que ya se puede publicar de
--  verdad, y hace falta quien lo haga.
--
--  El publicador es la Edge Function `publicar-promociones`, que corre cada
--  minuto. Esto es lo que necesita de la base:
--
--   · promo_reclamar — toma las promociones que ya tocan, CON CANDADO: dos
--     rondas a la vez nunca se llevan la misma (FOR UPDATE SKIP LOCKED), así
--     que nada sale dos veces por coincidir.
--   · promo_reportar — anota lo que contestó cada red. Se llama DESTINO POR
--     DESTINO, apenas sale cada uno, no al final: si algo se corta a la
--     mitad, lo que ya salió queda escrito y un reintento no lo repite. Lo
--     publicado no se pisa nunca.
--   · Si Meta dice que el token venció, la red se apaga sola
--     (publicacion_habilitada = false): no se sigue programando contra una
--     cuenta muerta hasta que se reconecte.
--
--  Solo toma promociones hechas con el formulario de Equipo IA
--  (publication_bundle_id + textos por red). Lo que Hermes programa por su
--  cuenta no se toca.
--
--  No publica nada fuera de hora: lo que se pasó más de 12 horas no se toma
--  (el supervisor ya lo marca vencido, para no publicar a deshora).
--
--  Las funciones de reclamar y reportar SOLO las puede ejecutar el service
--  role, que es con lo que corre la Edge Function.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Reclamar ───────────────────────────────────────────────────────────
create or replace function public.promo_reclamar(
  p_worker      text,
  p_limite      integer default 5,
  p_solo_bundle uuid default null      -- para el simulacro: no tocar nada más
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids uuid[];
begin
  with elegidos as (
    select j.id
      from public.hermes_publication_jobs j
     where j.status in ('queued', 'scheduled')
       and j.approval_status = 'approved'
       and j.publication_bundle_id is not null
       and j.textos <> '{}'::jsonb
       and j.claimed_by is null
       and j.scheduled_for <= now()
       and j.scheduled_for >= now() - interval '12 hours'
       and (p_solo_bundle is null or j.publication_bundle_id = p_solo_bundle)
     order by j.scheduled_for
     limit greatest(1, least(coalesce(p_limite, 5), 20))
     for update skip locked
  ),
  tomados as (
    update public.hermes_publication_jobs j
       set status = 'processing',
           claimed_by = p_worker,
           claimed_at = now(),
           attempt_count = j.attempt_count + 1,
           error_message = null,
           updated_at = now()
      from elegidos e
     where j.id = e.id
    returning j.id
  )
  select array_agg(id) into v_ids from tomados;

  if v_ids is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', j.id,
      'tenant_id', j.tenant_id,
      'channels', to_jsonb(j.channels),
      'caption', j.caption,
      'textos', j.textos,
      'media_url', coalesce(j.media_url, j.image_url),
      'channel_config', j.channel_config,
      'destinos', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', t.id, 'platform', t.platform, 'placement', t.placement,
          'status', t.status, 'external_post_id', t.external_post_id,
          'external_url', t.external_url, 'bloqueo_motivo', t.bloqueo_motivo)
          order by t.placement), '[]'::jsonb)
          from public.hermes_publication_targets t
         where t.job_id = j.id
           and t.bloqueo_motivo is null
           -- Lo que ya salió no se vuelve a mandar.
           and t.external_post_id is null and t.external_url is null
           and t.status <> 'published')
    ))
      from public.hermes_publication_jobs j
     where j.id = any(v_ids)
  ), '[]'::jsonb);
end;
$$;

-- ── 2. Reportar ───────────────────────────────────────────────────────────
create or replace function public.promo_reportar(
  p_job_id     uuid,
  p_worker     text,
  p_resultados jsonb    -- [{platform, placement, status, platform_post_id, platform_post_url, error, token_vencido}]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_j      record;
  v_lista  jsonb;
  v_r      jsonb;
  v_total  int;
  v_pub    int;
  v_fal    int;
  v_estado text;
begin
  select * into v_j from public.hermes_publication_jobs where id = p_job_id for update;
  if v_j.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  if v_j.claimed_by is distinct from p_worker then
    return jsonb_build_object('ok', false, 'motivo', 'no_es_tuyo', 'abandonar', true);
  end if;

  v_lista := coalesce(v_j.external_results -> 'platforms', '[]'::jsonb);

  for v_r in select * from jsonb_array_elements(coalesce(p_resultados, '[]'::jsonb)) loop
    -- LO PUBLICADO NO SE PISA. Si ese destino ya consta como publicado, lo
    -- que llegue ahora se ignora, diga lo que diga.
    if exists (select 1 from jsonb_array_elements(v_lista) e
                where e ->> 'platform' = v_r ->> 'platform'
                  and e ->> 'placement' = v_r ->> 'placement'
                  and e ->> 'status' = 'published') then
      continue;
    end if;

    v_lista := coalesce((select jsonb_agg(e) from jsonb_array_elements(v_lista) e
                          where not (e ->> 'platform' = v_r ->> 'platform'
                                 and e ->> 'placement' = v_r ->> 'placement')), '[]'::jsonb)
            || jsonb_build_array((v_r - 'token_vencido')
                 || jsonb_build_object('publicado_por', p_worker, 'reportado_en', now()));
  end loop;

  -- El disparador hermes_publication_jobs_sync_targets pasa esto a cada
  -- destino (estado, id, enlace, error).
  update public.hermes_publication_jobs
     set external_results = jsonb_set(coalesce(external_results, '{}'::jsonb), '{platforms}', v_lista),
         updated_at = now()
   where id = p_job_id;

  -- ¿Ya contestaron todos los destinos de este trabajo?
  select count(*) into v_total
    from public.hermes_publication_targets
   where job_id = p_job_id and bloqueo_motivo is null;
  select count(*) filter (where e ->> 'status' = 'published'),
         count(*) filter (where e ->> 'status' = 'failed')
    into v_pub, v_fal
    from jsonb_array_elements(v_lista) e;

  if v_pub + v_fal >= v_total and v_total > 0 then
    v_estado := case when v_pub = v_total then 'published'
                     when v_pub > 0 then 'partially_published'
                     else 'failed' end;
    update public.hermes_publication_jobs
       set status = v_estado,
           completed_at = case when v_estado = 'published' then now() else null end,
           error_message = case when v_estado = 'published' then null else (
             select string_agg((e ->> 'platform') || ' ' || (e ->> 'placement') || ': '
                               || coalesce(e ->> 'error', 'sin detalle'), ' | ')
               from jsonb_array_elements(v_lista) e where e ->> 'status' = 'failed') end,
           -- Se suelta: para que un reintento lo pueda volver a tomar.
           claimed_by = null,
           claimed_at = null,
           updated_at = now()
     where id = p_job_id;
  end if;

  -- Meta dijo que el token venció: la red se apaga hasta que se reconecte.
  if exists (select 1 from jsonb_array_elements(coalesce(p_resultados, '[]'::jsonb)) r
              where coalesce((r ->> 'token_vencido')::boolean, false)) then
    update public.social_accounts
       set publicacion_habilitada = false,
           verificado_at = now(),
           verificacion_detalle = 'Meta dijo que el token venció al publicar. Reconectar y volver a comprobar con scripts/social-estado.mjs.'
     where tenant_id = v_j.tenant_id and platform = any(v_j.channels);
  end if;

  return jsonb_build_object('ok', true, 'estado', coalesce(v_estado, 'publicando'),
                            'publicados', v_pub, 'fallidos', v_fal, 'total', v_total);
end;
$$;

-- Solo el service role, que es con lo que corre la Edge Function.
revoke all on function public.promo_reclamar(text, integer, uuid) from public, anon, authenticated;
revoke all on function public.promo_reportar(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.promo_reclamar(text, integer, uuid) to service_role;
grant execute on function public.promo_reportar(uuid, text, jsonb) to service_role;

-- ── 3. Reintentar: que el publicador lo pueda volver a tomar ─────────────
--  Mismo contrato de antes, más dos cosas que el publicador necesita:
--   · suelta el candado (claimed_by), o el publicador no lo vuelve a tomar;
--   · borra el "falló" de los destinos que se reintentan, para que se vean
--     como PROGRAMADO y no como FALLÓ mientras esperan.
create or replace function public.promo_reintentar(p_bundle_id uuid, p_target_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_n integer;
  v_j record;
begin
  v_tenant := public.promo_tenant_admin();

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

  for v_j in
    select j.* from public.hermes_publication_jobs j
     where j.publication_bundle_id = p_bundle_id
       and j.tenant_id = v_tenant
       and j.approval_status = 'approved'
       and exists (select 1 from public.hermes_publication_targets t
                    where t.job_id = j.id and t.status = 'failed'
                      and t.bloqueo_motivo is null
                      and t.external_post_id is null and t.external_url is null
                      and (p_target_id is null or t.id = p_target_id))
  loop
    update public.hermes_publication_jobs j
       set status = 'scheduled',
           scheduled_for = now(),
           error_message = null,
           claimed_by = null,
           claimed_at = null,
           external_results = case when j.external_results ? 'platforms' then
             jsonb_set(j.external_results, '{platforms}', coalesce((
               select jsonb_agg(e) from jsonb_array_elements(j.external_results -> 'platforms') e
                where not (e ->> 'status' = 'failed' and exists (
                  select 1 from public.hermes_publication_targets t
                   where t.job_id = j.id and t.platform = e ->> 'platform'
                     and t.placement = e ->> 'placement'
                     and (p_target_id is null or t.id = p_target_id)))), '[]'::jsonb))
             else j.external_results end,
           updated_at = now()
     where j.id = v_j.id;
  end loop;

  insert into public.publicacion_auditoria (tenant_id, bundle_id, target_id, accion, actor, detalle)
  values (v_tenant, p_bundle_id, p_target_id, 'reintentar', auth.uid(), jsonb_build_object('destinos', v_n));

  return jsonb_build_object('ok', true, 'reintentados', v_n);
end;
$$;

-- ── 4. Cada minuto ────────────────────────────────────────────────────────
--  Igual que los demás cron de la nube: net.http_post a la Edge Function con
--  la anon key, que es pública (va en la web). Esa llamada solo puede hacer
--  una cosa: que la ronda corra antes. Y la ronda solo toma lo que YA está
--  aprobado y YA tocaba, con candado: llamarla de más no publica nada que no
--  tocara ni lo publica dos veces.
--
--  La key se copia de la función del equipo en la nube al aplicar esto, para
--  no escribirla en un archivo del repositorio.
do $cron$
declare
  v_key text;
begin
  v_key := substring(pg_get_functiondef('public.equipo_nube_llamar'::regproc)
                     from 'Bearer (eyJ[A-Za-z0-9_.-]+)');
  if v_key is null then
    raise exception 'No encontré la anon key en equipo_nube_llamar: el cron del publicador no tendría con qué llamar.';
  end if;

  execute format($f$
    create or replace function public.promo_publicador_llamar()
    returns bigint
    language sql
    security definer
    set search_path = public
    as $b$
      select net.http_post(
        url     := 'https://zdvxowpuklbypweyqqki.supabase.co/functions/v1/publicar-promociones',
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'Authorization', 'Bearer ' || %L),
        body    := '{}'::jsonb,
        timeout_milliseconds := 5000)
    $b$;
  $f$, v_key);
end
$cron$;

revoke all on function public.promo_publicador_llamar() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
--  SIMULACRO — contra producción, sin publicar nada, y se borra solo.
--  Recorre lo que hace el publicador sin llamar a Meta: reclamar, reportar un
--  destino publicado y otro fallido, intentar pisar el publicado, reintentar
--  el fallido, y que la red se apague si el token venció.
-- ═══════════════════════════════════════════════════════════════════════════
do $prueba$
declare
  v_dueno  uuid := 'a9a2d9fd-c408-4d33-b1c7-1f7f29e397fb';
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_res    jsonb;
  v_bundle uuid;
  v_job    uuid;
  v_feed   record;
  v_story  record;
  v_fb_antes boolean;
  v_disenos uuid[];
  v_fallos text := '';
begin
  select publicacion_habilitada into v_fb_antes
    from public.social_accounts where tenant_id = v_tenant and platform = 'facebook' limit 1;

  -- El simulacro necesita Facebook habilitado para que se programe; si hoy no
  -- lo está, se habilita y al final se deja como estaba.
  update public.social_accounts set publicacion_habilitada = true
   where tenant_id = v_tenant and platform = 'facebook';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dueno::text, 'role', 'authenticated')::text, true);

  v_res := public.promo_crear(
    'SIMULACRO PUBLICADOR — no publicar', null, 1500,
    jsonb_build_object('facebook', 'Simulacro. RD$ 1,500. No publicar.'),
    jsonb_build_object('imagen_feed', 'https://ejemplo/feed.png', 'imagen_historia', 'https://ejemplo/historia.png'),
    '[{"platform":"facebook","placement":"feed"},{"platform":"facebook","placement":"story"}]'::jsonb,
    'simulacro-publicador-' || gen_random_uuid()::text);
  v_bundle := (v_res ->> 'bundle_id')::uuid;
  perform public.promo_confirmar_existencia(v_bundle);
  perform public.promo_aprobar(v_bundle);
  perform public.promo_programar(v_bundle, now() + interval '5 minutes');
  reset role;

  select id into v_job from public.hermes_publication_jobs where publication_bundle_id = v_bundle;

  -- Llega la hora.
  update public.hermes_publication_jobs set scheduled_for = now() - interval '1 minute' where id = v_job;

  -- 1. Reclamar: se lo lleva, con sus dos destinos.
  set local role service_role;
  v_res := public.promo_reclamar('simulacro', 5, v_bundle);
  reset role;
  if jsonb_array_length(v_res) <> 1 then
    v_fallos := v_fallos || format('[1] se esperaba reclamar 1 trabajo y fueron %s. ', jsonb_array_length(v_res));
  elsif jsonb_array_length(v_res -> 0 -> 'destinos') <> 2 then
    v_fallos := v_fallos || '[2] el trabajo reclamado no traia sus 2 destinos. ';
  end if;

  -- 2. Otra ronda a la vez no se lo lleva otra vez.
  set local role service_role;
  v_res := public.promo_reclamar('otra-ronda', 5, v_bundle);
  reset role;
  if jsonb_array_length(v_res) <> 0 then
    v_fallos := v_fallos || '[3] una segunda ronda se llevo el mismo trabajo: saldria dos veces. ';
  end if;

  -- 3. Reporta: el feed salió, la historia falló.
  set local role service_role;
  v_res := public.promo_reportar(v_job, 'simulacro', jsonb_build_array(
    jsonb_build_object('platform', 'facebook', 'placement', 'feed', 'status', 'published',
                       'platform_post_id', 'SIMULACRO-123', 'platform_post_url', 'https://facebook.com/SIMULACRO-123')));
  v_res := public.promo_reportar(v_job, 'simulacro', jsonb_build_array(
    jsonb_build_object('platform', 'facebook', 'placement', 'story', 'status', 'failed', 'error', 'prueba')));
  reset role;

  select * into v_feed from public.hermes_publication_targets where job_id = v_job and placement = 'feed';
  select * into v_story from public.hermes_publication_targets where job_id = v_job and placement = 'story';
  if v_feed.status <> 'published' or v_feed.external_post_id is distinct from 'SIMULACRO-123' then
    v_fallos := v_fallos || format('[4] el feed no quedo publicado con su id (%s, %s). ', v_feed.status, v_feed.external_post_id);
  end if;
  if v_story.status <> 'failed' then
    v_fallos := v_fallos || format('[5] la historia no quedo fallida (%s). ', v_story.status);
  end if;
  if (select status from public.hermes_publication_jobs where id = v_job) <> 'partially_published' then
    v_fallos := v_fallos || '[6] el trabajo no quedo como publicado a medias. ';
  end if;
  if (select claimed_by from public.hermes_publication_jobs where id = v_job) is not null then
    v_fallos := v_fallos || '[7] al terminar no solto el candado: un reintento no lo podria tomar. ';
  end if;

  -- 4. Nadie pisa lo publicado: ni un reporte tardío que diga "falló".
  update public.hermes_publication_jobs set claimed_by = 'simulacro' where id = v_job;
  set local role service_role;
  perform public.promo_reportar(v_job, 'simulacro', jsonb_build_array(
    jsonb_build_object('platform', 'facebook', 'placement', 'feed', 'status', 'failed', 'error', 'tarde')));
  reset role;
  update public.hermes_publication_jobs set claimed_by = null where id = v_job;
  if (select status from public.hermes_publication_targets where job_id = v_job and placement = 'feed') <> 'published' then
    v_fallos := v_fallos || '[8] un reporte tardio piso el feed publicado. ';
  end if;

  -- 5. Reintentar la historia: vuelve a PROGRAMADO, el feed sigue publicado,
  --    y el publicador la puede volver a tomar SOLO a ella.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dueno::text, 'role', 'authenticated')::text, true);
  perform public.promo_reintentar(v_bundle);
  reset role;

  if (select status from public.hermes_publication_targets where job_id = v_job and placement = 'story') <> 'scheduled' then
    v_fallos := v_fallos || '[9] la historia reintentada no se ve como programada. ';
  end if;
  if (select status from public.hermes_publication_targets where job_id = v_job and placement = 'feed') <> 'published' then
    v_fallos := v_fallos || '[10] el reintento movio el feed publicado. ';
  end if;

  set local role service_role;
  v_res := public.promo_reclamar('simulacro', 5, v_bundle);
  reset role;
  if jsonb_array_length(v_res) <> 1
     or jsonb_array_length(v_res -> 0 -> 'destinos') <> 1
     or v_res -> 0 -> 'destinos' -> 0 ->> 'placement' <> 'story' then
    v_fallos := v_fallos || '[11] el reintento no le dio al publicador solo la historia. ';
  end if;

  -- 6. Si Meta dice que el token venció, la red se apaga.
  set local role service_role;
  perform public.promo_reportar(v_job, 'simulacro', jsonb_build_array(
    jsonb_build_object('platform', 'facebook', 'placement', 'story', 'status', 'failed',
                       'error', 'Session has expired', 'token_vencido', true)));
  reset role;
  if (select publicacion_habilitada from public.social_accounts
       where tenant_id = v_tenant and platform = 'facebook' limit 1) then
    v_fallos := v_fallos || '[12] con el token vencido, Facebook siguio como habilitado. ';
  end if;

  -- 7. Solo el service role puede reclamar y reportar.
  begin
    set local role authenticated;
    perform public.promo_reclamar('intruso', 5, v_bundle);
    reset role;
    v_fallos := v_fallos || '[13] un usuario con sesion pudo reclamar trabajos del publicador. ';
  exception when insufficient_privilege then
    reset role;
  end;

  -- Limpieza: nada de esto queda. Primero el trabajo y después el arte (la
  -- FK design_id es ON DELETE SET NULL y un trabajo de imagen sin diseño
  -- viola su propia restricción).
  delete from public.publicacion_auditoria where bundle_id = v_bundle;
  delete from public.social_posts sp using public.hermes_publication_jobs j
   where sp.publication_job_id = j.id and j.publication_bundle_id = v_bundle;
  delete from public.hermes_publication_targets t using public.hermes_publication_jobs j
   where t.job_id = j.id and j.publication_bundle_id = v_bundle;
  select array_agg(distinct design_id) into v_disenos from public.hermes_publication_jobs
   where publication_bundle_id = v_bundle and design_id is not null;
  delete from public.hermes_publication_jobs where publication_bundle_id = v_bundle;
  delete from public.design_documents where id = any(coalesce(v_disenos, '{}'::uuid[]));

  update public.social_accounts set publicacion_habilitada = v_fb_antes
   where tenant_id = v_tenant and platform = 'facebook';

  if v_fallos <> '' then
    raise exception 'SIMULACRO FALLIDO: %', v_fallos;
  end if;
  raise notice 'Publicador: las 13 comprobaciones pasaron.';
end
$prueba$;

-- El cron se agenda al final: si el simulacro falla, no queda corriendo.
select cron.unschedule(jobid) from cron.job where jobname = 'promo-publicador';
select cron.schedule('promo-publicador', '* * * * *', 'select public.promo_publicador_llamar()');

select public.registrar_migracion('promo_publicador.sql');
