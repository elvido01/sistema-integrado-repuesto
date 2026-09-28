-- ═══════════════════════════════════════════════════════════════════════════
--  EL CREATIVO PIDE SU ESCENA POR EL PUENTE DE LA CASA
--  sql/creativo_escena_permiso.sql
-- ═══════════════════════════════════════════════════════════════════════════
--
--  >>> POR QUÉ <<<
--  El 28/09/2026 el dueño aprobó que las piezas del Comercial-Creativo se
--  hagan con GPT Image 2 (calidad media), y pidió que se use "la misma ruta"
--  que ya existía para la API de imágenes de OpenAI: el puente del Marketing
--  IA, con la clave guardada en los secretos de Supabase y cada imagen
--  anotada en ai_agent_runs.
--
--  El creativo corre en el VPS y entra a la base como hermes_readonly. No
--  tiene sesión de usuario ni llave de servicio, así que no puede llamar a
--  una Edge Function por las buenas. Y la salida fácil —usar la copia de la
--  clave de OpenAI que tiene en su .env— es justo lo que ya se quitó con
--  Jarvis: un secreto duplicado.
--
--  Así que se hace como hermes-media con el audio: la base entrega un
--  PERMISO —de un solo uso, cinco minutos, atado al encargo que el creativo
--  tiene tomado— y la Edge Function creativo-escena lo canjea. De la base
--  se guarda solo el sha256 del permiso, no el permiso.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists hermes.equipo_permisos_escena (
  sha256      text primary key,
  tenant_id   uuid not null,
  mensaje_id  uuid not null,
  formato     text not null check (formato in ('feed', 'historia')),
  creado_en   timestamptz not null default now(),
  expira_en   timestamptz not null default now() + interval '5 minutes',
  usado_en    timestamptz
);

-- Nadie lee esto salvo las dos funciones de abajo.
alter table hermes.equipo_permisos_escena enable row level security;
revoke all on hermes.equipo_permisos_escena from public, anon, authenticated;

-- ── El creativo pide permiso ──────────────────────────────────────────────
create or replace function hermes.equipo_permiso_escena(
  p_mensaje_id  uuid,
  p_claim_token uuid,
  p_formato     text
)
returns json
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_m     record;
  v_token text;
begin
  if p_formato not in ('feed', 'historia') then
    raise exception 'Formato no admitido: %', p_formato;
  end if;

  select m.id, m.tenant_id, m.claim_token, m.to_agent into v_m
    from public.equipo_mensajes m where m.id = p_mensaje_id;
  if v_m.id is null then
    raise exception 'Ese mensaje no existe';
  end if;
  -- Solo quien tiene tomado el encargo. Un permiso suelto no se reparte.
  if v_m.claim_token is distinct from p_claim_token then
    return json_build_object('ok', false, 'motivo', 'claim_reemplazado', 'abandonar', true);
  end if;
  if v_m.to_agent <> 'comercial_creativo' then
    raise exception 'Solo el Comercial-Creativo pide escenas.';
  end if;

  -- Los vencidos no sirven para nada: se barren al pedir uno nuevo.
  delete from hermes.equipo_permisos_escena where expira_en < now() - interval '1 day';

  v_token := encode(gen_random_bytes(24), 'hex');
  insert into hermes.equipo_permisos_escena (sha256, tenant_id, mensaje_id, formato)
  values (encode(digest(v_token, 'sha256'), 'hex'), v_m.tenant_id, v_m.id, p_formato);

  return json_build_object(
    'ok', true,
    'token', v_token,
    'url', 'https://zdvxowpuklbypweyqqki.supabase.co/functions/v1/creativo-escena');
end;
$$;

revoke all on function hermes.equipo_permiso_escena(uuid, uuid, text) from public, anon, authenticated;
grant execute on function hermes.equipo_permiso_escena(uuid, uuid, text) to hermes_readonly;

