-- Backend-only, single-use OAuth state. This migration does not enable publishing.
create table public.social_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  platform text not null check (platform in ('tiktok','youtube')),
  code_verifier text not null,
  return_origin text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index social_oauth_states_expiry on public.social_oauth_states(expires_at);
create index social_oauth_states_user on public.social_oauth_states(user_id);
create index social_oauth_states_tenant on public.social_oauth_states(tenant_id);
alter table public.social_oauth_states enable row level security;
revoke all on public.social_oauth_states from public, anon, authenticated;
grant select, insert, delete on public.social_oauth_states to service_role;

-- INVOKER and service-role-only: identity and credentials are saved atomically.
create or replace function public.social_oauth_save_connection(
  p_user uuid, p_tenant uuid, p_platform text, p_external_id text, p_name text,
  p_access_token text, p_refresh_token text, p_expires_at timestamptz, p_scopes text
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_account uuid;
begin
  if p_platform not in ('tiktok','youtube') or p_platform is null or nullif(p_external_id,'') is null
    or nullif(p_access_token,'') is null or nullif(p_refresh_token,'') is null
    or p_expires_at <= now() or p_expires_at is null then
    raise exception 'Invalid OAuth connection';
  end if;
  if not exists (select 1 from public.usuarios_empresas where user_id=p_user
    and tenant_id=p_tenant and rol in ('owner','admin')) then
    raise exception 'Administrator membership required';
  end if;
  insert into public.social_accounts(tenant_id,platform,external_account_id,account_name,status,
    connected_at,publicacion_habilitada,verificado_at,verificacion_detalle,meta)
  values (p_tenant,p_platform,p_external_id,p_name,'connected',now(),false,now(),
    'OAuth conectado. Publicación pendiente de pruebas y aprobación del proveedor.',
    jsonb_build_object('oauth_scopes',p_scopes,'oauth_connected_by',p_user,'oauth_provider',p_platform))
  on conflict (tenant_id,platform,external_account_id) do update set
    account_name=excluded.account_name,status='connected',connected_at=now(),
    publicacion_habilitada=false,verificado_at=now(),verificacion_detalle=excluded.verificacion_detalle,
    meta=coalesce(social_accounts.meta,'{}'::jsonb)||excluded.meta
  returning id into v_account;
  insert into public.social_account_secrets(account_id,access_token,refresh_token,expires_at,updated_at)
  values(v_account,p_access_token,p_refresh_token,p_expires_at,now())
  on conflict(account_id) do update set access_token=excluded.access_token,
    refresh_token=excluded.refresh_token,expires_at=excluded.expires_at,updated_at=now();
  delete from public.social_oauth_states where expires_at < now();
  return v_account;
end;
$$;
revoke all on function public.social_oauth_save_connection(uuid,uuid,text,text,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.social_oauth_save_connection(uuid,uuid,text,text,text,text,text,timestamptz,text) to service_role;
