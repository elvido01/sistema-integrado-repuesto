-- ============================================================
-- LA REFERENCIA DEL DUEÑO
-- ============================================================
-- "El arte de Comercial-Creativo no es apto para publicar. ¿Cómo le muestro
--  la imagen del tanque para que la tome como referencia y punto de partida?"
--
-- Tenía razón en lo primero y la respuesta a lo segundo no era solo enseñarle
-- la foto: el montador sabía dibujar seis cosas y con seis cosas no se hace
-- una pieza publicable. Eso ya se arregló en arteCreativo.mjs.
--
-- Esto es la otra mitad: el sitio donde el dueño deja SU referencia, y el
-- carril por el que le llega al creativo. Dos usos, que no son lo mismo:
--
--   'estilo' → mírala y hazlo así. Es un ejemplo a imitar.
--   'fondo'  → úsala DE FONDO. La pieza se monta encima de ella.
--
-- El segundo es el que da resultado inmediato: el fondo bueno deja de ser
-- algo que hay que dibujar y pasa a ser algo que el dueño ya tiene.
--
-- Las imágenes van a `hermes_imagenes` —bytes en la base—, el mismo carril
-- que ya usan las piezas montadas. No se abre un bucket ni se reparte llave
-- de Storage: el creativo entra como rol de base, sin sesión.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. DONDE VIVEN
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.equipo_referencias (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  imagen_id   uuid NOT NULL REFERENCES public.hermes_imagenes(imagen_id),
  uso         text NOT NULL DEFAULT 'estilo',
  nota        text,
  activo      boolean NOT NULL DEFAULT true,
  creado_por  uuid,
  creado_en   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.equipo_referencias DROP CONSTRAINT IF EXISTS equipo_referencias_uso_check;
ALTER TABLE public.equipo_referencias ADD CONSTRAINT equipo_referencias_uso_check
  CHECK (uso IN ('estilo', 'fondo'));

CREATE INDEX IF NOT EXISTS ix_equipo_referencias_tenant
  ON public.equipo_referencias (tenant_id, activo, uso);

ALTER TABLE public.equipo_referencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS equipo_referencias_de_su_empresa ON public.equipo_referencias;
CREATE POLICY equipo_referencias_de_su_empresa ON public.equipo_referencias
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant());

-- ------------------------------------------------------------
-- 2. SUBIRLA
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.equipo_referencia_guardar(
  p_imagen_b64 text,
  p_mime_type  text DEFAULT 'image/png',
  p_nombre     text DEFAULT NULL,
  p_uso        text DEFAULT 'estilo',
  p_nota       text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_max    int  := 8388608;   -- 8 MB. Una referencia de diseñador pesa 1-2.
  v_bytes  bytea;
  v_size   bigint;
  v_sha    text;
  v_img    uuid;
  v_id     uuid;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Este módulo es del dueño.';
  END IF;
  IF p_mime_type NOT IN ('image/png', 'image/jpeg', 'image/webp') THEN
    RAISE EXCEPTION 'Tipo de imagen no admitido: %', p_mime_type;
  END IF;
  IF p_uso NOT IN ('estilo', 'fondo') THEN
    RAISE EXCEPTION 'Uso no admitido: %', p_uso;
  END IF;

  BEGIN
    v_bytes := decode(p_imagen_b64, 'base64');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'La imagen no viene en base64 válido';
  END;

  v_size := octet_length(v_bytes);
  IF v_size = 0 THEN RAISE EXCEPTION 'La imagen viene vacía'; END IF;
  IF v_size > v_max THEN
    RAISE EXCEPTION 'La imagen pesa % bytes; el máximo es %', v_size, v_max;
  END IF;

  v_sha := encode(sha256(v_bytes), 'hex');

  -- Subir dos veces la misma referencia no guarda dos copias de los bytes.
  SELECT i.imagen_id INTO v_img FROM public.hermes_imagenes i
  WHERE i.tenant_id = v_tenant AND i.sha256 = v_sha AND i.deleted_at IS NULL;

  IF v_img IS NULL THEN
    INSERT INTO public.hermes_imagenes
      (tenant_id, origen, mime_type, nombre, size_bytes, bytes, sha256)
    VALUES (v_tenant, 'usuario', p_mime_type,
            left(COALESCE(p_nombre, 'referencia.png'), 120), v_size, v_bytes, v_sha)
    RETURNING imagen_id INTO v_img;
  END IF;

  -- Pero sí puede cambiar de uso o de nota: eso es editarla, no duplicarla.
  SELECT r.id INTO v_id FROM public.equipo_referencias r
  WHERE r.tenant_id = v_tenant AND r.imagen_id = v_img;

  IF v_id IS NULL THEN
    INSERT INTO public.equipo_referencias (tenant_id, imagen_id, uso, nota, creado_por)
    VALUES (v_tenant, v_img, p_uso, NULLIF(btrim(COALESCE(p_nota, '')), ''), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.equipo_referencias
       SET uso = p_uso, nota = NULLIF(btrim(COALESCE(p_nota, '')), ''), activo = true
     WHERE id = v_id;
  END IF;

  RETURN json_build_object('ok', true, 'id', v_id, 'imagen_id', v_img, 'size_bytes', v_size);
END $fn$;

REVOKE ALL ON FUNCTION public.equipo_referencia_guardar(text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_referencia_guardar(text,text,text,text,text) TO authenticated;

-- ------------------------------------------------------------
-- 3. VERLAS Y QUITARLAS
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.equipo_referencias_ver()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', r.id, 'imagen_id', r.imagen_id, 'uso', r.uso,
           'nota', r.nota, 'nombre', i.nombre)
         ORDER BY r.creado_en DESC), '[]'::jsonb)
  FROM public.equipo_referencias r
  JOIN public.hermes_imagenes i ON i.imagen_id = r.imagen_id
  WHERE r.tenant_id = public.get_user_tenant() AND r.activo
    AND i.deleted_at IS NULL;
