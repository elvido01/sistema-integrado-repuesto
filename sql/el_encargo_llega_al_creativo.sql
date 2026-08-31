-- ============================================================
-- EL ENCARGO LLEGA AL COMERCIAL-CREATIVO
-- ============================================================
-- 30/08/2026, ya de noche. Hermes por fin propuso, el dueño autorizó, y el
-- trabajo se abrió: "Promoción ACEITE 20W50 MINERAL DTS-11L BAJAJ", con el
-- código, el precio del catálogo, las 58 unidades y el encargo de entregar
-- un borrador. Todo correcto.
--
-- Y se quedó "En cola" sin que nadie lo tomara.
--
-- El motivo, mirando hermes.equipo_tomar(): el reparto no mira los trabajos,
-- mira los MENSAJES dirigidos a cada agente. Y equipo_abrir_trabajo() crea un
-- solo mensaje: de 'elvido' para 'hermes', ya 'completed'. Nada para el
-- Comercial-Creativo.
--
-- El diseño espera que un ORQUESTADOR —un worker de Hermes dentro de Equipo
-- IA— oiga el pg_notify('equipo_ia') y reparta. Ese worker no existe: en
-- equipo_workers solo están jarvis y comercial_creativo, y el de Hermes no se
-- ha registrado nunca.
--
-- Pero para una promoción no hay nada que decidir. La regla del dueño es
-- explícita: el Comercial-Creativo hace TODO lo creativo. Así que el encargo
-- se asigna en el mismo acto, sin intermediario que pueda faltar.
--
-- Esto NO sustituye al orquestador: cuando exista, seguirá repartiendo lo
-- demás (consultas, seguimientos, lo que haya que pensar). Solo se le quita
-- de las manos el caso en el que no hay decisión posible.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ASIGNARLE EL TRABAJO A UN AGENTE
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION hermes.equipo_encargar_a(
  p_trabajo_id uuid,
  p_agente     text DEFAULT 'comercial_creativo')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_w    record;
  v_tipo text;
  v_id   uuid;
  v_idem text;
BEGIN
  IF p_agente NOT IN ('jarvis', 'comercial_creativo') THEN
    RAISE EXCEPTION 'A ese agente no se le encargan trabajos: %', p_agente;
  END IF;

  SELECT * INTO v_w FROM public.equipo_trabajos WHERE id = p_trabajo_id;
  IF v_w.id IS NULL THEN
    RAISE EXCEPTION 'El trabajo % no existe', p_trabajo_id;
  END IF;

  -- Pedir dos veces lo mismo no abre dos encargos. Misma regla que en todo
  -- el esquema: la clave la pone el contenido, no el que llama.
  v_idem := 'encargo:' || p_trabajo_id::text || ':' || p_agente;

  SELECT m.id INTO v_id FROM public.equipo_mensajes m
  WHERE m.tenant_id = v_w.tenant_id AND m.idempotency_key = v_idem;

  IF v_id IS NOT NULL THEN
    RETURN json_build_object('ok', true, 'duplicado', true, 'mensaje_id', v_id);
  END IF;

  -- Una promoción es trabajo creativo; lo demás es delegación normal.
  v_tipo := CASE WHEN v_w.tipo = 'promocion' AND p_agente = 'comercial_creativo'
                 THEN 'creative_request' ELSE 'delegation' END;

  INSERT INTO public.equipo_mensajes
    (tenant_id, trabajo_id, conversation_key, context_epoch, correlation_id,
     profundidad, from_agent, to_agent, message_type, status, priority,
     summary, payload, idempotency_key)
  VALUES
    (v_w.tenant_id, v_w.id, v_w.conversation_key, v_w.context_epoch, v_w.id,
     1, 'hermes', p_agente, v_tipo, 'pending', 5,
     left(v_w.titulo, 200),
     jsonb_build_object('texto', v_w.peticion, 'tipo', v_w.tipo,
                        'titulo', v_w.titulo),
     v_idem)
  RETURNING id INTO v_id;

  -- El mismo aviso que usa el resto del sistema, por si alguien escucha.
  PERFORM pg_notify('equipo_ia', json_build_object(
    'tipo', 'encargo_nuevo', 'trabajo_id', v_w.id,
    'para', p_agente, 'tenant_id', v_w.tenant_id)::text);

  RETURN json_build_object('ok', true, 'duplicado', false,
                           'mensaje_id', v_id, 'para', p_agente, 'tipo', v_tipo);
END $fn$;

REVOKE ALL ON FUNCTION hermes.equipo_encargar_a(uuid, text) FROM PUBLIC;
DO $g$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hermes_readonly') THEN
    GRANT EXECUTE ON FUNCTION hermes.equipo_encargar_a(uuid, text) TO hermes_readonly;
  END IF;
END $g$;

