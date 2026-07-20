-- =====================================================================
-- VAULT COMPARTIDO — Elvido (Obsidian) + Hermes + Claude
-- ---------------------------------------------------------------------
-- El vault de Obsidian vive en archivos (vault/) en la PC de Elvido.
-- Hermes corre en OTRA PC y no tiene esos archivos. Esta tabla es el
-- punto de encuentro: un demonio en la PC de Elvido sincroniza los
-- archivos contra aquí, y Hermes lee/escribe por el esquema `hermes`.
--
-- REGLA DE ORO — separación por dueño (evita el desastre clásico de la
-- sincronización bidireccional):
--   vault/vision, decisiones, modulos, ...  -> de Elvido. Agentes SOLO leen.
--   vault/agentes/hermes/**                 -> solo Hermes escribe.
--   vault/agentes/claude/**                 -> solo Claude escribe.
-- Un agente que quiera comentar una nota de Elvido crea la suya con un
-- [[wikilink]]; en Obsidian aparece como backlink. Nadie edita encima
-- del texto de otro, así que casi no existe el conflicto.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- Depende del censor de credenciales que ya usamos en el espejo WhatsApp.
DO $$ BEGIN
  IF to_regprocedure('public.ocultar_secretos(text)') IS NULL THEN
    RAISE EXCEPTION 'Falta public.ocultar_secretos: correr primero sql/whatsapp_espejo_seguridad.sql';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. Tabla
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vault_notas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL DEFAULT public.get_user_tenant(),
  ruta        text NOT NULL,                       -- 'vision/target-ideal.md'
  titulo      text,
  contenido   text NOT NULL DEFAULT '',
  autor       text NOT NULL DEFAULT 'elvido'
              CHECK (autor IN ('elvido', 'hermes', 'claude')),
  wikilinks   text[] NOT NULL DEFAULT '{}',        -- [[destinos]] extraídos
  tags        text[] NOT NULL DEFAULT '{}',        -- #tags extraídos
  hash        text,                                -- sha256 del contenido
  borrada     boolean NOT NULL DEFAULT false,      -- borrado suave: nunca perdemos texto
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vault_notas_ruta_unica UNIQUE (tenant_id, ruta)
);

-- Carpeta raíz, para filtrar rápido por dueño
ALTER TABLE public.vault_notas
  DROP COLUMN IF EXISTS carpeta;
ALTER TABLE public.vault_notas
  ADD COLUMN carpeta text GENERATED ALWAYS AS (split_part(ruta, '/', 1)) STORED;

-- Búsqueda en español: Hermes busca por concepto en vez de leerse las 19
-- notas completas cada vez (le ahorra contexto).
ALTER TABLE public.vault_notas
  DROP COLUMN IF EXISTS busqueda;
ALTER TABLE public.vault_notas
  ADD COLUMN busqueda tsvector GENERATED ALWAYS AS (
    to_tsvector('spanish', coalesce(titulo, '') || ' ' || coalesce(contenido, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_vault_notas_busqueda ON public.vault_notas USING gin (busqueda);
CREATE INDEX IF NOT EXISTS idx_vault_notas_tenant   ON public.vault_notas (tenant_id, borrada);
CREATE INDEX IF NOT EXISTS idx_vault_notas_carpeta  ON public.vault_notas (tenant_id, carpeta);
CREATE INDEX IF NOT EXISTS idx_vault_notas_links    ON public.vault_notas USING gin (wikilinks);

COMMENT ON TABLE public.vault_notas IS
  'Vault de Obsidian compartido entre Elvido y sus agentes. Ver sql/vault_agentes.sql';

-- ---------------------------------------------------------------------
-- 2. Guardias de escritura (dueño de carpeta + secretos)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._vault_validar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.ruta := regexp_replace(btrim(NEW.ruta), '^/+', '');

  IF NEW.ruta = '' OR NEW.ruta !~ '\.md$' THEN
    RAISE EXCEPTION 'Ruta inválida "%": debe ser relativa y terminar en .md', NEW.ruta;
  END IF;

  -- Sin escapes fuera del vault
  IF NEW.ruta LIKE '%..%' THEN
    RAISE EXCEPTION 'Ruta inválida "%": no se permite ".."', NEW.ruta;
  END IF;

  -- Cada agente solo dentro de su carpeta. Elvido escribe donde quiera
  -- MENOS dentro de agentes/ (esas son notas de ellos).
  IF NEW.autor IN ('hermes', 'claude') THEN
    IF NEW.ruta NOT LIKE ('agentes/' || NEW.autor || '/%') THEN
      RAISE EXCEPTION
        'El agente % solo puede escribir en agentes/%/ (intentó "%"). Para comentar una nota ajena, crea la tuya con un [[wikilink]].',
        NEW.autor, NEW.autor, NEW.ruta;
    END IF;
  ELSIF NEW.ruta LIKE 'agentes/%' THEN
    RAISE EXCEPTION 'La carpeta agentes/ es de los agentes; no escribas ahí como elvido (ruta "%")', NEW.ruta;
  END IF;

  -- Guardia de secretos: el vault es compartido, una credencial aquí se
  -- replica a otra PC. Rechazamos en vez de censurar para que el autor
  -- lo arregle y sepa que pasó.
  IF public.ocultar_secretos(NEW.contenido) IS DISTINCT FROM NEW.contenido THEN
    RAISE EXCEPTION
      'La nota "%" contiene algo que parece una credencial. Sácala antes de sincronizar (el vault es compartido).',
      NEW.ruta;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vault_validar ON public.vault_notas;
CREATE TRIGGER trg_vault_validar
  BEFORE INSERT OR UPDATE ON public.vault_notas
  FOR EACH ROW EXECUTE FUNCTION public._vault_validar();

-- ---------------------------------------------------------------------
-- 3. RLS — aislamiento por empresa, igual que el resto del sistema
-- ---------------------------------------------------------------------
ALTER TABLE public.vault_notas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vault_notas_tenant ON public.vault_notas;
CREATE POLICY vault_notas_tenant ON public.vault_notas
  FOR ALL
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

-- ---------------------------------------------------------------------
-- 4. Vistas para Hermes
--    OJO x2:
--    a) inline a la tabla base, nunca sobre vistas public con
--       security_invoker -> permission denied (lección de julio 2026).
--    b) Hermes entra por psycopg2 con el rol hermes_readonly, SIN JWT de
--       Supabase, así que get_user_tenant() le devuelve NULL y el RLS lo
--       bloquearía todo. Por eso el tenant va FIJO en la vista y usamos
--       security_barrier (la vista corre como su dueño): el WHERE de la
--       vista ES la frontera de seguridad. Mismo patrón que crm_hoy.
-- ---------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS hermes;

DO $$
DECLARE
  v_morla constant uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- Lectura: todo el vault de Morla
  EXECUTE format($q$
    CREATE OR REPLACE VIEW hermes.vault_notas WITH (security_barrier = true) AS
      SELECT v.id, v.ruta, v.carpeta, v.titulo, v.contenido,
             v.autor, v.wikilinks, v.tags, v.updated_at
      FROM public.vault_notas v
      WHERE v.tenant_id = %L::uuid
        AND v.borrada = false
  $q$, v_morla);

  -- Escritura: solo lo suyo. El CHECK OPTION impide que inserte o mueva
  -- una fila fuera de este filtro, ni aunque lo intente a propósito.
  EXECUTE format($q$
    CREATE OR REPLACE VIEW hermes.vault_mis_notas WITH (security_barrier = true) AS
      SELECT v.id, v.ruta, v.titulo, v.contenido,
             v.wikilinks, v.tags, v.autor, v.borrada, v.updated_at
      FROM public.vault_notas v
      WHERE v.tenant_id = %L::uuid
        AND v.autor = 'hermes'
    WITH CASCADED CHECK OPTION
  $q$, v_morla);
END $$;

-- ---------------------------------------------------------------------
-- 5. RPCs para Hermes (escribir y buscar)
-- ---------------------------------------------------------------------

-- Guarda/actualiza una nota de Hermes. Devuelve la ruta final.
-- SECURITY DEFINER a propósito: Hermes entra sin JWT, así que no puede
-- apoyarse en RLS. El tenant se fija aquí dentro y el autor está acotado
-- a los agentes; la frontera de seguridad es esta función, no el RLS.
CREATE OR REPLACE FUNCTION public.vault_guardar_nota(
  p_ruta      text,
  p_contenido text,
  p_titulo    text DEFAULT NULL,
  p_autor     text DEFAULT 'hermes'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_morla constant uuid := '00000000-0000-0000-0000-000000000001';
  v_ruta  text := regexp_replace(btrim(p_ruta), '^/+', '');
  v_links text[];
  v_tags  text[];
BEGIN
  IF p_autor NOT IN ('hermes', 'claude') THEN
    RAISE EXCEPTION 'vault_guardar_nota es para agentes (hermes/claude), no para "%"', p_autor;
  END IF;

  -- Comodidad: si no puso la carpeta, se la ponemos nosotros
  IF v_ruta NOT LIKE 'agentes/%' THEN
    v_ruta := 'agentes/' || p_autor || '/' || v_ruta;
  END IF;
  IF v_ruta !~ '\.md$' THEN
    v_ruta := v_ruta || '.md';
  END IF;

  -- Extraer [[wikilinks]] y #tags del contenido
  SELECT coalesce(array_agg(DISTINCT m[1]), '{}')
    INTO v_links
    FROM regexp_matches(coalesce(p_contenido, ''), '\[\[([^\]|]+)', 'g') AS m;

  SELECT coalesce(array_agg(DISTINCT m[1]), '{}')
    INTO v_tags
    FROM regexp_matches(coalesce(p_contenido, ''), '(?:^|\s)#([a-zA-Z0-9áéíóúñ_-]+)', 'g') AS m;

  INSERT INTO public.vault_notas (tenant_id, ruta, titulo, contenido, autor, wikilinks, tags, hash, borrada)
  VALUES (
    v_morla,
    v_ruta,
    coalesce(p_titulo, regexp_replace(split_part(v_ruta, '/', -1), '\.md$', '')),
    coalesce(p_contenido, ''),
    p_autor,
    v_links,
    v_tags,
    encode(digest(coalesce(p_contenido, ''), 'sha256'), 'hex'),
    false
  )
  ON CONFLICT (tenant_id, ruta) DO UPDATE
    SET contenido = EXCLUDED.contenido,
        titulo    = EXCLUDED.titulo,
        wikilinks = EXCLUDED.wikilinks,
        tags      = EXCLUDED.tags,
        hash      = EXCLUDED.hash,
        borrada   = false
    WHERE public.vault_notas.autor = p_autor;   -- nunca encima de otro autor

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La nota "%" pertenece a otro autor; crea la tuya y enlázala con [[wikilink]]', v_ruta;
  END IF;

  RETURN v_ruta;
END $$;

-- Búsqueda por concepto. Devuelve un extracto, no la nota entera.
CREATE OR REPLACE FUNCTION public.vault_buscar(
  p_texto text,
  p_limite integer DEFAULT 10
)
RETURNS TABLE (ruta text, titulo text, autor text, extracto text, relevancia real)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    v.ruta,
    v.titulo,
    v.autor,
    ts_headline('spanish', v.contenido, plainto_tsquery('spanish', p_texto),
                'MaxWords=40, MinWords=15, ShortWord=3, MaxFragments=2') AS extracto,
    ts_rank(v.busqueda, plainto_tsquery('spanish', p_texto)) AS relevancia
  FROM public.vault_notas v
  WHERE v.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    AND v.borrada = false
    AND v.busqueda @@ plainto_tsquery('spanish', p_texto)
  ORDER BY relevancia DESC, v.updated_at DESC
  LIMIT greatest(1, least(coalesce(p_limite, 10), 50));
$$;

-- Espejos en el esquema hermes (Hermes llama hermes.*)
-- SECURITY DEFINER en los dos: el RPC público de 4 argumentos está
-- revocado (deja elegir autor), así que un wrapper INVOKER no podría
-- llamarlo. Corriendo como dueño, el wrapper es la única puerta y fija
-- 'hermes' sin que el llamador pueda cambiarlo.
CREATE OR REPLACE FUNCTION hermes.vault_guardar_nota(
  p_ruta text, p_contenido text, p_titulo text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.vault_guardar_nota(p_ruta, p_contenido, p_titulo, 'hermes'); $$;

CREATE OR REPLACE FUNCTION hermes.vault_buscar(p_texto text, p_limite integer DEFAULT 10)
RETURNS TABLE (ruta text, titulo text, autor text, extracto text, relevancia real)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT * FROM public.vault_buscar(p_texto, p_limite); $$;

-- ---------------------------------------------------------------------
-- 6. Permisos del rol hermes_readonly
--    Lee todo el vault, escribe SOLO sus notas. Nada de permisos
--    amplios sobre public.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hermes_readonly') THEN
    GRANT USAGE ON SCHEMA hermes TO hermes_readonly;

    GRANT SELECT ON hermes.vault_notas    TO hermes_readonly;
    GRANT SELECT, INSERT, UPDATE ON hermes.vault_mis_notas TO hermes_readonly;

    -- Sobre la tabla base NO se da nada: las vistas (que corren como su
    -- dueño) y los RPCs SECURITY DEFINER son el único camino. Así Hermes
    -- nunca puede leer notas de otra empresa ni saltarse el filtro.
    REVOKE ALL ON public.vault_notas FROM hermes_readonly;

    GRANT EXECUTE ON FUNCTION hermes.vault_guardar_nota(text, text, text) TO hermes_readonly;
    GRANT EXECUTE ON FUNCTION hermes.vault_buscar(text, integer)          TO hermes_readonly;
    GRANT EXECUTE ON FUNCTION public.vault_buscar(text, integer)          TO hermes_readonly;

    -- El RPC público lleva p_autor: si Hermes pudiera llamarlo, pasaría
    -- p_autor='claude' y escribiría en la carpeta ajena. Solo el wrapper
    -- hermes.* (que fija 'hermes') queda a su alcance.
    REVOKE ALL ON FUNCTION public.vault_guardar_nota(text, text, text, text) FROM hermes_readonly, PUBLIC;

    RAISE NOTICE 'Permisos de vault otorgados a hermes_readonly';
  ELSE
    RAISE NOTICE 'No existe el rol hermes_readonly; saltando GRANTs';
  END IF;
END $$;

-- Realtime: para que las notas de Hermes bajen solas a Obsidian.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'vault_notas'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vault_notas;
    RAISE NOTICE 'vault_notas agregada a supabase_realtime';
  END IF;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('vault_agentes.sql');
  END IF;
END $$;

-- Verificación
SELECT 'tabla'   AS objeto, to_regclass('public.vault_notas')::text        AS existe
UNION ALL SELECT 'vista_hermes', to_regclass('hermes.vault_notas')::text
UNION ALL SELECT 'vista_escritura', to_regclass('hermes.vault_mis_notas')::text
UNION ALL SELECT 'rpc_guardar', to_regprocedure('hermes.vault_guardar_nota(text,text,text)')::text
UNION ALL SELECT 'rpc_buscar',  to_regprocedure('hermes.vault_buscar(text,integer)')::text;
