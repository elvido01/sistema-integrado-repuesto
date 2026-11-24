-- ============================================================
-- FACTURAS DE MOTOFLOW A SUS CLIENTES (24/11/2026)
-- ============================================================
-- El dueño factura las membresías de MotoFlow a su nombre (persona física).
-- A familiares y amigos les hace precios especiales, así que el monto se
-- ajusta en cada factura y queda el precio de lista, el descuento y el motivo.
--
--  · motoflow_emisor: UNA fila con los datos del emisor (nombre, cédula…).
--    Los escribe el dueño en el Super Admin; no viven en el código.
--  · motoflow_facturas: numeración propia MF-000001; NCF opcional a mano.
--  · Solo super admin (profiles.is_superadmin). Las tablas no tienen
--    políticas: todo pasa por las funciones de abajo.
--  · Emitir puede registrar el pago en el mismo paso (admin_registrar_pago:
--    extiende la membresía) y guardar el monto como precio especial de la
--    empresa (tenants.precio_especial, mensual) para la próxima vez.
-- NOTA: Elite Solutions NO es MotoFlow; el emisor es el dueño.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.motoflow_emisor (
  id          integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nombre      text NOT NULL DEFAULT '',
  documento   text NOT NULL DEFAULT '',          -- cédula o RNC
  telefono    text,
  email       text,
  direccion   text,
  itbis_por_defecto boolean NOT NULL DEFAULT false,
  nota_pie    text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.motoflow_emisor ENABLE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.motoflow_factura_seq;

CREATE TABLE IF NOT EXISTS public.motoflow_facturas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero           integer NOT NULL UNIQUE DEFAULT nextval('public.motoflow_factura_seq'),
  fecha            timestamptz NOT NULL DEFAULT now(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id),
  cliente_nombre   text NOT NULL,
  cliente_documento text,
  cliente_direccion text,
  plan_nombre      text NOT NULL,
  meses            integer NOT NULL CHECK (meses BETWEEN 1 AND 36),
  precio_lista     numeric(12,2) NOT NULL,      -- precio del plan × meses
  descuento        numeric(12,2) NOT NULL DEFAULT 0,
  motivo_descuento text,
  subtotal         numeric(12,2) NOT NULL,
  itbis            numeric(12,2) NOT NULL DEFAULT 0,
  total            numeric(12,2) NOT NULL CHECK (total > 0),
  ncf              text,
  metodo_pago      text,
  referencia       text,
  periodo_hasta    timestamptz,
  pago_id          uuid REFERENCES public.pagos_suscripcion(id),
  emisor           jsonb NOT NULL,              -- copia del emisor al emitir
  estado           text NOT NULL DEFAULT 'emitida' CHECK (estado IN ('emitida','anulada')),
  motivo_anulacion text,
  emitida_por      uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.motoflow_facturas ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS motoflow_facturas_ncf_uq
  ON public.motoflow_facturas (upper(ncf)) WHERE ncf IS NOT NULL AND estado = 'emitida';
CREATE INDEX IF NOT EXISTS motoflow_facturas_tenant_idx ON public.motoflow_facturas (tenant_id, fecha DESC);

CREATE OR REPLACE FUNCTION private.mf_exigir_superadmin() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_superadmin = true) THEN
    RAISE EXCEPTION 'Solo el super admin puede facturar';
  END IF;
END $$;

-- ── Emisor ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mf_emisor() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM private.mf_exigir_superadmin();
  RETURN COALESCE((SELECT to_jsonb(e) FROM public.motoflow_emisor e WHERE id = 1),
                  jsonb_build_object('nombre','','documento','','itbis_por_defecto',false));
END $$;

