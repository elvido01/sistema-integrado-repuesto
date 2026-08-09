-- =====================================================================
-- Que el agente no pueda proponer un código que no existe
-- ---------------------------------------------------------------------
-- (2026-08-09) Jarvis propuso esto y llegó a la pantalla de autorización:
--
--   Cotización: 2 pesitas tornillo rojas PC Racing y 1 juego de chorizo
--     · 1 × 015298
--     · 2 × [PESA_TORNILLO_ROJA_PC]      <- esto no es un código
--
-- Se inventó un marcador de posición en vez de usar el código que le
-- devolvió buscar_piezas. Al autorizar, el ejecutor lo rechazó —"No existe
-- el producto con código"— y no se grabó nada. La validación funcionó.
--
-- Pero funcionó DEMASIADO TARDE. Falló después de que una persona leyera la
-- propuesta, decidiera y pulsara Autorizar. Y el agente ni se enteró: para
-- él la propuesta salió bien, así que al decirle "te equivocaste" no supo de
-- qué se le hablaba y no corrigió nada.
--
-- >>> LA VALIDACIÓN SE ADELANTA AL MOMENTO DE PROPONER <<<
-- Ahí el error le llega AL MODELO como resultado de su propia herramienta,
-- en la misma vuelta y con el código exacto que se inventó. Puede volver a
-- buscar y proponer bien sin que nadie se entere. Y sobre todo: una propuesta
-- que no se puede ejecutar no llega nunca a pedirle permiso a nadie.
--
-- La comprobación del ejecutor SE QUEDA. Entre proponer y autorizar pasan
-- hasta diez minutos, y en ese rato alguien puede borrar el producto.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.agente_proponer_accion(
  p_tipo text, p_resumen text, p_payload jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_regla  jsonb := public._agente_accion_permitida(p_tipo);
  v_id     uuid;
  v_malos  text;
  v_n      int;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión'; END IF;
  IF NOT (v_regla ->> 'ok')::boolean THEN
    RAISE EXCEPTION 'El agente no puede proponer acciones de tipo "%"', p_tipo;
  END IF;

  IF p_tipo = 'crear_cotizacion' THEN
    v_n := jsonb_array_length(COALESCE(p_payload -> 'lineas', '[]'::jsonb));
    IF v_n IS NULL OR v_n = 0 THEN
      RAISE EXCEPTION 'La cotización no lleva líneas. Agrega al menos un producto con su código exacto.';
    END IF;

    -- Los códigos que no están en el catálogo de esta empresa. El mensaje los
    -- nombra uno por uno: el modelo lee esto como resultado de su herramienta
    -- y necesita saber CUÁL se inventó, no que "algo" falló.
    SELECT string_agg(DISTINCT quote_literal(x.cod), ', ')
    INTO v_malos
    FROM (
      SELECT btrim(e ->> 'codigo') AS cod
      FROM jsonb_array_elements(p_payload -> 'lineas') e
    ) x
    WHERE COALESCE(x.cod, '') = ''
       OR NOT EXISTS (
            SELECT 1 FROM public.productos p
            WHERE p.tenant_id = v_tenant AND p.codigo = x.cod
          );

    IF v_malos IS NOT NULL THEN
      RAISE EXCEPTION
        'Estos códigos no existen en el catálogo: %. Usa el campo "codigo" EXACTO que devolvió buscar_piezas, tal cual, sin inventarlo ni describirlo. Vuelve a buscar la pieza y propón otra vez.',
        v_malos;
    END IF;
  END IF;

  INSERT INTO public.agente_acciones (tenant_id, tipo, resumen, payload)
  VALUES (v_tenant, p_tipo, p_resumen, p_payload)
  RETURNING id INTO v_id;

  RETURN json_build_object(
    'accion_id', v_id,
    'estado', 'propuesta',
    'requiere_password', (v_regla ->> 'password')::boolean,
    'nota', v_regla ->> 'nota',
    'aviso', 'PROPUESTA, no ejecutada. La persona debe autorizarla en pantalla.');
END $$;

REVOKE EXECUTE ON FUNCTION public.agente_proponer_accion(text, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.agente_proponer_accion(text, text, jsonb) TO authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hermes_readonly') THEN
    GRANT EXECUTE ON FUNCTION public.agente_proponer_accion(text, text, jsonb) TO hermes_readonly;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('agente_valida_codigos_al_proponer.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- Con sesión iniciada, esto debe FALLAR nombrando el código inventado:
-- SELECT public.agente_proponer_accion(
--   'crear_cotizacion', 'prueba',
--   '{"lineas":[{"codigo":"[NO_EXISTE]","cantidad":1}]}'::jsonb);

-- Propuestas que quedaron colgadas sin poder ejecutarse:
SELECT id, creado_en, estado, left(resumen, 60) AS resumen
FROM public.agente_acciones
WHERE estado = 'propuesta'
ORDER BY creado_en DESC LIMIT 10;
