-- =====================================================================
-- Que Hermes también pueda dejar la factura armada en pantalla
-- ---------------------------------------------------------------------
-- (2026-08-09) "ojo este harness debe estar disponible también para Hermes."
--
-- Jarvis puede porque vive en el servidor: devuelve la orden en la misma
-- respuesta y el navegador la ejecuta. Hermes vive en otra PC y no puede
-- tocar ese navegador ni de lejos.
--
-- Pero sí puede escribir en hermes_chat, y la pantalla lee esa tabla cada
-- cuatro segundos. Así que la orden viaja con la respuesta: un campo más en
-- la fila que ya se estaba escribiendo. Sin canal nuevo, sin conexión nueva,
-- sin nada que se pueda caer aparte.
--
-- >>> LO QUE NO CAMBIA <<<
-- Preparar no es grabar. La factura queda armada en Ventas y la persona
-- pulsa F10. Hermes sigue sin poder facturar, igual que antes: lo que gana
-- es adelantarle el trabajo a quien está en el mostrador.
--
-- Y las líneas entran por el mismo camino que teclear el código, así que
-- siguen rigiendo el control de existencia y el bloqueo de venta bajo costo.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

ALTER TABLE public.hermes_chat
  ADD COLUMN IF NOT EXISTS acciones jsonb;

COMMENT ON COLUMN public.hermes_chat.acciones IS
  'Órdenes para la pantalla que acompañan a una respuesta de Hermes. No graban nada.';

-- ------------------------------------------------------------
-- RESPONDER, AHORA CON ÓRDENES
-- ------------------------------------------------------------
-- El tercer argumento tiene valor por defecto: las llamadas de dos
-- argumentos que Hermes ya hace siguen funcionando igual.
CREATE OR REPLACE FUNCTION hermes.chat_responder(
  p_mensaje_id bigint, p_texto text, p_acciones jsonb DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_malos  text;
BEGIN
  IF COALESCE(btrim(p_texto), '') = '' THEN RAISE EXCEPTION 'Respuesta vacía'; END IF;

  -- Los códigos se comprueban AQUÍ, no en la pantalla. Un código inventado
  -- tiene que rebotarle a Hermes mientras todavía puede corregirlo; si se
  -- descubriera al abrir la factura, el mostrador vería una pantalla a medio
  -- llenar y nadie sabría por qué. Ya pasó con el otro agente.
  IF p_acciones IS NOT NULL AND p_acciones ->> 'tipo' = 'preparar_venta' THEN
    SELECT string_agg(DISTINCT quote_literal(x.cod), ', ')
    INTO v_malos
    FROM (
      SELECT btrim(e ->> 'codigo') AS cod
      FROM jsonb_array_elements(COALESCE(p_acciones -> 'lineas', '[]'::jsonb)) e
    ) x
    WHERE COALESCE(x.cod, '') = ''
       OR NOT EXISTS (
            SELECT 1 FROM public.productos p
            WHERE p.tenant_id = v_tenant AND p.codigo = x.cod
          );

    IF v_malos IS NOT NULL THEN
      RAISE EXCEPTION
        'Estos códigos no existen en el catálogo: %. Usa el "codigo" exacto de la vista de productos, copiado tal cual.',
        v_malos;
    END IF;
  END IF;

  INSERT INTO public.hermes_chat (tenant_id, rol, texto, acciones)
  VALUES (v_tenant, 'hermes', btrim(p_texto), p_acciones);

  UPDATE public.hermes_chat
  SET respondido = true
  WHERE tenant_id = v_tenant AND id = p_mensaje_id;

  RETURN json_build_object('ok', true);
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hermes_readonly') THEN
    GRANT EXECUTE ON FUNCTION hermes.chat_responder(bigint, text, jsonb) TO hermes_readonly;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('hermes_ordenes_pantalla.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- Del lado de Hermes, con transacción de escritura:
--   BEGIN; SET TRANSACTION READ WRITE;
--   SELECT hermes.chat_responder(
--     p_mensaje_id := 123,
--     p_texto      := 'Te dejé la factura armada. ¿Cómo van a pagar?',
--     p_acciones   := '{"tipo":"preparar_venta",
--                       "lineas":[{"codigo":"GAX046-NG","cantidad":1}]}'::jsonb);
--   COMMIT;

SELECT id, rol, left(texto, 40) AS texto, acciones
FROM public.hermes_chat WHERE acciones IS NOT NULL ORDER BY id DESC LIMIT 5;
