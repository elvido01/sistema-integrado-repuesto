-- =====================================================================
-- VENTANAS Y ALUMINIO · PARTE 1: tipo de empresa, sistemas, proyectos y
-- medidas (09/11/2026)
-- ---------------------------------------------------------------------
-- Pedido del dueño para D MARIO CASTRO TERMINACIONES (como se hizo con el
-- colegio): un tipo de empresa 'aluminio' con su grupo en el menú.
--
-- · tipo_negocio 'aluminio': se comporta como 'repuestos' en todo lo general
--   (ventas, compras, inventario, caja, e-CF) y suma el grupo "Ventanas".
-- · vent_sistemas: los sistemas que trabaja el taller (Tradicional, P-65,
--   P-92, AA, C-70, M-100…). Editables por empresa; se cargan solos.
-- · vent_proyectos: un trabajo de un cliente, con su estado (tablero):
--   sin medir → medido → cotizado → aprobado → en fabricación → instalado
--   → cobrado (o cancelado), y su cita (calendario). Número por empresa.
-- · vent_medidas: cada ventana del proyecto: sistema, hojas (2/3/4), ancho y
--   alto en PULGADAS (decimal: 40 1/4 = 40.25), cantidad, color, ubicación.
-- El desglose (cortes), las barras y el presupuesto vienen en las partes
-- siguientes (necesitan las hojas de desglose de Mario).
-- Idempotente.
-- =====================================================================

-- ── Tipo de empresa ────────────────────────────────────────────────────
ALTER TABLE public.config_empresa DROP CONSTRAINT IF EXISTS config_empresa_tipo_negocio_check;
ALTER TABLE public.config_empresa ADD CONSTRAINT config_empresa_tipo_negocio_check
  CHECK (tipo_negocio = ANY (ARRAY['repuestos', 'dealer', 'financiera', 'servicios', 'inmobiliaria', 'educativo', 'aluminio']));

-- ── Sistemas ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vent_sistemas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  codigo     text NOT NULL,
  nombre     text NOT NULL,
  tipo       text NOT NULL DEFAULT 'ventana' CHECK (tipo IN ('ventana', 'puerta', 'otro')),
  hojas      integer[] NOT NULL DEFAULT '{2,3,4}',      -- cuántas hojas admite
  activo     boolean NOT NULL DEFAULT true,
  orden      integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, codigo)
);
ALTER TABLE public.vent_sistemas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vent_sistemas_tenant ON public.vent_sistemas;
CREATE POLICY vent_sistemas_tenant ON public.vent_sistemas FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant()) WITH CHECK (tenant_id = public.get_user_tenant());

-- ── Proyectos ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vent_proyectos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  numero         integer NOT NULL,
  nombre         text NOT NULL,
  cliente_id     uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nombre text,                 -- si no se escoge un cliente del catálogo
  direccion      text,
  telefono       text,
  estado         text NOT NULL DEFAULT 'sin_medir'
                 CHECK (estado IN ('sin_medir', 'medido', 'cotizado', 'aprobado', 'fabricacion', 'instalado', 'cobrado', 'cancelado')),
  fecha_cita     date,                 -- calendario (medir / instalar)
  hora_cita      time,
  notas          text,
  cotizacion_id  uuid,                 -- partes siguientes
  factura_id     uuid,
  created_by     uuid DEFAULT auth.uid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, numero)
);
CREATE INDEX IF NOT EXISTS vent_proyectos_tenant_estado ON public.vent_proyectos (tenant_id, estado);
ALTER TABLE public.vent_proyectos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vent_proyectos_tenant ON public.vent_proyectos;
CREATE POLICY vent_proyectos_tenant ON public.vent_proyectos FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant()) WITH CHECK (tenant_id = public.get_user_tenant());

-- Número correlativo por empresa y updated_at.
CREATE OR REPLACE FUNCTION private.vent_proyecto_antes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' AND NEW.numero IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('vent_proyecto:' || NEW.tenant_id::text));
    SELECT COALESCE(max(numero), 0) + 1 INTO NEW.numero FROM public.vent_proyectos WHERE tenant_id = NEW.tenant_id;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Un proyecto no cambia de empresa';
  END IF;
  IF NEW.cliente_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = NEW.cliente_id AND c.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'El cliente no es de esta empresa';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.vent_proyecto_antes() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS vent_proyecto_antes ON public.vent_proyectos;
