-- ============================================================
-- ESPECIFICACIONES DEL ARTE, Y HERMES REVISA ANTES DE ENSEÑARLO
-- ============================================================
-- Dos peticiones del dueño, la misma noche:
--
--   "Hay que poder darle ejemplos y especificaciones al agente creativo de
--    cómo debería verse la imagen final, y además que Hermes la revise antes
--    de que me la muestre a mí."
--
-- 1) LAS ESPECIFICACIONES no se escriben en el código. Ya existe
--    `equipo_criterios`, con tipo, texto, orden y `bloqueante`. Se le añade
--    el tipo 'arte' y esas reglas viajan en TODOS los encargos de pieza. Así
--    el dueño cambia cómo se ven sus promociones sin que nadie toque nada.
--
-- 2) LA REVISIÓN es de verdad o no es nada. Hermes no "mira y opina": se
--    comprueban cosas que se pueden comprobar —que la pieza existe, que el
--    precio es el del catálogo, que el producto no está bloqueado— y si algo
--    falla el borrador NO llega a la mesa: vuelve al creativo con el motivo.
--
--    Un supervisor que aprueba todo lo que le pasa por delante no es un
--    supervisor, es un sello.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. CÓMO DEBE VERSE LA PIEZA
-- ------------------------------------------------------------
INSERT INTO public.equipo_criterios (tenant_id, tipo, clave, texto, orden, bloqueante, activo)
SELECT '00000000-0000-0000-0000-000000000001', 'arte', k.clave, k.texto, k.orden, false, true
FROM (VALUES
  ('producto_protagonista', 'El producto es lo más grande de la pieza. Si el texto le quita sitio, se acorta el texto.', 10),
  ('titulo_corto', 'El título es lo que se LEE, no el nombre del catálogo. Máximo tres palabras fuertes; se puede partir en dos líneas.', 20),
  ('precio_visible', 'El precio se lee de un vistazo, en el color de acento, y es el del catálogo sin retocar.', 30),
  ('marca_presente', 'El logo oficial arriba y el teléfono abajo, siempre. Sin el teléfono la pieza no sirve de nada.', 40),
  ('sin_relleno', 'Nada de adornos, marcos ni frases de relleno. Fondo liso.', 50)
) AS k(clave, texto, orden)
WHERE NOT EXISTS (
  SELECT 1 FROM public.equipo_criterios c
  WHERE c.tenant_id = '00000000-0000-0000-0000-000000000001'
    AND c.tipo = 'arte' AND c.clave = k.clave);

-- El dueño las edita desde la pantalla, sin tocar SQL.
CREATE OR REPLACE FUNCTION public.equipo_criterio_guardar(
  p_tipo text, p_clave text, p_texto text,
  p_orden int DEFAULT 100, p_activo boolean DEFAULT true)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_tenant uuid := public.get_user_tenant();
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Este módulo es del dueño.';
  END IF;
  IF p_tipo NOT IN ('promocion','arte','seguimiento','consulta') THEN
    RAISE EXCEPTION 'Tipo no admitido: %', p_tipo;
  END IF;
  IF COALESCE(btrim(p_texto), '') = '' THEN
    RAISE EXCEPTION 'La regla viene vacía';
  END IF;

  UPDATE public.equipo_criterios
     SET texto = btrim(p_texto), orden = COALESCE(p_orden, orden), activo = p_activo
   WHERE tenant_id = v_tenant AND tipo = p_tipo AND clave = p_clave;

  IF NOT FOUND THEN
    INSERT INTO public.equipo_criterios (tenant_id, tipo, clave, texto, orden, bloqueante, activo)
    VALUES (v_tenant, p_tipo, COALESCE(NULLIF(btrim(p_clave), ''), 'regla_' || extract(epoch from now())::bigint),
            btrim(p_texto), COALESCE(p_orden, 100), false, p_activo);
  END IF;

  RETURN json_build_object('ok', true);
END $fn$;

