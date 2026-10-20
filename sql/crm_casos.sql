-- =====================================================================
-- CRM: CASOS — "esto lo tiene que decidir una persona" (20/10/2026)
-- ---------------------------------------------------------------------
-- Idea del video de DeskCom que mandó el dueño: cuando la IA no puede
-- resolver una conversación, le deja al equipo un CASO con el contexto
-- (qué quiere el cliente, qué ya se le dijo, qué falta decidir), para que
-- el vendedor actúe sin leerse el chat entero.
--
-- Aquí el que lee las conversaciones es el clasificador del embudo
-- (crm-clasificar, cada 10 min, sql/crm_clasificador_embudo.sql). Ahora,
-- además de la etapa, dice si hace falta una persona y por qué:
--
--   no_lo_tenemos       pide una pieza que no hay o hay que conseguir
--   reclamo             garantía, pieza mala, devolución, queja
--   precio_especial     pide rebaja, precio por cantidad, crédito
--   listo_para_comprar  quiere pagar / separar / que se lo manden
--   duda_tecnica        compatibilidad o medida que hay que verificar
--   otro                cualquier otra cosa que solo decide una persona
--
-- Reglas (en SQL, no en el modelo):
--   · Solo si la última palabra es del cliente (si la tienda ya contestó,
--     no hay nada que decidir) y nunca en spam.
--   · Un caso abierto por conversación; si sigue abierto se actualiza.
--   · Se cierra solo cuando alguien de la tienda contesta en esa
--     conversación (o a mano con "Resuelto").
--   · Aviso por Telegram (bot de Hermes, el de los avisos de 24 h) de 7 am
--     a 10 pm, uno por caso. Con el enlace para abrir WhatsApp si es WA.
--
-- Solo empresas con feat_clasificador_crm (hoy Morla).
-- La versión de crm_guardar_clasificacion parte de producción (20/10/2026).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.crm_casos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.sales_conversations(id) ON DELETE CASCADE,
  motivo          text NOT NULL CHECK (motivo IN ('no_lo_tenemos', 'reclamo', 'precio_especial',
                                                  'listo_para_comprar', 'duda_tecnica', 'otro')),
  quiere          text,
  se_le_dijo      text,
  falta           text,
  producto        text,
  estado          text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'resuelto')),
  creado_at       timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  avisado_at      timestamptz,
  resuelto_at     timestamptz,
  resuelto_como   text CHECK (resuelto_como IN ('respondido', 'a_mano')),
  resuelto_por    uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_casos_uno_abierto
  ON public.crm_casos (conversation_id) WHERE estado = 'abierto';
CREATE INDEX IF NOT EXISTS crm_casos_tenant_estado ON public.crm_casos (tenant_id, estado, creado_at DESC);

ALTER TABLE public.crm_casos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_casos_tenant_select ON public.crm_casos;
CREATE POLICY crm_casos_tenant_select ON public.crm_casos
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
REVOKE ALL ON public.crm_casos FROM anon;
GRANT SELECT ON public.crm_casos TO authenticated;

