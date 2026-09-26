-- MotoFlow / Repuestos Morla: reliable, destination-level publication tracking.
-- This migration does not publish content. It makes scheduling, retries and
-- completion status safe and observable.

create table if not exists public.hermes_publication_targets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  job_id uuid not null references public.hermes_publication_jobs(id) on delete cascade,
  platform text not null check (platform in ('facebook','instagram','tiktok','youtube')),
  placement text not null check (placement in ('feed','story','reel','short')),
  status text not null default 'draft' check (status in (
    'draft','awaiting_upload','awaiting_approval','scheduled','queued','processing',
    'awaiting_confirmation','published','failed','cancelled'
  )),
  provider_job_id text,
  external_post_id text,
  external_url text,
  error_message text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_retry_at timestamptz,
  last_checked_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, platform, placement)
);

create index if not exists hermes_publication_targets_queue_idx
  on public.hermes_publication_targets (tenant_id, status, next_retry_at, updated_at);
create index if not exists hermes_publication_targets_job_idx
  on public.hermes_publication_targets (job_id, platform, placement);

alter table public.hermes_publication_targets enable row level security;

drop policy if exists hermes_publication_targets_tenant_select on public.hermes_publication_targets;
create policy hermes_publication_targets_tenant_select
  on public.hermes_publication_targets for select to authenticated
  using (tenant_id = (select public.get_user_tenant()));

drop policy if exists hermes_publication_targets_admin_write on public.hermes_publication_targets;
create policy hermes_publication_targets_admin_write
  on public.hermes_publication_targets for all to authenticated
  using (
    tenant_id = (select public.get_user_tenant())
    and exists (
      select 1 from public.usuarios_empresas ue
      where ue.user_id = (select auth.uid())
        and ue.tenant_id = hermes_publication_targets.tenant_id
        and ue.rol in ('owner','admin')
    )
  )
  with check (
    tenant_id = (select public.get_user_tenant())
    and exists (
      select 1 from public.usuarios_empresas ue
      where ue.user_id = (select auth.uid())
        and ue.tenant_id = hermes_publication_targets.tenant_id
        and ue.rol in ('owner','admin')
    )
  );

alter table public.hermes_publication_jobs
  drop constraint if exists hermes_publication_jobs_channels_allowed;
alter table public.hermes_publication_jobs
  add constraint hermes_publication_jobs_channels_allowed
  check (channels <@ array['instagram','facebook','tiktok','youtube']::text[]);

alter table public.hermes_publication_jobs
  drop constraint if exists hermes_publication_jobs_channels_nonempty;
alter table public.hermes_publication_jobs
  add constraint hermes_publication_jobs_channels_nonempty
  check (cardinality(channels) between 1 and 4);

create or replace function hermes.sync_publication_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, hermes
as $$
declare
  j public.hermes_publication_jobs%rowtype;
  v_platform text;
  v_placement text;
  v_result jsonb;
  v_status text;
begin
  select * into j from public.hermes_publication_jobs where id = p_job_id;
  if j.id is null then return; end if;

  foreach v_platform in array j.channels loop
    for v_placement in
      select unnest(case when j.placement = 'both'
        then array['feed','story']::text[]
        else array[j.placement]::text[] end)
    loop
      select r into v_result
      from jsonb_array_elements(coalesce(j.external_results->'platforms','[]'::jsonb)) r
      where lower(r->>'platform') = v_platform
        and coalesce(lower(r->>'placement'), v_placement) = v_placement
      limit 1;

      v_status := case lower(coalesce(v_result->>'status',''))
        when 'published' then 'published'
        when 'processing' then 'awaiting_confirmation'
        when 'pending' then 'awaiting_confirmation'
        when 'failed' then 'failed'
        when 'error' then 'failed'
        else case j.status
          when 'draft' then 'draft'
          when 'awaiting_upload' then 'awaiting_upload'
          when 'awaiting_connector' then 'awaiting_approval'
          when 'scheduled' then 'scheduled'
          when 'queued' then 'queued'
          when 'processing' then 'processing'
          when 'published' then 'published'
          when 'failed' then 'failed'
          when 'cancelled' then 'cancelled'
          when 'partially_published' then 'awaiting_confirmation'
          else 'draft'
        end
      end;

      insert into public.hermes_publication_targets (
        tenant_id, job_id, platform, placement, status, provider_job_id,
        external_post_id, external_url, error_message, attempt_count,
        last_checked_at, published_at, updated_at
      ) values (
        j.tenant_id, j.id, v_platform, v_placement, v_status,
        nullif(v_result->>'zernio_post_id',''),
        nullif(v_result->>'platform_post_id',''),
        nullif(v_result->>'platform_post_url',''),
        nullif(v_result->>'error',''), j.attempt_count,
        case when v_result is null then null else now() end,
        case when v_status = 'published'
             then coalesce(j.completed_at, now()) end,
        now()
      )
      on conflict (job_id, platform, placement) do update set
        status = case
          when hermes_publication_targets.status = 'published' then 'published'
          else excluded.status
        end,
        provider_job_id = coalesce(excluded.provider_job_id, hermes_publication_targets.provider_job_id),
        external_post_id = coalesce(excluded.external_post_id, hermes_publication_targets.external_post_id),
        external_url = coalesce(excluded.external_url, hermes_publication_targets.external_url),
        error_message = excluded.error_message,
        attempt_count = greatest(hermes_publication_targets.attempt_count, excluded.attempt_count),
        last_checked_at = coalesce(excluded.last_checked_at, hermes_publication_targets.last_checked_at),
        published_at = coalesce(hermes_publication_targets.published_at, excluded.published_at),
        updated_at = now();
    end loop;
  end loop;
