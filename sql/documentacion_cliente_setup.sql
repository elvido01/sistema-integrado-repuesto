-- ============================================================
-- Documentacion Cliente - Caminero Motors
-- ============================================================
-- Crea tabla y bucket privado para imagenes de:
-- cedula/pasaporte, matricula, placa, autorizaciones y cartas de saldo.

CREATE TABLE IF NOT EXISTS public.documentacion_clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nombre TEXT NOT NULL,
  documento_identidad TEXT,
  telefono TEXT,
  chasis TEXT,
  placa TEXT,
  placa_estado TEXT,
  matricula TEXT, -- estado del documento: EN TRAMITE, ENTREGADA, EN CAMINERO MOTORS
  cedula_pasaporte_path TEXT,
  matricula_moto_path TEXT,
  placa_path TEXT,
  autorizacion_path TEXT,
  carta_saldo_path TEXT,
  notas TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documentacion_clientes_tenant
  ON public.documentacion_clientes(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_documentacion_clientes_busqueda
  ON public.documentacion_clientes(tenant_id, cliente_nombre, documento_identidad, chasis, placa);

ALTER TABLE public.documentacion_clientes
  ADD COLUMN IF NOT EXISTS placa_estado TEXT;

ALTER TABLE public.documentacion_clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "documentacion_clientes_select_tenant" ON public.documentacion_clientes;
CREATE POLICY "documentacion_clientes_select_tenant"
ON public.documentacion_clientes FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS "documentacion_clientes_insert_tenant" ON public.documentacion_clientes;
CREATE POLICY "documentacion_clientes_insert_tenant"
ON public.documentacion_clientes FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS "documentacion_clientes_update_tenant" ON public.documentacion_clientes;
CREATE POLICY "documentacion_clientes_update_tenant"
ON public.documentacion_clientes FOR UPDATE TO authenticated
USING (tenant_id = public.get_user_tenant())
WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS "documentacion_clientes_delete_tenant" ON public.documentacion_clientes;
CREATE POLICY "documentacion_clientes_delete_tenant"
ON public.documentacion_clientes FOR DELETE TO authenticated
USING (tenant_id = public.get_user_tenant());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documentacion-clientes',
  'documentacion-clientes',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "documentacion_clientes_storage_select" ON storage.objects;
CREATE POLICY "documentacion_clientes_storage_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documentacion-clientes'
  AND (storage.foldername(name))[1]::uuid = public.get_user_tenant()
);

DROP POLICY IF EXISTS "documentacion_clientes_storage_insert" ON storage.objects;
CREATE POLICY "documentacion_clientes_storage_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documentacion-clientes'
  AND (storage.foldername(name))[1]::uuid = public.get_user_tenant()
);

DROP POLICY IF EXISTS "documentacion_clientes_storage_update" ON storage.objects;
CREATE POLICY "documentacion_clientes_storage_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'documentacion-clientes'
  AND (storage.foldername(name))[1]::uuid = public.get_user_tenant()
)
WITH CHECK (
  bucket_id = 'documentacion-clientes'
  AND (storage.foldername(name))[1]::uuid = public.get_user_tenant()
);

DROP POLICY IF EXISTS "documentacion_clientes_storage_delete" ON storage.objects;
CREATE POLICY "documentacion_clientes_storage_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'documentacion-clientes'
  AND (storage.foldername(name))[1]::uuid = public.get_user_tenant()
);

-- Permisos visibles para admins/owners automaticamente por codigo.
-- Para vendedores, activar desde Configuracion > Usuarios y Permisos.
-- INSERT INTO public.user_module_permissions (user_id, module_key, can_view, can_edit)
-- SELECT id, 'documentacion-cliente', true, true FROM auth.users
-- ON CONFLICT (user_id, module_key) DO UPDATE
-- SET can_view = EXCLUDED.can_view, can_edit = EXCLUDED.can_edit;
