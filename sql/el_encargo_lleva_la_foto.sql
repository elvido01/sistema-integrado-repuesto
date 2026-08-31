-- ============================================================
-- EL ENCARGO LLEVA LA FOTO
-- ============================================================
-- El Comercial-Creativo entregó el borrador del aceite y avisó por su cuenta:
--
--   "No se recibió foto real del producto: falta antes de publicar"
--   "Foto real del producto (envase del aceite 20W50 DTS-11L Bajaj), no usar
--    imagen de stock o genérica"
--
-- Tenía razón y el dato existía: productos.imagen_url. La ficha del aceite
-- apunta a product-images, que es un bucket PÚBLICO — se abre con la URL, sin
-- sesión ni llave.
--
-- Por eso la foto se le ENTREGA, no se le da acceso a la base para que la
-- busque. Es el mismo criterio que con el precio y la existencia: el encargo
-- viaja con los datos ya verificados contra el catálogo, y el creativo no
-- tiene que consultar nada ni puede equivocarse de pieza.
--
-- Y cuando la ficha no tenga foto, el encargo lo dice con todas las letras en
-- vez de callarlo: así el aviso sale del catálogo y no de la intuición del
-- creativo.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PODER ENCARGAR UNA SEGUNDA VUELTA
-- ------------------------------------------------------------
-- La versión anterior era idempotente por (trabajo, agente): perfecto para no
-- duplicar un encargo, pero impedía volver a pedirlo con datos nuevos. La
-- ronda entra en la clave.
CREATE OR REPLACE FUNCTION hermes.equipo_encargar_a(
  p_trabajo_id uuid,
  p_agente     text DEFAULT 'comercial_creativo',
  p_ronda      integer DEFAULT 1,
  p_nota       text DEFAULT NULL)
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
  v_pet  text;
BEGIN
  IF p_agente NOT IN ('jarvis', 'comercial_creativo') THEN
    RAISE EXCEPTION 'A ese agente no se le encargan trabajos: %', p_agente;
  END IF;

  SELECT * INTO v_w FROM public.equipo_trabajos WHERE id = p_trabajo_id;
  IF v_w.id IS NULL THEN
    RAISE EXCEPTION 'El trabajo % no existe', p_trabajo_id;
  END IF;

  v_idem := 'encargo:' || p_trabajo_id::text || ':' || p_agente
            || CASE WHEN COALESCE(p_ronda, 1) > 1 THEN ':r' || p_ronda::text ELSE '' END;

  SELECT m.id INTO v_id FROM public.equipo_mensajes m
  WHERE m.tenant_id = v_w.tenant_id AND m.idempotency_key = v_idem;

  IF v_id IS NOT NULL THEN
    RETURN json_build_object('ok', true, 'duplicado', true, 'mensaje_id', v_id);
  END IF;

  v_tipo := CASE WHEN v_w.tipo = 'promocion' AND p_agente = 'comercial_creativo'
                 THEN 'creative_request' ELSE 'delegation' END;

  v_pet := v_w.peticion || COALESCE(E'\n\n' || p_nota, '');

  INSERT INTO public.equipo_mensajes
    (tenant_id, trabajo_id, conversation_key, context_epoch, correlation_id,
     profundidad, from_agent, to_agent, message_type, status, priority,
     summary, payload, idempotency_key)
  VALUES
    (v_w.tenant_id, v_w.id, v_w.conversation_key, v_w.context_epoch, v_w.id,
     1, 'hermes', p_agente, v_tipo, 'pending', 5,
     left(v_w.titulo, 200),
     jsonb_build_object('texto', v_pet, 'tipo', v_w.tipo, 'titulo', v_w.titulo,
                        'ronda', COALESCE(p_ronda, 1)),
     v_idem)
  RETURNING id INTO v_id;

  PERFORM pg_notify('equipo_ia', json_build_object(
    'tipo', 'encargo_nuevo', 'trabajo_id', v_w.id,
    'para', p_agente, 'tenant_id', v_w.tenant_id)::text);

  RETURN json_build_object('ok', true, 'duplicado', false,
                           'mensaje_id', v_id, 'para', p_agente, 'tipo', v_tipo,
                           'ronda', COALESCE(p_ronda, 1));
END $fn$;

DO $g$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hermes_readonly') THEN
    GRANT EXECUTE ON FUNCTION hermes.equipo_encargar_a(uuid, text, integer, text) TO hermes_readonly;
  END IF;
END $g$;

-- ------------------------------------------------------------
-- 2. LA PETICIÓN INCLUYE LA FOTO
-- ------------------------------------------------------------
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
  v_foto  text;
  v_pet   text;
  v_res   json;
  v_asig  json;
