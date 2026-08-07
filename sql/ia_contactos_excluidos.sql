-- =====================================================================
-- Contactos de los que NO se recoge nada para entrenar a Hermes
-- ---------------------------------------------------------------------
-- (2026-08-07) "ese número era personal anteriormente, por lo que aún me
-- comunico con familiares y amigos. Creo que si hacemos una lista de números
-- de conversaciones de las cuales no debemos recaudar información."
--
-- El número de Repuestos Morla fue antes el personal del dueño, así que en el
-- mismo WhatsApp conviven clientes preguntando por piezas y la familia. El
-- espejo se lleva todo por igual, y entre los pares recuperados salieron
-- conversaciones que no tienen nada que ver con el negocio.
--
-- Esto es un asunto de PRIVACIDAD antes que de calidad de datos. Una charla
-- con la esposa o con la mamá no debe estar en una tabla de entrenamiento de
-- una IA, aunque nunca se usara. Por eso al excluir un contacto no se marca
-- nada: se BORRA lo que ya se había recogido de él.
--
-- >>> CÓMO SE USA <<<
--   SELECT public.ia_excluir_contacto('My Love Herrera', 'familia');
--   SELECT public.ia_incluir_contacto('El Gago Cliente Cg');   -- deshacer
--
-- Busca por nombre del contacto o por teléfono, sin distinguir mayúsculas.
-- Al excluir, borra de una vez lo ya recogido de esa persona.
--
-- >>> LO QUE NO HACE <<<
-- No adivina. Se dejan sembrados solo los casos donde el propio nombre no
-- deja lugar a dudas; el resto lo decide una persona. Botar conversaciones
-- de clientes por una corazonada cuesta más que revisar una lista.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.ia_contactos_excluidos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL DEFAULT public.get_user_tenant(),
  patron     text NOT NULL,            -- nombre o teléfono del contacto
  motivo     text,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  creado_por uuid DEFAULT auth.uid(),
  UNIQUE (tenant_id, patron)
);

ALTER TABLE public.ia_contactos_excluidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ia_excluidos_propios ON public.ia_contactos_excluidos;
CREATE POLICY ia_excluidos_propios ON public.ia_contactos_excluidos
  FOR ALL USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

-- ------------------------------------------------------------
-- ¿ESTA CONVERSACIÓN ESTÁ EXCLUIDA?
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ia_conversacion_excluida(p_conv uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sales_conversations c
    JOIN public.ia_contactos_excluidos e ON e.tenant_id = c.tenant_id
    WHERE c.id = p_conv
      AND (
        COALESCE(c.customer_name, '')  ILIKE '%' || e.patron || '%'
        OR COALESCE(c.customer_phone, '') ILIKE '%' || e.patron || '%'
        OR COALESCE(c.customer_external_id, '') ILIKE '%' || e.patron || '%'
      )
  );
$$;