$fn$;

REVOKE ALL ON FUNCTION public.equipo_referencias_ver() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_referencias_ver() TO authenticated;

CREATE OR REPLACE FUNCTION public.equipo_referencia_quitar(p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Este módulo es del dueño.';
  END IF;
  -- Se desactiva, no se borra: los bytes pueden estar en una pieza ya
  -- montada, y borrarlos dejaría un agujero en el historial.
  UPDATE public.equipo_referencias SET activo = false
  WHERE id = p_id AND tenant_id = public.get_user_tenant();
  RETURN json_build_object('ok', FOUND);
END $fn$;

REVOKE ALL ON FUNCTION public.equipo_referencia_quitar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_referencia_quitar(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 4. QUE LE LLEGUEN AL CREATIVO
-- ------------------------------------------------------------
-- El brief nombra cada referencia por su imagen_id. El worker la resuelve
-- contra la base y decide qué hacer con ella según el uso: el 'fondo' se lo
-- pasa al montador, el 'estilo' se lo pone delante para que lo mire.
CREATE OR REPLACE FUNCTION hermes.equipo_brief_arte(p_tenant uuid, p_peticion text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_foto text; v_logo text; v_tel text; v_nom text; v_reglas text; v_refs text;
BEGIN
  SELECT p.imagen_url INTO v_foto FROM public.productos p
  WHERE p.tenant_id = p_tenant AND p_peticion LIKE '%' || p.codigo || '%'
  ORDER BY length(p.codigo) DESC LIMIT 1;

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
END $fn$;

-- Y el creativo tiene que poder leer los bytes de la referencia.
DO $g$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['hermes_readonly','equipo_worker'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT ON public.equipo_referencias TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.hermes_imagen_ver(uuid) TO %I', r);
    END IF;
  END LOOP;
END $g$;

SELECT public.registrar_migracion('la_referencia_del_dueno.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT json_build_object(
 'tabla', (SELECT count(*) FROM information_schema.tables
   WHERE table_schema='public' AND table_name='equipo_referencias'),
 'rpcs', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('equipo_referencia_guardar','equipo_referencias_ver','equipo_referencia_quitar')),
 'brief_habla_de_referencias', (SELECT hermes.equipo_brief_arte(
   '00000000-0000-0000-0000-000000000001',
   (SELECT w.peticion FROM public.equipo_trabajos w
    WHERE w.tenant_id='00000000-0000-0000-0000-000000000001' AND w.tipo='promocion'
    ORDER BY w.creado_en DESC LIMIT 1)) LIKE '%titulo_acento%'),
 'sin_referencias_no_ensucia', (SELECT hermes.equipo_brief_arte(
   '00000000-0000-0000-0000-000000000001',
   (SELECT w.peticion FROM public.equipo_trabajos w
    WHERE w.tenant_id='00000000-0000-0000-0000-000000000001' AND w.tipo='promocion'
    ORDER BY w.creado_en DESC LIMIT 1)) NOT LIKE '%REFERENCIAS QUE DEJÓ%')
) AS r;
