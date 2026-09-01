-- ============================================================
-- LA MISMA PIEZA, OTRO DÍA, ES OTRA PROMOCIÓN
-- ============================================================
-- El dueño eligió una pieza en "Qué promocionar hoy", la mandó, y la pantalla
-- le contestó "Encargado al Comercial-Creativo". No se encargó nada. No hubo
-- error, no hubo trabajo, no hubo nada: el panel siguió en cero.
--
-- >>> LA CLAVE DE IDEMPOTENCIA NO SABE QUÉ DÍA ES <<<
--
-- `equipo_encargar_promocion` no pasa `p_idempotency_key`, así que
-- `equipo_abrir_trabajo` cae a su respaldo:
--
--   'trabajo:' || md5(tenant || conversation_key || epoch || peticion)
--
-- Y la petición del panel es siempre la misma para la misma pieza: nombre,
-- código y precio de catálogo. Comprobado contra las dos promociones que
-- salieron del panel el 31/08 — la clave recalculada hoy sale idéntica,
-- carácter por carácter. Así que:
--
--   · `equipo_abrir_trabajo` devuelve `duplicado: true` y el trabajo VIEJO
--   · `equipo_encargar_a` ve que aquel encargo está 'completed' y también
--     devuelve `duplicado: true`, sin revivir nada (revivir es solo para los
--     muertos: 'failed' y 'cancelled')
--   · los dos contestan `ok: true`, la pantalla canta victoria, y el trabajo
--     que se enseña es uno de hace dos semanas
--
-- La idempotencia está para que un doble clic no abra dos promociones. No
-- para que una pieza promocionada una vez no se pueda volver a promocionar
-- NUNCA. La diferencia entre las dos cosas es el día — y por eso la otra
-- puerta, la de Hermes (`_agente_ejecutar_encargo_promocion`), lleva desde el
-- principio la fecha dentro de su clave. Al panel se le olvidó.
--
-- Aquí la clave lleva las piezas, el enfoque, el formato y el día local. Con
-- eso: doble clic sigue siendo un trabajo; cambiar el enfoque abre otro; y
-- mañana la misma pieza vuelve a poder promocionarse.
--
-- >>> Y SE DEJA DE MENTIR CUANDO ES DUPLICADO <<<
-- La función devuelve `duplicado` arriba del todo para que la pantalla pueda
-- decir "esa ya se encargó hoy" en vez de "encargado". Un ok que no hizo nada
-- es peor que un error: el error se ve.
--
-- ------------------------------------------------------------
-- Y LA SEGUNDA: CANCELAR NO APAGABA EL ROJO
-- ------------------------------------------------------------
-- La tarjeta del Comercial-Creativo llevaba en "Error" desde el 31/08 a las
-- 15:24, por el encargo del tanque de gasolina que murió con aquel "Your
-- organization has disabled Claude subscription access". El trabajo se
-- canceló ese mismo día. El mensaje, no.
--
-- `equipo_trabajo_accion('cancelar')` cancela los mensajes 'pending',
-- 'claimed', 'processing' y 'waiting_dependency' — y se deja fuera justo el
-- que hace ruido. `equipo_panel` pinta 'error' si queda UN mensaje 'failed'
-- vivo para ese agente, así que cancelar el trabajo roto dejaba la alarma
-- encendida para siempre y sin ningún botón que la apagara.
--
-- Cancelar un trabajo es decir "ya no me interesa esto". Sus fracasos se van
-- con él.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. UNA PROMOCIÓN POR PIEZA, POR ENFOQUE Y POR DÍA
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.equipo_encargar_promocion(
  p_producto_ids uuid[],
  p_enfoque      text DEFAULT NULL,
  p_formato      text DEFAULT 'historia')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant  uuid := public.get_user_tenant();
  v_n       int;
  v_titulo  text;
  v_cuerpo  text := '';
  v_codigos text := '';
  v_pet     text;
  v_idem    text;
  v_abierto json;
  v_trabajo uuid;
  v_encargo json;
  v_dup     boolean;
  r         record;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Este módulo es del dueño.';
  END IF;

  SELECT count(*) INTO v_n FROM unnest(COALESCE(p_producto_ids, '{}'::uuid[]));
  IF v_n = 0 THEN
    RAISE EXCEPTION 'No elegiste ningún producto.';
  END IF;
  IF v_n > 2 THEN
    RAISE EXCEPTION 'Máximo dos productos por promoción.';
  END IF;
  IF p_formato NOT IN ('historia', 'feed') THEN
    RAISE EXCEPTION 'Formato no admitido: %', p_formato;
  END IF;

  FOR r IN
    SELECT p.codigo, p.descripcion, p.precio, p.imagen_url
    FROM public.productos p
    WHERE p.tenant_id = v_tenant AND p.id = ANY(p_producto_ids)
    ORDER BY p.precio DESC
  LOOP
    v_cuerpo := v_cuerpo || format(
      E'· %s (código %s). Precio de catálogo: RD$ %s.\n',
      r.descripcion, r.codigo, to_char(r.precio, 'FM999G999G990D00'));
    v_codigos := v_codigos || r.codigo || '|';
    v_titulo := COALESCE(v_titulo, r.descripcion);
  END LOOP;

  IF v_cuerpo = '' THEN
    RAISE EXCEPTION 'Esos productos no son de esta empresa.';
  END IF;

  v_pet := 'Prepara la promoción de:' || E'\n' || v_cuerpo
    || COALESCE(E'\nEnfoque pedido: ' || NULLIF(btrim(p_enfoque), '') || E'\n', '')
    || format(E'\nFormato principal: %s.', p_formato)
    || E'\n\nEntrega un BORRADOR para aprobación: no publiques nada.';

  -- El día, en hora local. Sin esto la clave sale del contenido de la
  -- petición —que para la misma pieza es siempre igual— y la promoción de
  -- hace dos semanas se come la de hoy.
  v_idem := 'promo-panel:' || v_tenant::text || ':' || v_codigos
         || ':' || p_formato
         || ':' || md5(COALESCE(btrim(p_enfoque), ''))
         || ':' || (now() AT TIME ZONE 'America/Santo_Domingo')::date::text;

  v_abierto := hermes.equipo_abrir_trabajo(
    p_tenant   => v_tenant,
    p_titulo   => 'Promoción ' || left(v_titulo, 120),
    p_peticion => v_pet,
    p_tipo     => 'promocion',
    p_solicitado_por => auth.uid(),
    p_idempotency_key => v_idem);

  v_trabajo := (v_abierto ->> 'trabajo_id')::uuid;

  -- El encargo va derecho al creativo. Si ya existía y murió, revive.
  v_encargo := hermes.equipo_encargar_a(v_trabajo, 'comercial_creativo');

  -- Duplicado de verdad: el trabajo ya existía Y el encargo tampoco se movió.
  -- Si el encargo revivió, esto SÍ hizo algo y no debe decir lo contrario.
  v_dup := COALESCE((v_abierto ->> 'duplicado')::boolean, false)
       AND COALESCE((v_encargo ->> 'duplicado')::boolean, false);

  RETURN json_build_object('ok', true, 'trabajo_id', v_trabajo,
                           'duplicado', v_dup,
                           'revivido', COALESCE((v_encargo ->> 'revivido')::boolean, false),
                           'trabajo', v_abierto, 'encargo', v_encargo);
