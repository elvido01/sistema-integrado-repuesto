-- ============================================================
-- FACTURAS MOTOFLOW · ajustes de la revisión (24/11/2026)
-- ============================================================
-- 1. "Guardar precio especial" ya NO escribe tenants.precio_especial: ese es
--    el acuerdo comercial que quita el CRM y cambia límites (SuscripcionContext,
--    lib/planes.puedeCrm). El precio de familia/amigo se recuerda aparte, en
--    motoflow_precios_cliente (por empresa y plan), sin efecto en funciones.
-- 2. preparar devuelve el precio recordado y el pactado CON su plan, para
--    proponerlos solo cuando el plan facturado coincide.
-- 3. Sin registrar pago: metodo_pago y referencia van NULL (la factura no
--    dice "Pagado por" algo que no se cobró).
-- 4. Sin descuento, el motivo no se guarda.
-- 5. Cliente: un campo enviado en blanco queda en blanco (el respaldo de
--    config_empresa solo se usa si no se envía nada).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.motoflow_precios_cliente (
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_nombre    text NOT NULL,
  precio_mensual numeric(12,2) NOT NULL CHECK (precio_mensual > 0),
  motivo         text,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, plan_nombre)
);
ALTER TABLE public.motoflow_precios_cliente ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.motoflow_precios_cliente FROM anon, authenticated;

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
    -- Pactado (acuerdo comercial): vale en plan_especial; null = cualquier plan.
    'pactado', CASE WHEN COALESCE(_t.precio_especial, 0) > 0 THEN jsonb_build_object(
                 'plan', NULLIF(upper(btrim(COALESCE(_t.plan_especial, ''))), ''),
                 'precio', _t.precio_especial, 'nota', _t.precio_especial_nota) END,
    -- Recordados al facturar (familia/amigos), uno por plan.
    'recordados', COALESCE((SELECT jsonb_agg(jsonb_build_object('plan', upper(r.plan_nombre),
                    'precio', r.precio_mensual, 'motivo', r.motivo))
                    FROM public.motoflow_precios_cliente r WHERE r.tenant_id = p_tenant_id), '[]'::jsonb),
    'emisor', public.mf_emisor(),
    'planes', (SELECT jsonb_agg(jsonb_build_object('nombre', p.nombre, 'precio', p.precio) ORDER BY p.precio)
                 FROM public.planes p WHERE p.activo AND upper(p.nombre) NOT IN ('TRIAL','FREE')));
END $$;

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
  p_guardar_precio_especial boolean DEFAULT false,   -- = recordar el precio (motoflow_precios_cliente)
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
  _motivo text;
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
  _motivo := CASE WHEN _desc > 0 THEN NULLIF(btrim(p_motivo_descuento), '') END;
  IF _desc > 0 AND _motivo IS NULL THEN
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
               concat_ws(' · ', 'Factura MotoFlow', _motivo));
  END IF;

  IF p_guardar_precio_especial THEN
    INSERT INTO public.motoflow_precios_cliente (tenant_id, plan_nombre, precio_mensual, motivo, updated_at)
    VALUES (p_tenant_id, upper(_plan.nombre), round(_total / p_meses, 2), _motivo, now())
    ON CONFLICT (tenant_id, plan_nombre) DO UPDATE SET precio_mensual = EXCLUDED.precio_mensual,
      motivo = COALESCE(EXCLUDED.motivo, public.motoflow_precios_cliente.motivo), updated_at = now();
  END IF;

  INSERT INTO public.motoflow_facturas (tenant_id, cliente_nombre, cliente_documento, cliente_direccion,
    plan_nombre, meses, precio_lista, descuento, motivo_descuento, subtotal, itbis, total, ncf,
    metodo_pago, referencia, periodo_hasta, pago_id, emisor, emitida_por)
  VALUES (p_tenant_id,
    COALESCE(NULLIF(btrim(p_cliente_nombre),''), _prep->>'cliente_nombre'),   -- el nombre no puede quedar vacío
    CASE WHEN p_cliente_documento IS NULL THEN _prep->>'cliente_documento'
         ELSE NULLIF(regexp_replace(p_cliente_documento, '\D', '', 'g'), '') END,
    CASE WHEN p_cliente_direccion IS NULL THEN _prep->>'cliente_direccion'
         ELSE NULLIF(btrim(p_cliente_direccion), '') END,
    _plan.nombre, p_meses, _lista, _desc, _motivo, _sub, _itbis, _total, _ncf,
    CASE WHEN p_registrar_pago THEN COALESCE(NULLIF(btrim(p_metodo),''), 'efectivo') END,
    CASE WHEN p_registrar_pago THEN NULLIF(btrim(p_referencia),'') END,
    (_pago->>'fecha_fin')::timestamptz, (_pago->>'pago_id')::uuid, _emisor, auth.uid())
  RETURNING id INTO _id;

  RETURN public.mf_factura(_id);
