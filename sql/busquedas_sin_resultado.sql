-- =====================================================================
-- LO QUE SE BUSCA Y NO APARECE
-- ---------------------------------------------------------------------
-- (2026-08-14) "¿cómo entreno a Jarvis para que aprenda del inventario?"
--
-- No entrenándolo. Un modelo que memoriza el inventario memoriza el
-- precio de hoy y lo repite dentro de tres meses con total seguridad, y
-- ahí se pierde lo único que hace fiable a Jarvis: que los números salen
-- de la base. Lo que cambia vive en la base; lo que se enseña es CÓMO
-- habla la gente.
--
-- >>> QUÉ PROBLEMA RESUELVE ESTA TABLA <<<
-- Hoy, cuando alguien busca y no encuentra nada, esa información se
-- pierde. Es la más valiosa que produce el negocio: dice exactamente qué
-- le piden a la tienda y la tienda no sabe contestar. Medido contra el
-- catálogo real, "bujía" con tilde da cero y "bujia" da cincuenta — pero
-- sin registro no hay forma de saber cuántas veces pasa eso de verdad ni
-- con qué palabras.
--
-- Se registra ANTES de arreglar las búsquedas, a propósito: así el
-- arreglo se hace sobre lo que de verdad falla en el mostrador y no
-- sobre lo que yo supuse en nueve ejemplos.
--
-- >>> EL DICCIONARIO QUE ESCRIBEN LOS CLIENTES <<<
-- El patrón que más vale no es "buscó y no halló". Es:
--   busca "balinera"  -> 0 resultados
--   busca "rodamiento" -> lo encuentra
-- Eso acaba de enseñar que balinera = rodamiento, y no lo escribió un
-- programador: lo escribió el mostrador. `busquedas_pistas_sinonimo`
-- saca justamente esos pares.
--
-- >>> LO QUE ESTO NO HACE <<<
-- No cambia ninguna búsqueda. No toca get_productos_paginados ni
-- hermes.buscar_producto. Solo mira y anota. Si algo de esto fallara, la
-- búsqueda del vendedor sigue funcionando igual: por eso el registro se
-- llama desde fuera y nunca desde dentro del buscador.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. QUITAR TILDES
-- ------------------------------------------------------------
-- Hace falta para agrupar: "bujía" y "bujia" son la MISMA búsqueda y
-- contarlas por separado escondería el problema justo donde está.
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- Normaliza como leería una persona: sin tildes, sin mayúsculas, sin
-- espacios de más. Se usa aquí para agrupar, y servirá para arreglar las
-- búsquedas en el siguiente paso — una sola definición de "lo mismo".
CREATE OR REPLACE FUNCTION public.normalizar_busqueda(p_texto text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions'
AS $$
  SELECT NULLIF(btrim(regexp_replace(
           lower(extensions.unaccent(COALESCE(p_texto, ''))),
           '\s+', ' ', 'g')), '')
$$;

-- ------------------------------------------------------------
-- 1. EL REGISTRO
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.busquedas_catalogo (
  id          bigserial PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  -- De dónde salió la búsqueda. Importa: el vendedor y el agente buscan
  -- por funciones distintas y fallan de formas distintas.
  origen      text NOT NULL CHECK (origen IN ('vendedor', 'agente', 'movil', 'widget')),
  usuario_id  uuid,
  texto       text NOT NULL,
  texto_norm  text NOT NULL,
  resultados  integer NOT NULL CHECK (resultados >= 0),
  creado_en   timestamptz NOT NULL DEFAULT now()
);

-- El índice que de verdad se usa: "qué se buscó sin éxito y hace poco".
CREATE INDEX IF NOT EXISTS idx_busquedas_sin_resultado
  ON public.busquedas_catalogo (tenant_id, creado_en DESC)
  WHERE resultados = 0;

CREATE INDEX IF NOT EXISTS idx_busquedas_norm
  ON public.busquedas_catalogo (tenant_id, texto_norm, creado_en DESC);

ALTER TABLE public.busquedas_catalogo ENABLE ROW LEVEL SECURITY;

-- Se lee dentro de la empresa; escribir es SOLO por la función de abajo.
-- Sin esto, cualquiera con sesión podría inventarse el historial de
-- búsquedas y torcer las decisiones que salgan de él.
DROP POLICY IF EXISTS busquedas_catalogo_lee ON public.busquedas_catalogo;
CREATE POLICY busquedas_catalogo_lee ON public.busquedas_catalogo
  FOR SELECT USING (tenant_id = public.get_user_tenant());

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.busquedas_catalogo FROM anon, authenticated;
GRANT SELECT ON public.busquedas_catalogo TO authenticated;

-- ------------------------------------------------------------
-- 2. ANOTAR UNA BÚSQUEDA
-- ------------------------------------------------------------
-- >>> POR QUÉ NO SE LLAMA DESDE DENTRO DEL BUSCADOR <<<
-- get_productos_paginados y hermes.buscar_producto son STABLE: no pueden
-- escribir, y volverlas VOLATILE para meterles un INSERT le pondría una
-- escritura al camino más caliente del sistema. El que busca no puede
-- esperar por el registro.
--
-- >>> POR QUÉ COLAPSA LO QUE SE VA TECLEANDO <<<
-- El buscador dispara mientras se escribe: "b", "bu", "buj", "buji",
-- "bujia". Guardar las cinco llenaría la tabla de prefijos y taparía la
-- señal. Si la anterior es de hace segundos y la nueva EMPIEZA por ella,
-- se reemplaza: queda lo que la persona terminó de escribir.
CREATE OR REPLACE FUNCTION public.registrar_busqueda(
  p_origen     text,
  p_texto      text,
  p_resultados integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  -- El agente entra sin sesión de usuario. hermes.buscar_producto ya está
  -- fijada a Repuestos Morla, así que este respaldo dice lo mismo que la
  -- búsqueda que se está registrando y no inventa un tenant.
  v_tenant uuid := COALESCE(public.get_user_tenant(),
                            '00000000-0000-0000-0000-000000000001'::uuid);
  v_uid    uuid := auth.uid();
  v_norm   text := public.normalizar_busqueda(p_texto);
  v_previa bigint;
BEGIN
  -- Menos de dos letras no es una búsqueda, es alguien empezando.
  IF v_norm IS NULL OR length(v_norm) < 2 THEN RETURN; END IF;
  IF p_origen NOT IN ('vendedor', 'agente', 'movil', 'widget') THEN RETURN; END IF;

  SELECT b.id INTO v_previa
  FROM public.busquedas_catalogo b
  WHERE b.tenant_id = v_tenant
    AND b.origen = p_origen
    AND b.usuario_id IS NOT DISTINCT FROM v_uid
    AND b.creado_en > now() - interval '8 seconds'
    AND v_norm LIKE b.texto_norm || '%'
  ORDER BY b.creado_en DESC
  LIMIT 1;

  IF v_previa IS NOT NULL THEN
    UPDATE public.busquedas_catalogo
       SET texto = p_texto, texto_norm = v_norm,
           resultados = GREATEST(0, COALESCE(p_resultados, 0)), creado_en = now()
     WHERE id = v_previa;
  ELSE
    INSERT INTO public.busquedas_catalogo
      (tenant_id, origen, usuario_id, texto, texto_norm, resultados)
    VALUES
      (v_tenant, p_origen, v_uid, p_texto, v_norm, GREATEST(0, COALESCE(p_resultados, 0)));
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.registrar_busqueda(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_busqueda(text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_busqueda(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_busqueda(text, text, integer) TO hermes_readonly;

-- ------------------------------------------------------------
-- 3. QUÉ SE BUSCA Y NO APARECE
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.busquedas_sin_resultado(p_dias integer DEFAULT 7)
RETURNS TABLE(texto text, veces bigint, origenes text, ultima timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT b.texto_norm,
         count(*),
         string_agg(DISTINCT b.origen, ', ' ORDER BY b.origen),
         max(b.creado_en)
  FROM public.busquedas_catalogo b
  WHERE b.tenant_id = public.get_user_tenant()
    AND b.resultados = 0
    AND b.creado_en > now() - make_interval(days => GREATEST(1, p_dias))
  GROUP BY b.texto_norm
  ORDER BY count(*) DESC, max(b.creado_en) DESC
  LIMIT 200
$$;

REVOKE ALL ON FUNCTION public.busquedas_sin_resultado(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.busquedas_sin_resultado(integer) TO authenticated;

-- ------------------------------------------------------------
-- 4. EL DICCIONARIO QUE ESCRIBEN LOS CLIENTES
-- ------------------------------------------------------------
-- Busca el par "no encontró -> volvió a buscar y sí encontró", de la misma
-- persona y en menos de dos minutos. Eso es un sinónimo dicho por quien
-- estaba delante del mostrador.
--
-- Son PISTAS, no verdades: hay que mirarlas antes de convertirlas en
-- sinónimos. Alguien puede buscar dos cosas distintas seguidas.
CREATE OR REPLACE FUNCTION public.busquedas_pistas_sinonimo(p_dias integer DEFAULT 30)
RETURNS TABLE(no_encontro text, si_encontro text, resultados integer, cuando timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT fallo.texto_norm, exito.texto_norm, exito.resultados, fallo.creado_en
  FROM public.busquedas_catalogo fallo
  JOIN LATERAL (
    SELECT e.texto_norm, e.resultados
    FROM public.busquedas_catalogo e
    WHERE e.tenant_id = fallo.tenant_id
      AND e.usuario_id IS NOT DISTINCT FROM fallo.usuario_id
      AND e.resultados > 0
      AND e.creado_en > fallo.creado_en
      AND e.creado_en < fallo.creado_en + interval '2 minutes'
      -- Si una empieza por la otra es la misma palabra siendo tecleada,
      -- no un sinónimo.
      AND e.texto_norm NOT LIKE fallo.texto_norm || '%'
      AND fallo.texto_norm NOT LIKE e.texto_norm || '%'
    ORDER BY e.creado_en
    LIMIT 1
  ) exito ON true
  WHERE fallo.tenant_id = public.get_user_tenant()
    AND fallo.resultados = 0
    AND fallo.creado_en > now() - make_interval(days => GREATEST(1, p_dias))
  ORDER BY fallo.creado_en DESC
  LIMIT 200
$$;

REVOKE ALL ON FUNCTION public.busquedas_pistas_sinonimo(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.busquedas_pistas_sinonimo(integer) TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('busquedas_sin_resultado.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verificación (vacío hasta que alguien busque):
SELECT public.normalizar_busqueda('  BUJÍA   NGK ') AS asi_se_agrupa;