END $fn$;

REVOKE ALL ON FUNCTION public.equipo_encargar_promocion(uuid[],text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_encargar_promocion(uuid[],text,text) TO authenticated;

-- ------------------------------------------------------------
-- 2. CANCELAR SE LLEVA LOS FRACASOS
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.equipo_trabajo_accion(p_trabajo_id uuid, p_accion text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_tenant uuid := public.get_user_tenant(); v_n int;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Este módulo es del dueño.';
  END IF;

  IF p_accion = 'cancelar' THEN
    UPDATE public.equipo_trabajos SET estado = 'cancelled', terminado_en = now()
    WHERE id = p_trabajo_id AND tenant_id = v_tenant
      AND estado NOT IN ('completed','cancelled');
    -- 'failed' incluido a propósito: `equipo_panel` pinta la tarjeta del
    -- agente en rojo mientras le quede un mensaje fallido vivo. Sin esto,
    -- cancelar el trabajo roto dejaba la alarma encendida para siempre y sin
    -- ningún botón que la apagara.
    UPDATE public.equipo_mensajes SET status = 'cancelled'
    WHERE trabajo_id = p_trabajo_id
      AND status IN ('pending','claimed','processing','waiting_dependency','failed');
    RETURN json_build_object('ok', true, 'estado', 'cancelled');

  ELSIF p_accion = 'reintentar' THEN
    -- Los intentos vuelven a cero: reintentar a mano es una decisión de una
    -- persona, no el cuarto intento automático de un worker.
    UPDATE public.equipo_mensajes
    SET status = 'pending', attempts = 0, claim_token = NULL, lease_until = NULL
    WHERE trabajo_id = p_trabajo_id AND status = 'failed';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    UPDATE public.equipo_trabajos SET estado = 'pending', error = NULL, terminado_en = NULL
    WHERE id = p_trabajo_id AND tenant_id = v_tenant;
    PERFORM pg_notify('equipo_ia', json_build_object(
      'tipo', 'reintento', 'trabajo_id', p_trabajo_id)::text);
    RETURN json_build_object('ok', true, 'estado', 'pending', 'mensajes', v_n);
  END IF;

  RAISE EXCEPTION 'Acción desconocida: %', p_accion;
END $fn$;

-- ------------------------------------------------------------
-- 3. APAGAR EL ROJO QUE YA ESTABA ENCENDIDO
-- ------------------------------------------------------------
-- La regla nueva, aplicada hacia atrás y solo donde ya se decidió: mensajes
-- fallidos de trabajos que alguien YA canceló. No toca ningún trabajo vivo.
UPDATE public.equipo_mensajes m
   SET status = 'cancelled'
  FROM public.equipo_trabajos w
 WHERE w.id = m.trabajo_id
   AND w.estado = 'cancelled'
   AND m.status = 'failed';

SELECT public.registrar_migracion('promocionar_lo_mismo_pero_otro_dia.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
DO $prueba$
DECLARE
  v_tenant  uuid := '00000000-0000-0000-0000-000000000001';
  v_hoy     text := (now() AT TIME ZONE 'America/Santo_Domingo')::date::text;
  v_src     text;
BEGIN
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='equipo_encargar_promocion';

  IF v_src NOT LIKE '%promo-panel:%' THEN
    RAISE EXCEPTION 'La clave del panel no lleva fecha: la misma pieza seguiria sin poder repetirse.';
  END IF;
  IF v_src NOT LIKE '%America/Santo_Domingo%' THEN
    RAISE EXCEPTION 'El dia no se calcula en hora local: el corte se correria cuatro horas.';
  END IF;

  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='equipo_trabajo_accion';

  IF v_src NOT LIKE '%''waiting_dependency'',''failed''%' THEN
    RAISE EXCEPTION 'Cancelar sigue sin llevarse los mensajes fallidos: la tarjeta se queda en rojo.';
  END IF;

  RAISE NOTICE 'Clave del dia %, y cancelar se lleva los fracasos.', v_hoy;
END $prueba$;

SELECT json_build_object(
 'clave_lleva_el_dia', (SELECT p.prosrc LIKE '%promo-panel:%' FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='equipo_encargar_promocion'),
 'devuelve_duplicado', (SELECT p.prosrc LIKE '%''duplicado'', v_dup%' FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='equipo_encargar_promocion'),
 'cancelar_apaga_el_rojo', (SELECT p.prosrc LIKE '%''waiting_dependency'',''failed''%' FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='equipo_trabajo_accion'),
 'mensajes_fallidos_vivos', (
   SELECT count(*) FROM public.equipo_mensajes m
   WHERE m.to_agent='comercial_creativo' AND m.status='failed'),
 'tarjeta_del_creativo', (
   SELECT COALESCE((SELECT CASE
      WHEN bool_or(m.status='processing') THEN 'trabajando'
      WHEN bool_or(m.status='failed') THEN 'error'
      WHEN bool_or(m.status='pending') THEN 'trabajando'
      ELSE 'disponible' END
    FROM public.equipo_mensajes m
    WHERE m.tenant_id='00000000-0000-0000-0000-000000000001'
      AND m.to_agent='comercial_creativo'
      AND m.status NOT IN ('completed','cancelled','expired')), 'disponible'))
) AS r;