CREATE OR REPLACE FUNCTION public.mf_emisor_guardar(
  p_nombre text, p_documento text, p_telefono text DEFAULT NULL, p_email text DEFAULT NULL,
  p_direccion text DEFAULT NULL, p_itbis_por_defecto boolean DEFAULT false, p_nota_pie text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r jsonb;
BEGIN
  PERFORM private.mf_exigir_superadmin();
  IF COALESCE(btrim(p_nombre),'') = '' THEN RAISE EXCEPTION 'Falta el nombre del emisor'; END IF;
  IF COALESCE(btrim(p_documento),'') = '' THEN RAISE EXCEPTION 'Falta la cédula o RNC del emisor'; END IF;
  INSERT INTO public.motoflow_emisor AS e (id, nombre, documento, telefono, email, direccion, itbis_por_defecto, nota_pie, updated_at)
  VALUES (1, btrim(p_nombre), regexp_replace(p_documento, '\D', '', 'g'), NULLIF(btrim(p_telefono),''),
          NULLIF(btrim(p_email),''), NULLIF(btrim(p_direccion),''), COALESCE(p_itbis_por_defecto,false),
          NULLIF(btrim(p_nota_pie),''), now())
  ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, documento = EXCLUDED.documento,
    telefono = EXCLUDED.telefono, email = EXCLUDED.email, direccion = EXCLUDED.direccion,
    itbis_por_defecto = EXCLUDED.itbis_por_defecto, nota_pie = EXCLUDED.nota_pie, updated_at = now()
  RETURNING to_jsonb(e) INTO r;
  RETURN r;
END $$;

-- ── Preparar: datos del cliente y precio sugerido ──────────
CREATE OR REPLACE FUNCTION public.mf_factura_preparar(p_tenant_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _t public.tenants%ROWTYPE;
  _ce record;
  _doc text;
  _registro text;
BEGIN
  PERFORM private.mf_exigir_superadmin();
  SELECT * INTO _t FROM public.tenants WHERE id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa no encontrada'; END IF;

  SELECT c.razon_social, c.nombre, c.rnc, c.direccion INTO _ce
    FROM public.config_empresa c WHERE c.tenant_id = p_tenant_id
   ORDER BY c.updated_at DESC NULLS LAST LIMIT 1;
  _doc := NULLIF(regexp_replace(COALESCE(_ce.rnc, ''), '\D', '', 'g'), '');
  IF _doc IS NOT NULL THEN
    SELECT d.razon_social INTO _registro FROM public.dgii_contribuyentes d WHERE d.rnc = _doc;
  END IF;

  RETURN jsonb_build_object(
    'cliente_nombre', COALESCE(NULLIF(btrim(_registro),''), NULLIF(btrim(_ce.razon_social),''),
                               NULLIF(btrim(_ce.nombre),''), _t.nombre),
    'cliente_documento', _doc,
    'cliente_direccion', NULLIF(btrim(_ce.direccion), ''),
    'plan_actual', upper(COALESCE(_t.plan, '')),
    'precio_especial', NULLIF(_t.precio_especial, 0),
    'precio_especial_nota', _t.precio_especial_nota,
    'emisor', public.mf_emisor(),
    'planes', (SELECT jsonb_agg(jsonb_build_object('nombre', p.nombre, 'precio', p.precio) ORDER BY p.precio)
                 FROM public.planes p WHERE p.activo AND upper(p.nombre) NOT IN ('TRIAL','FREE')));
END $$;

-- ── Emitir ─────────────────────────────────────────────────
-- p_total = lo que paga el cliente (con ITBIS si p_itbis). El precio de
-- lista sale del plan; la diferencia es el descuento y pide motivo.
CREATE OR REPLACE FUNCTION public.mf_factura_emitir(
  p_tenant_id uuid,
  p_plan_nombre text,
  p_meses integer,
  p_total numeric,
  p_motivo_descuento text DEFAULT NULL,
  p_ncf text DEFAULT NULL,
  p_itbis boolean DEFAULT false,
  p_registrar_pago boolean DEFAULT true,
  p_metodo text DEFAULT 'efectivo',
  p_referencia text DEFAULT NULL,
  p_guardar_precio_especial boolean DEFAULT false,
  p_cliente_nombre text DEFAULT NULL,
  p_cliente_documento text DEFAULT NULL,
  p_cliente_direccion text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _plan public.planes%ROWTYPE;
  _prep jsonb;
  _emisor jsonb;
  _lista numeric(12,2);
  _total numeric(12,2) := round(COALESCE(p_total, 0), 2);
  _sub numeric(12,2);
  _itbis numeric(12,2) := 0;
  _desc numeric(12,2);
  _pago jsonb;
  _ncf text := NULLIF(upper(regexp_replace(COALESCE(p_ncf,''), '\s', '', 'g')), '');
  _id uuid;
BEGIN
  PERFORM private.mf_exigir_superadmin();
  IF COALESCE(p_meses, 0) < 1 OR p_meses > 36 THEN RAISE EXCEPTION 'Meses debe ser de 1 a 36'; END IF;
  IF _total <= 0 THEN RAISE EXCEPTION 'El total debe ser mayor que cero'; END IF;

  SELECT * INTO _plan FROM public.planes WHERE upper(nombre) = upper(btrim(p_plan_nombre)) AND activo;
  IF NOT FOUND OR upper(_plan.nombre) IN ('TRIAL','FREE') THEN
    RAISE EXCEPTION 'Plan no válido para facturar: %', p_plan_nombre;
  END IF;

  _emisor := public.mf_emisor();
  IF COALESCE(_emisor->>'nombre','') = '' OR COALESCE(_emisor->>'documento','') = '' THEN
    RAISE EXCEPTION 'Primero guarda tus datos de emisor (nombre y cédula)';
  END IF;
  IF _ncf IS NOT NULL AND EXISTS (SELECT 1 FROM public.motoflow_facturas
       WHERE upper(ncf) = _ncf AND estado = 'emitida') THEN
    RAISE EXCEPTION 'El NCF % ya se usó en otra factura', _ncf;
  END IF;

  _lista := round(_plan.precio * p_meses, 2);
  _desc := GREATEST(_lista - _total, 0);
  IF _desc > 0 AND COALESCE(btrim(p_motivo_descuento),'') = '' THEN
    RAISE EXCEPTION 'Escribe el motivo del precio especial';
  END IF;
  IF p_itbis THEN
    _sub := round(_total / 1.18, 2);
    _itbis := _total - _sub;
  ELSE
    _sub := _total;
  END IF;

  _prep := public.mf_factura_preparar(p_tenant_id);

  IF p_registrar_pago THEN
    _pago := public.admin_registrar_pago(p_tenant_id, _plan.nombre, p_meses, _total, p_metodo, p_referencia,
               concat_ws(' · ', 'Factura MotoFlow', NULLIF(btrim(p_motivo_descuento),'')));
  END IF;

  IF p_guardar_precio_especial THEN
    UPDATE public.tenants SET precio_especial = round(_total / p_meses, 2),
           precio_especial_nota = NULLIF(btrim(p_motivo_descuento),''), updated_at = now()
     WHERE id = p_tenant_id;
  END IF;

  INSERT INTO public.motoflow_facturas (tenant_id, cliente_nombre, cliente_documento, cliente_direccion,
    plan_nombre, meses, precio_lista, descuento, motivo_descuento, subtotal, itbis, total, ncf,
    metodo_pago, referencia, periodo_hasta, pago_id, emisor, emitida_por)
  VALUES (p_tenant_id,
    COALESCE(NULLIF(btrim(p_cliente_nombre),''), _prep->>'cliente_nombre'),
    COALESCE(NULLIF(regexp_replace(COALESCE(p_cliente_documento,''), '\D', '', 'g'),''), _prep->>'cliente_documento'),
    COALESCE(NULLIF(btrim(p_cliente_direccion),''), _prep->>'cliente_direccion'),
    _plan.nombre, p_meses, _lista, _desc, NULLIF(btrim(p_motivo_descuento),''), _sub, _itbis, _total, _ncf,
    COALESCE(NULLIF(btrim(p_metodo),''), 'efectivo'), NULLIF(btrim(p_referencia),''),
    (_pago->>'fecha_fin')::timestamptz, (_pago->>'pago_id')::uuid, _emisor, auth.uid())
  RETURNING id INTO _id;

  RETURN public.mf_factura(_id);
END $$;

CREATE OR REPLACE FUNCTION public.mf_factura(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM private.mf_exigir_superadmin();
  RETURN (SELECT to_jsonb(f) || jsonb_build_object('numero_txt', 'MF-' || lpad(f.numero::text, 6, '0'))
            FROM public.motoflow_facturas f WHERE f.id = p_id);
END $$;

CREATE OR REPLACE FUNCTION public.mf_facturas_lista(p_tenant_id uuid DEFAULT NULL, p_limite integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM private.mf_exigir_superadmin();
  RETURN COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'numero')::int DESC) FROM (
    SELECT to_jsonb(f) || jsonb_build_object('numero_txt', 'MF-' || lpad(f.numero::text, 6, '0')) AS x
      FROM public.motoflow_facturas f
     WHERE p_tenant_id IS NULL OR f.tenant_id = p_tenant_id
     ORDER BY f.numero DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limite, 100), 1), 500)) s), '[]'::jsonb);
