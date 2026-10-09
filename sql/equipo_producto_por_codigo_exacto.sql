-- =====================================================================
-- EL PRODUCTO DE UN ENCARGO SE BUSCA POR SU CÓDIGO, NO POR CUALQUIER PALABRA
-- =====================================================================
-- (09/10/2026) "PORTA FAROL BLANCO CG300 GATO (código I-7479)" salió sin arte:
-- para buscar el producto se tomaba el código MÁS LARGO que apareciera en
-- cualquier parte del texto, y el producto viejo de código "BLANCO" (inactivo,
-- RD$1.10, sin foto) empataba en largo con "I-7479". Hermes le dijo al
-- Creativo "no hay foto" y luego le rechazó el precio (675 ≠ 1.10).
-- Lo mismo podía pasar con "501", "675", "300"... dentro del texto.
--
-- Ahora: primero el código exacto que viene en "(código X)"; si no hay, la
-- búsqueda vieja pero como palabra completa y prefiriendo activo y con foto.
-- Se usa en los tres sitios que tenían la búsqueda vieja: el brief del arte,
-- la revisión del arte y el reel.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._equipo_producto_de_peticion(p_tenant uuid, p_peticion text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cod text := btrim(substring(COALESCE(p_peticion, '') from '\(c[oó]digo ([^)]+)\)'));
  v_id uuid;
BEGIN
  IF v_cod IS NOT NULL AND v_cod <> '' THEN
    SELECT p.id INTO v_id FROM public.productos p
     WHERE p.tenant_id = p_tenant AND p.codigo = v_cod
     ORDER BY p.activo DESC NULLS LAST, (p.imagen_url IS NOT NULL) DESC
     LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  SELECT p.id INTO v_id FROM public.productos p
   WHERE p.tenant_id = p_tenant
     AND length(p.codigo) >= 3
     AND p_peticion ~ ('(^|[^[:alnum:]])' || regexp_replace(p.codigo, '([.\+*?\[^\]$(){}=!<>|:#/-])', '\\1', 'g') || '($|[^[:alnum:]])')
   ORDER BY p.activo DESC NULLS LAST, length(p.codigo) DESC, (p.imagen_url IS NOT NULL) DESC
   LIMIT 1;
  RETURN v_id;
END $function$;
REVOKE ALL ON FUNCTION public._equipo_producto_de_peticion(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION hermes.equipo_brief_arte(p_tenant uuid, p_peticion text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_foto text; v_logo text; v_tel text; v_nom text; v_reglas text; v_refs text;
BEGIN
  SELECT p.imagen_url INTO v_foto FROM public.productos p
  WHERE p.id = public._equipo_producto_de_peticion(p_tenant, p_peticion);

  SELECT e.logo_url, e.telefono, e.nombre INTO v_logo, v_tel, v_nom
  FROM public.config_empresa e WHERE e.tenant_id = p_tenant;

  -- Mismo criterio que usa la pantalla del dueño (equipo_criterios_ver): las
  -- de arte y las universales. Si él las ve en la lista, tienen que llegarle
  -- al creativo.
  SELECT string_agg('· ' || c.texto, E'\n' ORDER BY c.tipo, c.orden) INTO v_reglas
  FROM public.equipo_criterios c
  WHERE c.tenant_id = p_tenant AND c.activo AND c.tipo IN ('arte', '*');

  SELECT string_agg(
           '· ' || upper(r.uso) || ' imagen_id=' || r.imagen_id::text
           || COALESCE(' — ' || r.nota, ''), E'\n' ORDER BY r.creado_en)
    INTO v_refs
  FROM public.equipo_referencias r
  JOIN public.hermes_imagenes i ON i.imagen_id = r.imagen_id
  WHERE r.tenant_id = p_tenant AND r.activo AND i.deleted_at IS NULL;

  RETURN 'CONCEPTO APROBADO por el dueño. Ahora monta el ARTE FINAL.'
    || E'\n\nMateriales (úsalos tal cual, no busques ni generes otros):'
    || COALESCE(E'\n· Foto real del producto: ' || v_foto, E'\n· Foto: no hay en el catálogo, dilo')
    || COALESCE(E'\n· Logo oficial: ' || v_logo, '')
    || COALESCE(E'\n· Empresa: ' || v_nom, '')
    || COALESCE(E'\n· Teléfono: ' || v_tel, '')
    || COALESCE(E'\n\nREFERENCIAS QUE DEJÓ EL DUEÑO:' || E'\n' || v_refs
        || E'\nLas de tipo FONDO se montan de fondo automáticamente: no las describas,'
        || ' elige colores de texto que se lean encima.'
        || E'\nLas de tipo ESTILO son el listón: imita su estructura, no su producto.', '')
    || COALESCE(E'\n\nCÓMO DEBE VERSE LA PIEZA (reglas de la casa):' || E'\n' || v_reglas, '')
    || E'\n\nDevuelve el objeto "arte" con lo que decidas. Campos que el montador dibuja:'
    || E'\n  titulo          — lo que se LEE, 2 renglones cortos'
    || E'\n  titulo_acento   — UNA palabra del título que va en color de acento'
    || E'\n  subtitulo       — la marca, va en una cinta bajo el título'
    || E'\n  tagline         — una línea fina, opcional'
    || E'\n  bullets         — hasta 3 ventajas de 2-3 palabras (solo en historia)'
    || E'\n  sello           — palabra del sello redondo, o null. No prometas garantías que no existen.'
    || E'\n  precio, fondo, acento — hexadecimal en los dos colores'
    || E'\n\nLa foto real, el logo, el teléfono y la ciudad los pone el montador.'
    || E'\n\nY entrega, para CADA red, un ejemplo de TÍTULO y otro de DESCRIPCIÓN.'
    || E'\n\nNo se publica nada: esto vuelve a pasar por aprobación.';
END $function$;

CREATE OR REPLACE FUNCTION public.equipo_revisar_arte(p_trabajo_id uuid, p_payload jsonb)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  WHERE p.id = public._equipo_producto_de_peticion(v_w.tenant_id, v_w.peticion);

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
END $function$;

CREATE OR REPLACE FUNCTION hermes.equipo_reel_para(p_mensaje_id uuid, p_claim_token uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_m      record;
  v_w      record;
  v_prod   record;
  v_modelo record;
BEGIN
  SELECT m.id, m.tenant_id, m.claim_token, m.trabajo_id INTO v_m
    FROM public.equipo_mensajes m WHERE m.id = p_mensaje_id;
  IF v_m.id IS NULL OR v_m.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_w FROM public.equipo_trabajos WHERE id = v_m.trabajo_id;

  -- La pieza, por su código en el pedido (igual que la revisión de Hermes).
  SELECT p.id, p.codigo, p.descripcion, p.precio,
         ma.nombre AS marca,
         NULLIF(public.get_nombres_modelos(p.modelos_ids), '') AS modelos
    INTO v_prod
    FROM public.productos p
    LEFT JOIN public.marcas ma ON ma.id = p.marca_id AND ma.tenant_id = p.tenant_id
   WHERE p.tenant_id = v_m.tenant_id
     AND p.id = public._equipo_producto_de_peticion(v_m.tenant_id, v_w.peticion);
  IF v_prod.id IS NULL THEN RETURN NULL; END IF;

  -- El formato que hace más tiempo que no sale; dentro, un modelo al azar.
  SELECT r.* INTO v_modelo
    FROM public.equipo_reels_modelo r
    LEFT JOIN LATERAL (
      SELECT max(h.created_at) AS ultimo FROM public.equipo_reels_hechos h
       WHERE h.tenant_id = r.tenant_id AND h.formato = r.formato) u ON true
   WHERE r.tenant_id = v_m.tenant_id AND r.estado = 'listo' AND r.receta IS NOT NULL
   ORDER BY u.ultimo NULLS FIRST, random()
   LIMIT 1;
  IF v_modelo.id IS NULL THEN RETURN NULL; END IF;

  RETURN json_build_object(
    'modelo_id', v_modelo.id, 'formato', v_modelo.formato, 'receta', v_modelo.receta,
    'nota_dueno', v_modelo.nota_dueno,
    'producto', json_build_object('id', v_prod.id, 'codigo', v_prod.codigo,
      'descripcion', v_prod.descripcion, 'precio', v_prod.precio,
      'marca', v_prod.marca, 'modelos', v_prod.modelos));
END $function$;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('equipo_producto_por_codigo_exacto.sql');
