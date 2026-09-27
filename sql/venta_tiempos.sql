-- ═══════════════════════════════════════════════════════════════════════════
--  CUÁNTO ESPERA EL CLIENTE DEL MOSTRADOR
--  sql/venta_tiempos.sql
-- ═══════════════════════════════════════════════════════════════════════════
--
--  >>> POR QUE UNA TABLA Y NO UN console.log <<<
--  "Sigue tardando mucho" no se arregla adivinando. Del lado del servidor ya
--  está medido y no es: los cinco disparadores de inventario_movimientos
--  suman 39 ms para una venta de cinco renglones, y get_stock_actual tarda
--  18 ms. Así que el tiempo se va en el camino —la red, la impresora, la
--  emisión fiscal— y eso solo se ve DESDE LA CAJA, con la conexión de la
--  tienda y la impresora de la tienda.
--
--  Pedirle al cajero que abra la consola del navegador y copie un renglón no
--  es un plan. Cada venta anota sola cuánto tardó cada tramo; yo lo leo de
--  aquí. Se escribe en segundo plano, después de que el papel salió: medir no
--  puede costarle tiempo a lo que se está midiendo.
--
--  Esto NO guarda nada del cliente ni de la venta: número de factura,
--  milisegundos y cuántos renglones. Nada más.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.venta_tiempos (
  id            bigserial primary key,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  factura_numero text,
  lineas        integer,
  total_ms      integer not null,
  etapas        jsonb not null default '{}'::jsonb,
  metodo_impresion text,
  usuario_id    uuid,
  creado_at     timestamptz not null default now()
);

create index if not exists venta_tiempos_tenant_idx
  on public.venta_tiempos (tenant_id, creado_at desc);

alter table public.venta_tiempos enable row level security;

drop policy if exists venta_tiempos_tenant_select on public.venta_tiempos;
create policy venta_tiempos_tenant_select
  on public.venta_tiempos for select
  using (tenant_id = (select public.get_user_tenant()));

-- El que factura es el que anota. No hay UPDATE ni DELETE a propósito: una
-- medición que se puede retocar no mide nada.
drop policy if exists venta_tiempos_tenant_insert on public.venta_tiempos;
create policy venta_tiempos_tenant_insert
  on public.venta_tiempos for insert
  with check (tenant_id = (select public.get_user_tenant()));

grant select, insert on public.venta_tiempos to authenticated;
grant usage, select on sequence public.venta_tiempos_id_seq to authenticated;

-- ── Lo que se mira para decidir dónde está el freno ───────────────────────
create or replace view public.v_venta_tiempos_resumen as
select
  tenant_id,
  count(*) ventas,
  round(avg(total_ms))                                         promedio_ms,
  percentile_disc(0.5) within group (order by total_ms)         mediana_ms,
  max(total_ms)                                                 peor_ms,
  round(avg((etapas->>'ncf')::numeric))                         ncf_ms,
  round(avg((etapas->>'factura')::numeric))                     factura_ms,
  round(avg((etapas->>'lineas')::numeric))                      lineas_ms,
  round(avg((etapas->>'impresion')::numeric))                   impresion_ms,
  round(avg((etapas->>'fiscal')::numeric))                      fiscal_ms,
  max(creado_at)                                                ultima
from public.venta_tiempos
group by tenant_id;

do $prueba$
declare
  v_admin  uuid := '0a751661-5ec4-4136-a75c-b4d8493beae0';
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_id bigint;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);

  insert into public.venta_tiempos (tenant_id, factura_numero, lineas, total_ms, etapas)
  values (v_tenant, 'PRUEBA', 3, 1234, '{"ncf":100}'::jsonb)
  returning id into v_id;

  if v_id is null then
    raise exception 'SIMULACRO FALLIDO: el cajero no pudo anotar su medicion.';
  end if;
  if not exists (select 1 from public.venta_tiempos where id = v_id) then
    raise exception 'SIMULACRO FALLIDO: anotó pero no puede leer lo suyo.';
  end if;

  reset role;
  delete from public.venta_tiempos where id = v_id;
  raise notice 'venta_tiempos: el cajero puede anotar y leer.';
end;
$prueba$;

select public.registrar_migracion('venta_tiempos.sql');
