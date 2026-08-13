-- =====================================================================
-- LOS AGENTES DE NUBE NO DEPENDEN DE NINGUNA PC
-- ---------------------------------------------------------------------
-- (2026-08-13) "ni Jarvis ni el Comercial pueden depender de que mi PC
-- esté encendida para que funcionen".
--
-- Tenía razón, y el fallo era de diseño. El worker de la PC llamaba a
-- OpenAI directo, así que pedía una SEGUNDA copia de una clave que ya
-- vivía donde tenía que vivir: como secreto de las Edge Functions. Eso
-- duplica el secreto, lo saca de un entorno controlado y ata el negocio
-- a que una máquina de escritorio esté encendida.
--
-- >>> LA REGLA QUE SE ROMPIÓ Y AQUÍ SE REPONE <<<
-- La credencial vive en UN solo sitio, y quien necesita el trabajo se lo
-- pide a ese sitio en vez de llevarse una copia.
--
-- Estas funciones son la puerta para que una Edge Function —que corre
-- con la clave ya guardada en Supabase— atienda la cola del equipo.
-- PostgREST solo publica el esquema `public`, así que la cola, que vive
-- en `hermes`, necesita estos envoltorios para ser alcanzable.
--
-- >>> POR QUÉ SOLO service_role <<<
-- Son envoltorios SECURITY DEFINER sobre funciones que TOMAN trabajo y
-- lo dan por respondido. En manos de `authenticated` cualquier usuario
-- con sesión podría vaciarle la cola a un agente o contestar por él.
-- El único que las puede llamar es el service_role, que solo existe
-- dentro de las Edge Functions y nunca llega al navegador.
--
-- >>> POR QUÉ HERMES QUEDA FUERA <<<
-- `hermes` figura como agente de nube, pero tiene su propio proceso en
-- el VPS con herramientas de verdad: puede buscar, leer archivos y usar
-- el canal. Atenderlo desde aquí con una llamada suelta a un modelo
-- sería robarle trabajo que él hace mejor, y contestar peor.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- 1. QUIÉNES SE ATIENDEN DESDE LA NUBE
-- ------------------------------------------------------------
-- Se pregunta a la base, no se escribe una lista aquí. Así el día que
-- cambies el motor del Comercial desde la pantalla, empieza a atenderse
-- solo, sin tocar código.
CREATE OR REPLACE FUNCTION public.equipo_nube_agentes()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_agg(a.clave ORDER BY a.orden, a.clave), '[]'::jsonb)
  FROM public.equipo_agentes a
  WHERE a.activo
    AND a.ejecuta_en = 'nube'
    AND a.clave <> 'hermes'
$$;

REVOKE ALL ON FUNCTION public.equipo_nube_agentes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.equipo_nube_agentes() TO service_role;

