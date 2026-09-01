-- ============================================================
-- NO LE PIDAS LA PIEZA ANTES DE QUE FIRMEN EL CONCEPTO
-- ============================================================
-- El 01/09 se probaron dos promociones seguidas, misma forma de encargo:
--
--   CASCO RACING HAO     2 rondas · llegó a la mesa CON pieza montada
--   AMORTIGUADOR PLATINA 3 rondas · 8 minutos · llegó SIN pieza
--
-- Misma entrada, resultado distinto. La diferencia no fue el motor ni el
-- modelo: fue suerte. Al casco se le ocurrió devolver el bloque `arte` por su
-- cuenta; al amortiguador no, y se pasó dos rondas peleando con esto:
--
--   REPAROS DE HERMES. Esto no ha llegado al dueño todavía:
--   · No hay pieza montada: llegó un brief, no un archivo. Monta el arte
--     con el montador.
--
-- El reparo era correcto y el creativo no podía cumplirlo. Le pedían la pieza
-- SIN los materiales (foto, logo, teléfono, reglas de la casa) y SIN la forma
-- del JSON que el montador sabe dibujar — las dos cosas viajan en
-- `equipo_brief_arte()`, y ese brief solo se manda cuando el dueño FIRMA el
-- concepto. Así que se puso a improvisar: llegó a escribir archivos de lienzo
-- a mano, en una máquina donde no hay a dónde guardarlos.
--
-- >>> EL CIRCUITO SON DOS FIRMAS, Y ESTABA PIDIENDO LAS DOS A LA VEZ <<<
--
--   concepto  →  firma del dueño  →  ARTE FINAL con materiales  →  pieza
--                                                               →  firma  →  publicar
--
-- `equipo_revisar_arte` exigía pieza montada en TODAS las entregas, también
-- en la del concepto, que es exactamente lo que el circuito pide en esa
-- vuelta. Resultado: cada promoción gastaba las dos devoluciones permitidas
-- antes de llegar a la mesa, y a la tercera pasaba igual con el reparo
-- escrito encima. Dos ejecuciones del modelo por promoción, tiradas.
--
-- El arreglo NO es quitar el reparo: cuando la pieza SÍ se pidió y vuelve un
-- brief, hay que devolverlo. Es preguntar antes si se pidió. El marcador ya
-- existe y es el mismo que mira el worker para decidir si le explica cómo
-- montarla (`pideArte`, en equipo-worker.mjs): el texto 'ARTE FINAL', que
-- solo aparece en el encargo que nace de la firma del concepto. Un solo
-- marcador para las dos mitades — si algún día cambia, se rompen a la vez y
-- se ve, en vez de desincronizarse en silencio.
--
-- Idempotente. Mismos argumentos que la versión viva (uuid, jsonb), así que
-- REPLACE reemplaza de verdad y no crea una sobrecarga.
-- ============================================================

CREATE OR REPLACE FUNCTION public.equipo_revisar_arte(p_trabajo_id uuid, p_payload jsonb)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_w      record;
  v_prod   record;
  v_reparos text[] := ARRAY[]::text[];
  v_precio numeric;
  v_pidieron_arte boolean;
BEGIN
  SELECT * INTO v_w FROM public.equipo_trabajos WHERE id = p_trabajo_id;
  IF v_w.id IS NULL THEN RETURN v_reparos; END IF;

  -- ¿Se le llegó a pedir la pieza? Solo se le pide después de que el dueño
  -- firme el concepto, y ese encargo lleva 'ARTE FINAL' dentro.
  SELECT EXISTS (
    SELECT 1 FROM public.equipo_mensajes m
    WHERE m.trabajo_id = p_trabajo_id
      AND m.to_agent = 'comercial_creativo'
      AND m.payload ->> 'texto' ILIKE '%ARTE FINAL%')
  INTO v_pidieron_arte;

  -- a) ¿Montó la pieza, o volvió a mandar un plano?
  --    Solo cuenta como reparo si se la pidieron. En la vuelta del concepto
  --    el brief ES el entregable: exigirle ahí un archivo es mandarlo a
  --    hacer algo para lo que todavía no tiene ni los materiales ni el
  --    formato, y gastar las dos devoluciones en eso.
  IF v_pidieron_arte AND NOT public.equipo_es_arte(p_payload) THEN
    v_reparos := array_append(v_reparos, 'No hay pieza montada: llegó un brief, no un archivo. Monta el arte con el montador.');
  END IF;

  SELECT p.codigo, p.descripcion, p.precio, p.id INTO v_prod
  FROM public.productos p
  WHERE p.tenant_id = v_w.tenant_id AND v_w.peticion LIKE '%' || p.codigo || '%'
  ORDER BY length(p.codigo) DESC LIMIT 1;

  IF v_prod.codigo IS NOT NULL THEN
    -- b) El precio de la pieza contra el catálogo. Es lo que sale a la calle
    --    con el nombre de la empresa: aquí no se admite "aproximado".
    BEGIN
      v_precio := NULLIF(regexp_replace(COALESCE(p_payload -> 'arte' ->> 'precio', ''), '[^0-9.]', '', 'g'), '')::numeric;
    EXCEPTION WHEN OTHERS THEN v_precio := NULL;
    END;

    IF v_precio IS NOT NULL AND round(v_precio, 2) <> round(COALESCE(v_prod.precio, 0), 2) THEN
      v_reparos := array_append(v_reparos, format(
        'El precio de la pieza (%s) no es el del catálogo (%s). Usa el del catálogo.',
        to_char(v_precio, 'FM999G999G990D00'), to_char(COALESCE(v_prod.precio,0), 'FM999G999G990D00')));
    END IF;

    -- c) ¿Se marcó como no promocionable mientras se trabajaba?
    IF EXISTS (SELECT 1 FROM public.marketing_promocion_manual m
               WHERE m.tenant_id = v_w.tenant_id AND m.producto_id = v_prod.id
                 AND (m.permanente OR m.fecha > now() - interval '14 days')) THEN
      v_reparos := array_append(v_reparos, 'Esa pieza quedó marcada como "no promocionar" mientras se trabajaba. No sale.');
    END IF;
  END IF;

  -- d) Sin copy no hay nada que publicar. Esta SÍ vale en las dos vueltas:
  --    un concepto sin copy tampoco es un concepto.
  IF COALESCE(jsonb_typeof(p_payload -> 'copy'), 'null') <> 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(p_payload -> 'copy')) = 0 THEN
    v_reparos := array_append(v_reparos, 'Falta el copy por red.');
  END IF;

  RETURN v_reparos;
