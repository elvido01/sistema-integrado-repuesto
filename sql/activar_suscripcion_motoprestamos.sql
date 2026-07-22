-- =====================================================================
-- Activar el TRIAL de MotoPrestamos Los Naranjos (empresa nueva)
-- ---------------------------------------------------------------------
-- La empresa quedo "sin suscripcion activa" porque registrar_nueva_empresa
-- solo crea el TRIAL si existe un plan llamado 'TRIAL' en la tabla planes,
-- y en PROD no existe. Este script le crea un TRIAL de 15 dias usando un
-- plan disponible (asi tiene todas las funciones durante la prueba).
--
-- Si prefieres que NO se vuelva a bloquear en 15 dias, cambia abajo
-- 'trial' -> 'activo' y interval '15 days' -> interval '1 year'.
-- =====================================================================

-- 0) (Opcional) diagnostico: ver que tiene hoy
--    SELECT s.estado, s.fecha_fin, p.nombre
--    FROM public.suscripciones s
--    JOIN public.config_empresa ce ON ce.tenant_id = s.tenant_id
--    LEFT JOIN public.planes p ON p.id = s.plan_id
--    WHERE ce.nombre ILIKE '%motoprestamo%' OR ce.nombre ILIKE '%naranjo%';

DO $$
DECLARE
  v_tenant       uuid;
  v_plan         uuid;
  v_plan_nombre  text;
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM public.config_empresa
  WHERE nombre ILIKE '%motoprestamo%' OR nombre ILIKE '%naranjo%'
  LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No encontre el tenant de MotoPrestamos (revisa el nombre en config_empresa)';
  END IF;

  -- No duplicar si ya tiene una suscripcion vigente
  IF EXISTS (
    SELECT 1 FROM public.suscripciones
    WHERE tenant_id = v_tenant AND estado IN ('trial','activo') AND fecha_fin > now()
  ) THEN
    RAISE NOTICE 'MotoPrestamos ya tiene una suscripcion vigente; no se crea otra.';
    RETURN;
  END IF;

  SELECT id, nombre INTO v_plan, v_plan_nombre
  FROM public.planes
  WHERE activo = true
  ORDER BY precio DESC NULLS LAST
  LIMIT 1;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'No hay planes activos en la tabla planes';
  END IF;

  INSERT INTO public.suscripciones
    (tenant_id, plan_id, estado, fecha_inicio, fecha_fin, monto_pagado, auto_renovar)
  VALUES
    (v_tenant, v_plan, 'trial', now(), now() + interval '15 days', 0, false);

  UPDATE public.tenants
     SET plan = COALESCE(plan, v_plan_nombre),
         trial_end_date = now() + interval '15 days'
   WHERE id = v_tenant;

  RAISE NOTICE 'TRIAL de 15 dias creado para % (plan %).', v_tenant, v_plan_nombre;
END $$;

-- Verificacion
SELECT s.tenant_id, p.nombre AS plan, s.estado, s.fecha_inicio, s.fecha_fin
FROM public.suscripciones s
JOIN public.config_empresa ce ON ce.tenant_id = s.tenant_id
LEFT JOIN public.planes p ON p.id = s.plan_id
WHERE ce.nombre ILIKE '%motoprestamo%' OR ce.nombre ILIKE '%naranjo%'
ORDER BY s.fecha_fin DESC;