CREATE TRIGGER vent_proyecto_antes BEFORE INSERT OR UPDATE ON public.vent_proyectos
  FOR EACH ROW EXECUTE FUNCTION private.vent_proyecto_antes();

-- ── Medidas ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vent_medidas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  proyecto_id uuid NOT NULL REFERENCES public.vent_proyectos(id) ON DELETE CASCADE,
  sistema_id  uuid NOT NULL REFERENCES public.vent_sistemas(id),
  hojas       integer NOT NULL DEFAULT 2 CHECK (hojas BETWEEN 1 AND 8),
  ancho       numeric(9,4) NOT NULL CHECK (ancho > 0),     -- pulgadas
  alto        numeric(9,4) NOT NULL CHECK (alto > 0),      -- pulgadas
  cantidad    integer NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  color       text,
  ubicacion   text,                                       -- "sala", "cocina"…
  notas       text,
  orden       integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vent_medidas_proyecto ON public.vent_medidas (proyecto_id, orden);
ALTER TABLE public.vent_medidas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vent_medidas_tenant ON public.vent_medidas;
CREATE POLICY vent_medidas_tenant ON public.vent_medidas FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant()) WITH CHECK (tenant_id = public.get_user_tenant());

-- El proyecto y el sistema tienen que ser de la misma empresa; al medir la
-- primera ventana, el proyecto pasa de "sin medir" a "medido".
CREATE OR REPLACE FUNCTION private.vent_medida_antes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.vent_proyectos p WHERE p.id = NEW.proyecto_id AND p.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'El proyecto no es de esta empresa';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vent_sistemas s WHERE s.id = NEW.sistema_id AND s.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'El sistema no es de esta empresa';
  END IF;
  IF TG_OP = 'INSERT' THEN
    UPDATE public.vent_proyectos SET estado = 'medido' WHERE id = NEW.proyecto_id AND estado = 'sin_medir';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.vent_medida_antes() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS vent_medida_antes ON public.vent_medidas;
CREATE TRIGGER vent_medida_antes BEFORE INSERT OR UPDATE ON public.vent_medidas
  FOR EACH ROW EXECUTE FUNCTION private.vent_medida_antes();

-- ── Preparar una empresa de aluminio (sistemas de fábrica) ─────────────
CREATE OR REPLACE FUNCTION private.vent_preparar(p_tenant uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  INSERT INTO public.vent_sistemas (tenant_id, codigo, nombre, tipo, hojas, orden)
  SELECT p_tenant, x.codigo, x.nombre, x.tipo, x.hojas::integer[], x.orden
    FROM (VALUES
      ('TRADICIONAL', 'Ventana Tradicional', 'ventana', '{2,3,4}', 1),
      ('P-65',        'Ventana P-65',        'ventana', '{2,3,4}', 2),
      ('P-92',        'Ventana P-92',        'ventana', '{2,3,4}', 3),
      ('AA',          'Ventana AA',          'ventana', '{2,3,4}', 4),
      ('C-70',        'Ventana C-70',        'ventana', '{2,3,4}', 5),
      ('M-100-CT',    'Ventana M-100 con tapa', 'ventana', '{2,3,4}', 6),
      ('M-100-ST',    'Ventana M-100 sin tapa', 'ventana', '{2,3,4}', 7),
      ('ABISAGRADA',  'Ventana Abisagrada',  'ventana', '{1,2}',   8),
      ('V-P-40',      'Ventana P-40',        'ventana', '{2,3,4}', 9),
      ('PUERTA-P-40', 'Puerta P-40',         'puerta',  '{1,2}',   10),
      ('PUERTA-COM',  'Puerta Comercial',    'puerta',  '{1,2}',   11)
    ) AS x(codigo, nombre, tipo, hojas, orden)
  ON CONFLICT (tenant_id, codigo) DO NOTHING;
END;
$function$;
REVOKE ALL ON FUNCTION private.vent_preparar(uuid) FROM PUBLIC, anon, authenticated;

-- Para la pantalla: si una empresa de aluminio todavía no tiene sistemas.
CREATE OR REPLACE FUNCTION public.vent_preparar_empresa()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_t uuid := public.get_user_tenant();
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.config_empresa WHERE tenant_id = v_t AND tipo_negocio = 'aluminio') THEN
    RAISE EXCEPTION 'Esta empresa no es de ventanas y aluminio';
  END IF;
  PERFORM private.vent_preparar(v_t);
