-- =====================================================================
-- Registro de empresa con TIPO DE NEGOCIO (repuestos / dealer / financiera)
-- ---------------------------------------------------------------------
-- (2026-10-01) INVERSIONES EL NARANJO (160f0230) se creó el 01/10 por el
-- formulario de registro y quedó como 'repuestos': el formulario no
-- preguntaba el tipo. Pedido del dueño: es una financiera, cambiarla, y que
-- el formulario de creación lo pregunte.
--
-- Una financiera no es solo tipo_negocio: el menú de préstamos cuelga de
-- feat_financiera, y la mora por defecto del grupo es 4% (igual que Odalys e
-- Inversiones Los Naranjos). Se ponen las tres cosas juntas.
--
-- La función gana un 6º parámetro con DEFAULT. Se BORRA la de 5 antes de
-- crearla: CREATE OR REPLACE con otros argumentos deja dos versiones y la
-- llamada revienta con "is not unique". El formulario viejo (5 argumentos
-- por nombre) sigue funcionando contra la nueva.
-- =====================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.registrar_nueva_empresa(text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.registrar_nueva_empresa(
  p_nombre text,
  p_rnc text DEFAULT NULL::text,
  p_direccion text DEFAULT NULL::text,
  p_telefono text DEFAULT NULL::text,
  p_email text DEFAULT NULL::text,
  p_tipo_negocio text DEFAULT 'repuestos'
)
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

  IF v_tipo NOT IN ('repuestos', 'dealer', 'financiera') THEN
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
    v_tipo = 'financiera',
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

  RETURN v_tenant_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.registrar_nueva_empresa(text, text, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.registrar_nueva_empresa(text, text, text, text, text, text) TO authenticated;

-- INVERSIONES EL NARANJO pasa a financiera (pedido del dueño 01/10).
-- Solo esta empresa.
UPDATE public.config_empresa
   SET tipo_negocio = 'financiera',
       feat_financiera = true,
       mora_pct_default = 4
 WHERE tenant_id = '160f0230-ed68-4d43-a569-8abafa8134a3';

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('registro_empresa_con_tipo_de_negocio.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  (SELECT tipo_negocio || ' / feat_financiera=' || feat_financiera || ' / mora=' || mora_pct_default
     FROM public.config_empresa
    WHERE tenant_id = '160f0230-ed68-4d43-a569-8abafa8134a3') AS el_naranjo,
  (SELECT count(*) FROM pg_proc WHERE proname = 'registrar_nueva_empresa') AS versiones_de_la_funcion;