BEGIN
  SELECT p.codigo, p.descripcion, p.precio, p.imagen_url,
         COALESCE(public.get_stock_actual(p.id), 0) AS existencia
    INTO v_prod
  FROM public.productos p
  WHERE p.tenant_id = p_tenant AND p.codigo = v_cod;

  IF v_prod.codigo IS NULL THEN
    RAISE EXCEPTION 'El producto % ya no está en el catálogo', quote_literal(v_cod);
  END IF;

  -- La foto de la ficha, o la ausencia dicha en voz alta. El creativo ya
  -- avisó de que sin foto real no se publica; que ese aviso salga del
  -- catálogo y no de su intuición.
  v_foto := NULLIF(btrim(COALESCE(v_prod.imagen_url, '')), '');
  IF v_foto IS NOT NULL THEN
    v_pet := E'\nFoto real del producto (del catálogo, úsala tal cual, no busques otra): ' || v_foto;
  ELSE
    v_pet := E'\nEsta pieza NO tiene foto en el catálogo. Prepara el copy y di qué foto hace falta; no inventes una imagen de stock.';
  END IF;

  v_pet := format(
    'Prepara la promoción de %s (código %s). Precio de catálogo: RD$ %s. Existencia: %s.%s%s%s'
    || E'\n\nEntrega un BORRADOR para aprobación: no publiques nada.',
    v_prod.descripcion, v_prod.codigo,
    to_char(COALESCE(v_prod.precio, 0), 'FM999G999G990D00'),
    v_prod.existencia,
    COALESCE(E'\nEnfoque pedido: ' || v_ang, ''),
    COALESCE(E'\nDestino: ' || v_canal, ''),
    v_pet);

  v_res := hermes.equipo_abrir_trabajo(
    p_tenant,
    left('Promoción ' || v_prod.descripcion, 60),
    v_pet,
    'promocion',
    NULL, NULL, 'motoflow', auth.uid()::text, NULL, auth.uid(),
    'promo:' || p_tenant::text || ':' || v_cod || ':' || (now() AT TIME ZONE 'America/Santo_Domingo')::date::text);

  IF COALESCE((v_res ->> 'ok')::boolean, false) THEN
    v_asig := hermes.equipo_encargar_a((v_res ->> 'trabajo_id')::uuid, 'comercial_creativo');
  END IF;

  RETURN json_build_object(
    'ok', true,
    'trabajo', v_res,
    'asignado', v_asig,
    'producto', json_build_object('codigo', v_prod.codigo, 'descripcion', v_prod.descripcion,
                                  'precio', v_prod.precio, 'existencia', v_prod.existencia,
                                  'foto', v_foto),
    'donde_verlo', 'Equipo IA → Trabajos activos. Cuando el Comercial-Creativo termine, '
                || 'aparece en Esperando tu aprobación.');
END $fn$;

-- ------------------------------------------------------------
-- 3. AL DE ESTA NOCHE SE LE MANDA LA FOTO
-- ------------------------------------------------------------
-- El borrador del aceite ya está entregado, pero sin foto porque el encargo
-- no la llevaba. Se le pide una segunda ronda con la imagen.
DO $ronda2$
DECLARE
  v_w    record;
  v_foto text;
  v_res  json;
BEGIN
  SELECT w.* INTO v_w FROM public.equipo_trabajos w
  WHERE w.tenant_id = '00000000-0000-0000-0000-000000000001'
    AND w.tipo = 'promocion'
    AND w.estado IN ('waiting_approval', 'pending', 'processing')
  ORDER BY w.creado_en DESC LIMIT 1;

  IF v_w.id IS NULL THEN RETURN; END IF;

  SELECT p.imagen_url INTO v_foto FROM public.productos p
  WHERE p.tenant_id = v_w.tenant_id
    AND v_w.peticion LIKE '%' || p.codigo || '%'
  ORDER BY length(p.codigo) DESC LIMIT 1;

  IF v_foto IS NULL THEN RETURN; END IF;

  v_res := hermes.equipo_encargar_a(v_w.id, 'comercial_creativo', 2,
    'Añadido: foto real del producto, del catálogo. Úsala tal cual, no busques otra ni uses imagen de stock: '
    || v_foto || E'\n\nRehaz el borrador incorporándola. El copy anterior sirve de base.');

  RAISE NOTICE 'Segunda ronda pedida: %', v_res::text;
END $ronda2$;

SELECT public.registrar_migracion('el_encargo_lleva_la_foto.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT json_build_object(
 'peticion_lleva_foto', (SELECT m.payload ->> 'texto' LIKE '%product-images%'
   FROM public.equipo_mensajes m
   WHERE m.to_agent = 'comercial_creativo'
   ORDER BY m.created_at DESC LIMIT 1),
 'ultimo_encargo', (SELECT json_build_object('status', m.status, 'ronda', m.payload ->> 'ronda',
     'tomado', m.claimed_at)
   FROM public.equipo_mensajes m WHERE m.to_agent = 'comercial_creativo'
   ORDER BY m.created_at DESC LIMIT 1),
 'aprobaciones_pendientes', (SELECT count(*) FROM public.equipo_aprobaciones WHERE estado='pending')
) AS r;
