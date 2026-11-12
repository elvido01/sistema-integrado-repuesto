-- (12/11/2026) Empresa nueva: CAFETERÍA NUEVO CENTENARIO (tipo cafeteria,
-- pantalla táctil en Ventas). Es independiente del colegio: NO comparte
-- inventario ni clientes con él. Acceso de dueño para las dos cuentas del
-- colegio Nuevo Centenario (zuriespinalcaceres@hotmail.com y
-- elvidocaminero@gmail.com). Plan TRIAL 15 días, activa desde ya.
-- registrar_nueva_empresa ya prepara la cafetería (private.cafe_preparar).
DO $$
DECLARE
  v_nuevo uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.config_empresa WHERE upper(btrim(nombre)) = 'CAFETERÍA NUEVO CENTENARIO') THEN
    RAISE EXCEPTION 'Ya existe una empresa con ese nombre.';
  END IF;

  v_nuevo := public.registrar_nueva_empresa('CAFETERÍA NUEVO CENTENARIO', NULL, NULL, NULL, NULL, 'cafeteria');

  UPDATE public.tenants SET activo = true, trial_start_date = now() WHERE id = v_nuevo;

  INSERT INTO public.usuarios_empresas (user_id, tenant_id, rol) VALUES
    ('b0ee49cc-45f9-4106-ab53-38985fa0fbdb', v_nuevo, 'owner'),   -- Zuri
    ('a9a2d9fd-c408-4d33-b1c7-1f7f29e397fb', v_nuevo, 'owner')    -- elvidocaminero
  ON CONFLICT DO NOTHING;

  UPDATE private.tenant_onboarding_claims
     SET claimed_by = 'b0ee49cc-45f9-4106-ab53-38985fa0fbdb', claimed_at = now()
   WHERE tenant_id = v_nuevo;

  RAISE NOTICE 'Empresa creada: %', v_nuevo;
END $$;

SELECT c.tenant_id, c.nombre, c.tipo_negocio, t.activo, t.trial_end_date,
       (SELECT count(*) FROM public.usuarios_empresas ue WHERE ue.tenant_id = c.tenant_id) AS usuarios
  FROM public.config_empresa c JOIN public.tenants t ON t.id = c.tenant_id
 WHERE c.nombre = 'CAFETERÍA NUEVO CENTENARIO';

SELECT registrar_migracion('cafeteria_nuevo_centenario.sql');