END $$;

NOTIFY pgrst, 'reload schema';

DO $prueba$
DECLARE v_t uuid; f jsonb; p jsonb; v_esp_antes numeric; v_nota_antes text; v_esp numeric; v_nota text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', 'a9a2d9fd-c408-4d33-b1c7-1f7f29e397fb', 'role', 'authenticated')::text, true);
  SELECT t.id, t.precio_especial, t.precio_especial_nota INTO v_t, v_esp_antes, v_nota_antes
    FROM public.tenants t ORDER BY t.created_at LIMIT 1;
  PERFORM public.mf_emisor_guardar('PRUEBA EMISOR', '00100000001');

  -- Recordar precio: no toca tenants.precio_especial ni la nota
  f := public.mf_factura_emitir(v_t, 'PRO', 3, 9000, 'Familia', NULL, false, true, 'efectivo', NULL, true);
  SELECT precio_especial, precio_especial_nota INTO v_esp, v_nota FROM public.tenants WHERE id = v_t;
  IF v_esp IS DISTINCT FROM v_esp_antes OR v_nota IS DISTINCT FROM v_nota_antes THEN
    RAISE EXCEPTION 'Tocó el precio pactado: % / %', v_esp, v_nota;
  END IF;
  p := public.mf_factura_preparar(v_t);
  IF NOT (p->'recordados' @> '[{"plan":"PRO","precio":3000,"motivo":"Familia"}]'::jsonb) THEN
    RAISE EXCEPTION 'No recordó: %', p->'recordados';
  END IF;

  -- Sin pago: sin método ni referencia; sin descuento: sin motivo; cliente en blanco = en blanco
  f := public.mf_factura_emitir(v_t, 'BASICO', 1, 1950, 'Precio fundador', NULL, false, false, 'efectivo', 'X', false,
                                NULL, '', '');
  IF f->>'metodo_pago' IS NOT NULL OR f->>'referencia' IS NOT NULL THEN RAISE EXCEPTION 'Dice pagado: %', f; END IF;
  IF f->>'motivo_descuento' IS NOT NULL THEN RAISE EXCEPTION 'Motivo sin descuento: %', f; END IF;
  IF f->>'cliente_documento' IS NOT NULL OR f->>'cliente_direccion' IS NOT NULL THEN RAISE EXCEPTION 'No respetó el blanco: %', f; END IF;
  IF COALESCE(f->>'cliente_nombre','') = '' THEN RAISE EXCEPTION 'Nombre vacío'; END IF;

  RAISE EXCEPTION 'PRUEBA_OK';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'PRUEBA_OK' THEN RAISE; END IF;
END $prueba$;

SELECT setval('public.motoflow_factura_seq',
              COALESCE((SELECT max(numero) FROM public.motoflow_facturas), 0) + 1, false);

SELECT public.registrar_migracion('motoflow_facturas_ajustes.sql');