REVOKE ALL ON FUNCTION public.equipo_criterio_guardar(text,text,text,int,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_criterio_guardar(text,text,text,int,boolean) TO authenticated;

-- ------------------------------------------------------------
-- 2. EL ENCARGO DEL ARTE LLEVA LAS ESPECIFICACIONES
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION hermes.equipo_brief_arte(p_tenant uuid, p_peticion text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_foto text; v_logo text; v_tel text; v_nom text; v_reglas text;
BEGIN
  SELECT p.imagen_url INTO v_foto FROM public.productos p
  WHERE p.tenant_id = p_tenant AND p_peticion LIKE '%' || p.codigo || '%'
  ORDER BY length(p.codigo) DESC LIMIT 1;

  SELECT e.logo_url, e.telefono, e.nombre INTO v_logo, v_tel, v_nom
  FROM public.config_empresa e WHERE e.tenant_id = p_tenant;

  SELECT string_agg('· ' || c.texto, E'\n' ORDER BY c.orden) INTO v_reglas
  FROM public.equipo_criterios c
  WHERE c.tenant_id = p_tenant AND c.tipo = 'arte' AND c.activo;

  RETURN 'CONCEPTO APROBADO por el dueño. Ahora monta el ARTE FINAL.'
    || E'\n\nMateriales (úsalos tal cual, no busques ni generes otros):'
    || COALESCE(E'\n· Foto real del producto: ' || v_foto, E'\n· Foto: no hay en el catálogo, dilo')
    || COALESCE(E'\n· Logo oficial: ' || v_logo, '')
    || COALESCE(E'\n· Empresa: ' || v_nom, '')
    || COALESCE(E'\n· Teléfono: ' || v_tel, '')
    || COALESCE(E'\n\nCÓMO DEBE VERSE LA PIEZA (reglas de la casa):' || E'\n' || v_reglas, '')
    || E'\n\nDecide el título que se lee, el subtítulo y los colores, y devuélvelos en "arte".'
    || ' El montador la dibuja con la foto y el logo.'
    || E'\n\nY entrega, para CADA red, un ejemplo de TÍTULO y otro de DESCRIPCIÓN.'
    || E'\n\nNo se publica nada: esto vuelve a pasar por aprobación.';
END $fn$;

-- ------------------------------------------------------------
-- 3. LA REVISIÓN DE HERMES
-- ------------------------------------------------------------
-- Devuelve los reparos. Vacío = pasa.
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
BEGIN
  SELECT * INTO v_w FROM public.equipo_trabajos WHERE id = p_trabajo_id;
  IF v_w.id IS NULL THEN RETURN v_reparos; END IF;

  -- a) ¿Montó la pieza, o volvió a mandar un plano?
  IF NOT public.equipo_es_arte(p_payload) THEN
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

  -- d) Sin copy no hay nada que publicar.
  IF COALESCE(jsonb_typeof(p_payload -> 'copy'), 'null') <> 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(p_payload -> 'copy')) = 0 THEN
    v_reparos := array_append(v_reparos, 'Falta el copy por red.');
  END IF;

  RETURN v_reparos;
END $fn$;

SELECT public.registrar_migracion('hermes_revisa_antes_de_enseñarte.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT json_build_object(
 'reglas_de_arte', (SELECT count(*) FROM public.equipo_criterios
   WHERE tipo='arte' AND tenant_id='00000000-0000-0000-0000-000000000001'),
 'el_brief_las_lleva', (SELECT hermes.equipo_brief_arte(
   '00000000-0000-0000-0000-000000000001',
   (SELECT w.peticion FROM public.equipo_trabajos w
    WHERE w.tenant_id='00000000-0000-0000-0000-000000000001' AND w.tipo='promocion'
    ORDER BY w.creado_en DESC LIMIT 1)) LIKE '%reglas de la casa%'),
 'revision_de_un_brief', public.equipo_revisar_arte(
   (SELECT w.id FROM public.equipo_trabajos w
    WHERE w.tenant_id='00000000-0000-0000-0000-000000000001' AND w.tipo='promocion'
    ORDER BY w.creado_en DESC LIMIT 1),
   '{"estado":"arte","copy":{}}'::jsonb)
) AS r;