-- ------------------------------------------------------------
-- 2. LA CONFIGURACIÓN DEL AGENTE
-- ------------------------------------------------------------
-- Se relee en cada trabajo, igual que hacía el worker: cambiar el motor
-- desde la pantalla no puede exigir un redespliegue.
CREATE OR REPLACE FUNCTION public.equipo_nube_config(p_agente text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT hermes.equipo_agente_config(p_agente)::jsonb
$$;

REVOKE ALL ON FUNCTION public.equipo_nube_config(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.equipo_nube_config(text) TO service_role;

-- ------------------------------------------------------------
-- 3. TOMAR UN TRABAJO
-- ------------------------------------------------------------
-- Uno cada vez, como el worker. Devuelve jsonb y no una tabla: la forma
-- de `hermes.equipo_tomar` tiene diecisiete columnas y envolverla como
-- RETURNS TABLE obliga a repetirlas —y a mantenerlas sincronizadas— por
-- ningún beneficio. Un jsonb no se desincroniza.
--
-- Devuelve NULL cuando no hay nada. La Edge Function para ahí.
CREATE OR REPLACE FUNCTION public.equipo_nube_tomar(p_agente text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_fila jsonb;
BEGIN
  -- El agente tiene que ser de nube. Sin esta comprobación, una llamada
  -- con 'comercial_creativo' le quitaría de la boca el trabajo al worker
  -- de la suscripción, y aquí no hay con qué contestarlo.
  IF NOT (SELECT public.equipo_nube_agentes() ? p_agente) THEN
    RAISE EXCEPTION 'El agente % no se atiende desde la nube', p_agente
      USING HINT = 'Mira equipo_agentes.ejecuta_en; solo se atiende lo marcado como nube.';
  END IF;

  SELECT to_jsonb(t) INTO v_fila
  FROM hermes.equipo_tomar(p_agente, 1) AS t
  LIMIT 1;

  RETURN v_fila;   -- NULL si la cola está vacía
END $$;

REVOKE ALL ON FUNCTION public.equipo_nube_tomar(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.equipo_nube_tomar(text) TO service_role;

-- ------------------------------------------------------------
-- 4. EL CATÁLOGO QUE CONSULTA JARVIS
-- ------------------------------------------------------------
-- Jarvis NO inventa precios: los busca el SQL y el modelo solo redacta
-- lo que salió. Esa garantía tiene que viajar con él a la nube, porque
-- es la razón por la que se puede confiar en lo que contesta.
--
-- Si la consulta falla se propaga el error: sin datos no se contesta.
CREATE OR REPLACE FUNCTION public.equipo_nube_catalogo(p_texto text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(b)), '[]'::jsonb)
  FROM (
    SELECT codigo, descripcion, marca, precio, existencia, ubicacion
    FROM hermes.buscar_producto(p_texto, 8, false)
  ) b
$$;

REVOKE ALL ON FUNCTION public.equipo_nube_catalogo(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.equipo_nube_catalogo(text) TO service_role;

-- ------------------------------------------------------------
-- 5. RESPONDER, FALLAR Y RENOVAR
-- ------------------------------------------------------------
-- El claim_token va en todas: es lo que impide que dos atendedores
-- contesten el mismo mensaje. Si el arrendamiento venció y otro lo tomó,
-- la función de abajo devuelve `abandonar` y esta respuesta se descarta
-- en vez de pisar la del otro.
CREATE OR REPLACE FUNCTION public.equipo_nube_responder(
  p_mensaje_id uuid, p_claim_token uuid, p_resumen text, p_datos jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT hermes.equipo_responder(p_mensaje_id, p_claim_token, p_resumen, p_datos)::jsonb
$$;

REVOKE ALL ON FUNCTION public.equipo_nube_responder(uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.equipo_nube_responder(uuid,uuid,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.equipo_nube_error(
  p_mensaje_id uuid, p_claim_token uuid, p_mensaje text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT hermes.equipo_error(p_mensaje_id, p_claim_token, p_mensaje)::jsonb
$$;

REVOKE ALL ON FUNCTION public.equipo_nube_error(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.equipo_nube_error(uuid,uuid,text) TO service_role;

-- Renovar el arrendamiento NO hace falta y por eso no existe aquí. El
-- worker de la PC lo renovaba cada 5 minutos porque una promoción con
-- copy y concepto puede pasarse de los 15 del arrendamiento. Una Edge
-- Function no llega a vivir tanto: se muere antes por su propio límite.
-- Una función SECURITY DEFINER que nadie llama es superficie de ataque
-- sin dueño, así que si se creó en una pasada anterior, se quita.
DROP FUNCTION IF EXISTS public.equipo_nube_renovar(uuid,uuid);

-- ------------------------------------------------------------
-- 6. EL LATIDO
-- ------------------------------------------------------------
-- La pantalla del Equipo IA dice "Nunca ha arrancado un worker" cuando
-- nadie late. Un agente atendido desde la nube tiene que poder decir lo
-- mismo que decía la PC, o parecería apagado estando vivo.
--
-- Donde antes iba el nombre de la máquina va 'edge-function': quien mire
-- la pantalla tiene que poder distinguir de un vistazo si contesta la
-- nube o un escritorio.
CREATE OR REPLACE FUNCTION public.equipo_nube_latido(
  p_agente text, p_proveedor text DEFAULT NULL, p_modelo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT hermes.equipo_latido(
    p_agente, NULL, NULL, 'edge-function',
    COALESCE(p_proveedor, (hermes.equipo_agente_config(p_agente)::jsonb) ->> 'proveedor'),
    COALESCE(p_modelo,    (hermes.equipo_agente_config(p_agente)::jsonb) ->> 'modelo'),
    'deno'
  )::jsonb
$$;

REVOKE ALL ON FUNCTION public.equipo_nube_latido(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.equipo_nube_latido(text,text,text) TO service_role;

-- ------------------------------------------------------------
-- 7. ¿HAY TRABAJO ESPERANDO?
-- ------------------------------------------------------------
-- Para que el disparador no despierte a la Edge Function por mensajes
-- que no son suyos, y para que el cron de seguridad no la llame en vano
-- cada minuto durante todo el día.
CREATE OR REPLACE FUNCTION public.equipo_nube_pendientes()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::integer
  FROM public.equipo_mensajes m
  WHERE m.to_agent IN (SELECT jsonb_array_elements_text(public.equipo_nube_agentes()))
    AND m.attempts < 3
    AND (
      m.status = 'pending'
      OR (m.status IN ('claimed','processing')
          AND COALESCE(m.lease_until, m.claimed_at + hermes.equipo_lease()) <= now())
    )
    AND NOT (m.requires_approval AND COALESCE(m.approval_status,'pending') <> 'approved')
$$;

REVOKE ALL ON FUNCTION public.equipo_nube_pendientes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.equipo_nube_pendientes() TO service_role;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('equipo_ia_nube.sql');
  END IF;
END $$;