-- ── La Edge Function lo canjea ────────────────────────────────────────────
create or replace function public.equipo_canjear_permiso_escena(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_p record;
begin
  update hermes.equipo_permisos_escena
     set usado_en = now()
   where sha256 = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and usado_en is null
     and expira_en > now()
  returning * into v_p;

  if v_p.sha256 is null then
    return jsonb_build_object('ok', false, 'motivo', 'permiso_invalido_usado_o_vencido');
  end if;
  return jsonb_build_object('ok', true, 'tenant_id', v_p.tenant_id,
                            'mensaje_id', v_p.mensaje_id, 'formato', v_p.formato);
end;
$$;

revoke all on function public.equipo_canjear_permiso_escena(text) from public, anon, authenticated;
grant execute on function public.equipo_canjear_permiso_escena(text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
--  PRUEBA
-- ═══════════════════════════════════════════════════════════════════════════
do $prueba$
declare
  v_msg    uuid;
  v_claim_antes uuid;
  v_claim  uuid := gen_random_uuid();
  v_res    json;
  v_canje  jsonb;
  v_fallos text := '';
begin
  -- Un mensaje cualquiera del creativo, con un claim de prueba puesto a mano.
  select id, claim_token into v_msg, v_claim_antes from public.equipo_mensajes
   where to_agent = 'comercial_creativo' order by created_at desc limit 1;
  if v_msg is null then
    raise notice 'Sin mensajes del creativo para probar; se omite la prueba.';
    return;
  end if;
  update public.equipo_mensajes set claim_token = v_claim where id = v_msg;

  -- 1. Con el claim bueno, da permiso.
  v_res := hermes.equipo_permiso_escena(v_msg, v_claim, 'feed');
  if not coalesce((v_res ->> 'ok')::boolean, false) or v_res ->> 'token' is null then
    v_fallos := v_fallos || '[1] con el claim bueno no dio permiso. ';
  end if;

  -- 2. De la base solo se guarda la huella.
  if exists (select 1 from hermes.equipo_permisos_escena where sha256 = v_res ->> 'token') then
    v_fallos := v_fallos || '[2] se guardo el permiso en claro. ';
  end if;

  -- 3. Se canjea una vez...
  v_canje := public.equipo_canjear_permiso_escena(v_res ->> 'token');
  if not coalesce((v_canje ->> 'ok')::boolean, false) or v_canje ->> 'formato' <> 'feed' then
    v_fallos := v_fallos || '[3] el permiso bueno no se pudo canjear. ';
  end if;
  -- 4. ...y no dos.
  v_canje := public.equipo_canjear_permiso_escena(v_res ->> 'token');
  if coalesce((v_canje ->> 'ok')::boolean, false) then
    v_fallos := v_fallos || '[4] el permiso se pudo canjear dos veces. ';
  end if;

  -- 5. Con un claim ajeno no da permiso.
  v_res := hermes.equipo_permiso_escena(v_msg, gen_random_uuid(), 'feed');
  if coalesce((v_res ->> 'ok')::boolean, false) then
    v_fallos := v_fallos || '[5] dio permiso a quien no tenia tomado el encargo. ';
  end if;

  -- 6. Un usuario con sesión no puede canjear.
  begin
    set local role authenticated;
    perform public.equipo_canjear_permiso_escena('lo-que-sea');
    reset role;
    v_fallos := v_fallos || '[6] un usuario con sesion pudo canjear permisos. ';
  exception when insufficient_privilege then
    reset role;
  end;

  -- Limpieza.
  delete from hermes.equipo_permisos_escena where mensaje_id = v_msg;
  -- El claim vuelve a ser el que tenía: esto es un mensaje real.
  update public.equipo_mensajes set claim_token = v_claim_antes where id = v_msg and claim_token = v_claim;

  if v_fallos <> '' then
    raise exception 'PRUEBA FALLIDA: %', v_fallos;
  end if;
  raise notice 'Permisos de escena: las 6 comprobaciones pasaron.';
end
$prueba$;

select public.registrar_migracion('creativo_escena_permiso.sql');