end;
$$;

revoke all on function hermes.sync_publication_job(uuid) from public, anon, authenticated;

create or replace function hermes.sync_publication_job_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, hermes
as $$
begin
  perform hermes.sync_publication_job(new.id);
  return new;
end;
$$;

revoke all on function hermes.sync_publication_job_trigger() from public, anon, authenticated;

drop trigger if exists hermes_publication_jobs_sync_targets on public.hermes_publication_jobs;
create trigger hermes_publication_jobs_sync_targets
after insert or update of channels, placement, status, external_results, attempt_count,
  completed_at, error_message
on public.hermes_publication_jobs
for each row execute function hermes.sync_publication_job_trigger();

create or replace function hermes.supervise_publications()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, hermes
as $$
declare
  v_expired integer := 0;
  v_released integer := 0;
  v_queued integer := 0;
  v_stalled integer := 0;
  v_synced integer := 0;
  r record;
begin
  -- Never publish content that missed its time by more than 12 hours.
  update public.hermes_publication_jobs
     set status = 'failed', completed_at = null,
         error_message = 'Programacion vencida: requiere nueva fecha para evitar una publicacion fuera de hora.',
         updated_at = now()
   where status = 'scheduled' and scheduled_for < now() - interval '12 hours';
  get diagnostics v_expired = row_count;

  -- Release due jobs only when they are approved and have media.
  update public.hermes_publication_jobs
     set status = 'queued', claimed_by = null, claimed_at = null,
         error_message = null, updated_at = now()
   where status = 'scheduled'
     and scheduled_for <= now()
     and scheduled_for >= now() - interval '12 hours'
     and approval_status = 'approved'
     and coalesce(media_url, image_url) is not null;
  get diagnostics v_queued = row_count;

  -- A claim with no provider submission is safe to release for another attempt.
  update public.hermes_publication_jobs
     set claimed_by = null, claimed_at = null, updated_at = now()
   where status = 'queued'
     and claimed_at < now() - interval '10 minutes'
     and external_results = '{}'::jsonb;
  get diagnostics v_released = row_count;

  -- Do not retry an ambiguous provider call: flag it for review to avoid duplicates.
  update public.hermes_publication_jobs
     set status = 'failed', completed_at = null,
         error_message = 'Publicacion sin confirmacion del proveedor. Revisar antes de reintentar para evitar duplicados.',
         updated_at = now()
   where status = 'processing'
     and claimed_at < now() - interval '30 minutes'
     and external_results = '{}'::jsonb;
  get diagnostics v_stalled = row_count;

  for r in
    select id from public.hermes_publication_jobs
    where updated_at >= now() - interval '35 days'
       or status in ('scheduled','queued','processing','partially_published')
  loop
    perform hermes.sync_publication_job(r.id);
    v_synced := v_synced + 1;
  end loop;

  -- Completion is derived from every destination, never from a worker timeout.
  update public.hermes_publication_jobs j
     set status = case
           when s.total > 0 and s.published = s.total then 'published'
           when s.published > 0 then 'partially_published'
           when s.active = 0 and s.failed > 0 then 'failed'
           else j.status
         end,
         completed_at = case
           when s.total > 0 and s.published = s.total then coalesce(j.completed_at, now())
           else null
         end,
         error_message = case
           when s.total > 0 and s.published = s.total then null
           when s.published > 0 and s.published < s.total
             then 'Publicacion parcial: faltan destinos por confirmar.'
           else j.error_message
         end,
         updated_at = now()
  from (
    select job_id, count(*) total,
      count(*) filter (where status = 'published') published,
      count(*) filter (where status in ('scheduled','queued','processing','awaiting_confirmation')) active,
      count(*) filter (where status = 'failed') failed
    from public.hermes_publication_targets group by job_id
  ) s
  where j.id = s.job_id
    and j.status not in ('draft','awaiting_upload','awaiting_connector','cancelled','scheduled','queued')
    and (
      (s.total > 0 and s.published = s.total and j.status <> 'published')
      or (s.published > 0 and s.published < s.total and j.status <> 'partially_published')
      or (s.active = 0 and s.failed > 0 and s.published = 0 and j.status <> 'failed')
      or (j.status = 'partially_published' and j.completed_at is not null)
    );

  return jsonb_build_object(
    'ok', true, 'queued', v_queued, 'expired_safely', v_expired,
    'claims_released', v_released, 'stalled_flagged', v_stalled,
    'jobs_synced', v_synced, 'checked_at', now()
  );
end;
$$;

revoke all on function hermes.supervise_publications() from public, anon, authenticated;

-- Keep approvals available for a realistic operating window.
create or replace function public.equipo_aprobacion_min_ttl()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.expira_en is null or new.expira_en < now() + interval '30 days' then
    new.expira_en := now() + interval '30 days';
  end if;
  return new;
end;
$$;

drop trigger if exists equipo_aprobaciones_min_ttl on public.equipo_aprobaciones;
create trigger equipo_aprobaciones_min_ttl
before insert on public.equipo_aprobaciones
for each row execute function public.equipo_aprobacion_min_ttl();

revoke all on function public.equipo_aprobacion_min_ttl() from public, anon, authenticated;

-- Backfill target-level status without causing any publication.
do $$
declare r record;
begin
  for r in select id from public.hermes_publication_jobs loop
    perform hermes.sync_publication_job(r.id);
  end loop;
end $$;

-- Replace or create the minute supervisor. Existing content is never sent here;
-- this job only advances due schedules and reconciles database state.
select cron.schedule(
  'hermes-publication-supervisor',
  '* * * * *',
  'select hermes.supervise_publications();'
);