-- ------------------------------------------------------------
-- 2. QUE EL ENCARGO DE PROMOCIÓN LO HAGA SOLO
-- ------------------------------------------------------------
-- Mismo cuerpo que ya había; lo único nuevo son las tres líneas que
-- asignan el trabajo recién abierto.
CREATE OR REPLACE FUNCTION public._agente_ejecutar_encargo_promocion(p_tenant uuid, p_payload jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_cod   text := btrim(COALESCE(p_payload ->> 'codigo', ''));
  v_prod  record;
  v_ang   text := NULLIF(btrim(COALESCE(p_payload ->> 'angulo', '')), '');
  v_canal text := NULLIF(btrim(COALESCE(p_payload ->> 'canal',  '')), '');
  v_pet   text;
  v_res   json;
  v_asig  json;
BEGIN
  SELECT p.codigo, p.descripcion, p.precio, COALESCE(public.get_stock_actual(p.id), 0) AS existencia
    INTO v_prod
  FROM public.productos p
  WHERE p.tenant_id = p_tenant AND p.codigo = v_cod;

  IF v_prod.codigo IS NULL THEN
    RAISE EXCEPTION 'El producto % ya no está en el catálogo', quote_literal(v_cod);
  END IF;

  -- La petición lleva los datos YA VERIFICADOS contra el catálogo. El
  -- Comercial-Creativo no tiene que volver a buscarlos —ni puede
  -- inventárselos— y el precio que salga en el arte es el de la base.
  v_pet := format(
    'Prepara la promoción de %s (código %s). Precio de catálogo: RD$ %s. Existencia: %s.%s%s'
    || E'\n\nEntrega un BORRADOR para aprobación: no publiques nada.',
    v_prod.descripcion, v_prod.codigo,
    to_char(COALESCE(v_prod.precio, 0), 'FM999G999G990D00'),
    v_prod.existencia,
    COALESCE(E'\nEnfoque pedido: ' || v_ang, ''),
    COALESCE(E'\nDestino: ' || v_canal, ''));

  v_res := hermes.equipo_abrir_trabajo(
    p_tenant,
    left('Promoción ' || v_prod.descripcion, 60),
    v_pet,
    'promocion',
    NULL, NULL, 'motoflow', auth.uid()::text, NULL, auth.uid(),
    'promo:' || p_tenant::text || ':' || v_cod || ':' || (now() AT TIME ZONE 'America/Santo_Domingo')::date::text);

  -- NUEVO: y se le encarga al Comercial-Creativo en el acto. Sin esto el
  -- trabajo se abría y se quedaba "En cola" esperando a un orquestador que
  -- no existe. Para una promoción no hay a quién más dársela.
  IF COALESCE((v_res ->> 'ok')::boolean, false) THEN
    v_asig := hermes.equipo_encargar_a((v_res ->> 'trabajo_id')::uuid, 'comercial_creativo');
  END IF;

  RETURN json_build_object(
    'ok', true,
    'trabajo', v_res,
    'asignado', v_asig,
    'producto', json_build_object('codigo', v_prod.codigo, 'descripcion', v_prod.descripcion,
                                  'precio', v_prod.precio, 'existencia', v_prod.existencia),
    'donde_verlo', 'Equipo IA → Trabajos activos. Cuando el Comercial-Creativo termine, '
                || 'aparece en Esperando tu aprobación.');
END $fn$;

-- ------------------------------------------------------------
-- 3. EL TRABAJO DE ESTA NOCHE, QUE YA ESTABA ABIERTO
-- ------------------------------------------------------------
-- Se abrió antes de que existiera la asignación automática. Se le pone el
-- encargo ahora en vez de dejarlo huérfano.
DO $rescate$
DECLARE
  v_id  uuid;
  v_res json;
BEGIN
  SELECT w.id INTO v_id
  FROM public.equipo_trabajos w
  WHERE w.tenant_id = '00000000-0000-0000-0000-000000000001'
    AND w.tipo = 'promocion' AND w.estado = 'pending'
    AND NOT EXISTS (SELECT 1 FROM public.equipo_mensajes m
                    WHERE m.trabajo_id = w.id AND m.to_agent = 'comercial_creativo')
  ORDER BY w.creado_en DESC LIMIT 1;

  IF v_id IS NOT NULL THEN
    v_res := hermes.equipo_encargar_a(v_id, 'comercial_creativo');
    RAISE NOTICE 'Rescatado el trabajo %: %', v_id, v_res::text;
  END IF;
END $rescate$;

SELECT public.registrar_migracion('el_encargo_llega_al_creativo.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT json_build_object(
 'mensajes_del_trabajo', (SELECT json_agg(json_build_object(
     'de', m.from_agent, 'para', m.to_agent, 'tipo', m.message_type,
     'status', m.status) ORDER BY m.created_at)
   FROM public.equipo_mensajes m
   WHERE m.trabajo_id = (SELECT w.id FROM public.equipo_trabajos w
     WHERE w.tenant_id = '00000000-0000-0000-0000-000000000001'
     ORDER BY w.creado_en DESC LIMIT 1)),
 'la_base_se_lo_entrega', (SELECT count(*) FROM public.equipo_mensajes m
   WHERE m.to_agent = 'comercial_creativo' AND m.status = 'pending'
     AND m.attempts < 3
     AND NOT (m.requires_approval AND COALESCE(m.approval_status,'pending') <> 'approved'))
) AS r;
