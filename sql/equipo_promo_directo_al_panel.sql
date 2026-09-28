-- ═══════════════════════════════════════════════════════════════════════════
--  LA PROMOCIÓN DEL PANEL VA DIRECTO AL ARTE, Y HERMES NO SE METE
--  sql/equipo_promo_directo_al_panel.sql
-- ═══════════════════════════════════════════════════════════════════════════
--
--  >>> CÓMO ERA <<<
--  El dueño elige una pieza en "Qué promocionar hoy" y la encarga. Desde ahí:
--
--   1. El Comercial-Creativo devolvía SOLO TEXTO: un "concepto". El trabajador
--      solo dibuja cuando el pedido dice "ARTE FINAL", y el pedido del panel
--      no lo decía.
--   2. equipo_borrador_a_la_mesa creaba "Aprobar el concepto de…" y llamaba a
--      equipo_avisar_del_borrador, que le escribe al dueño por el canal de
--      Hermes.
--   3. Al aprobar el concepto, equipo_cerrar_al_aprobar mandaba el brief de
--      arte final, y el creativo, por fin, dibujaba.
--   4. Otra vez a la mesa: "Publicar…", y otro aviso por Hermes.
--
--  Dos aprobaciones y dos avisos por el canal para una sola pieza que el dueño
--  YA había elegido. El 28/09/2026 el Motul dio cuatro vueltas así.
--
--  >>> CÓMO QUEDA <<<
--   · El encargo del panel lleva el brief de ARTE FINAL desde el primer
--     mensaje (hermes.equipo_brief_arte: foto real, logo, teléfono, empresa,
--     referencias y reglas de la casa). Elegir la pieza ES aprobar el concepto:
--     el creativo dibuja a la primera.
--   · El trabajo queda marcado origin_platform = 'panel'.
--   · Siendo del panel, NADA sale por el canal de Hermes: ni el "Arte listo",
--     ni los reparos, ni el "Arte aprobado". El dueño está mirando la pantalla
--     de Equipo IA, que es donde ve la pieza y la acepta.
--
--  Lo que NO cambia:
--   · La revisión automática de Hermes (equipo_revisar_arte) sigue igual: si
--     la pieza falla algo comprobable, se devuelve al creativo antes de llegar
--     al dueño. Solo deja de avisar por el canal.
--   · Los encargos que NO vienen del panel —los que Hermes arma por su cuenta
--     o los que se le piden por el chat— siguen exactamente como estaban.
--   · Aprobar un arte NO publica: cierra el trabajo como completado. Eso ya era
--     así (equipo_cerrar_al_aprobar) y así se queda. La publicación va por el
--     formulario de "Publicar una promoción".
--
--  Se parchea la definición VIVA de cada función (pg_get_functiondef), no una
--  copia del repo: el repo puede estar más viejo que producción. Cada parche
--  exige que su fragmento aparezca exactamente una vez; si no, se para.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function pg_temp.parchar(p_src text, p_de text, p_a text)
returns text
language plpgsql
as $f$
declare
  n int;
begin
  n := (length(p_src) - length(replace(p_src, p_de, ''))) / greatest(length(p_de), 1);
  if n <> 1 then
    raise exception 'El fragmento aparece % veces (se esperaba 1): %', n, left(p_de, 90);
  end if;
  return replace(p_src, p_de, p_a);
end
$f$;

do $parche$
declare
  v_src text;
  v_new text;