-- ------------------------------------------------------------
-- EXCLUIR: además de anotar, BORRA lo ya recogido
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ia_excluir_contacto(p_patron text, p_motivo text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_pat    text := btrim(p_patron);
  v_convs  int;
  v_borr   int;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin empresa'; END IF;
  IF COALESCE(v_pat, '') = '' THEN RAISE EXCEPTION 'Falta el nombre o teléfono'; END IF;

  INSERT INTO public.ia_contactos_excluidos (tenant_id, patron, motivo)
  VALUES (v_tenant, v_pat, p_motivo)
  ON CONFLICT (tenant_id, patron) DO UPDATE SET motivo = COALESCE(EXCLUDED.motivo, public.ia_contactos_excluidos.motivo);

  -- Se borra, no se marca: si es la familia, no debe quedar guardado.
  WITH afectadas AS (
    SELECT c.id FROM public.sales_conversations c
    WHERE c.tenant_id = v_tenant
      AND (COALESCE(c.customer_name, '') ILIKE '%' || v_pat || '%'
        OR COALESCE(c.customer_phone, '') ILIKE '%' || v_pat || '%'
        OR COALESCE(c.customer_external_id, '') ILIKE '%' || v_pat || '%')
  ), borrados AS (
    DELETE FROM public.sales_ai_training_logs t
    WHERE t.tenant_id = v_tenant
      AND t.conversation_id IN (SELECT id FROM afectadas)
    RETURNING 1
  )
  SELECT (SELECT COUNT(*) FROM afectadas), (SELECT COUNT(*) FROM borrados)
    INTO v_convs, v_borr;

  RETURN json_build_object('patron', v_pat, 'conversaciones', v_convs, 'ejemplos_borrados', v_borr);
END $$;

CREATE OR REPLACE FUNCTION public.ia_incluir_contacto(p_patron text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_n int;
BEGIN
  DELETE FROM public.ia_contactos_excluidos
  WHERE tenant_id = public.get_user_tenant() AND patron = btrim(p_patron);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  -- Lo borrado no vuelve: de aquí en adelante sí se recoge.
  RETURN json_build_object('quitado', v_n > 0);
END $$;

REVOKE EXECUTE ON FUNCTION public.ia_excluir_contacto(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ia_incluir_contacto(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ia_excluir_contacto(text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.ia_incluir_contacto(text) TO authenticated;

-- ------------------------------------------------------------
-- EL DISPARADOR RESPETA LA LISTA
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ia_captura_respuesta_humana()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.sender_type <> 'agent' OR NOT public._ia_sirve_de_ejemplo(NEW.message_text) THEN
    RETURN NEW;
  END IF;
  IF public._ia_conversacion_excluida(NEW.conversation_id) THEN
    RETURN NEW;
  END IF;

  UPDATE public.sales_ai_training_logs t
  SET human_reply = btrim(COALESCE(t.human_reply || E'\n', '') || NEW.message_text),
      metadata    = COALESCE(t.metadata, '{}'::jsonb)
                    || jsonb_build_object('respondido_en', now(), 'via', 'trigger_v3')
  WHERE t.id = (
    SELECT t2.id FROM public.sales_ai_training_logs t2
    JOIN public.sales_messages cm ON cm.id = t2.message_id
    WHERE t2.conversation_id = NEW.conversation_id
      AND cm.enviado_en < COALESCE(NEW.enviado_en, NEW.created_at, now())
    ORDER BY cm.enviado_en DESC LIMIT 1
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;

-- ------------------------------------------------------------
-- SEMILLA: solo los que el nombre delata
-- ------------------------------------------------------------
-- REVÍSALOS. Si alguno es cliente, se devuelve con ia_incluir_contacto().
-- No se sembraron los dudosos ("Anneris", que habla de estados de cuenta;
-- "Lesmy"; "Caminero Motors"): esos los decides tú.
DO $$
DECLARE
  v_pat text;
  v_res json;
BEGIN
  FOREACH v_pat IN ARRAY ARRAY[
    'My Love Herrera',
    'Moi et mon mari',
    'Papi Caminero',
    'Lola Estados Unidos'
  ] LOOP
    BEGIN
      v_res := public.ia_excluir_contacto(v_pat, 'personal / familia');
      RAISE NOTICE 'excluido % -> %', v_pat, v_res;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'no se pudo excluir % (%). Córrelo con tu sesión iniciada.', v_pat, SQLERRM;
    END;
  END LOOP;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('ia_contactos_excluidos.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) LA LISTA
SELECT patron, motivo, creado_en FROM public.ia_contactos_excluidos ORDER BY patron;

-- 2) QUÉ CONTACTOS ESTÁN APORTANDO EJEMPLOS (para seguir depurando)
SELECT COALESCE(c.customer_name, c.customer_phone, '(sin nombre)') AS contacto,
       COUNT(*) AS ejemplos,
       left(min(t.customer_message), 45) AS una_pregunta
FROM public.sales_ai_training_logs t
JOIN public.sales_conversations c ON c.id = t.conversation_id
WHERE t.human_reply IS NOT NULL
GROUP BY 1 ORDER BY ejemplos DESC LIMIT 30;
-- Recórrela: el que no sea cliente, fuera con
--   SELECT public.ia_excluir_contacto('<nombre>', 'personal');
