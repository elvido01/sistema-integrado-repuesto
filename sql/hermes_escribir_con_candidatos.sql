-- =====================================================================
-- Traerle la respuesta hecha en vez de esperar a que la busque
-- ---------------------------------------------------------------------
-- (2026-08-12) Medido sobre el canal de MotoFlow:
--
--   entrega del mensaje (pg_notify)      instantánea
--   hermes.buscar_producto('motul 7100')      851 ms
--   respuestas que NO consultan               3-5 s
--   respuestas que SÍ consultan          20s · 63s · +128s
--
-- El dato estaba listo en menos de un segundo y la respuesta tardó dos
-- minutos. Lo que se va no es la consulta: es que el agente decida
-- consultar, arme la llamada, levante su herramienta y lea el resultado.
-- Ese tramo no lo controlamos desde aquí… pero se puede saltar.
--
-- >>> LA IDEA <<<
-- Si la pregunta huele a precio o existencia, MotoFlow hace la búsqueda
-- AL INSERTAR y le adjunta los candidatos al mensaje. Cuando Hermes lo
-- recoge ya tiene el código, el precio y las unidades delante. Le queda
-- redactar, que es lo que sabe hacer rápido.
--
-- Cuesta ~1s en el insert y ahorra el tramo de 15 a 120. Y si el agente
-- prefiere consultar igual, puede: los candidatos son una ayuda, no un
-- sustituto — por eso van etiquetados como tales.
--
-- >>> POR QUÉ SOLO CON PALABRAS DE COMPRA <<<
-- Buscar en todo el catálogo por cada "hola" sería pagar un segundo por
-- nada. El disparador es estrecho a propósito: si no acierta, Hermes
-- consulta como hasta ahora y no se pierde nada.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.hermes_escribir(p_texto text, p_pantalla jsonb DEFAULT NULL::jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_texto  text := btrim(p_texto);
  v_id     bigint;
  v_prev   record;
  v_pantalla jsonb := p_pantalla;
  v_cands  jsonb;
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

  -- ── Los candidatos ──────────────────────────────────────────────────
  -- Solo para Morla, que es de quien son las vistas del schema hermes, y
  -- solo si la frase pide precio o disponibilidad. El resto de preguntas
  -- —"cómo va el día", "quién soy"— no tocan el catálogo.
  IF v_tenant = '00000000-0000-0000-0000-000000000001'::uuid
     AND v_texto ~* '(precio|costo|cuánto|cuanto|vale|cotiz|tienes|tienen|hay |queda|disponib|existencia|stock|busca|consigue|vend)'
  THEN
    BEGIN
      SELECT jsonb_agg(to_jsonb(b))
      INTO v_cands
      FROM (
        SELECT codigo, descripcion, marca, precio, existencia, ubicacion
        FROM hermes.buscar_producto(v_texto, 6)
      ) b;
    EXCEPTION WHEN OTHERS THEN
      -- Que la búsqueda falle no puede impedir que el mensaje llegue.
      -- Sin candidatos Hermes consulta él, que es como estaba antes.
      v_cands := NULL;
    END;

    IF v_cands IS NOT NULL THEN
      v_pantalla := COALESCE(v_pantalla, '{}'::jsonb) || jsonb_build_object(
        'candidatos', v_cands,
        'candidatos_son',
          'Resultados REALES de hermes.buscar_producto sobre esta pregunta, ya consultados por MotoFlow. ' ||
          'Precio y existencia salen de la base en este instante: puedes citarlos sin volver a consultar. ' ||
          'Van ordenados por cuánto encajan con lo que se pidió; el primero no siempre es el bueno, elige tú. ' ||
          'Si ninguno encaja, dilo y busca con hermes.buscar_producto(otro_texto).'
      );
    END IF;
  END IF;

  INSERT INTO public.hermes_chat (tenant_id, user_id, rol, texto, pantalla)
  VALUES (v_tenant, auth.uid(), 'usuario', v_texto, v_pantalla)
  RETURNING id INTO v_id;

  PERFORM pg_notify('hermes_chat',
    json_build_object('id', v_id, 'tenant_id', v_tenant, 'texto', left(v_texto, 300))::text);

  RETURN json_build_object('id', v_id, 'enviado', true);
END $function$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('hermes_escribir_con_candidatos.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- Que la búsqueda que se adjuntaría encuentra lo que debe:
SELECT codigo, descripcion, precio, existencia
FROM hermes.buscar_producto('tenemos motul 7100', 6);

-- Y que el disparador distingue: la primera debe dar true, la segunda false.
SELECT
  'tenemos motul 7100' ~* '(precio|costo|cuánto|cuanto|vale|cotiz|tienes|tienen|hay |queda|disponib|existencia|stock|busca|consigue|vend)' AS pregunta_de_producto,
  'hola cómo va el día'  ~* '(precio|costo|cuánto|cuanto|vale|cotiz|tienes|tienen|hay |queda|disponib|existencia|stock|busca|consigue|vend)' AS charla;