begin
  -- ── 1. El encargo del panel: marcado, y directo al arte ───────────────
  v_src := pg_get_functiondef('public.equipo_encargar_promocion'::regproc);

  v_new := pg_temp.parchar(v_src,
    'p_solicitado_por => auth.uid(),',
    'p_origin_platform => ''panel'',' || E'\n'
      || '    p_solicitado_por => auth.uid(),');

  -- Elegir la pieza en el panel ES aprobar el concepto: el creativo recibe
  -- el brief de arte final desde el primer mensaje y dibuja a la primera.
  -- Ronda 1: la misma clave de idempotencia de siempre, así que el
  -- "ya se encargó hoy" sigue funcionando igual.
  v_new := pg_temp.parchar(v_new,
    'hermes.equipo_encargar_a(v_trabajo, ''comercial_creativo'');',
    'hermes.equipo_encargar_a(v_trabajo, ''comercial_creativo'', 1,'
      || ' hermes.equipo_brief_arte(v_tenant, v_pet));');

  execute v_new;

  -- ── 2. Cuando llega el borrador: sin avisos por Hermes si es del panel ─
  v_src := pg_get_functiondef('public.equipo_borrador_a_la_mesa'::regproc);

  -- Los reparos: se devuelve al creativo igual, pero sin contárselo al dueño
  -- por el canal. En la pantalla se ve que el creativo está corrigiendo.
  v_new := pg_temp.parchar(v_src,
    'INSERT INTO public.hermes_chat',
    'IF v_w.origin_platform IS DISTINCT FROM ''panel'' THEN INSERT INTO public.hermes_chat');
  v_new := pg_temp.parchar(v_new,
    '''respondido'', true, now(), ''text'');',
    '''respondido'', true, now(), ''text''); END IF;');

  -- El "🎨 Arte listo — apruébalo aquí mismo": es justo lo que el dueño no
  -- quiere recibir por Hermes cuando lo encargó desde el panel.
  v_new := pg_temp.parchar(v_new,
    'PERFORM public.equipo_avisar_del_borrador(v_w.tenant_id, v_w.conversation_key,',
    'IF v_w.origin_platform IS DISTINCT FROM ''panel'' THEN'
      || ' PERFORM public.equipo_avisar_del_borrador(v_w.tenant_id, v_w.conversation_key,');
  v_new := pg_temp.parchar(v_new,
    'v_w.context_epoch, v_w.titulo, NEW.payload, v_num);',
    'v_w.context_epoch, v_w.titulo, NEW.payload, v_num); END IF;');

  execute v_new;

  -- ── 3. Al aprobar: sin el "✅ Arte aprobado" por Hermes si es del panel ─
  v_src := pg_get_functiondef('public.equipo_cerrar_al_aprobar'::regproc);

  v_new := pg_temp.parchar(v_src,
    'INSERT INTO public.hermes_chat',
    'IF v_w.origin_platform IS DISTINCT FROM ''panel'' THEN INSERT INTO public.hermes_chat');
  v_new := pg_temp.parchar(v_new,
    'COALESCE(v_w.context_epoch,1), ''respondido'', true, now(), ''text'');',
    'COALESCE(v_w.context_epoch,1), ''respondido'', true, now(), ''text''); END IF;');

  execute v_new;
end
$parche$;

-- ═══════════════════════════════════════════════════════════════════════════
--  SIMULACRO — el flujo entero, contra producción, y se borra solo.
--  Nada de esto llega al creativo: todo se borra antes de confirmar, así que
--  el trabajador nunca ve un encargo pendiente.
-- ═══════════════════════════════════════════════════════════════════════════
do $prueba$
declare
  v_dueno   uuid := 'a9a2d9fd-c408-4d33-b1c7-1f7f29e397fb';
  v_tenant  uuid := '00000000-0000-0000-0000-000000000001';
  v_prod    uuid;
  v_precio  numeric;
  v_res     json;
  v_trabajo uuid;
  v_w       record;
  v_texto   text;
  v_chat_antes  int;
  v_chat_despues int;
  v_aprob   uuid;
  v_msg     uuid;
  v_fallos  text := '';
