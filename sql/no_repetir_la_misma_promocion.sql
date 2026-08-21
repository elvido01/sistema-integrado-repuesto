-- =====================================================================
-- El brief deja de proponer lo que ya se promocionó
-- ---------------------------------------------------------------------
-- (2026-08-21) Hermes propuso la CARETA NEGRA AZUL PLATINA para promoción
-- y el dueño le contestó: "ya le realizamos promoción hace...". Al otro dia
-- la volvió a proponer.
--
-- No es que la ignore: es que nadie se la contó. El brief mira stock, foto
-- y ventas — tres cosas que no cambian porque se haya publicado algo. Y la
-- corrección del dueño vivía en un chat de Telegram, que no es un dato.
--
-- >>> POR QUE EN LA BASE Y NO EN UN JSON DEL VPS <<<
-- Porque acabamos de pasar dos dias arreglando scripts que apuntaban a una
-- PC que ya no existe. Un historial comercial guardado al lado de esos
-- scripts se pierde en la proxima mudanza, y ademas no se puede mirar desde
-- MotoFlow. Esto es un dato del negocio, va donde estan los datos.
--
-- >>> TRES FUENTES, UNA SOLA RESPUESTA <<<
-- La pregunta que el brief necesita es una sola: "¿este producto se
-- promociono hace poco?". Se responde juntando:
--
--   hermes_publication_jobs   lo que salio por la cola de publicacion
--   ai_marketing_content      lo que el modulo de Marketing IA marco publicado
--   marketing_promocion_manual  lo que se hizo POR FUERA, o lo que el dueño
--                               pide que no se proponga mas
--
-- La tercera es la que faltaba. Las dos primeras solo saben de lo que pasa
-- por el sistema; la careta se promociono a mano y por eso era invisible.
--
-- >>> EL BRIEF NO TIENE QUE PENSAR <<<
-- La vista `hermes.productos_no_promocionar` ya trae la ventana aplicada.
-- El script no calcula fechas ni compara dias: pregunta si el codigo esta
-- en la lista. Asi la ventana se cambia en la base (un UPDATE) y no
-- editando un archivo en el VPS por consola restringida.
--
-- Idempotente.
-- =====================================================================

-- ------------------------------------------------------------
-- Cuantos dias no repetir. Vive en la config del modulo, no en el codigo.
-- ------------------------------------------------------------
ALTER TABLE public.ai_marketing_settings
  ADD COLUMN IF NOT EXISTS dias_sin_repetir_promocion integer NOT NULL DEFAULT 30;

COMMENT ON COLUMN public.ai_marketing_settings.dias_sin_repetir_promocion IS
  'Dias que un producto queda fuera de las propuestas de promocion despues de promocionarse.';