-- ---------------------------------------------------------------------
-- El clasificador guarda: lo de antes + el caso.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_guardar_clasificacion(p_conversation_id uuid, p_resultado jsonb, p_hasta timestamp with time zone, p_tokens integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c public.sales_conversations;
  v_nueva text := p_resultado->>'etapa';
  v_final text;
  v_score integer := LEAST(100, GREATEST(0, COALESCE((p_resultado->>'intencion_compra')::numeric, 0)::integer));
  v_cat text := COALESCE(p_resultado->>'categoria', 'otro');
  v_avisar text;
  v_nombre text;
  v_caso jsonb := p_resultado->'caso';
  v_motivo text;
  v_caso_id uuid;
BEGIN
  SELECT * INTO c FROM public.sales_conversations WHERE id = p_conversation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'no existe'); END IF;

  IF v_nueva IS NULL OR v_nueva NOT IN ('nuevo','interesado','cotizado','listo_para_comprar','ganado','perdido','spam') THEN
    v_nueva := c.etapa;
  END IF;
  -- Si la categoría es spam, la etapa también (el modelo a veces deja 'nuevo').
  IF v_cat = 'spam' THEN v_nueva := 'spam'; END IF;

  v_final := c.etapa;
  IF c.etapa_manual_at IS NOT NULL AND c.etapa_manual_at > now() - interval '48 hours' THEN
    v_final := c.etapa;                                   -- la persona manda
  ELSIF c.etapa IN ('perdido', 'spam', 'ganado') THEN
    IF v_nueva <> c.etapa AND (c.etapa <> 'ganado' OR v_nueva NOT IN ('perdido', 'spam')) THEN
      v_final := v_nueva;                                 -- vuelve: otra vuelta
    END IF;
  ELSIF v_nueva IN ('perdido', 'spam') THEN
    v_final := v_nueva;
  ELSIF public._crm_etapa_orden(v_nueva) > public._crm_etapa_orden(c.etapa) THEN
    v_final := v_nueva;                                   -- solo hacia adelante
  END IF;

  UPDATE public.sales_conversations
     SET clasificacion = p_resultado || jsonb_build_object('hasta', p_hasta),
         clasificado_at = GREATEST(COALESCE(p_hasta, now()), COALESCE(clasificado_at, '-infinity')),
         lead_score = v_score,
         intent = CASE v_cat WHEN 'precio' THEN 'precio_cotizacion' WHEN 'envio' THEN 'envio_ubicacion'
                             WHEN 'reclamo' THEN 'garantia' ELSE v_cat END,
         etapa = v_final,
         etapa_motivo = CASE WHEN v_final <> c.etapa THEN p_resultado->>'motivo_etapa' ELSE etapa_motivo END,
         etapa_cambiada_at = CASE WHEN v_final <> c.etapa THEN now() ELSE etapa_cambiada_at END
   WHERE id = c.id;

  IF v_final <> c.etapa THEN
    INSERT INTO public.crm_etapa_historial (tenant_id, conversation_id, etapa_antes, etapa_despues, motivo, por, clasificacion, tokens)
    VALUES (c.tenant_id, c.id, c.etapa, v_final, p_resultado->>'motivo_etapa', 'clasificador', p_resultado, p_tokens);
  END IF;

  v_nombre := COALESCE(NULLIF(c.customer_name, ''), 'Un cliente') || ' (' || c.platform || ')';
  IF v_final = 'listo_para_comprar' AND c.etapa <> 'listo_para_comprar' THEN
    v_avisar := format('🛒 %s quiere comprar: %s', v_nombre,
                       COALESCE(p_resultado->>'producto', p_resultado->>'resumen', ''));
  ELSIF v_cat = 'reclamo' AND COALESCE(c.clasificacion->>'categoria', '') <> 'reclamo' THEN
    v_avisar := format('⚠️ Reclamo de %s: %s', v_nombre, COALESCE(p_resultado->>'resumen', ''));
  END IF;

  IF v_avisar IS NOT NULL THEN
    INSERT INTO public.notificaciones (tenant_id, user_id, tipo, titulo, mensaje)
    SELECT c.tenant_id, p.id, 'crm_embudo', left(v_avisar, 120),
           COALESCE(p_resultado->>'siguiente_paso', '')
      FROM public.profiles p
     WHERE p.tenant_id = c.tenant_id AND p.role IN ('owner', 'admin');
  END IF;

  -- (20/10/2026) El caso (sql/crm_casos.sql). Solo si el cliente tiene la
  -- última palabra: si la tienda ya contestó, no hay nada pendiente.
  v_motivo := v_caso->>'motivo';
  IF COALESCE((v_caso->>'necesita_persona')::boolean, false)
     AND v_motivo IN ('no_lo_tenemos', 'reclamo', 'precio_especial', 'listo_para_comprar', 'duda_tecnica', 'otro')
     AND v_final <> 'spam'
     AND (c.last_agent_message_at IS NULL OR c.last_agent_message_at < c.last_user_message_at)
  THEN
    UPDATE public.crm_casos
       SET motivo = v_motivo, quiere = left(v_caso->>'quiere', 200),
           se_le_dijo = left(v_caso->>'se_le_dijo', 200), falta = left(v_caso->>'falta', 200),
           producto = COALESCE(p_resultado->>'producto', producto), actualizado_at = now()
     WHERE conversation_id = c.id AND estado = 'abierto'
     RETURNING id INTO v_caso_id;
    IF v_caso_id IS NULL THEN
      INSERT INTO public.crm_casos (tenant_id, conversation_id, motivo, quiere, se_le_dijo, falta, producto)
      VALUES (c.tenant_id, c.id, v_motivo, left(v_caso->>'quiere', 200), left(v_caso->>'se_le_dijo', 200),
              left(v_caso->>'falta', 200), p_resultado->>'producto')
      RETURNING id INTO v_caso_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'antes', c.etapa, 'despues', v_final, 'aviso', v_avisar IS NOT NULL,
                            'caso', v_caso_id);
