-- =====================================================================
-- CENTROS EDUCATIVOS · PARTE 1: LA BASE (06/11/2026)
-- ---------------------------------------------------------------------
-- Nuevo tipo de empresa 'educativo' (colegios). Primer cliente: Colegio
-- con Inglés Nuevo Centenario (Higüey). Decisiones del dueño y del colegio
-- en la memoria project_centros_educativos.
--
--   · Tipo de empresa 'educativo' (registro + Configuración).
--   · Planes EDUCA INICIAL / EDUCA PRO / EDUCA TOTAL, con límite de
--     ESTUDIANTES (planes.limite_estudiantes) y segmento 'educativo' para
--     que un colegio vea solo sus planes y los demás no los vean.
--   · Año escolar (mes de inicio: agosto o septiembre; 10 mensualidades).
--   · Cursos y tandas (Párvulo → 6to de secundaria; secundaria solo
--     matutina, editable por el colegio).
--   · Lista de TARIFAS (mensualidad por estudiante, congelada por
--     antigüedad): se desactivan, nunca se borran. Incremento automático
--     para la tarifa de nuevo ingreso de cada año.
--   · Conceptos de cobro de fábrica (Inscripción, Reservación de cupo,
--     Utilería, Sistema Bilingüe en US$, Sala de Tareas, Recargo) que el
--     colegio cambia o amplía.
--   · Reglas del colegio: día límite de pago (5), recargo (RD$200) desde el
--     día 1 del mes siguiente, 5% por pagar el año completo (solo
--     mensualidades), beca por defecto 50% (solo mensualidades).
--
-- Los estudiantes, la caja y los reportes van en las partes 2-4.
-- Idempotente.
-- =====================================================================

-- ── 0. El tipo de empresa ───────────────────────────────────────────────
ALTER TABLE public.config_empresa DROP CONSTRAINT IF EXISTS config_empresa_tipo_negocio_check;
ALTER TABLE public.config_empresa ADD CONSTRAINT config_empresa_tipo_negocio_check
  CHECK (tipo_negocio = ANY (ARRAY['repuestos','dealer','financiera','servicios','inmobiliaria','educativo']::text[]));

-- El registro acepta 'educativo'. Se parte de la función EN PRODUCCIÓN.
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.registrar_nueva_empresa(text,text,text,text,text,text)'::regprocedure);
  IF position('educativo' IN d) > 0 THEN RETURN; END IF;
  n := replace(d, $x$'servicios', 'inmobiliaria') THEN$x$, $x$'servicios', 'inmobiliaria', 'educativo') THEN$x$);
  -- Al crear un colegio se le preparan cursos, conceptos y reglas.
  n := replace(n, $x$  RETURN v_tenant_id;$x$,
                  $x$  IF v_tipo = 'educativo' THEN PERFORM private.edu_preparar_colegio(v_tenant_id); END IF;

  RETURN v_tenant_id;$x$);
  IF position($x$'inmobiliaria', 'educativo'$x$ IN n) = 0 OR position('private.edu_preparar_colegio' IN n) = 0 THEN
    RAISE EXCEPTION 'registrar_nueva_empresa cambió: no se pudo poner el tipo educativo';
  END IF;
  -- (la función que llama se crea más abajo; plpgsql la resuelve al ejecutar)
  EXECUTE n;
END $$;

-- ── 1. Planes Educa ─────────────────────────────────────────────────────
ALTER TABLE public.planes ADD COLUMN IF NOT EXISTS limite_estudiantes integer;          -- NULL = sin límite
ALTER TABLE public.planes ADD COLUMN IF NOT EXISTS segmento text NOT NULL DEFAULT 'general';
ALTER TABLE public.planes DROP CONSTRAINT IF EXISTS planes_segmento_check;
ALTER TABLE public.planes ADD CONSTRAINT planes_segmento_check CHECK (segmento IN ('general', 'educativo'));

INSERT INTO public.planes (nombre, descripcion, precio, duracion_dias, limite_usuarios, limite_productos,
                           limite_facturas, limite_almacenes, limite_estudiantes, segmento, activo)
SELECT v.nombre, v.descripcion, v.precio, 30, v.usuarios, 100, NULL, 1, v.estudiantes, 'educativo', true
  FROM (VALUES
    ('EDUCA INICIAL', 'Colegios de hasta 300 estudiantes', 2000.00, 3,     300),
    ('EDUCA PRO',     'Colegios de hasta 800 estudiantes', 3950.00, 6,     800),
    ('EDUCA TOTAL',   'Colegios sin límite, con recordatorios por WhatsApp', 7950.00, 99999, NULL::integer)
  ) AS v(nombre, descripcion, precio, usuarios, estudiantes)
 WHERE NOT EXISTS (SELECT 1 FROM public.planes p WHERE p.nombre = v.nombre);

