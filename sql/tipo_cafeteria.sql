-- =====================================================================
-- Tipo de empresa CAFETERÍA (11/11/2026)
-- ---------------------------------------------------------------------
-- Punto de venta simple con pantalla táctil (Ventas abre en modo táctil).
-- · config_empresa.tipo_negocio acepta 'cafeteria'.
-- · private.cafe_preparar: categorías de inicio del menú (CAFÉ, BEBIDAS,
--   COMIDA, POSTRES, SNACKS); son las pestañas de la pantalla táctil.
-- · registrar_nueva_empresa: misma versión de producción + 'cafeteria'
--   (mismos argumentos: no crea sobrecarga).
-- Idempotente.
-- =====================================================================

ALTER TABLE public.config_empresa DROP CONSTRAINT IF EXISTS config_empresa_tipo_negocio_check;
ALTER TABLE public.config_empresa ADD CONSTRAINT config_empresa_tipo_negocio_check
  CHECK (tipo_negocio = ANY (ARRAY['repuestos','dealer','financiera','servicios','inmobiliaria','educativo','aluminio','cafeteria']));

CREATE OR REPLACE FUNCTION private.cafe_preparar(p_tenant uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $f$
DECLARE c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['CAFÉ', 'BEBIDAS', 'COMIDA', 'POSTRES', 'SNACKS'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.tipos_producto WHERE tenant_id = p_tenant AND upper(nombre) = c) THEN
      INSERT INTO public.tipos_producto (nombre, activo, tenant_id) VALUES (c, true, p_tenant);
    END IF;
  END LOOP;
END
$f$;
REVOKE ALL ON FUNCTION private.cafe_preparar(uuid) FROM PUBLIC, anon, authenticated;

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

  IF v_tipo NOT IN ('repuestos', 'dealer', 'financiera', 'servicios', 'inmobiliaria', 'educativo', 'aluminio', 'cafeteria') THEN
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
  IF v_tipo = 'cafeteria' THEN PERFORM private.cafe_preparar(v_tenant_id); END IF;

  RETURN v_tenant_id;
END;
$function$;

SELECT public.registrar_migracion('tipo_cafeteria.sql');
