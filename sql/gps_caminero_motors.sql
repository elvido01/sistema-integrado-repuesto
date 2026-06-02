-- GPS / Financiamiento / Recuperacion - Caminero Motors
-- Modulo multi-tenant preparado para proveedores GPS reales.
-- Por ahora el frontend usa MockGpsProvider; estas tablas quedan listas para datos reales.

CREATE TABLE IF NOT EXISTS public.gps_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cliente_id UUID NULL REFERENCES public.clientes(id) ON DELETE SET NULL,
  vehiculo_id UUID NULL,
  imei TEXT NOT NULL UNIQUE,
  sim_number TEXT,
  modelo TEXT,
  proveedor TEXT,
  estado TEXT NOT NULL DEFAULT 'en_inventario'
    CHECK (estado IN ('activo', 'inactivo', 'instalado', 'en_inventario', 'suspendido', 'sin_senal')),
  installed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.gps_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  gps_device_id UUID NOT NULL REFERENCES public.gps_devices(id) ON DELETE CASCADE,
  lat NUMERIC NOT NULL,
  lng NUMERIC NOT NULL,
  speed NUMERIC,
  heading NUMERIC,
  ignition BOOLEAN,
  battery_level NUMERIC,
  gsm_signal NUMERIC,
  event_type TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.gps_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  gps_device_id UUID REFERENCES public.gps_devices(id) ON DELETE CASCADE,
  cliente_id UUID NULL REFERENCES public.clientes(id) ON DELETE SET NULL,
  vehiculo_id UUID NULL,
  tipo TEXT NOT NULL
    CHECK (tipo IN ('atraso', 'sin_senal', 'bateria_baja', 'fuera_geocerca', 'gps_desconectado', 'movimiento_sospechoso')),
  nivel TEXT NOT NULL DEFAULT 'bajo'
    CHECK (nivel IN ('bajo', 'medio', 'alto', 'critico')),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'revisada', 'resuelta')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.gps_geofences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'circulo' CHECK (tipo IN ('circulo', 'poligono')),
  center_lat NUMERIC,
  center_lng NUMERIC,
  radius_meters NUMERIC,
  polygon JSONB,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.gps_device_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  gps_device_id UUID NOT NULL REFERENCES public.gps_devices(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  vehiculo_id UUID NOT NULL,
  contrato_id UUID NULL,
  fecha_inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_fin TIMESTAMPTZ,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'finalizado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gps_devices_empresa_estado ON public.gps_devices(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_gps_positions_device_recorded ON public.gps_positions(gps_device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_gps_alerts_empresa_estado ON public.gps_alerts(empresa_id, estado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gps_assignments_device_estado ON public.gps_device_assignments(gps_device_id, estado);

ALTER TABLE public.gps_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_device_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gps_devices_tenant ON public.gps_devices;
CREATE POLICY gps_devices_tenant ON public.gps_devices
  FOR ALL USING (empresa_id = public.get_user_tenant())
  WITH CHECK (empresa_id = public.get_user_tenant());

DROP POLICY IF EXISTS gps_positions_tenant ON public.gps_positions;
CREATE POLICY gps_positions_tenant ON public.gps_positions
  FOR ALL USING (empresa_id = public.get_user_tenant())
  WITH CHECK (empresa_id = public.get_user_tenant());

DROP POLICY IF EXISTS gps_alerts_tenant ON public.gps_alerts;
CREATE POLICY gps_alerts_tenant ON public.gps_alerts
  FOR ALL USING (empresa_id = public.get_user_tenant())
  WITH CHECK (empresa_id = public.get_user_tenant());

DROP POLICY IF EXISTS gps_geofences_tenant ON public.gps_geofences;
CREATE POLICY gps_geofences_tenant ON public.gps_geofences
  FOR ALL USING (empresa_id = public.get_user_tenant())
  WITH CHECK (empresa_id = public.get_user_tenant());

DROP POLICY IF EXISTS gps_assignments_tenant ON public.gps_device_assignments;
CREATE POLICY gps_assignments_tenant ON public.gps_device_assignments
  FOR ALL USING (empresa_id = public.get_user_tenant())
  WITH CHECK (empresa_id = public.get_user_tenant());

GRANT SELECT, INSERT, UPDATE ON public.gps_devices TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.gps_positions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.gps_alerts TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.gps_geofences TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.gps_device_assignments TO authenticated, service_role;

-- Permisos sugeridos para usuarios existentes de Caminero Motors.
-- Admin/owner ya entran por rol; esto habilita perfiles operativos si existen.
INSERT INTO public.user_module_permissions (user_id, module_key, can_view, can_edit)
SELECT p.id, m.module_key, TRUE, p.role IN ('admin', 'owner', 'gerente')
FROM public.profiles p
CROSS JOIN (
  VALUES
    ('gps-dashboard'),
    ('gps-dispositivos'),
    ('gps-mapa'),
    ('gps-alertas'),
    ('gps-financiamiento')
) AS m(module_key)
WHERE p.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
ON CONFLICT (user_id, module_key) DO UPDATE
SET can_view = EXCLUDED.can_view,
    can_edit = public.user_module_permissions.can_edit OR EXCLUDED.can_edit;