begin
  -- Una pieza real con foto, para que el brief tenga material.
  -- Con su precio de catálogo: la revisión de Hermes compara el de la pieza
  -- al centavo, y una pieza con otro precio se devuelve antes de la mesa.
  select p.id, p.precio into v_prod, v_precio from public.productos p
   where p.tenant_id = v_tenant and coalesce(p.activo, true)
     and coalesce(p.imagen_url, '') <> ''
   order by p.updated_at desc nulls last limit 1;

  select count(*) into v_chat_antes from public.hermes_chat where tenant_id = v_tenant;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dueno::text, 'role', 'authenticated')::text, true);

  -- 1. El encargo desde el panel. El enfoque único evita chocar con un
  --    encargo de verdad de hoy.
  v_res := public.equipo_encargar_promocion(array[v_prod],
    'SIMULACRO ' || gen_random_uuid()::text, 'historia');
  v_trabajo := (v_res ->> 'trabajo_id')::uuid;

  reset role;

  select * into v_w from public.equipo_trabajos where id = v_trabajo;
  if v_w.origin_platform is distinct from 'panel' then
    v_fallos := v_fallos || format('[1] el trabajo no quedo marcado del panel (%s). ', coalesce(v_w.origin_platform, 'NULL'));
  end if;

  select m.payload ->> 'texto' into v_texto from public.equipo_mensajes m
   where m.trabajo_id = v_trabajo and m.to_agent = 'comercial_creativo'
   order by m.created_at limit 1;
  if coalesce(v_texto, '') not like '%ARTE FINAL%' then
    v_fallos := v_fallos || '[2] el primer encargo al creativo no pide ARTE FINAL: dibujaria solo texto. ';
  end if;
  if coalesce(v_texto, '') not like '%Foto real del producto:%' then
    v_fallos := v_fallos || '[3] el encargo no lleva la foto del producto. ';
  end if;

  -- 2. El creativo entrega el arte. Se simula su respuesta tal cual la
  --    escribe el trabajador (hermes.equipo_responder deja un draft_result).
  update public.equipo_mensajes set status = 'completed'
   where trabajo_id = v_trabajo and to_agent = 'comercial_creativo';

  insert into public.equipo_mensajes
    (tenant_id, trabajo_id, conversation_key, context_epoch, correlation_id,
     profundidad, from_agent, to_agent, message_type, status, priority,
     summary, payload, idempotency_key)
  values
    (v_tenant, v_trabajo, v_w.conversation_key, v_w.context_epoch, v_trabajo,
     2, 'comercial_creativo', 'hermes', 'draft_result', 'pending', 5,
     'Simulacro: pieza montada',
     jsonb_build_object(
       'estado', 'arte',
       'resumen', 'Simulacro: pieza montada',
       'arte', jsonb_build_object('titulo', 'SIMULACRO', 'precio', to_char(v_precio, 'FM999999990.00'),
                                  'fondo', '#0b1e3a', 'acento', '#f5a623'),
       'arte_imagen_id', gen_random_uuid(),
       'arte_historia_id', gen_random_uuid(),
       'copy', jsonb_build_object(
         'facebook', jsonb_build_object('titulo', 'Simulacro', 'descripcion', 'RD$ 100.00'),
         'instagram', jsonb_build_object('titulo', 'Simulacro', 'descripcion', 'RD$ 100.00'))),
     'simulacro-arte:' || v_trabajo::text)
  returning id into v_msg;

  select count(*) into v_chat_despues from public.hermes_chat where tenant_id = v_tenant;
  if v_chat_despues <> v_chat_antes then
    v_fallos := v_fallos || format('[4] Hermes le escribio al dueño por el canal (%s mensajes nuevos). ',
      v_chat_despues - v_chat_antes);
  end if;

  -- 3. Si pasó la revisión, está en la mesa. Aceptarla cierra el trabajo sin
  --    publicar nada y, siendo del panel, sin avisar por Hermes.
  select a.id into v_aprob from public.equipo_aprobaciones a
   where a.trabajo_id = v_trabajo and a.estado = 'pending'
   order by a.creado_en desc limit 1;

  if v_aprob is not null then
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_dueno::text, 'role', 'authenticated')::text, true);
    perform public.equipo_decidir(v_aprob, 'approved', null);
    reset role;

    if (select estado from public.equipo_trabajos where id = v_trabajo) <> 'completed' then
      v_fallos := v_fallos || '[5] aceptar el arte no cerro el trabajo. ';
    end if;

    select count(*) into v_chat_despues from public.hermes_chat where tenant_id = v_tenant;
    if v_chat_despues <> v_chat_antes then
      v_fallos := v_fallos || '[6] al aceptar, Hermes le escribio al dueño por el canal. ';
    end if;
  end if;

  -- Limpieza: el simulacro no deja rastro.
  delete from public.equipo_aprobaciones where trabajo_id = v_trabajo;
  delete from public.equipo_mensajes where trabajo_id = v_trabajo;
  delete from public.equipo_trabajos where id = v_trabajo;

  if v_fallos <> '' then
    raise exception 'SIMULACRO FALLIDO: %', v_fallos;
  end if;
  raise notice 'Promocion del panel: directo al arte y sin avisos por Hermes (aprobacion en la mesa: %).',
    case when v_aprob is null then 'no, la reviso Hermes' else 'si' end;
end
$prueba$;

select public.registrar_migracion('equipo_promo_directo_al_panel.sql');
