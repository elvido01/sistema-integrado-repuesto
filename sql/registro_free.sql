-- =====================================================================
-- Lanzar FREE en el registro (19/11/2026) — decisión del dueño
-- ---------------------------------------------------------------------
-- Una empresa nueva entra en el plan FREE (RD$0, sin vencimiento) en vez de
-- la prueba de 15 días. Dentro de FREE tiene el botón "Probar Pro 15 días"
-- (una vez). Igual en la web y en la app (las dos llaman registrar-empresa).
--
-- Excepción: los tipos cuyo módulo principal NO está en FREE (préstamos,
-- colegios, inmobiliaria a plazos, proyectos de ventanas) siguen entrando
-- con la prueba de 15 días como antes; en FREE no verían nada suyo. Al
-- terminar esa prueba sin comprar, pasan a FREE (cron free-tras-prueba).
-- Todo lo demás es igual a la versión anterior.
-- =====================================================================

BEGIN;

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
  v_free boolean;
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

  -- (19/11/2026) FREE para los tipos que FREE cubre; los demás, prueba.
  SELECT id INTO v_plan_id FROM public.planes WHERE nombre = 'FREE' ORDER BY created_at, id LIMIT 1;
  v_free := v_tipo IN ('repuestos', 'servicios', 'dealer', 'cafeteria') AND v_plan_id IS NOT NULL;

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
    CASE WHEN v_free THEN 'FREE' ELSE 'TRIAL' END
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

  IF v_free THEN
    INSERT INTO public.suscripciones (
      tenant_id, plan_id, estado, fecha_inicio, fecha_fin, monto_pagado, auto_renovar, created_at
    )
    VALUES (v_tenant_id, v_plan_id, 'activo', clock_timestamp(), now() + interval '100 years', 0, false, clock_timestamp());
  ELSE
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
  END IF;

  INSERT INTO private.tenant_onboarding_claims (tenant_id)
  VALUES (v_tenant_id);

  -- El reloj de inactividad (Fase 5) arranca con el alta.
  INSERT INTO public.tenant_actividad (tenant_id, ultima) VALUES (v_tenant_id, now())
  ON CONFLICT (tenant_id) DO NOTHING;

  IF v_tipo = 'educativo' THEN PERFORM private.edu_preparar_colegio(v_tenant_id); END IF;
  IF v_tipo = 'aluminio' THEN PERFORM private.vent_preparar(v_tenant_id); END IF;
  IF v_tipo = 'cafeteria' THEN PERFORM private.cafe_preparar(v_tenant_id); END IF;

  RETURN v_tenant_id;
END;
$function$;

-- El freno contra altas masivas (10 por hora, sql/registro_con_captcha.sql)
-- contaba solo plan TRIAL: con el registro en FREE quedaba sin efecto.
CREATE OR REPLACE FUNCTION public._freno_registro_empresas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  -- Solo frena las altas públicas (plan TRIAL o FREE inactivo, como las crea
  -- registrar_nueva_empresa); el superadmin crea empresas por otro camino.
  IF NEW.plan IN ('TRIAL', 'FREE') AND NOT coalesce(NEW.activo, false)
     AND (SELECT count(*) FROM public.tenants
           WHERE created_at > now() - interval '1 hour' AND plan IN ('TRIAL', 'FREE')) >= 10 THEN
    RAISE EXCEPTION 'Hay demasiados registros en este momento. Intenta en una hora o escríbenos por WhatsApp.';
  END IF;
  RETURN NEW;
END
$function$;

COMMIT;

SELECT public.registrar_migracion('registro_free.sql');