-- ------------------------------------------------------------
-- Lo que se promociono por fuera, o lo que no se quiere proponer mas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_promocion_manual (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  -- Cuando se promociono. Para "no lo propongas mas" da igual: manda `permanente`.
  fecha       timestamptz NOT NULL DEFAULT now(),
  permanente  boolean NOT NULL DEFAULT false,
  nota        text,
  creado_por  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_promocion_manual_producto
  ON public.marketing_promocion_manual (tenant_id, producto_id, fecha DESC);

ALTER TABLE public.marketing_promocion_manual ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promocion_manual_select ON public.marketing_promocion_manual;
CREATE POLICY promocion_manual_select ON public.marketing_promocion_manual
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS promocion_manual_insert ON public.marketing_promocion_manual;
CREATE POLICY promocion_manual_insert ON public.marketing_promocion_manual
  FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS promocion_manual_delete ON public.marketing_promocion_manual;
CREATE POLICY promocion_manual_delete ON public.marketing_promocion_manual
  FOR DELETE TO authenticated USING (tenant_id = public.get_user_tenant());

-- ------------------------------------------------------------
-- LA RESPUESTA, YA MASTICADA
-- ------------------------------------------------------------
-- Filtrada a Repuestos Morla igual que las demas vistas del schema hermes.
CREATE OR REPLACE VIEW hermes.productos_no_promocionar AS
WITH cfg AS (
  SELECT COALESCE(MAX(s.dias_sin_repetir_promocion), 30) AS dias
  FROM public.ai_marketing_settings s
  WHERE s.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
),
fuentes AS (
  SELECT j.producto_id,
         COALESCE(j.completed_at, j.created_at) AS cuando,
         'publicacion'::text AS fuente,
         false AS permanente,
         NULL::text AS nota
  FROM public.hermes_publication_jobs j
  WHERE j.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    AND j.status = 'published'
    AND j.producto_id IS NOT NULL

  UNION ALL

  SELECT c.producto_id, c.published_at, 'marketing', false, NULL
  FROM public.ai_marketing_content c
  WHERE c.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    AND c.published_at IS NOT NULL
    AND c.producto_id IS NOT NULL

  UNION ALL

  SELECT m.producto_id, m.fecha, 'manual', m.permanente, m.nota
  FROM public.marketing_promocion_manual m
  WHERE m.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
),
ultima AS (
  -- Un producto puede venir de varias fuentes: manda la mas reciente, y
  -- `permanente` gana siempre aunque sea de una fila vieja.
  SELECT f.producto_id,
         MAX(f.cuando)                     AS ultima_promocion,
         bool_or(f.permanente)             AS permanente,
         (array_agg(f.fuente ORDER BY f.cuando DESC NULLS LAST))[1] AS fuente,
         (array_agg(f.nota   ORDER BY f.cuando DESC NULLS LAST))[1] AS nota
  FROM fuentes f
  GROUP BY f.producto_id
)
SELECT u.producto_id,
       p.codigo,
       p.descripcion,
       u.ultima_promocion,
       u.permanente,
       u.fuente,
       u.nota,
       (now()::date - u.ultima_promocion::date) AS dias_desde,
       CASE WHEN u.permanente THEN 'No proponer nunca'
            ELSE 'Promocionado hace ' || (now()::date - u.ultima_promocion::date) || ' dias'
       END AS motivo
FROM ultima u
JOIN public.productos p ON p.id = u.producto_id
CROSS JOIN cfg
WHERE u.permanente
   OR u.ultima_promocion >= now() - (cfg.dias || ' days')::interval;

GRANT SELECT ON hermes.productos_no_promocionar TO hermes_readonly;

-- ------------------------------------------------------------
-- Para que Hermes lo anote cuando el dueño se lo diga en el chat
-- ------------------------------------------------------------
-- Va en el schema hermes: hermes_readonly no puede llamar funciones de
-- public (ver crm_operativo.sql).
CREATE OR REPLACE FUNCTION hermes.registrar_promocion(
  p_codigo     text,
  p_fecha      date    DEFAULT NULL,
  p_permanente boolean DEFAULT false,
  p_nota       text    DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_prod   uuid;
  v_desc   text;
BEGIN
  SELECT p.id, p.descripcion INTO v_prod, v_desc
  FROM public.productos p
  WHERE p.tenant_id = v_tenant AND lower(p.codigo) = lower(btrim(p_codigo))
  LIMIT 1;

  IF v_prod IS NULL THEN
    RETURN json_build_object('ok', false, 'motivo', format('No existe el codigo %s', p_codigo));
  END IF;

  INSERT INTO public.marketing_promocion_manual (tenant_id, producto_id, fecha, permanente, nota)
  VALUES (v_tenant, v_prod, COALESCE(p_fecha::timestamptz, now()), COALESCE(p_permanente, false), p_nota);

  RETURN json_build_object('ok', true, 'codigo', p_codigo, 'descripcion', v_desc,
                           'permanente', COALESCE(p_permanente, false));
END $$;

REVOKE EXECUTE ON FUNCTION hermes.registrar_promocion(text, date, boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION hermes.registrar_promocion(text, date, boolean, text) TO hermes_readonly, authenticated;

-- ------------------------------------------------------------
-- LA CARETA
-- ------------------------------------------------------------
-- El caso que origino todo esto. El dueño se lo dijo a Hermes el 20/08 y
-- se perdio en el chat; aqui queda escrito.
INSERT INTO public.marketing_promocion_manual (tenant_id, producto_id, fecha, permanente, nota)
SELECT '00000000-0000-0000-0000-000000000001'::uuid, p.id, '2026-08-20'::timestamptz, false,
       'Promocion hecha por fuera del sistema; el dueño lo indico en el chat el 20/08.'
FROM public.productos p
WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND p.codigo = '52JK0442'
  AND NOT EXISTS (
    SELECT 1 FROM public.marketing_promocion_manual m
    WHERE m.producto_id = p.id AND m.fecha::date = '2026-08-20'
  );

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('no_repetir_la_misma_promocion.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT codigo, descripcion, fuente, dias_desde, permanente, motivo
FROM hermes.productos_no_promocionar
ORDER BY ultima_promocion DESC NULLS LAST;