END $fn$;

SELECT public.registrar_migracion('el_concepto_todavia_no_es_la_pieza.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- No basta con que la función exista: hay que resolver LAS DOS ramas contra
-- trabajos de verdad, porque el error era justamente que las trataba igual.
-- Si alguna falla, esto revienta con el motivo escrito.
DO $prueba$
DECLARE
  v_concepto jsonb := '{"estado":"borrador","copy":{"whatsapp":"x"}}'::jsonb;
  v_sin_firma uuid;
  v_con_firma uuid;
  v_r text[];
  v_hay  boolean;
BEGIN
  -- Una promoción a la que NUNCA se le pidió el arte.
  SELECT w.id INTO v_sin_firma
  FROM public.equipo_trabajos w
  WHERE w.tipo = 'promocion'
    AND NOT EXISTS (SELECT 1 FROM public.equipo_mensajes m
                    WHERE m.trabajo_id = w.id AND m.to_agent = 'comercial_creativo'
                      AND m.payload ->> 'texto' ILIKE '%ARTE FINAL%')
  ORDER BY w.creado_en DESC LIMIT 1;

  -- Y una a la que sí, porque el dueño firmó el concepto.
  SELECT m.trabajo_id INTO v_con_firma
  FROM public.equipo_mensajes m
  WHERE m.to_agent = 'comercial_creativo' AND m.payload ->> 'texto' ILIKE '%ARTE FINAL%'
  ORDER BY m.created_at DESC LIMIT 1;

  IF v_sin_firma IS NULL OR v_con_firma IS NULL THEN
    RAISE NOTICE 'Sin datos para una de las dos ramas (sin_firma=%, con_firma=%). No se pudo probar.',
      v_sin_firma, v_con_firma;
    RETURN;
  END IF;

  -- RAMA 1: el concepto pasa. Esto es lo que estaba roto.
  v_r := public.equipo_revisar_arte(v_sin_firma, v_concepto);
  v_hay := EXISTS (SELECT 1 FROM unnest(v_r) x WHERE x LIKE 'No hay pieza montada%');
  IF v_hay THEN
    RAISE EXCEPTION 'SIGUE ROTO: al concepto del trabajo % le reclama la pieza que nadie le pidió. Reparos: %',
      v_sin_firma, v_r;
  END IF;

  -- RAMA 2: si la pidieron y vuelve un brief, se devuelve. Esto NO se toca.
  v_r := public.equipo_revisar_arte(v_con_firma, v_concepto);
  v_hay := EXISTS (SELECT 1 FROM unnest(v_r) x WHERE x LIKE 'No hay pieza montada%');
  IF NOT v_hay THEN
    RAISE EXCEPTION 'SE PASÓ DE LISTO: al trabajo % le pidieron el ARTE FINAL, volvió un brief, y lo deja pasar. Reparos: %',
      v_con_firma, v_r;
  END IF;

  RAISE NOTICE 'Las dos ramas correctas. Concepto libre: %. Arte exigido: %.', v_sin_firma, v_con_firma;
END $prueba$;

SELECT json_build_object(
 'firma', (SELECT pg_get_function_identity_arguments(p.oid) FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='equipo_revisar_arte'),
 'cuantas_hay', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='equipo_revisar_arte'),
 'mira_el_marcador', (SELECT p.prosrc LIKE '%ARTE FINAL%' FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='equipo_revisar_arte'),
 'promos_que_daban_tres_vueltas', (
   SELECT count(*) FROM public.equipo_trabajos w
   WHERE w.tipo='promocion'
     AND (SELECT count(*) FROM public.equipo_mensajes m
          WHERE m.trabajo_id=w.id AND m.payload->>'texto' LIKE '%REPAROS DE HERMES%') >= 2)
) AS r;