END $function$;

-- ---------------------------------------------------------------------
-- Alguien de la tienda contestó → el caso queda resuelto.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_crm_caso_respondido()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.sender_type = 'agent' AND NEW.status IN ('sent', 'queued') THEN
    UPDATE public.crm_casos
       SET estado = 'resuelto', resuelto_at = now(), resuelto_como = 'respondido'
     WHERE conversation_id = NEW.conversation_id AND estado = 'abierto'
       AND creado_at <= NEW.created_at;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_crm_caso_respondido ON public.sales_messages;
CREATE TRIGGER trg_crm_caso_respondido AFTER INSERT OR UPDATE OF status ON public.sales_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_crm_caso_respondido();

-- ---------------------------------------------------------------------
-- Para la extensión: los casos abiertos y "Resuelto" a mano.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_casos_abiertos()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_agg(x ORDER BY x.creado_at), '[]'::jsonb)
    FROM (
      SELECT k.id, k.conversation_id, k.motivo, k.quiere, k.se_le_dijo, k.falta, k.producto,
             k.creado_at, c.platform,
             COALESCE(NULLIF(btrim(c.customer_name), ''), c.customer_phone, c.external_conversation_id) AS nombre
        FROM public.crm_casos k
        JOIN public.sales_conversations c ON c.id = k.conversation_id
       WHERE k.tenant_id = public.get_user_tenant() AND k.estado = 'abierto'
       ORDER BY k.creado_at
       LIMIT 30
    ) x
$$;

CREATE OR REPLACE FUNCTION public.crm_caso_resolver(p_caso_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.crm_casos
     SET estado = 'resuelto', resuelto_at = now(), resuelto_como = 'a_mano', resuelto_por = auth.uid()
   WHERE id = p_caso_id AND tenant_id = public.get_user_tenant() AND estado = 'abierto';
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.crm_casos_abiertos() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_caso_resolver(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_casos_abiertos() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_caso_resolver(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- Telegram: los casos que todavía no se avisaron (los toma
-- omni-avisos-ventana en su vuelta de cada 5 min). Si Telegram falla,
-- se sueltan y salen en la próxima.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_casos_tomar_avisos()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_hora int := extract(hour FROM now() AT TIME ZONE 'America/Santo_Domingo');
  v_out jsonb;
BEGIN
  IF v_hora < 7 OR v_hora >= 22 THEN RETURN '[]'::jsonb; END IF;
  WITH t AS (
    UPDATE public.crm_casos k SET avisado_at = now()
     WHERE k.estado = 'abierto' AND k.avisado_at IS NULL
       AND k.creado_at > now() - interval '12 hours'
    RETURNING k.*
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', t.id, 'motivo', t.motivo, 'quiere', t.quiere, 'se_le_dijo', t.se_le_dijo,
           'falta', t.falta, 'producto', t.producto, 'plataforma', c.platform,
           'cliente', COALESCE(NULLIF(btrim(c.customer_name), ''), 'Un cliente'),
           'telefono', regexp_replace(COALESCE(c.customer_phone, ''), '\D', '', 'g'))), '[]'::jsonb)
    INTO v_out
    FROM t JOIN public.sales_conversations c ON c.id = t.conversation_id;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.crm_casos_soltar_aviso(p_caso_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ UPDATE public.crm_casos SET avisado_at = NULL WHERE id = p_caso_id $$;

REVOKE ALL ON FUNCTION public.crm_casos_tomar_avisos() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_casos_soltar_aviso(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_casos_tomar_avisos() TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_casos_soltar_aviso(uuid) TO service_role;

SELECT public.registrar_migracion('crm_casos.sql');
