-- =====================================================================
-- Módulo Documentos compartido entre empresas aliadas
-- Caminero Motors (dealer) y MotoPréstamos Los Naranjos (financiera)
-- comparten las Notas y Comentarios y la Documentación Cliente:
-- son la misma operación real (el dealer vende, la financiera financia,
-- el cliente es el mismo). Lectura cruzada + edición de documentación;
-- cada empresa escribe sus registros con su propio tenant.
-- =====================================================================

-- 1) Parejas de empresas que comparten Documentos (ambas direcciones)
CREATE TABLE IF NOT EXISTS public.tenant_socios_documentos (
  tenant_id       uuid NOT NULL,
  socio_tenant_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, socio_tenant_id)
);
ALTER TABLE public.tenant_socios_documentos ENABLE ROW LEVEL SECURITY;
-- (sin políticas: solo la función SECURITY DEFINER y service_role la leen)

INSERT INTO public.tenant_socios_documentos (tenant_id, socio_tenant_id) VALUES
  ('b39506c3-27dc-467d-830b-096731b83113', '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'), -- Caminero -> Naranjos
  ('766fe3d6-6885-4f2b-b2cc-1a91db696fb4', 'b39506c3-27dc-467d-830b-096731b83113')  -- Naranjos -> Caminero
ON CONFLICT DO NOTHING;

-- Mi tenant + mis socios de Documentos
CREATE OR REPLACE FUNCTION public.get_tenants_documentos()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT array_agg(t) FROM (
    SELECT public.get_user_tenant() AS t
    UNION
    SELECT socio_tenant_id FROM public.tenant_socios_documentos
    WHERE tenant_id = public.get_user_tenant()
  ) s;
$$;
GRANT EXECUTE ON FUNCTION public.get_tenants_documentos() TO authenticated;

-- 2) Documentación Cliente: leer y actualizar dentro del grupo;
--    crear y borrar solo lo propio
DROP POLICY IF EXISTS "documentacion_clientes_select_tenant" ON public.documentacion_clientes;
CREATE POLICY "documentacion_clientes_select_tenant"
ON public.documentacion_clientes FOR SELECT TO authenticated
USING (tenant_id = ANY (public.get_tenants_documentos()));

DROP POLICY IF EXISTS "documentacion_clientes_update_tenant" ON public.documentacion_clientes;
CREATE POLICY "documentacion_clientes_update_tenant"
ON public.documentacion_clientes FOR UPDATE TO authenticated
USING (tenant_id = ANY (public.get_tenants_documentos()))
WITH CHECK (tenant_id = ANY (public.get_tenants_documentos()));

-- (insert y delete quedan como estaban: solo el tenant propio)

-- Imágenes: ver las del socio; subir/borrar solo en la carpeta propia
DROP POLICY IF EXISTS "documentacion_clientes_storage_select" ON storage.objects;
CREATE POLICY "documentacion_clientes_storage_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documentacion-clientes'
  AND (storage.foldername(name))[1]::uuid = ANY (public.get_tenants_documentos())
);

-- 3) Notas y Comentarios: leer las del socio (cruzando por cédula);
--    escribir/borrar solo las propias
ALTER TABLE public.cliente_notas
  ADD COLUMN IF NOT EXISTS cliente_cedula text;

CREATE INDEX IF NOT EXISTS idx_cliente_notas_cedula
  ON public.cliente_notas (cliente_cedula) WHERE cliente_cedula IS NOT NULL;

-- Backfill por si ya hay notas guardadas sin cédula
UPDATE public.cliente_notas n
SET cliente_cedula = c.rnc
FROM public.clientes c
WHERE n.cliente_id = c.id AND n.cliente_cedula IS NULL AND c.rnc IS NOT NULL;

DROP POLICY IF EXISTS cliente_notas_tenant ON public.cliente_notas;

DROP POLICY IF EXISTS cliente_notas_select ON public.cliente_notas;
CREATE POLICY cliente_notas_select ON public.cliente_notas FOR SELECT TO authenticated
  USING (tenant_id = ANY (public.get_tenants_documentos()));

DROP POLICY IF EXISTS cliente_notas_insert ON public.cliente_notas;
CREATE POLICY cliente_notas_insert ON public.cliente_notas FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS cliente_notas_update ON public.cliente_notas;
CREATE POLICY cliente_notas_update ON public.cliente_notas FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS cliente_notas_delete ON public.cliente_notas;
CREATE POLICY cliente_notas_delete ON public.cliente_notas FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant());

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('documentos_compartidos.sql');
  END IF;
END $$;

SELECT 'Documentos compartidos Caminero <-> Naranjos listos' AS status;