END;
$function$;
REVOKE ALL ON FUNCTION public.vent_preparar_empresa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vent_preparar_empresa() TO authenticated;

-- ── Registro de empresas nuevas: acepta 'aluminio' (misma firma; mismo
--    cuerpo que producción + 'aluminio' + preparar sus sistemas) ─────────
CREATE OR REPLACE FUNCTION public.registrar_nueva_empresa(p_nombre text, p_rnc text DEFAULT NULL::text, p_direccion text DEFAULT NULL::text, p_telefono text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_tipo_negocio text DEFAULT 'repuestos'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_plan_id uuid;
  v_nombre text := NULLIF(btrim(p_nombre), '');
  v_tipo text := COALESCE(NULLIF(lower(btrim(p_tipo_negocio)), ''), 'repuestos');
BEGIN
  IF v_nombre IS NULL THEN
    RAISE EXCEPTION 'El nombre de la empresa es requerido';
  END IF;

  IF length(v_nombre) > 160 THEN
    RAISE EXCEPTION 'El nombre de la empresa es demasiado largo';
  END IF;

  IF v_tipo NOT IN ('repuestos', 'dealer', 'financiera', 'servicios', 'inmobiliaria', 'educativo', 'aluminio') THEN
    RAISE EXCEPTION 'Tipo de negocio no válido: %', p_tipo_negocio;
  END IF;

  INSERT INTO public.tenants (
    nombre, rnc, direccion, telefono, email, activo, plan
  )
  VALUES (
    v_nombre,
    NULLIF(btrim(p_rnc), ''),
    NULLIF(btrim(p_direccion), ''),
    NULLIF(btrim(p_telefono), ''),
    NULLIF(lower(btrim(p_email)), ''),
    false,
    'TRIAL'
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.config_empresa (
    tenant_id, nombre, rnc, direccion, telefono, email,
    tipo_negocio, feat_financiera, mora_pct_default
  )
  VALUES (
    v_tenant_id,
    v_nombre,
    NULLIF(btrim(p_rnc), ''),
    NULLIF(btrim(p_direccion), ''),
    NULLIF(btrim(p_telefono), ''),
    NULLIF(lower(btrim(p_email)), ''),
    v_tipo,
    v_tipo IN ('financiera', 'inmobiliaria'),
    CASE WHEN v_tipo = 'financiera' THEN 4 ELSE 0 END
  )
  ON CONFLICT (tenant_id) DO NOTHING;

  INSERT INTO public.almacenes (codigo, nombre, activo, tenant_id)
  VALUES ('PRINCIPAL', 'PRINCIPAL', true, v_tenant_id);

  SELECT id
    INTO v_plan_id
    FROM public.planes
   WHERE nombre = 'TRIAL'
   LIMIT 1;

  IF v_plan_id IS NOT NULL THEN
    INSERT INTO public.suscripciones (
      tenant_id,
      plan_id,
      estado,
      fecha_inicio,
      fecha_fin,
      monto_pagado,
      auto_renovar
    )
    VALUES (
      v_tenant_id,
      v_plan_id,
      'trial',
      now(),
      now() + interval '15 days',
      0,
      false
    );

    UPDATE public.tenants
       SET trial_end_date = now() + interval '15 days'
     WHERE id = v_tenant_id;
  END IF;

  INSERT INTO private.tenant_onboarding_claims (tenant_id)
  VALUES (v_tenant_id);

  IF v_tipo = 'educativo' THEN PERFORM private.edu_preparar_colegio(v_tenant_id); END IF;
  IF v_tipo = 'aluminio' THEN PERFORM private.vent_preparar(v_tenant_id); END IF;

  RETURN v_tenant_id;
END;
$function$;

-- ── D MARIO CASTRO TERMINACIONES pasa a 'aluminio' ─────────────────────
UPDATE public.config_empresa SET tipo_negocio = 'aluminio' WHERE tenant_id = '58c09df3-48c2-4a3e-bb3e-96997ccbbc8a';
SELECT private.vent_preparar('58c09df3-48c2-4a3e-bb3e-96997ccbbc8a');

SELECT public.registrar_migracion('ventanas_base.sql');
