-- =====================================================================
-- Que una sola pregunta llegue una sola vez
-- ---------------------------------------------------------------------
-- (2026-08-08) La primera pregunta real que se le hizo a Hermes desde
-- MotoFlow entró DIECISIETE veces, en trozos que iban creciendo:
--
--    1  "recuer"
--    2  "recuerdas"
--    3  "recuerdas la"
--    7  "recuerdas la última imagen"
--   13  "recuerdas la última imagen que publicamos"
--
-- Y desordenados entre sí: el id 6 ("recuerdas la") entró después del 5
-- ("recuerdas la última"). Eso es la misma frase muestreada mientras se
-- formaba, mandada en llamadas que corren en paralelo y llegan como les toca.
--
-- >>> POR QUÉ SE ARREGLA AQUÍ Y NO SOLO EN LA PANTALLA <<<
-- La causa exacta en el navegador no está clara todavía. Pero el daño sí:
-- cada trozo es una pregunta que Hermes lee, piensa y cobra, y le deja una
-- cola de basura que tiene que ir descartando a mano. Esta regla lo corta
-- venga de donde venga — de un micrófono, de un dictado del sistema o de
-- algo que todavía no hemos encontrado.
--
-- LA REGLA
-- Si lo último que mandó la misma persona sigue sin contestar, llegó hace
-- menos de 10 segundos, y el mensaje nuevo EMPIEZA con ese texto, entonces
-- el viejo era esta misma frase a medio formar: se da por superado.
-- Si es idéntico, no se inserta nada y se devuelve el que ya estaba.
--
-- Diez segundos y "empieza con" a propósito: dos preguntas distintas no se
-- parecen en el arranque, y quien pregunta dos cosas de verdad tarda más que
-- eso en escribir la segunda. Un "sí" repetido a los 30 segundos pasa igual.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.hermes_escribir(p_texto text, p_pantalla jsonb DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_texto  text := btrim(p_texto);
  v_id     bigint;
  v_prev   record;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión'; END IF;
  IF COALESCE(v_texto, '') = '' THEN RAISE EXCEPTION 'Mensaje vacío'; END IF;

  -- Lo último que mandó esta misma persona y que Hermes aún no ha tocado.
  SELECT c.id, c.texto INTO v_prev
  FROM public.hermes_chat c
  WHERE c.tenant_id = v_tenant
    AND c.user_id IS NOT DISTINCT FROM auth.uid()
    AND c.rol = 'usuario'
    AND c.respondido = false
    AND c.creado_en > now() - interval '10 seconds'
  ORDER BY c.creado_en DESC, c.id DESC
  LIMIT 1;

  IF v_prev.id IS NOT NULL THEN
    -- Idéntico: es la misma pregunta otra vez. No se duplica la cola.
    IF v_prev.texto = v_texto THEN
      RETURN json_build_object('id', v_prev.id, 'enviado', true, 'repetido', true);
    END IF;

    -- starts_with y no LIKE: un texto con % o _ dentro rompería el patrón.
    IF starts_with(v_texto, v_prev.texto) THEN
      UPDATE public.hermes_chat SET respondido = true WHERE id = v_prev.id;
    END IF;
  END IF;

  INSERT INTO public.hermes_chat (tenant_id, user_id, rol, texto, pantalla)
  VALUES (v_tenant, auth.uid(), 'usuario', v_texto, p_pantalla)
  RETURNING id INTO v_id;

  PERFORM pg_notify('hermes_chat',
    json_build_object('id', v_id, 'tenant_id', v_tenant, 'texto', left(v_texto, 300))::text);

  RETURN json_build_object('id', v_id, 'enviado', true);
END $$;

REVOKE EXECUTE ON FUNCTION public.hermes_escribir(text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.hermes_escribir(text, jsonb) TO authenticated;

-- ------------------------------------------------------------
-- LIMPIAR LA COLA QUE YA ESTÁ SUCIA
-- ------------------------------------------------------------
-- Los 23 mensajes de la prueba de hoy. Se aplica la misma regla hacia atrás:
-- sobrevive el último de cada ráfaga, que es el único con la frase completa.
UPDATE public.hermes_chat c
SET respondido = true
WHERE c.rol = 'usuario'
  AND c.respondido = false
  AND EXISTS (
    SELECT 1 FROM public.hermes_chat d
    WHERE d.tenant_id = c.tenant_id
      AND d.user_id IS NOT DISTINCT FROM c.user_id
      AND d.rol = 'usuario'
      AND d.id > c.id
      AND d.creado_en < c.creado_en + interval '10 seconds'
      AND starts_with(d.texto, c.texto)
  );

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('hermes_chat_sin_rafagas.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
SELECT id, rol, respondido, left(texto, 50) AS texto
FROM public.hermes_chat ORDER BY id;
-- De los 23 de hoy deben quedar sin contestar solo los últimos de cada
-- ráfaga: la frase completa de la imagen, y el "hola sigues ahí".