-- Precio especial por empresa (ej. el precio fundador del Centenario:
-- RD$2,000 con lo de EDUCA PRO hasta 700 estudiantes, para siempre
-- mientras pague sin atrasos). NULL = lo del plan.
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS limite_estudiantes_especial integer;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS precio_especial numeric;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS precio_especial_nota text;

-- ── 2. Reglas del colegio ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.edu_config (
  tenant_id             uuid PRIMARY KEY DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  incremento_tarifa     numeric NOT NULL DEFAULT 150 CHECK (incremento_tarifa >= 0),
  dia_limite_pago       integer NOT NULL DEFAULT 5  CHECK (dia_limite_pago BETWEEN 1 AND 28),
  recargo_monto         numeric NOT NULL DEFAULT 200 CHECK (recargo_monto >= 0),
  descuento_anual_pct   numeric NOT NULL DEFAULT 5  CHECK (descuento_anual_pct BETWEEN 0 AND 100),
  beca_pct_defecto      numeric NOT NULL DEFAULT 50 CHECK (beca_pct_defecto BETWEEN 0 AND 100),
  permite_medio_mes     boolean NOT NULL DEFAULT true,   -- solo mes completo o medio mes
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Año escolar ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.edu_anios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre      text NOT NULL,                                -- '2026-2027'
  anio_inicio integer NOT NULL,                             -- 2026
  mes_inicio  integer NOT NULL DEFAULT 9 CHECK (mes_inicio BETWEEN 1 AND 12),   -- 8 agosto / 9 septiembre
  meses       integer NOT NULL DEFAULT 10 CHECK (meses BETWEEN 1 AND 12),
  actual      boolean NOT NULL DEFAULT false,
  cerrado     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, anio_inicio)
);
-- Un solo año "actual" por colegio.
CREATE UNIQUE INDEX IF NOT EXISTS edu_anios_un_actual ON public.edu_anios (tenant_id) WHERE actual;

-- ── 4. Cursos y tandas ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.edu_cursos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  nivel       text NOT NULL CHECK (nivel IN ('inicial', 'primaria', 'secundaria')),
  orden       integer NOT NULL DEFAULT 0,                    -- para promover al siguiente curso
  tandas      text[] NOT NULL DEFAULT ARRAY['matutina']::text[]
              CHECK (tandas <@ ARRAY['matutina','vespertina','extendida','nocturna']::text[] AND cardinality(tandas) > 0),
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nombre)
);

-- ── 5. Tarifas (mensualidad por estudiante) ─────────────────────────────
-- Cada estudiante guarda una COPIA del monto al inscribirse (parte 2): si
-- la lista cambia después, los que ya están conservan la suya.
CREATE TABLE IF NOT EXISTS public.edu_tarifas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  monto       numeric NOT NULL CHECK (monto > 0),
  anio_inicio integer,                                       -- año escolar en que se creó (para el reporte)
  nota        text,
  activa      boolean NOT NULL DEFAULT true,                 -- inactiva = no se ofrece a nuevos
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, monto)
);

-- ── 6. Conceptos de cobro ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.edu_conceptos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo        text NOT NULL CHECK (tipo IN ('inscripcion','reservacion','utileria','bilingue','mensualidad','sala_tareas','recargo','otro')),
  nombre      text NOT NULL,
  monto       numeric NOT NULL DEFAULT 0 CHECK (monto >= 0),  -- mensualidad: 0 (sale de la tarifa del estudiante)
  moneda      text NOT NULL DEFAULT 'DOP' CHECK (moneda IN ('DOP', 'USD')),
  frecuencia  text NOT NULL CHECK (frecuencia IN ('anual', 'mensual', 'eventual')),
  aplica_a    text NOT NULL DEFAULT 'todos' CHECK (aplica_a IN ('nuevo', 'continuante', 'todos')),
  obligatorio boolean NOT NULL DEFAULT true,
  becable     boolean NOT NULL DEFAULT false,               -- la beca solo toca las mensualidades
  es_tercero  boolean NOT NULL DEFAULT false,               -- cobro por cuenta ajena (Sistema Bilingüe), no es ingreso del colegio
  orden       integer NOT NULL DEFAULT 0,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nombre)
);