END $$;

-- Anular deja la factura (no se borra) y NO toca la membresía: si el pago
-- fue un error, se corrige aparte en la empresa.
CREATE OR REPLACE FUNCTION public.mf_factura_anular(p_id uuid, p_motivo text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM private.mf_exigir_superadmin();
  IF COALESCE(btrim(p_motivo),'') = '' THEN RAISE EXCEPTION 'Escribe el motivo de la anulación'; END IF;
  UPDATE public.motoflow_facturas SET estado = 'anulada', motivo_anulacion = btrim(p_motivo)
   WHERE id = p_id AND estado = 'emitida';
  IF NOT FOUND THEN RAISE EXCEPTION 'La factura no existe o ya está anulada'; END IF;
  RETURN public.mf_factura(p_id);
END $$;

REVOKE ALL ON public.motoflow_emisor, public.motoflow_facturas FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mf_emisor(), public.mf_emisor_guardar(text,text,text,text,text,boolean,text),
  public.mf_factura_preparar(uuid),
  public.mf_factura_emitir(uuid,text,integer,numeric,text,text,boolean,boolean,text,text,boolean,text,text,text),
  public.mf_factura(uuid), public.mf_facturas_lista(uuid,integer), public.mf_factura_anular(uuid,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mf_emisor(), public.mf_emisor_guardar(text,text,text,text,text,boolean,text),
  public.mf_factura_preparar(uuid),
  public.mf_factura_emitir(uuid,text,integer,numeric,text,text,boolean,boolean,text,text,boolean,text,text,text),
  public.mf_factura(uuid), public.mf_facturas_lista(uuid,integer), public.mf_factura_anular(uuid,text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

-- PRUEBA: como el super admin; todo se deshace al final.
DO $prueba$
DECLARE v_t uuid; f jsonb; f2 jsonb; v_fin timestamptz; v_esp numeric; v_emisor_antes jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', 'a9a2d9fd-c408-4d33-b1c7-1f7f29e397fb', 'role', 'authenticated')::text, true);
  SELECT t.id INTO v_t FROM public.tenants t ORDER BY t.created_at LIMIT 1;

  -- Sin emisor no se factura
  DELETE FROM public.motoflow_emisor;
  BEGIN
    PERFORM public.mf_factura_emitir(v_t, 'BASICO', 1, 1950);
    RAISE EXCEPTION 'Facturó sin emisor';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Facturó sin emisor' THEN RAISE; END IF;
  END;
  PERFORM public.mf_emisor_guardar('PRUEBA EMISOR', '001-0000000-1');

  -- Precio especial sin motivo: no
  BEGIN
    PERFORM public.mf_factura_emitir(v_t, 'PRO', 3, 9000);
    RAISE EXCEPTION 'Aceptó descuento sin motivo';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Aceptó descuento sin motivo' THEN RAISE; END IF;
  END;

  -- PRO 3 meses = 11,850 de lista; cobra 9,000 con ITBIS, registra el pago y guarda precio especial
  f := public.mf_factura_emitir(v_t, 'pro', 3, 9000, 'Familia', 'b0100000001', true, true,
                                'transferencia', 'REF1', true);
  IF (f->>'precio_lista')::numeric <> 11850 OR (f->>'descuento')::numeric <> 2850 THEN RAISE EXCEPTION 'Lista/desc: %', f; END IF;
  IF (f->>'subtotal')::numeric + (f->>'itbis')::numeric <> 9000 OR (f->>'itbis')::numeric <> 1372.88 THEN RAISE EXCEPTION 'ITBIS: %', f; END IF;
  IF f->>'ncf' <> 'B0100000001' OR f->>'pago_id' IS NULL OR f->>'periodo_hasta' IS NULL THEN RAISE EXCEPTION 'NCF/pago: %', f; END IF;
  IF f->'emisor'->>'documento' <> '00100000001' THEN RAISE EXCEPTION 'Emisor: %', f->'emisor'; END IF;
  SELECT precio_especial INTO v_esp FROM public.tenants WHERE id = v_t;
  IF v_esp <> 3000 THEN RAISE EXCEPTION 'precio_especial = %', v_esp; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pagos_suscripcion WHERE id = (f->>'pago_id')::uuid AND monto = 9000) THEN
    RAISE EXCEPTION 'Pago no registrado';
  END IF;

  -- Mismo NCF otra vez: no
  BEGIN
    PERFORM public.mf_factura_emitir(v_t, 'PRO', 1, 3950, NULL, 'B0100000001');
    RAISE EXCEPTION 'Repitió NCF';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Repitió NCF' THEN RAISE; END IF;
  END;

  -- Sin registrar pago, precio de lista: no pide motivo
  f2 := public.mf_factura_emitir(v_t, 'BASICO', 1, 1950, NULL, NULL, false, false);
  IF f2->>'pago_id' IS NOT NULL OR (f2->>'numero')::int <> (f->>'numero')::int + 1 THEN RAISE EXCEPTION 'Sin pago: %', f2; END IF;

  -- Anular libera el NCF
  PERFORM public.mf_factura_anular((f->>'id')::uuid, 'prueba');
  PERFORM public.mf_factura_emitir(v_t, 'PRO', 1, 3950, NULL, 'B0100000001', false, false);
  IF jsonb_array_length(public.mf_facturas_lista(v_t)) < 3 THEN RAISE EXCEPTION 'Lista corta'; END IF;

  -- Un usuario normal no puede
  PERFORM set_config('request.jwt.claims', json_build_object('sub', 'b0ee49cc-45f9-4106-ab53-38985fa0fbdb', 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.mf_facturas_lista();
    RAISE EXCEPTION 'Un no-superadmin vio facturas';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Un no-superadmin vio facturas' THEN RAISE; END IF;
  END;

  RAISE EXCEPTION 'PRUEBA_OK';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'PRUEBA_OK' THEN RAISE; END IF;
END $prueba$;

-- La prueba gastó números de la secuencia (no se devuelven): la primera
-- factura real debe ser MF-000001.
SELECT setval('public.motoflow_factura_seq',
              COALESCE((SELECT max(numero) FROM public.motoflow_facturas), 0) + 1, false);

SELECT public.registrar_migracion('motoflow_facturas.sql');
