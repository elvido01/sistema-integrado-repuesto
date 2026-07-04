-- =====================================================================
-- Separacion de financieras: crear tenants ODALYS + INVERSIONES LOS NARANJOS
-- ---------------------------------------------------------------------
-- Ambas empresas venian FUSIONADAS dentro del tenant de MotoPrestamos Los
-- Naranjos (el sistema viejo compartia una instalacion con varias cias).
-- Datos tomados del catalogo oficial del sistema viejo (cpf_gen_cias.cias):
--   05 - MOTO PRESTAMOS ODALYS        (base prestamos_05)
--   07 - INVERSIONES LOS NARANJOS     (base cpf_inv_los_naranjos)
-- Direccion/telefono del catalogo; RNC pendiente (llenar en Configuracion).
--
-- UUIDs FIJOS (los usan los scripts de migracion — NO cambiarlos):
--   ODALYS:      c05a1d05-0d1e-4a2b-8c3f-0da1e5000005
--   INVERSIONES: c07a1d07-1e2f-4b3c-9d4a-107a10500007
--
-- Idempotente: se puede correr mas de una vez.
-- =====================================================================

-- 1) Tenants
INSERT INTO public.tenants (id, nombre, direccion, telefono, activo, plan)
VALUES
  ('c05a1d05-0d1e-4a2b-8c3f-0da1e5000005', 'MOTO PRESTAMOS ODALYS',
   'Av. Juan XXIII esq. Altagracia, Higuey, Rep. Dom.', '809-554-4181', true, 'Enterprise'),
  ('c07a1d07-1e2f-4b3c-9d4a-107a10500007', 'INVERSIONES LOS NARANJOS',
   'Av. Juan XXIII esq. Altagracia, Higuey, Rep. Dom.', '809-554-4181', true, 'Enterprise')
ON CONFLICT (id) DO NOTHING;

-- 2) config_empresa: copia la configuracion FINANCIERA de MotoPrestamos Los
--    Naranjos (plantilla de cobro, hora de corte, mora, etc.) cambiando la
--    identidad. Asi las dos empresas nacen listas para Gestion de Cobro.
INSERT INTO public.config_empresa (
  id, tenant_id, nombre, direccion1, direccion2, telefono,
  itbis_pct, moneda_principal, moneda_precios, modo_fecha,
  tipo_negocio, feat_financiera, financiamiento_tipo,
  plantilla_cobro, cobranza_hora_corte
)
SELECT
  gen_random_uuid(), t.id, t.nombre,
  'Av. Juan XXIII esq. Altagracia', 'Higuey, Rep. Dom.', '809-554-4181',
  COALESCE(n.itbis_pct, 18), COALESCE(n.moneda_principal, 'DOP - PESOS'),
  COALESCE(n.moneda_precios, 'DOP - PESOS'), COALESCE(n.modo_fecha, 1),
  'financiera', true, 'propio',
  n.plantilla_cobro, COALESCE(n.cobranza_hora_corte, '17:50')
FROM public.tenants t
CROSS JOIN (
  SELECT * FROM public.config_empresa
  WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'  -- MotoPrestamos Los Naranjos
  LIMIT 1
) n
WHERE t.id IN (
  'c05a1d05-0d1e-4a2b-8c3f-0da1e5000005',
  'c07a1d07-1e2f-4b3c-9d4a-107a10500007'
)
AND NOT EXISTS (
  SELECT 1 FROM public.config_empresa ce WHERE ce.tenant_id = t.id
);

-- 3) Suscripcion ACTIVA por 1 anio (empresas reales en operacion, no trial)
DO $$
DECLARE
  v_plan uuid;
  v_tenant uuid;
BEGIN
  SELECT id INTO v_plan FROM public.planes WHERE activo = true ORDER BY precio DESC NULLS LAST LIMIT 1;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'No hay planes activos en la tabla planes';
  END IF;

  FOR v_tenant IN
    SELECT unnest(ARRAY[
      'c05a1d05-0d1e-4a2b-8c3f-0da1e5000005'::uuid,
      'c07a1d07-1e2f-4b3c-9d4a-107a10500007'::uuid
    ])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.suscripciones
      WHERE tenant_id = v_tenant AND estado IN ('trial','activo') AND fecha_fin > now()
    ) THEN
      INSERT INTO public.suscripciones
        (tenant_id, plan_id, estado, fecha_inicio, fecha_fin, monto_pagado, auto_renovar)
      VALUES
        (v_tenant, v_plan, 'activo', now(), now() + interval '1 year', 0, false);
    END IF;
  END LOOP;
END $$;

-- 4) Verificacion
SELECT ce.tenant_id, ce.nombre, ce.tipo_negocio, ce.feat_financiera,
       s.estado AS suscripcion, s.fecha_fin
FROM public.config_empresa ce
LEFT JOIN public.suscripciones s ON s.tenant_id = ce.tenant_id AND s.fecha_fin > now()
WHERE ce.tenant_id IN (
  'c05a1d05-0d1e-4a2b-8c3f-0da1e5000005',
  'c07a1d07-1e2f-4b3c-9d4a-107a10500007'
);