-- ── 7. Seguridad: cada colegio ve solo lo suyo (empresa activa) ─────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['edu_config','edu_anios','edu_cursos','edu_tarifas','edu_conceptos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                      USING (tenant_id = public.get_user_tenant()) WITH CHECK (tenant_id = public.get_user_tenant())',
                   t || '_tenant', t);
    -- Sin DELETE: tarifas y conceptos se desactivan, no se borran.
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- ── 8. Preparar un colegio (al registrarse o desde Configuración) ───────
-- Solo crea lo que falta: nunca pisa lo que el colegio ya cambió.
CREATE OR REPLACE FUNCTION private.edu_preparar_colegio(p_tenant uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_tenant uuid := p_tenant;
  v_anio   integer := CASE WHEN extract(month FROM now()) >= 7 THEN extract(year FROM now())::int
                           ELSE extract(year FROM now())::int - 1 END;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin empresa'; END IF;

  INSERT INTO public.edu_config (tenant_id) VALUES (v_tenant) ON CONFLICT (tenant_id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.edu_anios WHERE tenant_id = v_tenant) THEN
    INSERT INTO public.edu_anios (tenant_id, nombre, anio_inicio, mes_inicio, meses, actual)
    VALUES (v_tenant, v_anio || '-' || (v_anio + 1), v_anio, 9, 10, true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.edu_cursos WHERE tenant_id = v_tenant) THEN
    INSERT INTO public.edu_cursos (tenant_id, nombre, nivel, orden, tandas)
    SELECT v_tenant, c.nombre, c.nivel, c.orden, c.tandas
      FROM (VALUES
        ('Párvulo',          'inicial',    1, ARRAY['matutina','vespertina']),
        ('Pre-Kínder',       'inicial',    2, ARRAY['matutina','vespertina']),
        ('Kínder',           'inicial',    3, ARRAY['matutina','vespertina']),
        ('Preprimario',      'inicial',    4, ARRAY['matutina','vespertina']),
        ('1ro de Primaria',  'primaria',   5, ARRAY['matutina','vespertina']),
        ('2do de Primaria',  'primaria',   6, ARRAY['matutina','vespertina']),
        ('3ro de Primaria',  'primaria',   7, ARRAY['matutina','vespertina']),
        ('4to de Primaria',  'primaria',   8, ARRAY['matutina','vespertina']),
        ('5to de Primaria',  'primaria',   9, ARRAY['matutina','vespertina']),
        ('6to de Primaria',  'primaria',  10, ARRAY['matutina','vespertina']),
        ('1ro de Secundaria','secundaria',11, ARRAY['matutina']),
        ('2do de Secundaria','secundaria',12, ARRAY['matutina']),
        ('3ro de Secundaria','secundaria',13, ARRAY['matutina']),
        ('4to de Secundaria','secundaria',14, ARRAY['matutina']),
        ('5to de Secundaria','secundaria',15, ARRAY['matutina']),
        ('6to de Secundaria','secundaria',16, ARRAY['matutina'])
      ) AS c(nombre, nivel, orden, tandas);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.edu_conceptos WHERE tenant_id = v_tenant) THEN
    INSERT INTO public.edu_conceptos (tenant_id, tipo, nombre, monto, moneda, frecuencia, aplica_a, obligatorio, becable, es_tercero, orden)
    VALUES
      (v_tenant, 'inscripcion', 'Inscripción',          3500, 'DOP', 'anual',    'nuevo',       true,  false, false, 1),
      (v_tenant, 'reservacion', 'Reservación de cupo',  3500, 'DOP', 'anual',    'continuante', true,  false, false, 2),
      (v_tenant, 'utileria',    'Utilería',             3500, 'DOP', 'anual',    'todos',       true,  false, false, 3),
      (v_tenant, 'bilingue',    'Sistema Bilingüe',      110, 'USD', 'anual',    'todos',       true,  false, true,  4),
      (v_tenant, 'mensualidad', 'Mensualidad',             0, 'DOP', 'mensual',  'todos',       true,  true,  false, 5),
      (v_tenant, 'sala_tareas', 'Sala de Tareas',       2000, 'DOP', 'mensual',  'todos',       false, false, false, 6),
      (v_tenant, 'recargo',     'Recargo por atraso',    200, 'DOP', 'eventual', 'todos',       false, false, false, 7);
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION private.edu_preparar_colegio(uuid) FROM PUBLIC, anon, authenticated;

-- Desde Configuración ("Preparar mi colegio"): solo la empresa activa.
CREATE OR REPLACE FUNCTION public.edu_preparar_colegio()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_tenant uuid := public.get_user_tenant();
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.config_empresa WHERE tenant_id = v_tenant AND tipo_negocio = 'educativo') THEN
    RAISE EXCEPTION 'Esta empresa no es un centro educativo';
  END IF;
  PERFORM private.edu_preparar_colegio(v_tenant);
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_preparar_colegio() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_preparar_colegio() TO authenticated;

SELECT public.registrar_migracion('centros_educativos_base.sql');
